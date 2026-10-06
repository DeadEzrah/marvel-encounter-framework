import { Logger } from "../core/logger.js";

export class MarvelMultiverseAdapter {
  get systemReady() {
    return game.system?.id === "marvel-multiverse";
  }

  get version() {
    return game.system?.version ?? null;
  }

  get api() {
    return game.marvelMultiverse ?? game.MarvelMultiverse ?? null;
  }

  get capabilities() {
    return {
      requestRoll: typeof this.api?.requestRoll === "function",
      playEffect: typeof this.api?.playEffect === "function",
      applyDamage: typeof this.api?.applyDamage === "function",
      applyStatus: typeof this.api?.applyStatus === "function",
      resolveEnvironmentalAttack: typeof this.api?.resolveEnvironmentalAttack === "function",
      resolveCollision: typeof this.api?.resolveCollision === "function"
    };
  }

  async requestRoll(request) {
    if (!this.capabilities.requestRoll) return this.#unavailable("requestRoll");
    return this.api.requestRoll(request);
  }

  async applyHealthDamage(actor, amount, options = {}) {
    if (!this.capabilities.applyDamage) return this.#unavailable("applyDamage");
    return this.api.applyDamage({ actor, kind: "health", amount, ...options });
  }

  async applyFocusDamage(actor, amount, options = {}) {
    if (!this.capabilities.applyDamage) return this.#unavailable("applyDamage");
    return this.api.applyDamage({ actor, kind: "focus", amount, ...options });
  }

  async applyStatus(actor, statusId, options = {}) {
    if (!this.capabilities.applyStatus) return this.#unavailable("applyStatus");
    return this.api.applyStatus({ actor, status: statusId, ...options });
  }

  async playEffect(profile, options = {}) {
    if (!this.capabilities.playEffect) return this.#unavailable("playEffect", { notify: false });
    const location = options.location ?? this.#defaultEffectLocation();
    if (!location) return { ok: false, available: true, reason: "location-unavailable", profile };
    return this.api.playEffect(profile, { ...options, location });
  }

  async resolveEnvironmentalAttack(request) {
    if (!this.capabilities.resolveEnvironmentalAttack) return this.#unavailable("resolveEnvironmentalAttack");
    return this.api.resolveEnvironmentalAttack(request);
  }

  async resolveCollision(request) {
    if (!this.capabilities.resolveCollision) return this.#unavailable("resolveCollision");
    return this.api.resolveCollision(request);
  }

  #defaultEffectLocation() {
    const canvas = globalThis.canvas;
    const controlled = canvas?.tokens?.controlled?.[0];
    if (controlled) return controlled;

    const rect = canvas?.dimensions?.sceneRect;
    if (rect) {
      return {
        x: rect.x + (rect.width / 2),
        y: rect.y + (rect.height / 2)
      };
    }
    return null;
  }

  #unavailable(method, { notify = true } = {}) {
    Logger.warn(`Marvel system API method '${method}' is unavailable.`);
    if (notify) {
      ui.notifications?.warn(`Marvel Encounter Framework: the installed Marvel system does not expose ${method}.`);
    }
    return { ok: false, available: false, method };
  }
}
