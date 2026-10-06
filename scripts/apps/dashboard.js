import { MODULE_ID } from "../core/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class EncounterDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "marvel-encounter-dashboard",
    classes: ["marvel-encounter-framework", "mef-dashboard"],
    position: {
      width: 520,
      height: "auto"
    },
    window: {
      icon: "fa-solid fa-burst",
      title: "Marvel Encounter Framework"
    },
    actions: {
      activate: EncounterDashboard.#activate,
      reset: EncounterDashboard.#reset,
      advancePhase: EncounterDashboard.#advancePhase,
      incrementClock: EncounterDashboard.#incrementClock,
      decrementClock: EncounterDashboard.#decrementClock,
      incrementObjective: EncounterDashboard.#incrementObjective,
      toggleObjective: EncounterDashboard.#toggleObjective
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/dashboard.hbs`
    }
  };

  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const active = this.manager.activeEncounter;
    const state = this.manager.state;

    const phases = active?.phases ?? [];
    const phase = phases.find(p => p.id === state.phaseId) ?? null;

    return {
      ...context,
      isGM: game.user.isGM,
      encounters: this.manager.registry.all.map(e => ({
        id: e.id,
        name: e.name,
        active: e.id === state.activeEncounterId
      })),
      activeEncounter: active ? { id: active.id, name: active.name } : null,
      phase,
      clocks: Object.values(state.clocks ?? {}),
      objectives: Object.values(state.objectives ?? {}).map(o => ({
        ...o,
        completed: o.status === "completed",
        failed: o.status === "failed",
        hasTarget: o.target != null
      })),
      system: {
        id: game.system.id,
        version: game.system.version
      }
    };
  }

  static async #activate(_event, target) {
    const select = this.element.querySelector("[name='encounterId']");
    const id = select?.value;
    if (!id) return ui.notifications.warn("Choose an encounter first.");
    await this.manager.activate(id);
    this.render({ force: true });
  }

  static async #reset() {
    await this.manager.reset();
    this.render({ force: true });
  }

  static async #advancePhase() {
    await this.manager.advancePhase();
    this.render({ force: true });
  }

  static async #incrementClock(_event, target) {
    await this.manager.incrementClock(target.dataset.clockId, 1);
    this.render({ force: true });
  }

  static async #decrementClock(_event, target) {
    await this.manager.incrementClock(target.dataset.clockId, -1);
    this.render({ force: true });
  }

  static async #incrementObjective(_event, target) {
    const objective = this.manager.state.objectives[target.dataset.objectiveId];
    if (!objective) return;
    await this.manager.updateObjective(objective.id, { value: Number(objective.value ?? 0) + 1 });
    this.render({ force: true });
  }

  static async #toggleObjective(_event, target) {
    const objective = this.manager.state.objectives[target.dataset.objectiveId];
    if (!objective) return;
    const status = objective.status === "completed" ? "active" : "completed";
    await this.manager.updateObjective(objective.id, { status });
    this.render({ force: true });
  }
}
