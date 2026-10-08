import { ACTION_TYPES } from "./constants.js";
import { Logger } from "./logger.js";

export class ActionResolver {
  constructor({ manager, marvelAdapter, sceneAdapter, fxMasterAdapter }) {
    this.manager = manager;
    this.marvel = marvelAdapter;
    this.scene = sceneAdapter;
    this.fxmaster = fxMasterAdapter;
  }

  async execute(action, context = {}) {
    if (!action?.type) return { ok: false, reason: "Action has no type." };
    Logger.debug("Resolving action", action, context);

    switch (action.type) {
      case ACTION_TYPES.INCREMENT_CLOCK:
        return this.manager.incrementClock(action.clock, action.amount ?? 1, { source: context.source ?? "action" });

      case ACTION_TYPES.SET_CLOCK:
        return this.manager.setClock(action.clock, action.value ?? 0, { source: context.source ?? "action" });

      case ACTION_TYPES.UPDATE_OBJECTIVE:
        return this.manager.updateObjective(action.objective, {
          value: action.value,
          status: action.status
        }, { source: context.source ?? "action" });

      case ACTION_TYPES.ACTIVATE_PHASE:
        return this.manager.activatePhase(action.phase, { source: context.source ?? "action" });

      case ACTION_TYPES.CHAT_MESSAGE:
        return this.scene.createChatMessage(action.text ?? action.content ?? "", { whisperGM: action.whisperGM ?? false });

      case ACTION_TYPES.SET_REGION_ENABLED:
        return this.scene.setRegionEnabled(canvas?.scene, action.region, action.enabled ?? true);

      case ACTION_TYPES.PLAY_SOUND:
        return this.scene.playSound(action.src, { volume: action.volume, loop: action.loop });

      case ACTION_TYPES.PLAY_VFX:
        return this.marvel.playEffect(action.profile, {
          location: context.location,
          targetLocation: context.targetLocation,
          scale: action.scale,
          volume: action.volume,
          persist: action.persist,
          name: action.name
        });

      case ACTION_TYPES.PLAY_FXMASTER:
        return this.#playFxMaster(action, context);

      case ACTION_TYPES.STOP_FXMASTER:
        return this.stopFxMasterEffects({
          key: action.key,
          skipFading: action.skipFading,
          context
        });

      case ACTION_TYPES.SET_FXMASTER_REGIONS:
        return this.#reportFxMasterResult(await this.fxmaster.setRegionEffects(action.enabled ?? true, {
          scene: action.scene ?? context.scene,
          skipFading: action.skipFading
        }), action.type);

      case ACTION_TYPES.SPAWN_ACTORS:
        return this.scene.spawnActors(this.manager.activeEncounter, action, context);

      case ACTION_TYPES.REQUEST_ROLL:
        return this.marvel.requestRoll(action);

      case ACTION_TYPES.APPLY_HEALTH_DAMAGE:
        return this.marvel.applyHealthDamage(context.actor, action.amount, action);

      case ACTION_TYPES.APPLY_FOCUS_DAMAGE:
        return this.marvel.applyFocusDamage(context.actor, action.amount, action);

      case ACTION_TYPES.APPLY_STATUS:
        return this.marvel.applyStatus(context.actor, action.status, action);

      default:
        Logger.warn("Unknown action type", action.type);
        return { ok: false, reason: `Unknown action type '${action.type}'.` };
    }
  }

  async executeMany(actions = [], context = {}) {
    const results = [];
    for (const action of actions) {
      results.push(await this.execute(action, context));
    }
    return results;
  }

  async stopFxMasterEffects({ key = null, skipFading = false, context = {} } = {}) {
    const tracked = this.manager.store.state.fxmasterEffects ?? {};
    const keys = key ? [key] : Object.keys(tracked);
    const results = [];

    for (const effectKey of keys) {
      const entry = tracked[effectKey];
      if (!entry) continue;
      const result = await this.fxmaster.stop(entry, {
        scene: context.scene,
        skipFading
      });
      this.#reportFxMasterResult(result, ACTION_TYPES.STOP_FXMASTER);
      results.push(result);
      delete tracked[effectKey];
    }

    this.manager.store.state.fxmasterEffects = tracked;
    await this.manager.store.save();
    return { ok: results.every(result => result.ok || !result.available), results };
  }

  async #playFxMaster(action, context) {
    const result = await this.fxmaster.play(action, context);
    this.#reportFxMasterResult(result, ACTION_TYPES.PLAY_FXMASTER);
    if (!result.ok || !result.key) return result;

    this.manager.store.state.fxmasterEffects ??= {};
    this.manager.store.state.fxmasterEffects[result.key] = {
      ids: result.ids,
      sceneUuid: result.sceneUuid,
      tier: result.tier
    };
    await this.manager.store.save();
    return result;
  }

  #reportFxMasterResult(result, actionType) {
    if (result?.ok) return result;
    if (result?.available === false && result.reason === "module-inactive") {
      Logger.debug(`Skipped optional ${actionType} action because FXMaster is inactive.`);
      return result;
    }
    Logger.warn(`FXMaster action '${actionType}' did not complete.`, result);
    return result;
  }
}
