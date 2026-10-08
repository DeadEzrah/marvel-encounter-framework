import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  settings: { get: () => false },
  scenes: new Map(),
  marvelEncounters: { state: { sceneId: "scene-1" } }
};
globalThis.canvas = { scene: null };
globalThis.foundry = {
  utils: {
    deepClone: value => structuredClone(value)
  }
};

const { TriggerEngine } = await import("../scripts/core/trigger-engine.js");
const { FoundrySceneAdapter } = await import("../scripts/adapters/foundry-scene-adapter.js");

test("a one-time reinforcement trigger does not fire twice", async () => {
  const state = { firedTriggers: [] };
  let executions = 0;
  const manager = {
    activeEncounter: {
      triggers: [{
        id: "round-seven",
        event: "combat.roundStart",
        once: true,
        conditions: [{ path: "combat.round", op: "==", value: 7 }],
        actions: [{ type: "spawn-actors" }]
      }]
    },
    store: {
      state,
      save: async () => state
    }
  };
  const resolver = {
    executeMany: async () => {
      executions += 1;
      return [{ ok: true }];
    }
  };
  const engine = new TriggerEngine({ manager, resolver });

  await engine.emit("combat.roundStart", { combat: { round: 7 } });
  await engine.emit("combat.roundStart", { combat: { round: 7 } });

  assert.equal(executions, 1);
  assert.deepEqual(state.firedTriggers, ["round-seven"]);
});

test("spawns encounter roster actors from compendium UUIDs", async () => {
  const created = [];
  const scene = {
    id: "scene-1",
    createEmbeddedDocuments: async (_type, documents) => {
      created.push(...documents);
      return documents.map((document, index) => ({ ...document, id: `token-${index}` }));
    }
  };
  game.scenes.set(scene.id, scene);
  globalThis.fromUuid = async uuid => ({
    documentName: "Actor",
    name: "Alien Vanguard",
    getTokenDocument: async data => ({
      toObject: () => ({ _id: "temporary", actorId: uuid, ...data })
    })
  });

  const adapter = new FoundrySceneAdapter();
  const result = await adapter.spawnActors({
    id: "alien-invasion",
    actors: [{
      id: "alien-vanguard",
      uuid: "Compendium.marvel-character-library.minions.Actor.mefAlienVangrd01"
    }]
  }, {
    actors: [{
      actor: "alien-vanguard",
      count: 3,
      x: 100,
      y: 200,
      offsetX: 50
    }]
  }, { source: "test" });

  assert.equal(result.ok, true);
  assert.equal(created.length, 3);
  assert.deepEqual(created.map(token => token.x), [100, 150, 200]);
  assert.equal(created[0]._id, undefined);
  assert.equal(created[0].flags["marvel-encounter-framework"].rosterId, "alien-vanguard");
});
