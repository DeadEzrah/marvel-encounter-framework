const FXMASTER_MODULE_ID = "fxmaster";
const FXMASTER_PLUS_MODULE_ID = "fxmaster-plus";

function sanitizeKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withStableIds(payload, key) {
  const stableKey = sanitizeKey(key);
  const normalized = structuredClone(payload);

  if (Array.isArray(normalized.effects)) {
    normalized.effects = normalized.effects.map((effect, index) => ({
      ...effect,
      id: effect.id ?? `apiMacro_mef_${stableKey}_e${index}`
    }));
  }
  if (Array.isArray(normalized.particles)) {
    normalized.particles = normalized.particles.map((effect, index) => ({
      ...effect,
      id: effect.id ?? `apiMacro_mef_${stableKey}_p${index}`
    }));
  }
  if (Array.isArray(normalized.filters)) {
    normalized.filters = normalized.filters.map((effect, index) => ({
      ...effect,
      id: effect.id ?? `apiMacro_mef_${stableKey}_f${index}`
    }));
  }

  return normalized;
}

export class FxMasterAdapter {
  get active() {
    return globalThis.game?.modules?.get?.(FXMASTER_MODULE_ID)?.active === true;
  }

  get api() {
    return globalThis.FXMASTER?.api ?? null;
  }

  get plusActive() {
    if (!this.active) return false;
    if (typeof this.api?.presets?.hasFxmasterPlus === "function") {
      return this.api.presets.hasFxmasterPlus() === true;
    }
    return globalThis.game?.modules?.get?.(FXMASTER_PLUS_MODULE_ID)?.active === true;
  }

  get capabilities() {
    return {
      effects: this.active && typeof this.api?.effects?.play === "function",
      regionEffects: this.active
        && typeof this.api?.startRegionEffects === "function"
        && typeof this.api?.stopRegionEffects === "function",
      plus: this.plusActive
    };
  }

  async play(action, context = {}) {
    if (!this.capabilities.effects) return this.#unavailable("effects.play");

    const key = sanitizeKey(action.key);
    if (!key) return { ok: false, available: true, reason: "missing-key" };

    const tier = this.plusActive && action.plus ? "plus" : "core";
    const source = tier === "plus" ? action.plus : action.core;
    if (!source || typeof source !== "object") {
      return { ok: false, available: true, reason: "effects-unavailable", tier, key };
    }

    const payload = withStableIds(source, key);
    const scene = action.scene ?? context.scene ?? globalThis.canvas?.scene ?? null;
    const ids = await this.api.effects.play({
      ...payload,
      scene,
      skipFading: action.skipFading ?? false
    });

    return {
      ok: true,
      available: true,
      provider: FXMASTER_MODULE_ID,
      tier,
      key,
      sceneUuid: scene?.uuid ?? (typeof scene === "string" ? scene : null),
      ids
    };
  }

  async stop(trackedEffect, options = {}) {
    if (!this.capabilities.effects) return this.#unavailable("effects.stop");
    const ids = trackedEffect?.ids;
    if (!ids || typeof ids !== "object") {
      return { ok: false, available: true, reason: "missing-effect-ids" };
    }

    const scene = options.scene ?? trackedEffect.sceneUuid ?? globalThis.canvas?.scene ?? null;
    await this.api.effects.stop({
      particles: ids.particles ?? [],
      filters: ids.filters ?? [],
      scene,
      skipFading: options.skipFading ?? false
    });
    return { ok: true, available: true, provider: FXMASTER_MODULE_ID };
  }

  async setRegionEffects(enabled, options = {}) {
    if (!this.capabilities.regionEffects) return this.#unavailable("region-effects");
    const method = enabled ? "startRegionEffects" : "stopRegionEffects";
    const scene = options.scene ?? globalThis.canvas?.scene ?? null;
    await this.api[method]({
      scene,
      skipFading: options.skipFading ?? false
    });
    return { ok: true, available: true, provider: FXMASTER_MODULE_ID, enabled };
  }

  #unavailable(method) {
    return {
      ok: false,
      available: false,
      provider: FXMASTER_MODULE_ID,
      method,
      reason: this.active ? "api-unavailable" : "module-inactive"
    };
  }
}
