import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./core/constants.js";
import { Logger } from "./core/logger.js";
import { EncounterRegistry } from "./core/encounter-registry.js";
import { RuntimeStore } from "./core/runtime-store.js";
import { EncounterManager } from "./core/encounter-manager.js";
import { ActionResolver } from "./core/action-resolver.js";
import { TriggerEngine } from "./core/trigger-engine.js";
import { MarvelMultiverseAdapter } from "./adapters/marvel-multiverse-adapter.js";
import {
  FoundrySceneAdapter,
  isDestructibleTokenCombatEligible
} from "./adapters/foundry-scene-adapter.js";
import { FxMasterAdapter } from "./adapters/fxmaster-adapter.js";
import { EncounterDashboard } from "./apps/dashboard.js";

const registry = new EncounterRegistry();
const store = new RuntimeStore();
const marvelAdapter = new MarvelMultiverseAdapter();
const sceneAdapter = new FoundrySceneAdapter();
const fxMasterAdapter = new FxMasterAdapter();
const manager = new EncounterManager({ registry, store, sceneAdapter, marvelAdapter });
const resolver = new ActionResolver({ manager, marvelAdapter, sceneAdapter, fxMasterAdapter });
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
      scene: sceneAdapter,
      fxmaster: fxMasterAdapter
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

    reconcileDestructibleBindings(options) {
      return manager.reconcileDestructibleBindings(options);
    },

    getDestructibleBindings(options) {
      return manager.getDestructibleBindings(options);
    },

    bindBreakableWalls(options) {
      return manager.bindBreakableWalls(options);
    },

    destroyBreakableWalls(objectId, options) {
      return manager.destroyBreakableWalls(objectId, options);
    },

    repairBreakableWalls(objectId, options) {
      return manager.repairBreakableWalls(objectId, options);
    },

    get compatibility() {
      return marvelAdapter.compatibility;
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
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root || root.querySelector("[data-action='openMarvelEncounterDashboard']")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "openMarvelEncounterDashboard";
  button.classList.add("mef-open-dashboard");
  button.innerHTML = `<i class="fa-solid fa-burst"></i> ${MODULE_TITLE}`;

  button.addEventListener("click", () => game.marvelEncounters.openDashboard());

  const target =
    root.querySelector(".settings-sidebar") ??
    root.querySelector(".settings") ??
    root;

  target.append(button);
}

async function linkSelectedBreakableWalls() {
  const targets = Array.from(game.user?.targets ?? []);
  const selectedWalls = (canvas.walls?.placeables ?? canvas.walls?.objects?.children ?? [])
    .filter(wall => wall.controlled)
    .map(wall => wall.document)
    .filter(Boolean);
  if (targets.length !== 1) {
    ui.notifications?.warn("Target exactly one destructible Token before linking Wall segments.");
    return;
  }
  if (!selectedWalls.length) {
    ui.notifications?.warn("Select at least one Wall segment before linking a breakable wall.");
    return;
  }

  const token = targets[0]?.document ?? targets[0];
  try {
    const binding = await manager.bindBreakableWalls({
      sceneId: canvas.scene?.id,
      tokenId: token.id,
      wallIds: selectedWalls.map(wall => wall.id)
    });
    ui.notifications?.info(
      `Marvel Encounter Framework: linked ${binding.walls.length} Wall segment(s) to ${token.name}.`
    );
  } catch (error) {
    Logger.error("Breakable Wall linking failed.", error);
    ui.notifications?.error(`Marvel Encounter Framework: ${error.message}`);
  }
}

function addSceneControlButton(controls) {
  if (!game.user.isGM) return;
  const control = controls.tokens ?? Object.values(controls)[0];
  if (control?.tools) {
    control.tools.marvelEncounters = {
      name: "marvelEncounters",
      title: "Marvel Encounters",
      icon: "fa-solid fa-burst",
      button: true,
      onChange: () => game.marvelEncounters?.openDashboard()
    };
  }

  const walls = controls.walls;
  if (walls?.tools) {
    walls.tools.linkBreakableWall = {
      name: "linkBreakableWall",
      title: "Link Breakable Wall",
      icon: "fa-solid fa-link",
      button: true,
      onChange: () => void linkSelectedBreakableWalls()
    };
  }
}

function addBreakableWallHudButton(application, element) {
  if (!game.user.isGM) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const token = application.object?.document ?? application.object;
  const binding = manager.getBreakableWallBindingForToken(token);
  if (!root || binding?.wallState !== "destroyed") return;
  const column = root.querySelector(".col.right");
  if (!column || column.querySelector("[data-action='repairBreakableWall']")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon";
  button.dataset.action = "repairBreakableWall";
  button.title = "Repair Breakable Wall";
  button.setAttribute("aria-label", "Repair Breakable Wall");
  button.innerHTML = '<i class="fa-solid fa-hammer" aria-hidden="true"></i>';
  button.addEventListener("click", async () => {
    const result = await manager.repairBreakableWalls(binding.objectId);
    if (!result.ok) {
      ui.notifications?.error(`Marvel Encounter Framework: wall repair failed (${result.reason}).`);
      return;
    }
    application.render({ force: true });
  });
  column.append(button);
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
  const compatibility = marvelAdapter.compatibility;
  if (!compatibility.ok) {
    Logger.error("Incompatible Marvel Multiverse system or API.", compatibility);
    ui.notifications?.error(
      compatibility.reason === "unsupported-version"
        ? `Marvel Encounter Framework requires Marvel Multiverse ${compatibility.minimumVersion} or newer.`
        : "Marvel Encounter Framework requires the compatible Marvel Multiverse system API."
    );
  }

  try {
    await registry.registerFromUrl(`modules/${MODULE_ID}/encounters/city-intersection/encounter.json`);
  } catch (error) {
    Logger.error("Unable to register bundled encounter.", error);
    ui.notifications?.error("Marvel Encounter Framework could not load its bundled test encounter. See console.");
  }

  exposeApi();
  if (game.user.isGM) {
    await manager.reconcileDestructibleBindings();
  }
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
Hooks.on("getSceneControlButtons", addSceneControlButton);
Hooks.on("renderTokenHUD", addBreakableWallHudButton);
Hooks.on("updateActor", (actor, changes) => {
  if (!game.user?.isGM) return;
  const healthValue = foundry.utils.getProperty?.(changes, "system.health.value")
    ?? changes?.["system.health.value"];
  if (Number(healthValue) !== 0) return;
  void manager.onActorHealthDepleted(actor).catch(error => {
    Logger.error("Breakable Wall destruction failed.", error);
    ui.notifications?.error(`Marvel Encounter Framework: ${error.message}`);
  });
});
Hooks.on("preCreateCombatant", combatant => {
  const sceneRef = combatant.sceneId ?? combatant.parent?.scene;
  const scene = game.scenes?.get?.(sceneRef?.id ?? sceneRef) ?? canvas?.scene;
  const token = scene?.tokens?.get?.(combatant.tokenId);
  if (isDestructibleTokenCombatEligible(token)) return true;
  ui.notifications?.warn("Destructible encounter objects are excluded from combat by default.");
  return false;
});
