import test from "node:test";
import assert from "node:assert/strict";

const modules = new Map([
  ["fxmaster", { active: true }],
  ["fxmaster-plus", { active: true }]
]);

globalThis.game = { modules };
globalThis.canvas = { scene: { uuid: "Scene.test" } };

const calls = [];
globalThis.FXMASTER = {
  api: {
    effects: {
      play: async payload => {
        calls.push(["play", payload]);
        return {
          particles: payload.particles?.map(effect => effect.id) ?? [],
          filters: payload.filters?.map(effect => effect.id) ?? []
        };
      },
      stop: async payload => {
        calls.push(["stop", payload]);
      }
    },
    presets: {
      hasFxmasterPlus: () => true
    },
    startRegionEffects: async payload => {
      calls.push(["start-regions", payload]);
    },
    stopRegionEffects: async payload => {
      calls.push(["stop-regions", payload]);
    }
  }
};

const { FxMasterAdapter } = await import("../scripts/adapters/fxmaster-adapter.js");

test("prefers FXMaster+ effects and assigns stable API ids", async () => {
  const adapter = new FxMasterAdapter();
  const result = await adapter.play({
    key: "critical fire",
    core: {
      particles: [{ type: "embers", options: {} }]
    },
    plus: {
      particles: [{ type: "fire", options: {} }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.tier, "plus");
  assert.equal(calls[0][1].particles[0].type, "fire");
  assert.equal(calls[0][1].particles[0].id, "apiMacro_mef_critical-fire_p0");
  assert.deepEqual(result.ids.particles, ["apiMacro_mef_critical-fire_p0"]);
});

test("stops tracked ids and controls existing Region effects", async () => {
  const adapter = new FxMasterAdapter();

  const stopped = await adapter.stop({
    ids: {
      particles: ["apiMacro_mef_critical-fire_p0"],
      filters: []
    },
    sceneUuid: "Scene.test"
  }, { skipFading: true });
  const regions = await adapter.setRegionEffects(false, { skipFading: true });

  assert.equal(stopped.ok, true);
  assert.equal(regions.ok, true);
  assert.deepEqual(calls.at(-2)[1].particles, ["apiMacro_mef_critical-fire_p0"]);
  assert.equal(calls.at(-1)[0], "stop-regions");
});

test("reports an inactive FXMaster module without throwing", async () => {
  modules.get("fxmaster").active = false;
  const adapter = new FxMasterAdapter();
  const result = await adapter.play({
    key: "missing",
    core: {
      particles: [{ type: "embers", options: {} }]
    }
  });
  modules.get("fxmaster").active = true;

  assert.equal(result.ok, false);
  assert.equal(result.available, false);
  assert.equal(result.reason, "module-inactive");
});
