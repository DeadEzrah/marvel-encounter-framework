import test from "node:test";
import assert from "node:assert/strict";

const savedSettings = new Map();
globalThis.game = {
  settings: {
    get: (_module, key) => savedSettings.get(key) ?? {},
    set: async (_module, key, value) => savedSettings.set(key, structuredClone(value))
  },
  scenes: new Map(),
  actors: [],
  marvelEncounters: { state: { sceneId: "scene-1" } }
};
globalThis.canvas = { scene: null };
globalThis.foundry = {
  utils: {
    deepClone: value => structuredClone(value),
    mergeObject: (base, source) => {
      const merge = (left, right) => {
        for (const [key, value] of Object.entries(right ?? {})) {
          left[key] = value && typeof value === "object" && !Array.isArray(value)
            ? merge(left[key] ?? {}, value)
            : structuredClone(value);
        }
        return left;
      };
      return merge(structuredClone(base), source);
    }
  }
};
globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };

const {
  FoundrySceneAdapter,
  isDestructibleTokenCombatEligible
} = await import("../scripts/adapters/foundry-scene-adapter.js");
const { EncounterManager } = await import("../scripts/core/encounter-manager.js");
const { RuntimeStore } = await import("../scripts/core/runtime-store.js");
const { MarvelMultiverseAdapter } = await import("../scripts/adapters/marvel-multiverse-adapter.js");

function makeScene() {
  const tokens = new Map();
  tokens.find = predicate => Array.from(tokens.values()).find(predicate);
  return {
    id: "scene-1",
    tokens,
    createEmbeddedDocuments: async (_type, documents) => documents.map((data, index) => {
      const token = {
        ...structuredClone(data),
        id: `token-${tokens.size + index + 1}`,
        getFlag: (scope, key) => data.flags?.[scope]?.[key]
      };
      tokens.set(token.id, token);
      return token;
    })
  };
}

function installActors({ destructible = true } = {}) {
  game.actors.length = 0;
  globalThis.fromUuid = async uuid => ({
    documentName: "Actor",
    uuid,
    pack: "marvel-multiverse.destructibles",
    name: destructible ? "Taxi" : "Civilian",
    flags: destructible ? { "marvel-multiverse": { destructible: true } } : {},
    getFlag: (scope, key) => destructible && scope === "marvel-multiverse" && key === "destructible",
    toObject: () => ({
      _id: "pack-id",
      name: destructible ? "Taxi" : "Civilian",
      flags: destructible ? { "marvel-multiverse": { destructible: true } } : {}
    })
  });
  globalThis.Actor = {
    create: async data => {
      const id = `world-${game.actors.length + 1}`;
      const actor = {
        id,
        name: data.name,
        flags: data.flags,
        getFlag: (scope, key) => data.flags?.[scope]?.[key],
        getTokenDocument: async tokenData => ({
          toObject: () => ({ _id: "temporary", actorId: id, ...tokenData })
        })
      };
      game.actors.push(actor);
      return actor;
    }
  };
}

const encounter = {
  id: "city",
  actors: [{ id: "taxi", uuid: "Compendium.marvel-multiverse.destructibles.Actor.taxi" }]
};

test("validates every roster UUID before creating tokens", async () => {
  const scene = makeScene();
  game.scenes.set(scene.id, scene);
  globalThis.fromUuid = async uuid => uuid.endsWith(".bad") ? null : ({
    documentName: "Actor",
    uuid,
    pack: null
  });

  const adapter = new FoundrySceneAdapter();
  await assert.rejects(
    adapter.spawnActors({
      id: "city",
      actors: [
        { id: "good", uuid: "Actor.good" },
        { id: "bad", uuid: "Compendium.objects.Actor.bad" }
      ]
    }, { actors: [{ actor: "good" }, { actor: "bad" }] }),
    /for encounter actor 'bad' did not resolve to an Actor/
  );
  assert.equal(scene.tokens.size, 0);
});

test("creates independent destructible tokens and persists stable bindings", async () => {
  const scene = makeScene();
  game.scenes.set(scene.id, scene);
  installActors();
  const store = new RuntimeStore();
  store.state.activeEncounterId = encounter.id;
  store.state.sceneId = scene.id;
  const manager = new EncounterManager({
    registry: { get: () => encounter },
    store,
    sceneAdapter: new FoundrySceneAdapter()
  });

  const result = await manager.spawnActors({
    id: "street-props",
    actors: [{ actor: "taxi", objectId: "taxi-a", count: 2, x: 100, y: 200 }]
  }, { source: "phase:start" });

  const token = scene.tokens.get(result.tokenIds[0]);
  const bindings = manager.getDestructibleBindings();
  const binding = bindings[0];
  assert.equal(token.actorLink, false);
  assert.equal(token.flags["marvel-encounter-framework"].objectId, "taxi-a:0");
  assert.equal(token.flags["marvel-encounter-framework"].sourceUuid, encounter.actors[0].uuid);
  assert.equal(token.flags["marvel-encounter-framework"].includeInCombat, false);
  assert.deepEqual(bindings.map(item => item.objectId), ["taxi-a:0", "taxi-a:1"]);
  assert.equal(new Set(bindings.map(item => item.tokenId)).size, 2);
  assert.equal(binding.tokenId, token.id);
  assert.equal(binding.actorId, token.actorId);
  assert.equal(binding.sourceActorUuid, encounter.actors[0].uuid);
  assert.equal(binding.status, "resolved");
  assert.equal(isDestructibleTokenCombatEligible(token), false);

  const reloaded = new RuntimeStore();
  await reloaded.load();
  assert.equal(reloaded.state.schemaVersion, 2);
  assert.equal(reloaded.state.destructibleBindings["taxi-a:0"].tokenId, token.id);
});

test("reuses flagged tokens and reports missing bindings without duplicating them", async () => {
  const scene = makeScene();
  game.scenes.set(scene.id, scene);
  installActors();
  const adapter = new FoundrySceneAdapter();
  const first = await adapter.spawnActors(encounter, {
    id: "street-props",
    actors: [{ actor: "taxi", objectId: "taxi-a" }]
  });
  const binding = first.bindings[0];

  const reused = await adapter.spawnActors(encounter, {
    id: "street-props",
    actors: [{ actor: "taxi", objectId: "taxi-a" }]
  }, {}, { bindings: { "taxi-a": binding } });
  assert.equal(scene.tokens.size, 1);
  assert.deepEqual(reused.reusedTokenIds, [binding.tokenId]);

  scene.tokens.delete(binding.tokenId);
  const missing = await adapter.spawnActors(encounter, {
    id: "street-props",
    actors: [{ actor: "taxi", objectId: "taxi-a" }]
  }, {}, { bindings: { "taxi-a": binding } });
  assert.equal(missing.ok, false);
  assert.equal(missing.missing[0].status, "missing");
  assert.equal(scene.tokens.size, 0);
});

test("reconciliation re-resolves by object flag and reports absent tokens", async () => {
  const scene = makeScene();
  game.scenes.set(scene.id, scene);
  const token = {
    id: "replacement",
    actorId: "world-taxi",
    flags: { "marvel-encounter-framework": { objectId: "taxi-a" } }
  };
  scene.tokens.set(token.id, token);
  const state = {
    destructibleBindings: {
      "taxi-a": { objectId: "taxi-a", sceneId: scene.id, tokenId: "old", status: "resolved" },
      "taxi-b": { objectId: "taxi-b", sceneId: scene.id, tokenId: "gone", status: "resolved" }
    }
  };
  const store = { state, save: async () => state };
  const manager = new EncounterManager({ registry: {}, store, sceneAdapter: {} });

  const result = await manager.reconcileDestructibleBindings({ notify: false });
  assert.equal(state.destructibleBindings["taxi-a"].tokenId, "replacement");
  assert.equal(state.destructibleBindings["taxi-a"].status, "resolved");
  assert.equal(state.destructibleBindings["taxi-b"].status, "missing");
  assert.deepEqual(result.missing.map(item => item.objectId), ["taxi-b"]);
});

test("ordinary roster actors keep their existing linked-token behavior", async () => {
  const scene = makeScene();
  game.scenes.set(scene.id, scene);
  installActors({ destructible: false });
  const result = await new FoundrySceneAdapter().spawnActors(encounter, {
    actors: [{ actor: "taxi" }]
  });
  const token = scene.tokens.get(result.tokenIds[0]);

  assert.equal(token.actorLink, undefined);
  assert.equal(token.flags["marvel-encounter-framework"].objectId, undefined);
  assert.deepEqual(result.bindings, []);
  assert.equal(isDestructibleTokenCombatEligible(token), true);
});

test("enforces the Marvel Multiverse 3.10.0 system API compatibility floor", () => {
  const adapter = new MarvelMultiverseAdapter();
  game.system = { id: "marvel-multiverse", version: "3.9.9" };
  game.marvelMultiverse = {};
  assert.deepEqual(adapter.compatibility, {
    ok: false,
    reason: "unsupported-version",
    version: "3.9.9",
    minimumVersion: "3.10.0"
  });

  game.system.version = "3.10.0";
  assert.equal(adapter.compatibility.ok, true);
  delete game.marvelMultiverse;
  assert.equal(adapter.compatibility.reason, "api-unavailable");
});
