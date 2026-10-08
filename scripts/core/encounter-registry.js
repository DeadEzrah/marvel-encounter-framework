import { EncounterValidator } from "./validator.js";
import { Logger } from "./logger.js";

export class EncounterRegistry {
  #encounters = new Map();

  get all() {
    return Array.from(this.#encounters.values());
  }

  get ids() {
    return Array.from(this.#encounters.keys());
  }

  get(id) {
    return this.#encounters.get(id) ?? null;
  }

  has(id) {
    return this.#encounters.has(id);
  }

  register(manifest, { source = "runtime" } = {}) {
    const validation = EncounterValidator.validate(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid encounter '${manifest?.id ?? "unknown"}': ${validation.errors.join(" ")}`);
    }

    const normalized = foundry.utils.deepClone(manifest);
    normalized._source = source;
    normalized._validationWarnings = validation.warnings;
    this.#encounters.set(normalized.id, normalized);
    Logger.debug("Registered encounter", normalized.id, source);
    return normalized;
  }

  async registerFromUrl(url) {
    return this.registerPackageFromUrl(url);
  }

  async registerPackageFromUrl(url) {
    const manifestUrl = this.#resolveUrl(url);
    const manifest = await this.#fetchJson(manifestUrl, "encounter manifest");
    const resolved = foundry.utils.deepClone(manifest);

    for (const collection of ["regions", "objects", "objectives", "phases", "actors"]) {
      resolved[collection] = await this.#resolveCollection(resolved[collection], manifestUrl, collection);
    }

    if (resolved.scene && typeof resolved.scene === "object") {
      for (const key of ["sceneData", "sceneFile", "background", "foreground"]) {
        if (typeof resolved.scene[key] === "string" && resolved.scene[key].trim()) {
          resolved.scene[key] = this.#resolvePackageUrl(resolved.scene[key], manifestUrl);
        }
      }
    }

    return this.register(resolved, { source: manifestUrl });
  }

  async #resolveCollection(entries, manifestUrl, collection) {
    if (entries == null) return [];
    if (!Array.isArray(entries)) {
      throw new Error(`Encounter collection '${collection}' must be an array.`);
    }

    const resolved = [];
    for (const entry of entries) {
      if (typeof entry !== "string") {
        resolved.push(entry);
        continue;
      }

      const resourceUrl = this.#resolvePackageUrl(entry, manifestUrl);
      const resource = await this.#fetchJson(resourceUrl, collection);
      if (!Array.isArray(resource)) {
        throw new Error(`Encounter resource '${resourceUrl}' must contain an array.`);
      }
      resolved.push(...resource);
    }
    return resolved;
  }

  async #fetchJson(url, label) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${label} '${url}': ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  #resolveUrl(value, base = globalThis.location?.href ?? "http://localhost/") {
    const locationUrl = new URL(globalThis.location?.href ?? "http://localhost/");
    const resolved = new URL(value, new URL(base, locationUrl));
    if (resolved.origin === locationUrl.origin) {
      return `${resolved.pathname.replace(/^\/+/, "")}${resolved.search}${resolved.hash}`;
    }
    return resolved.href;
  }

  #resolvePackageUrl(value, manifestUrl) {
    const locationUrl = new URL(globalThis.location?.href ?? "http://localhost/");
    const manifest = new URL(manifestUrl, locationUrl);
    const packageRoot = new URL("./", manifest);
    const resolved = new URL(value, manifest);
    if (resolved.origin !== packageRoot.origin || !resolved.pathname.startsWith(packageRoot.pathname)) {
      throw new Error(`Encounter package reference '${value}' resolves outside '${packageRoot.pathname}'.`);
    }
    return this.#resolveUrl(resolved.href);
  }
}
