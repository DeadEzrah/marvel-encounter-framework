import { Logger } from "../core/logger.js";
import { MODULE_ID } from "../core/constants.js";

export function isDestructibleTokenCombatEligible(token) {
  const flags = token?.flags?.[MODULE_ID];
  return !flags?.destructible || flags.includeInCombat === true;
}

export function applySceneArtwork(data, descriptor = {}) {
  const legacyBackground = data.background && typeof data.background === "object"
    ? data.background
    : {};
  const legacyForeground = typeof data.foreground === "string"
    ? { src: data.foreground }
    : data.foreground && typeof data.foreground === "object"
      ? data.foreground
      : {};
  const levels = Array.isArray(data.levels) && data.levels.length
    ? data.levels
    : [{}];
  const level = levels[0];

  level._id ??= data.initialLevel ?? "defaultLevel0000";
  level.name ??= "Level";
  level.elevation = {
    bottom: 0,
    top: Number(data.foregroundElevation ?? 20),
    ...(level.elevation ?? {})
  };
  level.background = {
    color: data.backgroundColor ?? "#999999",
    tint: "#ffffff",
    alphaThreshold: 0.75,
    ...(level.background ?? {}),
    src: descriptor.background ?? level.background?.src ?? legacyBackground.src ?? null
  };
  level.foreground = {
    tint: "#ffffff",
    alphaThreshold: 0.75,
    ...(level.foreground ?? {}),
    src: descriptor.foreground ?? level.foreground?.src ?? legacyForeground.src ?? null
  };
  level.fog = {
    src: data.fog?.overlay ?? null,
    ...(level.fog ?? {})
  };
  level.textures = {
    anchorX: legacyBackground.anchorX ?? 0.5,
    anchorY: legacyBackground.anchorY ?? 0.5,
    offsetX: legacyBackground.offsetX ?? 0,
    offsetY: legacyBackground.offsetY ?? 0,
    fit: legacyBackground.fit ?? "fill",
    scaleX: legacyBackground.scaleX ?? 1,
    scaleY: legacyBackground.scaleY ?? 1,
    rotation: legacyBackground.rotation ?? 0,
    ...(level.textures ?? {})
  };
  level.visibility ??= { levels: [] };
  level.sort ??= 0;
  level.flags ??= {};

  data.levels = levels;
  data.initialLevel = level._id;
  delete data.background;
  delete data.backgroundColor;
  delete data.foreground;
  delete data.foregroundElevation;
  return data;
}

export class FoundrySceneAdapter {
  async ensureEncounterScene(encounter) {
    const descriptor = encounter?.scene;
    if (!descriptor) return { ok: true, scene: null, created: false };

    const existing = game.scenes?.find?.(scene =>
      scene.getFlag?.(MODULE_ID, "encounterId") === encounter.id
      || scene.name === (descriptor.name ?? encounter.name)
    );
    if (existing) {
      const sceneData = foundry.utils.deepClone(existing.toObject?.() ?? {});
      applySceneArtwork(sceneData, descriptor);
      const updates = {
        [`flags.${MODULE_ID}.encounterId`]: encounter.id,
        initialLevel: sceneData.initialLevel,
        levels: sceneData.levels
      };
      await existing.update(updates);
      return { ok: true, scene: existing, created: false, updated: true };
    }

    let sceneData = {};
    const sceneDataUrl = descriptor.sceneData ?? descriptor.sceneFile;
    if (sceneDataUrl) {
      const response = await fetch(sceneDataUrl);
      if (!response.ok) {
        throw new Error(`Failed to load Scene data '${sceneDataUrl}': ${response.status} ${response.statusText}`);
      }
      sceneData = await response.json();
    }

    const data = foundry.utils.deepClone(sceneData);
    delete data._id;
    data.name = descriptor.name ?? encounter.name ?? data.name;
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
      [MODULE_ID]: { encounterId: encounter.id }
    }, { inplace: false });

    applySceneArtwork(data, descriptor);
    if (!data.grid && descriptor.gridSize) {
      data.grid = {
        type: descriptor.gridVisible === false ? 0 : 1,
        size: descriptor.gridSize,
        distance: descriptor.gridDistance ?? 5,
        units: descriptor.gridUnits ?? "ft"
      };
    }

    const scene = await Scene.create(data);
    return { ok: true, scene, created: true };
  }

  async setRegionEnabled(scene, regionRef, enabled) {
    if (!scene) return { ok: false, reason: "No scene supplied." };

    const region = scene.regions?.get(regionRef)
      ?? scene.regions?.find?.(r => r.name === regionRef || r.getFlag("marvel-encounter-framework", "id") === regionRef);

    if (!region) {
      Logger.warn("Region not found", regionRef);
      return { ok: false, reason: `Region '${regionRef}' not found.` };
    }

    // First-pass convention: disable/enable each behavior rather than mutating Region visibility.
    const updates = Array.from(region.behaviors ?? []).map(b => ({
      _id: b.id,
      disabled: !enabled
    }));

    if (updates.length) {
      await region.updateEmbeddedDocuments("RegionBehavior", updates);
    }

    return { ok: true, region: region.id, enabled };
  }

  async createChatMessage(content, { whisperGM = false } = {}) {
    const data = { content };
    if (whisperGM) data.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
    return ChatMessage.create(data);
  }

  async spawnActors(encounter, action, context = {}, { bindings = {} } = {}) {
    const scene = game.scenes?.get?.(action.sceneId ?? encounter?.sceneId)
      ?? game.scenes?.get?.(game.marvelEncounters?.state?.sceneId)
      ?? canvas?.scene;
    if (!scene) throw new Error("Cannot spawn actors without an active encounter Scene.");

    const roster = new Map((encounter?.actors ?? []).map(actor => [actor.id, actor]));
    const placements = action.actors ?? [];
    if (!Array.isArray(placements) || placements.length === 0) {
      throw new Error("spawn-actors requires a non-empty actors array.");
    }

    const resolved = [];
    for (const [placementIndex, placement] of placements.entries()) {
      const rosterEntry = roster.get(placement.actor);
      if (!rosterEntry) throw new Error(`Encounter actor '${placement.actor}' is not defined.`);
      if (!rosterEntry.uuid) throw new Error(`Encounter actor '${placement.actor}' has no compendium UUID.`);

      let actor;
      try {
        actor = await fromUuid(rosterEntry.uuid);
      } catch (error) {
        throw new Error(
          `Actor UUID '${rosterEntry.uuid}' for encounter actor '${rosterEntry.id}' could not be resolved: ${error.message}`,
          { cause: error }
        );
      }
      if (!actor || actor.documentName !== "Actor") {
        throw new Error(
          `Actor UUID '${rosterEntry.uuid}' for encounter actor '${rosterEntry.id}' did not resolve to an Actor.`
        );
      }
      resolved.push({ actor, placement, placementIndex, rosterEntry });
    }

    const tokenData = [];
    const pendingBindings = [];
    const reusedBindings = [];
    const missingBindings = [];
    for (const { actor, placement, placementIndex, rosterEntry } of resolved) {
      const spawnActor = await this.#ensureWorldActor(actor, encounter, rosterEntry);
      const destructible = Boolean(
        actor.getFlag?.("marvel-multiverse", "destructible")
        ?? actor.flags?.["marvel-multiverse"]?.destructible
      );

      const count = Math.max(1, Number(placement.count ?? 1));
      for (let index = 0; index < count; index++) {
        const source = placement.source ?? action.id ?? context.source ?? "action";
        const objectBase = placement.objectId ?? placement.id
          ?? `${source}:${rosterEntry.id}:${placementIndex}`;
        const objectId = count > 1 ? `${objectBase}:${index}` : objectBase;

        if (destructible) {
          const existingBinding = bindings[objectId];
          const existingToken = this.#findBoundToken(scene, existingBinding, objectId);
          if (existingToken) {
            reusedBindings.push(this.#createBinding({
              encounter, scene, rosterEntry, spawnActor, source, objectId,
              tokenId: existingToken.id,
              actorId: existingToken.actorId ?? spawnActor.id,
              sourceUuid: actor.uuid ?? rosterEntry.uuid
            }));
            continue;
          }
          if (existingBinding) {
            missingBindings.push({ ...foundry.utils.deepClone(existingBinding), status: "missing" });
            continue;
          }
        }

        const token = await spawnActor.getTokenDocument({
          x: Number(placement.x ?? action.x ?? 0) + (Number(placement.offsetX ?? 0) * index),
          y: Number(placement.y ?? action.y ?? 0) + (Number(placement.offsetY ?? 0) * index),
          hidden: placement.hidden ?? action.hidden ?? false,
          name: placement.name ?? spawnActor.name,
          ...(destructible ? { actorLink: false } : {}),
          flags: {
            [MODULE_ID]: {
              encounterId: encounter.id,
              rosterId: rosterEntry.id,
              source,
              ...(destructible ? {
                objectId,
                sourceUuid: actor.uuid ?? rosterEntry.uuid,
                destructible: true,
                includeInCombat: placement.includeInCombat === true
              } : {})
            }
          }
        });
        const data = token.toObject();
        delete data._id;
        tokenData.push(data);
        pendingBindings.push(destructible ? {
          encounter, scene, rosterEntry, spawnActor, source, objectId,
          actorId: data.actorId ?? spawnActor.id,
          sourceUuid: actor.uuid ?? rosterEntry.uuid
        } : null);
      }
    }

    const tokens = tokenData.length
      ? await scene.createEmbeddedDocuments("Token", tokenData)
      : [];
    const createdBindings = [];
    for (let index = 0; index < tokens.length; index++) {
      const pending = pendingBindings[index];
      if (!pending) continue;
      createdBindings.push(this.#createBinding({
        ...pending,
        tokenId: tokens[index].id,
        actorId: tokens[index].actorId ?? pending.actorId
      }));
    }

    return {
      ok: missingBindings.length === 0,
      sceneId: scene.id,
      tokenIds: tokens.map(token => token.id),
      bindings: [...reusedBindings, ...createdBindings, ...missingBindings],
      reusedTokenIds: reusedBindings.map(binding => binding.tokenId),
      missing: missingBindings
    };
  }

  #findBoundToken(scene, binding, objectId) {
    return scene.tokens?.get?.(binding?.tokenId)
      ?? scene.tokens?.find?.(token =>
        token.getFlag?.(MODULE_ID, "objectId") === objectId
        || token.flags?.[MODULE_ID]?.objectId === objectId
      )
      ?? null;
  }

  #createBinding({
    encounter, scene, rosterEntry, spawnActor, source, objectId, tokenId, actorId, sourceUuid
  }) {
    return {
      version: 1,
      encounterId: encounter.id,
      objectId,
      source,
      sceneId: scene.id,
      tokenId,
      actorId: actorId ?? spawnActor.id ?? null,
      rosterId: rosterEntry.id,
      sourceActorUuid: sourceUuid,
      status: "resolved"
    };
  }

  async #ensureWorldActor(actor, encounter, rosterEntry) {
    if (!actor.pack) return actor;

    const sourceUuid = actor.uuid ?? rosterEntry.uuid;
    const existing = game.actors?.find?.(candidate =>
      candidate.getFlag?.(MODULE_ID, "sourceUuid") === sourceUuid
    );
    if (existing) return existing;

    const data = actor.toObject();
    delete data._id;
    delete data._key;
    data.flags = foundry.utils.deepClone(data.flags ?? {});
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      sourceUuid,
      encounterId: encounter.id,
      rosterId: rosterEntry.id
    };

    const imported = await Actor.create(data);
    if (!imported) {
      throw new Error(`Actor UUID '${sourceUuid}' could not be imported into the world.`);
    }
    return imported;
  }

  async playSound(src, { volume = 0.8, loop = false } = {}) {
    if (!src) return { ok: false, reason: "No sound source." };
    try {
      const sound = await foundry.audio.AudioHelper.play({ src, volume, loop }, true);
      return { ok: true, sound };
    } catch (error) {
      Logger.warn("Unable to play sound", src, error);
      return { ok: false, error };
    }
  }
}
