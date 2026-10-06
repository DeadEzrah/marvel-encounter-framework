import { Logger } from "../core/logger.js";
import { MODULE_ID } from "../core/constants.js";

export class FoundrySceneAdapter {
  async ensureEncounterScene(encounter) {
    const descriptor = encounter?.scene;
    if (!descriptor) return { ok: true, scene: null, created: false };

    const existing = game.scenes?.find?.(scene =>
      scene.getFlag?.(MODULE_ID, "encounterId") === encounter.id
      || scene.name === (descriptor.name ?? encounter.name)
    );
    if (existing) return { ok: true, scene: existing, created: false };

    let sceneData = {};
    const sceneDataUrl = descriptor.sceneData ?? descriptor.sceneFile;
    if (sceneDataUrl) {
      const response = await fetch(sceneDataUrl);
      if (!response.ok) {
        throw new Error(`Failed to load Scene data '${sceneDataUrl}': ${response.status} ${response.statusText}`);
      }
      sceneData = await response.json();
    }

    const data = foundry.utils.deepClone(sceneData);
    delete data._id;
    data.name = descriptor.name ?? encounter.name ?? data.name;
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
      [MODULE_ID]: { encounterId: encounter.id }
    }, { inplace: false });

    if (descriptor.background) {
      data.background = foundry.utils.mergeObject(data.background ?? {}, {
        src: descriptor.background
      }, { inplace: false });
    }
    if (descriptor.foreground) data.foreground = descriptor.foreground;
    if (!data.grid && descriptor.gridSize) {
      data.grid = {
        type: descriptor.gridVisible === false ? 0 : 1,
        size: descriptor.gridSize,
        distance: descriptor.gridDistance ?? 5,
        units: descriptor.gridUnits ?? "ft"
      };
    }

    const scene = await Scene.create(data);
    return { ok: true, scene, created: true };
  }

  async setRegionEnabled(scene, regionRef, enabled) {
    if (!scene) return { ok: false, reason: "No scene supplied." };

    const region = scene.regions?.get(regionRef)
      ?? scene.regions?.find?.(r => r.name === regionRef || r.getFlag("marvel-encounter-framework", "id") === regionRef);

    if (!region) {
      Logger.warn("Region not found", regionRef);
      return { ok: false, reason: `Region '${regionRef}' not found.` };
    }

    // First-pass convention: disable/enable each behavior rather than mutating Region visibility.
    const updates = Array.from(region.behaviors ?? []).map(b => ({
      _id: b.id,
      disabled: !enabled
    }));

    if (updates.length) {
      await region.updateEmbeddedDocuments("RegionBehavior", updates);
    }

    return { ok: true, region: region.id, enabled };
  }

  async createChatMessage(content, { whisperGM = false } = {}) {
    const data = { content };
    if (whisperGM) data.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
    return ChatMessage.create(data);
  }

  async playSound(src, { volume = 0.8, loop = false } = {}) {
    if (!src) return { ok: false, reason: "No sound source." };
    try {
      const sound = await foundry.audio.AudioHelper.play({ src, volume, loop }, true);
      return { ok: true, sound };
    } catch (error) {
      Logger.warn("Unable to play sound", src, error);
      return { ok: false, error };
    }
  }
}
