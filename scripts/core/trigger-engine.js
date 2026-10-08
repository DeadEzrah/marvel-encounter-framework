import { Logger } from "./logger.js";

export class TriggerEngine {
  constructor({ manager, resolver }) {
    this.manager = manager;
    this.resolver = resolver;
  }

  async emit(event, context = {}) {
    const encounter = this.manager.activeEncounter;
    if (!encounter) return [];

    Logger.debug("Encounter event", event, context);

    const triggers = (encounter.triggers ?? []).filter(t => t.event === event);
    const results = [];

    for (const trigger of triggers) {
      if (trigger.once && this.manager.store.state.firedTriggers?.includes(trigger.id)) continue;
      if (!this.#conditionsPass(trigger.conditions ?? [], context)) continue;
      const result = {
        trigger: trigger.id ?? null,
        actions: await this.resolver.executeMany(trigger.actions ?? [], {
          ...context,
          source: `trigger:${trigger.id ?? event}`
        })
      };
      results.push(result);

      if (trigger.once && trigger.id) {
        this.manager.store.state.firedTriggers ??= [];
        this.manager.store.state.firedTriggers.push(trigger.id);
        await this.manager.store.save();
      }
    }

    return results;
  }

  #conditionsPass(conditions, context) {
    return conditions.every(c => {
      const actual = this.#resolvePath(c.path, context);
      switch (c.op) {
        case "==": return actual === c.value;
        case "!=": return actual !== c.value;
        case ">": return actual > c.value;
        case ">=": return actual >= c.value;
        case "<": return actual < c.value;
        case "<=": return actual <= c.value;
        case "includes": return Array.isArray(actual) ? actual.includes(c.value) : String(actual ?? "").includes(String(c.value));
        default:
          Logger.warn("Unknown condition operator", c.op, c);
          return false;
      }
    });
  }

  #resolvePath(path, context) {
    const scope = {
      ...context,
      encounter: {
        id: this.manager.store.state.activeEncounterId,
        phase: this.manager.store.state.phaseId
      },
      clock: context.clock ?? null,
      objective: context.objective ?? null,
      combat: context.combat ?? game.combat ?? null
    };
    return String(path ?? "").split(".").reduce((value, key) => value?.[key], scope);
  }
}
