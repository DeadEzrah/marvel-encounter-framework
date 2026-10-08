# Marvel Encounter Framework — First Pass

**Target:** Foundry VTT 14.365  
**System:** Marvel Multiverse 3.2.0
**Module version:** 0.6.0

This is the installable vertical-slice build of the Marvel Encounter Framework.

## What works in this pass

- Foundry module manifest and ESModule loading
- Bundled encounter registration
- Persistent world-level runtime state
- Encounter activation/reset
- Objectives
- Encounter clocks
- Encounter phases
- Phase thresholds based on clocks
- End-of-round trigger processing
- Safe declarative action resolver
- GM dashboard built with ApplicationV2 + Handlebars
- Public API at `game.marvelEncounters`
- Foundry Scene adapter shell
- Split encounter-package loading
- Scene creation and binding from encounter-pack exports
- Actor rosters backed by compendium UUIDs
- One-time round, phase, or clock-triggered reinforcement spawning
- Marvel Multiverse public API adapter
- Health damage, Focus damage, and actor status actions through the system's public mutation API
- Semantic VFX routed through the system's JB2A/Sequencer effect library
- Optional FXMaster/FXMaster+ scene effects with persisted IDs and reset cleanup

## Intentionally not implemented yet

- Custom encounter-authored roll dialogs
- Karma or Focus spending
- Environmental weapon attacks
- Knockback/collision
- Automatic Region creation
- Destructible object state swapping
- Scene/background phase swaps
- Encounter package importer UI

Those are deliberately deferred until this shell is proven stable in your Foundry installation.

## Installation

In Foundry Setup, open **Add-on Modules**, select **Install Module**, and use:

```text
https://raw.githubusercontent.com/DeadEzrah/marvel-encounter-framework/main/module.json
```

For a manual installation:

1. Download and unzip the release package.
2. Copy the **`marvel-encounter-framework`** folder into:

   `{Foundry User Data}/Data/modules/`

3. Restart Foundry.
4. Open your Marvel Multiverse world.
5. Enable **Marvel Encounter Framework** under Manage Modules.
6. As GM, click the burst icon beside **Settings** in the right sidebar, use the burst icon in the Token controls, or open **Settings** and click `Marvel Encounter Framework`.
7. Open the dashboard and activate **City Intersection Crisis**.

## Release

Update the version in `module.json` and `package.json`, including the version in the `download` URL, then run:

```powershell
npm run validate:release
npm run release:github
```

The release command runs the test suite, creates the Foundry-ready ZIP, and publishes the ZIP and `module.json` under the matching `release-x.y.z` tag.

You can also open it from the browser console:

```js
game.marvelEncounters.openDashboard()
```

## Quick smoke test

After activation:

1. Click `+` next to **Building Integrity**.
2. At 4/6, the phase should automatically become **Critical Damage**.
3. At 6/6, it should become **Collapse**.
4. Increment **Rescue the Civilians** to 6/6; it should mark itself completed.
5. Start a Combat and advance rounds. Each completed round should add 1 to Building Integrity.
6. Refresh the browser. The active encounter and its state should persist.

## Public API

```js
game.marvelEncounters.openDashboard();

await game.marvelEncounters.activate("city-intersection-crisis");
await game.marvelEncounters.incrementClock("building-collapse", 1);
await game.marvelEncounters.updateObjective("rescue-civilians", { value: 3 });
await game.marvelEncounters.advancePhase();
await game.marvelEncounters.reset();

game.marvelEncounters.activeEncounter;
game.marvelEncounters.state;
```

You can register additional encounter data at runtime:

```js
game.marvelEncounters.registerEncounter(myManifest);
```

Or load a JSON manifest by URL:

```js
await game.marvelEncounters.registerEncounterFromUrl(
  "modules/my-encounters/encounters/test/encounter.json"
);
```

Split encounter packages can use the same method, or the explicit alias:

```js
await game.marvelEncounters.registerEncounterPackageFromUrl(
  "modules/marvel-encounter-packs/packs/city-intersection-crisis/encounter.json"
);
```

Encounter packages can define reusable Actors in an `actors.json` roster:

```json
[
  {
    "id": "alien-vanguard",
    "uuid": "Compendium.marvel-character-library.minions.Actor.mefAlienVangrd01"
  }
]
```

Then spawn them from any phase or trigger:

```json
{
  "id": "round-seven-reinforcements",
  "event": "combat.roundStart",
  "once": true,
  "conditions": [{ "path": "combat.round", "op": "==", "value": 7 }],
  "actions": [{
    "type": "spawn-actors",
    "actors": [{
      "actor": "alien-vanguard",
      "count": 3,
      "x": 1200,
      "y": 800,
      "offsetX": 100
    }]
  }]
}
```

FXMaster effects can provide a free-tier payload and an FXMaster+ payload. The framework selects the Plus payload when available and otherwise uses the core fallback:

```json
{
  "type": "play-fxmaster",
  "key": "critical-fire",
  "core": {
    "particles": [
      { "type": "embers", "options": { "density": 0.05 } }
    ]
  },
  "plus": {
    "particles": [
      { "type": "fire", "options": { "density": 0.05 } }
    ]
  }
}
```

Use `stop-fxmaster` with the same `key` to remove one tracked effect group. Encounter reset removes all tracked FXMaster effects. `set-fxmaster-regions` starts or stops FXMaster Region behaviors without deleting their authored configuration.

## Architectural boundary

This first build intentionally enforces the design principle:

**The Marvel system owns rules. Foundry owns documents and scene mechanics. MEF orchestrates.**

The `MarvelMultiverseAdapter` never inspects actor data paths. It discovers and calls supported methods on `game.marvelMultiverse`, and reports unavailable optional capabilities explicitly.

## Files to inspect first

- `scripts/main.js`
- `scripts/core/encounter-manager.js`
- `scripts/core/action-resolver.js`
- `scripts/core/trigger-engine.js`
- `scripts/adapters/marvel-multiverse-adapter.js`
- `scripts/apps/dashboard.js`
- `encounters/city-intersection/encounter.json`

## Next milestone

Once this runs cleanly in the live world:

1. Connect Region enable/disable and Region event routing.
2. Define the first supported Marvel system API calls.
3. Add destructible environmental objects.
4. Add semantic VFX registry.
5. Add encounter package import/export tooling.
