import test from "node:test";
import assert from "node:assert/strict";

const savedSettings = new Map();

function setProperty(target, path, value) {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current[part] ??= {};
    current = current[part];
  }
  current[parts.at(-1)] = structuredClone(value);
}

function makeWall(id, flags = {}) {
  const data = {
    _id: id,
    c: [100, 100, 500, 100],
    move: 20,
    sight: 20,
    light: 20,
    sound: 20,
    door: 0,
    flags: structuredClone(flags)
  };
  return {
    id,
    flags: data.flags,
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    toObject() {
      return structuredClone(data);
    }
  };
}

function makeScene() {
  const walls = new Map([["wall-1", makeWall("wall-1")]]);
  const tokens = new Map();
  return {
    id: "scene-1",
    name: "Breakable Wall Test",
    walls,
    tokens,
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Wall");
      for (const update of updates) {
        const wall = walls.get(update._id);
        for (const [path, value] of Object.entries(update)) {
          if (path === "_id") continue;
          setProperty(wall, path, value);
        }
      }
      return updates.map(update => walls.get(update._id));
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Wall");
      for (const id of ids) walls.delete(id);
      return ids;
    },
    async createEmbeddedDocuments(type, documents, options) {
      assert.equal(type, "Wall");
      assert.equal(options.keepId, true);
      return documents.map(document => {
        const wall = makeWall(document._id, document.flags);
        walls.set(wall.id, wall);
        return wall;
      });
    }
  };
}

function makeToken(scene, { destructible = true } = {}) {
  const actor = {
    id: "actor-1",
    uuid: "Scene.scene-1.Token.token-1.Actor.actor-1",
    flags: destructible ? {
      "marvel-multiverse": {
        destructible: { version: 1, category: "walls-doors", profile: "heavy" }
      }
    } : {},
    system: {
      health: { value: 0, max: 40 }
    },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async update(changes) {
      if (changes.system?.health?.value != null) {
        this.system.health.value = changes.system.health.value;
      }
    }
  };
  const token = {
    id: "token-1",
    name: "Brick Wall Section",
    actorId: actor.id,
    actor,
    parent: scene,
    flags: {},
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
      return this;
    }
  };
  actor.token = token;
  scene.tokens.set(token.id, token);
  return token;
}

globalThis.game = {
  settings: {
    get: (_module, key) => savedSettings.get(key) ?? {},
    set: async (_module, key, value) => savedSettings.set(key, structuredClone(value))
  },
  scenes: new Map(),
  system: { id: "marvel-multiverse", version: "3.12.0" },
  marvelMultiverse: {
    async restoreResource({ actor, kind }) {
      assert.equal(kind, "health");
      const previousValue = actor.system.health.value;
      await actor.update({ system: { health: { value: actor.system.health.max } } });
      return {
        success: true,
        previousValue,
        newValue: actor.system.health.value,
        restoredAmount: actor.system.health.value - previousValue
      };
    }
  }
};
globalThis.foundry = {
  utils: {
    deepClone: value => structuredClone(value)
  }
};
globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {}
  }
};

const { FoundrySceneAdapter } = await import("../scripts/adapters/foundry-scene-adapter.js");
const { MarvelMultiverseAdapter } = await import("../scripts/adapters/marvel-multiverse-adapter.js");
const { EncounterManager } = await import("../scripts/core/encounter-manager.js");
const { RuntimeStore } = await import("../scripts/core/runtime-store.js");

function makeManager(scene) {
  game.scenes.clear();
  game.scenes.set(scene.id, scene);
  const store = new RuntimeStore();
  return new EncounterManager({
    registry: {},
    store,
    sceneAdapter: new FoundrySceneAdapter(),
    marvelAdapter: new MarvelMultiverseAdapter()
  });
}

test("links native Walls to a destructible Token and breaches them at zero Health", async () => {
  const scene = makeScene();
  const token = makeToken(scene);
  const manager = makeManager(scene);

  const binding = await manager.bindBreakableWalls({
    sceneId: scene.id,
    tokenId: token.id,
    wallIds: ["wall-1"]
  });

  assert.equal(binding.wallState, "intact");
  assert.equal(binding.walls[0].id, "wall-1");
  assert.equal(scene.walls.get("wall-1").getFlag("marvel-encounter-framework", "breakableObjectId"), binding.objectId);
  assert.equal(token.getFlag("marvel-encounter-framework", "breakableWall").objectId, binding.objectId);

  const destroyed = await manager.onActorHealthDepleted(token.actor);

  assert.equal(destroyed.ok, true);
  assert.deepEqual(destroyed.removedWallIds, ["wall-1"]);
  assert.equal(scene.walls.has("wall-1"), false);
  assert.equal(manager.getDestructibleBindings()[0].wallState, "destroyed");
  assert.equal(token.getFlag("marvel-encounter-framework", "breakableWall").wallState, "destroyed");
});

test("repairs breached Walls with their original ID and restores full Health", async () => {
  const scene = makeScene();
  const token = makeToken(scene);
  const manager = makeManager(scene);
  const binding = await manager.bindBreakableWalls({
    sceneId: scene.id,
    tokenId: token.id,
    wallIds: ["wall-1"]
  });
  await manager.destroyBreakableWalls(binding.objectId, { notify: false });
  await manager.reset();

  const repaired = await manager.repairBreakableWalls(binding.objectId, { notify: false });

  assert.equal(repaired.ok, true);
  assert.equal(token.actor.system.health.value, 40);
  assert.equal(scene.walls.has("wall-1"), true);
  assert.equal(scene.walls.get("wall-1").getFlag("marvel-encounter-framework", "breakableObjectId"), binding.objectId);
  assert.equal(manager.getDestructibleBindings()[0].wallState, "intact");
});

test("rejects non-destructible Tokens and Walls owned by another object", async () => {
  const scene = makeScene();
  const ordinary = makeToken(scene, { destructible: false });
  const manager = makeManager(scene);

  await assert.rejects(
    manager.bindBreakableWalls({
      sceneId: scene.id,
      tokenId: ordinary.id,
      wallIds: ["wall-1"]
    }),
    /is not a Marvel destructible Actor/
  );

  ordinary.actor.flags["marvel-multiverse"] = {
    destructible: { version: 1, category: "walls-doors", profile: "heavy" }
  };
  scene.walls.get("wall-1").flags["marvel-encounter-framework"] = {
    breakableObjectId: "another-object"
  };
  await assert.rejects(
    manager.bindBreakableWalls({
      sceneId: scene.id,
      tokenId: ordinary.id,
      wallIds: ["wall-1"]
    }),
    /already linked to destructible object 'another-object'/
  );
});
