import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  settings: { get: () => false }
};

const { applySceneArtwork } = await import("../scripts/adapters/foundry-scene-adapter.js");

test("maps legacy scene artwork into a Foundry 14 level", () => {
  const data = {
    background: {
      src: "legacy/background.png",
      offsetX: 12,
      scaleX: 1.25
    },
    foreground: "legacy/foreground.png",
    foregroundElevation: 30,
    backgroundColor: "#111111",
    fog: {
      overlay: "legacy/fog.png"
    }
  };

  applySceneArtwork(data, {
    background: "modules/encounters/art/background.png",
    foreground: "modules/encounters/art/foreground.png"
  });

  assert.equal(data.background, undefined);
  assert.equal(data.foreground, undefined);
  assert.equal(data.initialLevel, "defaultLevel0000");
  assert.equal(data.levels[0].background.src, "modules/encounters/art/background.png");
  assert.equal(data.levels[0].background.color, "#111111");
  assert.equal(data.levels[0].foreground.src, "modules/encounters/art/foreground.png");
  assert.equal(data.levels[0].elevation.top, 30);
  assert.equal(data.levels[0].fog.src, "legacy/fog.png");
  assert.equal(data.levels[0].textures.offsetX, 12);
  assert.equal(data.levels[0].textures.scaleX, 1.25);
});

test("preserves existing level settings while overriding packaged artwork", () => {
  const data = {
    initialLevel: "existingLevel001",
    levels: [{
      _id: "existingLevel001",
      name: "Roof",
      elevation: { bottom: 20, top: 40 },
      background: { color: "#222222", src: "old-background.png" },
      foreground: { tint: "#ff0000", src: "old-foreground.png" },
      textures: { fit: "contain", rotation: 15 },
      visibility: { levels: ["groundLevel0001"] },
      sort: 10,
      flags: { test: { preserved: true } }
    }]
  };

  applySceneArtwork(data, {
    background: "new-background.png",
    foreground: "new-foreground.png"
  });

  assert.equal(data.initialLevel, "existingLevel001");
  assert.equal(data.levels[0].name, "Roof");
  assert.deepEqual(data.levels[0].elevation, { bottom: 20, top: 40 });
  assert.equal(data.levels[0].background.color, "#222222");
  assert.equal(data.levels[0].background.src, "new-background.png");
  assert.equal(data.levels[0].foreground.tint, "#ff0000");
  assert.equal(data.levels[0].foreground.src, "new-foreground.png");
  assert.equal(data.levels[0].textures.fit, "contain");
  assert.equal(data.levels[0].textures.rotation, 15);
  assert.deepEqual(data.levels[0].flags, { test: { preserved: true } });
});
