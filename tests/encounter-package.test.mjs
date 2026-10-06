import test from "node:test";
import assert from "node:assert/strict";

globalThis.location = { href: "https://foundry.test/game" };
globalThis.game = {
  settings: {
    get: () => false
  }
};
globalThis.foundry = {
  utils: {
    deepClone: value => structuredClone(value)
  }
};

const { EncounterRegistry } = await import("../scripts/core/encounter-registry.js");
const { EncounterValidator } = await import("../scripts/core/validator.js");

test("loads and resolves a split encounter package", async () => {
  const responses = new Map([
    ["modules/packs/city/encounter.json", {
      id: "city",
      name: "City",
      version: "1.0.0",
      scene: {
        sceneData: "scene.json",
        background: "art/background.png"
      },
      objectives: ["objectives.json"],
      phases: ["phases.json"],
      clocks: [],
      triggers: []
    }],
    ["modules/packs/city/objectives.json", [{
      id: "rescue",
      name: "Rescue",
      type: "binary"
    }]],
    ["modules/packs/city/phases.json", [{
      id: "start",
      name: "Start",
      order: 1
    }]]
  ]);

  globalThis.fetch = async url => ({
    ok: responses.has(url),
    status: responses.has(url) ? 200 : 404,
    statusText: responses.has(url) ? "OK" : "Not Found",
    json: async () => structuredClone(responses.get(url))
  });

  const registry = new EncounterRegistry();
  const encounter = await registry.registerPackageFromUrl(
    "https://foundry.test/modules/packs/city/encounter.json"
  );

  assert.equal(encounter.objectives[0].id, "rescue");
  assert.equal(encounter.phases[0].id, "start");
  assert.equal(encounter.scene.sceneData, "modules/packs/city/scene.json");
  assert.equal(encounter.scene.background, "modules/packs/city/art/background.png");
});

test("rejects package references that escape the encounter directory", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      id: "unsafe",
      name: "Unsafe",
      version: "1.0.0",
      objectives: ["../secrets.json"]
    })
  });

  const registry = new EncounterRegistry();
  await assert.rejects(
    registry.registerPackageFromUrl("modules/packs/unsafe/encounter.json"),
    /resolves outside/
  );
});

test("rejects malformed trigger and phase action collections", () => {
  const result = EncounterValidator.validate({
    id: "invalid",
    name: "Invalid",
    version: "1.0.0",
    phases: [{ id: "start", onEnter: {} }],
    triggers: [{ id: "round", actions: [] }]
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /has no event/);
  assert.match(result.errors.join(" "), /onEnter must be an array/);
});
