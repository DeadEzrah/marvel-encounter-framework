import { EVENTS, MODULE_ID, RUNTIME_SCHEMA_VERSION } from "./constants.js";
import { Logger } from "./logger.js";

export class EncounterManager {
  constructor({ registry, store, sceneAdapter }) {
    this.registry = registry;
    this.store = store;
    this.sceneAdapter = sceneAdapter;
    this.triggerEngine = null;
    this.dashboard = null;
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
