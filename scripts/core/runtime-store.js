import { MODULE_ID, SETTINGS } from "./constants.js";
import { Logger } from "./logger.js";

export class RuntimeStore {
  constructor() {
    this.state = this.#emptyState();
  }

  #emptyState() {
    return {
      schemaVersion: 1,
      activeEncounterId: null,
      sceneId: null,
      phaseId: null,
      clocks: {},
      objectives: {},
      lastCombatRound: null,
      history: []
    };
  }

  async load() {
    const saved = game.settings.get(MODULE_ID, SETTINGS.RUNTIME_STATE);
    this.state = foundry.utils.mergeObject(this.#emptyState(), saved ?? {}, {
      inplace: false,
      recursive: true
    });
    Logger.debug("Runtime state loaded", this.state);
    return this.state;
  }

  async save() {
    await game.settings.set(MODULE_ID, SETTINGS.RUNTIME_STATE, foundry.utils.deepClone(this.state));
    return this.state;
  }

  async replace(state) {
    this.state = foundry.utils.deepClone(state);
    return this.save();
  }

  async reset() {
    this.state = this.#emptyState();
    return this.save();
  }

  pushHistory(type, payload = {}) {
    this.state.history.push({
      at: new Date().toISOString(),
      type,
      payload
    });
    if (this.state.history.length > 100) this.state.history.splice(0, this.state.history.length - 100);
  }
}
