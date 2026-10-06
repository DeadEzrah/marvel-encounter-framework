export const MODULE_ID = "marvel-encounter-framework";
export const MODULE_TITLE = "Marvel Encounter Framework";

export const SETTINGS = Object.freeze({
  RUNTIME_STATE: "runtimeState",
  DEBUG: "debug"
});

export const EVENTS = Object.freeze({
  ENCOUNTER_ACTIVATED: "encounter.activated",
  ENCOUNTER_RESET: "encounter.reset",
  ROUND_START: "combat.roundStart",
  ROUND_END: "combat.roundEnd",
  CLOCK_CHANGED: "clock.changed",
  OBJECTIVE_CHANGED: "objective.changed",
  PHASE_CHANGED: "phase.changed"
});

export const ACTION_TYPES = Object.freeze({
  INCREMENT_CLOCK: "increment-clock",
  SET_CLOCK: "set-clock",
  UPDATE_OBJECTIVE: "update-objective",
  ACTIVATE_PHASE: "activate-phase",
  CHAT_MESSAGE: "chat-message",
  SET_REGION_ENABLED: "set-region-enabled",
  PLAY_SOUND: "play-sound",
  PLAY_VFX: "play-vfx",
  APPLY_HEALTH_DAMAGE: "apply-health-damage",
  APPLY_FOCUS_DAMAGE: "apply-focus-damage",
  APPLY_STATUS: "apply-status",
  REQUEST_ROLL: "request-roll"
});
