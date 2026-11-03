import { EVENTS, MODULE_ID, RUNTIME_SCHEMA_VERSION } from "./constants.js";
import { Logger } from "./logger.js";

export class EncounterManager {
  constructor({ registry, store, sceneAdapter, marvelAdapter }) {
    this.registry = registry;
    this.store = store;
    this.sceneAdapter = sceneAdapter;
    this.marvelAdapter = marvelAdapter;
    this.triggerEngine = null;
    this.dashboard = null;
    this.wallMutations = new Set();
  }

  get activeEncounter() {
    return this.registry.get(this.store.state.activeEncounterId);
  }

  get state() {
    return this.store.state;
  }

  async activate(encounterId) {
    const encounter = this.registry.get(encounterId);
    if (!encounter) throw new Error(`Encounter '${encounterId}' is not registered.`);

    const sceneResult = await this.sceneAdapter?.ensureEncounterScene(encounter);
    if (game.user?.isGM && sceneResult?.scene) {
      await sceneResult.scene.view();
    }
    const phase = [...(encounter.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0] ?? null;

    const next = {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      activeEncounterId: encounter.id,
      sceneId: sceneResult?.scene?.id ?? null,
      phaseId: phase?.id ?? null,
      clocks: {},
      objectives: {},
      firedTriggers: [],
      fxmasterEffects: {},
      destructibleBindings: this.store.state.activeEncounterId === encounter.id
        ? foundry.utils.deepClone(this.store.state.destructibleBindings ?? {})
        : {},
      lastCombatRound: game.combat?.round ?? null,
      history: []
    };

    for (const clock of encounter.clocks ?? []) {
      next.clocks[clock.id] = {
        id: clock.id,
        name: clock.name ?? clock.id,
        value: Number(clock.value ?? 0),
        max: Number(clock.max ?? 6),
        public: clock.public ?? true
      };
    }

    for (const objective of encounter.objectives ?? []) {
      next.objectives[objective.id] = {
        id: objective.id,
        name: objective.name ?? objective.id,
        type: objective.type ?? "binary",
        value: Number(objective.value ?? 0),
        target: objective.target == null ? null : Number(objective.target),
        status: objective.status ?? "active",
        primary: objective.primary ?? false,
        public: objective.public ?? true
      };
    }

    await this.store.replace(next);
    this.store.pushHistory(EVENTS.ENCOUNTER_ACTIVATED, { encounterId });
    await this.store.save();
    if (Object.keys(next.destructibleBindings).length) {
      await this.reconcileDestructibleBindings();
    }

    if (phase?.onEnter?.length) {
      await this.triggerEngine?.resolver.executeMany(phase.onEnter, { source: `phase:${phase.id}:enter` });
    }

    await this.triggerEngine?.emit(EVENTS.ENCOUNTER_ACTIVATED, { encounter });
    this.renderDashboard();
    ui.notifications?.info(`Marvel Encounter Framework: Activated ${encounter.name}`);
    return this.store.state;
  }

  async spawnActors(action, context = {}) {
    const encounter = this.activeEncounter;
    if (!encounter) throw new Error("Cannot spawn actors without an active encounter.");

    const result = await this.sceneAdapter.spawnActors(encounter, action, context, {
      bindings: this.store.state.destructibleBindings ?? {}
    });

    this.store.state.destructibleBindings ??= {};
    for (const binding of result.bindings ?? []) {
      this.store.state.destructibleBindings[binding.objectId] = binding;
    }
    if ((result.bindings?.length ?? 0) > 0) await this.store.save();
    return result;
  }

  async reconcileDestructibleBindings({ notify = true } = {}) {
    const bindings = this.store.state.destructibleBindings ?? {};
    const missing = [];

    for (const scene of Array.from(game.scenes?.values?.() ?? game.scenes?.contents ?? [])) {
      for (const token of Array.from(scene.tokens?.values?.() ?? scene.tokens?.contents ?? [])) {
        const persisted = this.sceneAdapter.getBreakableWallBinding?.(token);
        if (!persisted?.objectId || bindings[persisted.objectId]) continue;
        bindings[persisted.objectId] = {
          ...foundry.utils.deepClone(persisted),
          sceneId: scene.id,
          tokenId: token.id,
          actorId: token.actorId ?? persisted.actorId ?? null,
          status: "resolved"
        };
      }
    }

    for (const binding of Object.values(bindings)) {
      const scene = game.scenes?.get?.(binding.sceneId);
      const tokens = scene?.tokens;
      let token = tokens?.get?.(binding.tokenId)
        ?? tokens?.find?.(candidate =>
          candidate.getFlag?.(MODULE_ID, "objectId") === binding.objectId
          || candidate.flags?.[MODULE_ID]?.objectId === binding.objectId
        );

      if (token) {
        binding.tokenId = token.id;
        binding.actorId = token.actorId ?? binding.actorId ?? null;
        binding.status = "resolved";
      } else {
        binding.status = "missing";
        missing.push(foundry.utils.deepClone(binding));
      }
    }

    await this.store.save();
    if (missing.length) {
      Logger.warn("Destructible encounter tokens are missing.", missing);
      if (notify) {
        ui.notifications?.warn(
          `Marvel Encounter Framework: ${missing.length} destructible token binding(s) could not be resolved.`
        );
      }
    }
    return {
      ok: missing.length === 0,
      bindings: this.getDestructibleBindings(),
      missing
    };
  }

  getDestructibleBindings({ includeMissing = true } = {}) {
    return Object.values(this.store.state.destructibleBindings ?? {})
      .filter(binding => includeMissing || binding.status !== "missing")
      .map(binding => foundry.utils.deepClone(binding));
  }

  getBreakableWallBindingForToken(token) {
    const tokenDocument = token?.document ?? token;
    if (!tokenDocument) return null;
    const persisted = this.sceneAdapter.getBreakableWallBinding?.(tokenDocument);
    if (persisted?.objectId) return foundry.utils.deepClone(persisted);
    const binding = Object.values(this.store.state.destructibleBindings ?? {}).find(candidate =>
      candidate.tokenId === tokenDocument.id
      && candidate.sceneId === (tokenDocument.parent?.id ?? tokenDocument.scene?.id)
      && candidate.walls?.length
    );
    return binding ? foundry.utils.deepClone(binding) : null;
  }

  findBreakableWallBinding(objectId) {
    const stored = this.store.state.destructibleBindings?.[objectId];
    if (stored) return stored;
    for (const scene of Array.from(game.scenes?.values?.() ?? game.scenes?.contents ?? [])) {
      for (const token of Array.from(scene.tokens?.values?.() ?? scene.tokens?.contents ?? [])) {
        const persisted = this.sceneAdapter.getBreakableWallBinding?.(token);
        if (persisted?.objectId !== objectId) continue;
        const binding = {
          ...foundry.utils.deepClone(persisted),
          sceneId: scene.id,
          tokenId: token.id,
          actorId: token.actorId ?? persisted.actorId ?? null,
          status: "resolved"
        };
        this.store.state.destructibleBindings ??= {};
        this.store.state.destructibleBindings[objectId] = binding;
        return binding;
      }
    }
    return null;
  }

  async bindBreakableWalls({ sceneId, tokenId, wallIds } = {}) {
    const scene = game.scenes?.get?.(sceneId);
    if (!scene) throw new Error(`Scene '${sceneId}' was not found.`);
    const token = scene.tokens?.get?.(tokenId);
    if (!token) throw new Error(`Token '${tokenId}' was not found in Scene '${scene.name ?? scene.id}'.`);
    const destructible = Boolean(
      token.actor?.getFlag?.("marvel-multiverse", "destructible")
      ?? token.actor?.flags?.["marvel-multiverse"]?.destructible
    );
    if (!destructible) throw new Error(`Token '${token.name ?? token.id}' is not a Marvel destructible Actor.`);
    const normalizedWallIds = [...new Set((wallIds ?? []).filter(id => typeof id === "string" && id))];
    if (!normalizedWallIds.length) throw new Error("Select at least one Wall segment to create a breakable wall.");

    const existing = this.getBreakableWallBindingForToken(token);
    if (existing?.wallState === "destroyed") {
      throw new Error(`Repair '${token.name ?? token.id}' before changing its Wall binding.`);
    }
    const objectId = existing?.objectId
      ?? token.getFlag?.(MODULE_ID, "objectId")
      ?? token.flags?.[MODULE_ID]?.objectId
      ?? `breakable-wall:${scene.id}:${token.id}`;
    const walls = this.sceneAdapter.resolveWallSnapshots(scene, normalizedWallIds, { objectId });
    const binding = {
      version: 2,
      encounterId: existing?.encounterId ?? this.store.state.activeEncounterId ?? null,
      objectId,
      source: existing?.source ?? "wall-link-tool",
      sceneId: scene.id,
      tokenId: token.id,
      actorId: token.actorId ?? token.actor?.id ?? null,
      rosterId: existing?.rosterId
        ?? token.getFlag?.(MODULE_ID, "rosterId")
        ?? token.flags?.[MODULE_ID]?.rosterId
        ?? null,
      sourceActorUuid: existing?.sourceActorUuid
        ?? token.getFlag?.(MODULE_ID, "sourceUuid")
        ?? token.flags?.[MODULE_ID]?.sourceUuid
        ?? token.actor?.uuid
        ?? null,
      status: "resolved",
      walls,
      wallState: "intact",
      destroyedAt: null
    };

    await this.sceneAdapter.persistBreakableWallBinding(binding);
    if (existing?.walls?.length) {
      await this.sceneAdapter.releaseBreakableWallFlags(existing, {
        exceptIds: walls.map(wall => wall.id)
      });
    }
    this.store.state.destructibleBindings ??= {};
    this.store.state.destructibleBindings[objectId] = binding;
    this.store.pushHistory(EVENTS.BREAKABLE_WALL_BOUND, {
      objectId,
      sceneId: scene.id,
      tokenId: token.id,
      wallIds: walls.map(wall => wall.id)
    });
    await this.store.save();
    return foundry.utils.deepClone(binding);
  }

  async destroyBreakableWalls(objectId, { notify = true } = {}) {
    const binding = this.findBreakableWallBinding(objectId);
    if (!binding?.walls?.length) return { ok: false, reason: "binding-missing", objectId };
    if (binding.wallState === "destroyed") {
      return { ok: true, alreadyDestroyed: true, binding: foundry.utils.deepClone(binding) };
    }
    if (this.wallMutations.has(objectId)) return { ok: false, reason: "mutation-in-progress", objectId };

    this.wallMutations.add(objectId);
    try {
      const result = await this.sceneAdapter.removeBreakableWalls(binding);
      binding.wallState = "destroyed";
      binding.destroyedAt = new Date().toISOString();
      await this.sceneAdapter.persistBreakableWallBinding(binding);
      this.store.pushHistory(EVENTS.BREAKABLE_WALL_DESTROYED, {
        objectId,
        wallIds: result.removedWallIds
      });
      await this.store.save();
      if (notify) {
        ui.notifications?.info(
          `Marvel Encounter Framework: ${result.removedWallIds.length} Wall segment(s) breached.`
        );
      }
      return { ok: true, binding: foundry.utils.deepClone(binding), ...result };
    } finally {
      this.wallMutations.delete(objectId);
    }
  }

  async repairBreakableWalls(objectId, { notify = true } = {}) {
    const binding = this.findBreakableWallBinding(objectId);
    if (!binding?.walls?.length) return { ok: false, reason: "binding-missing", objectId };
    if (this.wallMutations.has(objectId)) return { ok: false, reason: "mutation-in-progress", objectId };

    this.wallMutations.add(objectId);
    try {
      const token = this.sceneAdapter.getBoundToken(binding);
      if (!token?.actor) return { ok: false, reason: "token-missing", objectId };
      const restored = await this.marvelAdapter?.restoreHealth(token.actor);
      if (!restored?.success) {
        return {
          ok: false,
          reason: restored?.reason ?? "restore-unavailable",
          objectId,
          restore: restored
        };
      }

      const result = await this.sceneAdapter.restoreBreakableWalls(binding);
      binding.wallState = "intact";
      binding.destroyedAt = null;
      binding.status = "resolved";
      await this.sceneAdapter.persistBreakableWallBinding(binding);
      this.store.pushHistory(EVENTS.BREAKABLE_WALL_REPAIRED, {
        objectId,
        wallIds: binding.walls.map(wall => wall.id)
      });
      await this.store.save();
      if (notify) {
        ui.notifications?.info(
          `Marvel Encounter Framework: ${binding.walls.length} Wall segment(s) repaired.`
        );
      }
      return { ok: true, binding: foundry.utils.deepClone(binding), restore: restored, ...result };
    } finally {
      this.wallMutations.delete(objectId);
    }
  }

  async onActorHealthDepleted(actor) {
    const token = actor?.token?.document
      ?? actor?.token
      ?? (actor?.parent?.documentName === "Token" ? actor.parent : null);
    const binding = this.getBreakableWallBindingForToken(token);
    if (!binding?.objectId || binding.wallState === "destroyed") return null;
    this.store.state.destructibleBindings ??= {};
    this.store.state.destructibleBindings[binding.objectId] = {
      ...(this.store.state.destructibleBindings[binding.objectId] ?? {}),
      ...binding
    };
    return this.destroyBreakableWalls(binding.objectId);
  }

  async reset() {
    const previous = this.store.state.activeEncounterId;
    await this.triggerEngine?.resolver.stopFxMasterEffects({ skipFading: true });
    await this.store.reset();
    this.renderDashboard();
    ui.notifications?.info(previous ? "Marvel encounter reset." : "Marvel Encounter Framework runtime cleared.");
    return this.store.state;
  }

  async incrementClock(clockId, amount = 1, { source = "manual" } = {}) {
    const clock = this.store.state.clocks[clockId];
    if (!clock) throw new Error(`Clock '${clockId}' not found.`);

    return this.setClock(clockId, Number(clock.value) + Number(amount), { source });
  }

  async setClock(clockId, value, { source = "manual" } = {}) {
    const clock = this.store.state.clocks[clockId];
    if (!clock) throw new Error(`Clock '${clockId}' not found.`);

    clock.value = Math.max(0, Math.min(Number(clock.max ?? Infinity), Number(value)));
    this.store.pushHistory(EVENTS.CLOCK_CHANGED, { clockId, value: clock.value, source });
    await this.store.save();

    await this.triggerEngine?.emit(EVENTS.CLOCK_CHANGED, {
      clock: foundry.utils.deepClone(clock),
      source
    });

    await this.#evaluatePhaseThresholds();
    this.renderDashboard();
    return foundry.utils.deepClone(clock);
  }

  async updateObjective(objectiveId, patch = {}, { source = "manual" } = {}) {
    const objective = this.store.state.objectives[objectiveId];
    if (!objective) throw new Error(`Objective '${objectiveId}' not found.`);

    if (patch.value != null) objective.value = Number(patch.value);
    if (patch.status) objective.status = patch.status;

    if (objective.target != null && objective.value >= objective.target && objective.status === "active") {
      objective.status = "completed";
    }

    this.store.pushHistory(EVENTS.OBJECTIVE_CHANGED, {
      objectiveId,
      value: objective.value,
      status: objective.status,
      source
    });
    await this.store.save();

    await this.triggerEngine?.emit(EVENTS.OBJECTIVE_CHANGED, {
      objective: foundry.utils.deepClone(objective),
      source
    });

    this.renderDashboard();
    return foundry.utils.deepClone(objective);
  }

  async advancePhase() {
    const encounter = this.activeEncounter;
    if (!encounter) return null;

    const phases = [...(encounter.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const index = phases.findIndex(p => p.id === this.store.state.phaseId);
    const next = phases[index + 1];
    if (!next) {
      ui.notifications?.warn("This encounter is already in its final phase.");
      return null;
    }
    return this.activatePhase(next.id, { source: "manual-advance" });
  }

  async activatePhase(phaseId, { source = "manual" } = {}) {
    const encounter = this.activeEncounter;
    const phase = encounter?.phases?.find(p => p.id === phaseId);
    if (!phase) throw new Error(`Phase '${phaseId}' not found.`);

    if (this.store.state.phaseId === phaseId) return phase;

    const previous = encounter.phases?.find(p => p.id === this.store.state.phaseId) ?? null;
    if (previous?.onExit?.length) {
      await this.triggerEngine?.resolver.executeMany(previous.onExit, { source: `phase:${previous.id}:exit` });
    }

    this.store.state.phaseId = phase.id;
    this.store.pushHistory(EVENTS.PHASE_CHANGED, { phaseId, source });
    await this.store.save();

    if (phase.onEnter?.length) {
      await this.triggerEngine?.resolver.executeMany(phase.onEnter, { source: `phase:${phase.id}:enter` });
    }

    await this.triggerEngine?.emit(EVENTS.PHASE_CHANGED, { phase, source });
    this.renderDashboard();
    return phase;
  }

  async onCombatUpdated(combat, changes) {
    if (!this.activeEncounter || changes.round == null) return;

    const previousRound = this.store.state.lastCombatRound;
    const currentRound = combat.round ?? 0;
    this.store.state.lastCombatRound = currentRound;
    await this.store.save();

    if (previousRound == null || currentRound === previousRound) return;

    if (currentRound > previousRound) {
      await this.triggerEngine?.emit(EVENTS.ROUND_END, {
        combat: { round: previousRound, id: combat.id }
      });
      await this.triggerEngine?.emit(EVENTS.ROUND_START, {
        combat: { round: currentRound, id: combat.id }
      });
    }
  }

  async #evaluatePhaseThresholds() {
    const encounter = this.activeEncounter;
    if (!encounter) return;

    const phases = [...(encounter.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const currentIndex = phases.findIndex(p => p.id === this.store.state.phaseId);

    for (let i = currentIndex + 1; i < phases.length; i++) {
      const phase = phases[i];
      const trigger = phase.trigger;
      if (!trigger?.clock) continue;

      const clock = this.store.state.clocks[trigger.clock];
      if (!clock) continue;

      const pass =
        trigger.gte != null ? clock.value >= trigger.gte :
        trigger.gt != null ? clock.value > trigger.gt :
        trigger.eq != null ? clock.value === trigger.eq :
        false;

      if (pass) {
        await this.activatePhase(phase.id, { source: `phase-threshold:${trigger.clock}` });
        break;
      }
    }
  }

  renderDashboard() {
    if (this.dashboard?.rendered) this.dashboard.render({ force: true });
  }
}
