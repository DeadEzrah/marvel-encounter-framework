import { ACTION_TYPES } from "./constants.js";
import { Logger } from "./logger.js";

export class ActionResolver {
  constructor({ manager, marvelAdapter, sceneAdapter }) {
    this.manager = manager;
    this.marvel = marvelAdapter;
    this.scene = sceneAdapter;
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
}
