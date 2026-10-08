export class EncounterValidator {
  static validate(manifest) {
    const errors = [];
    const warnings = [];

    if (!manifest || typeof manifest !== "object") {
      errors.push("Encounter manifest must be an object.");
      return { valid: false, errors, warnings };
    }

    for (const key of ["id", "name", "version"]) {
      if (!manifest[key] || typeof manifest[key] !== "string") {
        errors.push(`Missing or invalid required field: ${key}`);
      }
    }

    if (!manifest.scene || typeof manifest.scene !== "object") {
      warnings.push("Encounter has no scene descriptor.");
    }

    if (manifest.clocks && !Array.isArray(manifest.clocks)) {
      errors.push("clocks must be an array.");
    }

    if (manifest.objectives && !Array.isArray(manifest.objectives)) {
      errors.push("objectives must be an array.");
    }

    if (manifest.phases && !Array.isArray(manifest.phases)) {
      errors.push("phases must be an array.");
    }

    if (manifest.actors && !Array.isArray(manifest.actors)) {
      errors.push("actors must be an array.");
    }

    if (manifest.compatibility?.system && manifest.compatibility.system !== "marvel-multiverse") {
      errors.push(`Unsupported target system: ${manifest.compatibility.system}`);
    }

    const ids = new Set();
    for (const collection of ["clocks", "objectives", "phases", "regions", "objects", "actors", "triggers"]) {
      const entries = manifest[collection];
      if (entries != null && !Array.isArray(entries)) continue;
      for (const entry of entries ?? []) {
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id.trim()) {
          errors.push(`${collection} contains an entry without an id.`);
          continue;
        }
        const compound = `${collection}:${entry.id}`;
        if (ids.has(compound)) errors.push(`Duplicate ${collection} id: ${entry.id}`);
        ids.add(compound);
      }
    }

    for (const trigger of Array.isArray(manifest.triggers) ? manifest.triggers : []) {
      if (typeof trigger.event !== "string" || !trigger.event.trim()) {
        errors.push(`Trigger '${trigger.id}' has no event.`);
      }
      if (trigger.actions != null && !Array.isArray(trigger.actions)) {
        errors.push(`Trigger '${trigger.id}' actions must be an array.`);
      }
    }

    for (const phase of Array.isArray(manifest.phases) ? manifest.phases : []) {
      for (const field of ["onEnter", "onExit"]) {
        if (phase[field] != null && !Array.isArray(phase[field])) {
          errors.push(`Phase '${phase.id}' ${field} must be an array.`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
