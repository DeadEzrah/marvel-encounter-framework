import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  combat: null,
  user: { isGM: true }
};
globalThis.foundry = {
  utils: {
    deepClone: value => structuredClone(value)
  }
};
globalThis.ui = {
  notifications: {
    info: () => {}
  }
};

const { EncounterManager } = await import("../scripts/core/encounter-manager.js");

test("activation views the encounter Scene before phase entry actions", async () => {
  const order = [];
  const encounter = {
    id: "city",
    name: "City",
    clocks: [],
    objectives: [],
    phases: [{
      id: "start",
      order: 1,
      onEnter: [{ type: "chat-message", text: "Started" }]
    }]
  };
  const state = {};
  const store = {
    state,
    replace: async next => {
      store.state = next;
      order.push("replace");
    },
    pushHistory: () => order.push("history"),
    save: async () => order.push("save")
  };
  const manager = new EncounterManager({
    registry: { get: id => id === encounter.id ? encounter : null },
    store,
    sceneAdapter: {
      ensureEncounterScene: async () => ({
        scene: {
          id: "scene-1",
          view: async () => order.push("view")
        }
      })
    }
  });
  manager.triggerEngine = {
    resolver: {
      executeMany: async () => order.push("phase-actions")
    },
    emit: async () => order.push("emit")
  };

  const result = await manager.activate("city");

  assert.equal(result.sceneId, "scene-1");
  assert.ok(order.indexOf("view") < order.indexOf("phase-actions"));
  assert.deepEqual(order, ["view", "replace", "history", "save", "phase-actions", "emit"]);
});

test("activation does not change the viewed Scene for non-GM users", async () => {
  game.user.isGM = false;
  let views = 0;
  const encounter = {
    id: "city",
    name: "City",
    clocks: [],
    objectives: [],
    phases: []
  };
  const store = {
    state: {},
    replace: async next => {
      store.state = next;
    },
    pushHistory: () => {},
    save: async () => {}
  };
  const manager = new EncounterManager({
    registry: { get: () => encounter },
    store,
    sceneAdapter: {
      ensureEncounterScene: async () => ({
        scene: {
          id: "scene-1",
          view: async () => {
            views += 1;
          }
        }
      })
    }
  });
  manager.triggerEngine = {
    emit: async () => {}
  };

  await manager.activate("city");

  assert.equal(views, 0);
});
