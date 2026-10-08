import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./core/constants.js";
import { Logger } from "./core/logger.js";
import { EncounterRegistry } from "./core/encounter-registry.js";
import { RuntimeStore } from "./core/runtime-store.js";
import { EncounterManager } from "./core/encounter-manager.js";
import { ActionResolver } from "./core/action-resolver.js";
import { TriggerEngine } from "./core/trigger-engine.js";
import { MarvelMultiverseAdapter } from "./adapters/marvel-multiverse-adapter.js";
import { FoundrySceneAdapter } from "./adapters/foundry-scene-adapter.js";
import { EncounterDashboard } from "./apps/dashboard.js";

const registry = new EncounterRegistry();
const store = new RuntimeStore();
const marvelAdapter = new MarvelMultiverseAdapter();
const sceneAdapter = new FoundrySceneAdapter();
const manager = new EncounterManager({ registry, store, sceneAdapter });
const resolver = new ActionResolver({ manager, marvelAdapter, sceneAdapter });
const triggerEngine = new TriggerEngine({ manager, resolver });
manager.triggerEngine = triggerEngine;

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.RUNTIME_STATE, {
    name: "Encounter Runtime State",
    hint: "Internal persisted state for the currently active Marvel encounter.",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: "Debug Logging",
    hint: "Write Marvel Encounter Framework diagnostics to the browser console.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

function exposeApi() {
  const api = {
    registry,
    store,
    manager,
    adapters: {
      marvel: marvelAdapter,
      scene: sceneAdapter
    },

    openDashboard() {
      if (!game.user.isGM) return ui.notifications.warn("Only a GM can open the Marvel Encounter Dashboard.");
      manager.dashboard ??= new EncounterDashboard(manager);
      manager.dashboard.render({ force: true });
      return manager.dashboard;
    },

    registerEncounter(manifest, options) {
      return registry.register(manifest, options);
    },

    async registerEncounterFromUrl(url) {
      return registry.registerFromUrl(url);
    },

    async registerEncounterPackageFromUrl(url) {
      return registry.registerPackageFromUrl(url);
    },

    activate(id) {
      return manager.activate(id);
    },

    reset() {
      return manager.reset();
    },

    advancePhase() {
      return manager.advancePhase();
    },

    incrementClock(id, amount = 1) {
      return manager.incrementClock(id, amount);
    },

    updateObjective(id, patch) {
      return manager.updateObjective(id, patch);
    },

    get activeEncounter() {
      return manager.activeEncounter;
    },

    get state() {
      return store.state;
    }
  };

  game.marvelEncounters = api;
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
}

function addSettingsButton(application, element) {
  if (!game.user.isGM) return;
  if (element.querySelector?.("[data-action='openMarvelEncounterDashboard']")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "openMarvelEncounterDashboard";
  button.classList.add("mef-open-dashboard");
  button.innerHTML = `<i class="fa-solid fa-burst"></i> ${MODULE_TITLE}`;

  button.addEventListener("click", () => game.marvelEncounters.openDashboard());

  const target =
    element.querySelector?.(".settings-sidebar") ??
    element.querySelector?.(".settings") ??
    element;

  target.append(button);
}

function addSidebarButton(_application, element = document.querySelector("#sidebar")) {
  if (!game.user.isGM) return;

  const sidebar = element?.matches?.("#sidebar")
    ? element
    : element?.querySelector?.("#sidebar") ?? document.querySelector("#sidebar");
  const menu = sidebar?.querySelector?.("#sidebar-tabs > menu");
  if (!menu || menu.querySelector(".mef-sidebar-launch")) return;

  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("ui-control", "plain", "icon", "fa-solid", "fa-burst", "mef-sidebar-launch");
  button.setAttribute("aria-label", MODULE_TITLE);
  button.dataset.tooltip = MODULE_TITLE;
  button.title = MODULE_TITLE;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    game.marvelEncounters.openDashboard();
  });
  item.append(button);

  const settingsItem = menu.querySelector("[data-tab='settings']")?.closest("li");
  menu.insertBefore(item, settingsItem ?? menu.lastElementChild);
}

Hooks.once("init", () => {
  registerSettings();
  Logger.info("Initializing");
});

Hooks.once("ready", async () => {
  await store.load();

  try {
    await registry.registerFromUrl(`modules/${MODULE_ID}/encounters/city-intersection/encounter.json`);
  } catch (error) {
    Logger.error("Unable to register bundled encounter.", error);
    ui.notifications?.error("Marvel Encounter Framework could not load its bundled test encounter. See console.");
  }

  exposeApi();
  addSidebarButton();
  Hooks.callAll("marvel-encounter-framework.ready", game.marvelEncounters);

  Hooks.on("updateCombat", async (combat, changes) => {
    if (!game.user.isGM) return;
    try {
      await manager.onCombatUpdated(combat, changes);
    } catch (error) {
      Logger.error("Combat event handling failed.", error);
    }
  });

  Logger.info("Ready");
  if (game.user.isGM) {
    ui.notifications?.info("Marvel Encounter Framework ready. Open it from the sidebar burst button or Settings.");
  }
});

Hooks.on("renderSidebar", addSidebarButton);
Hooks.on("renderSettings", addSettingsButton);
Hooks.on("renderSettingsConfig", addSettingsButton);
