# First-Pass Test Checklist

## Module load
- [x] Foundry lists Marvel Encounter Framework under Manage Modules.
- [x] Module enables without a manifest warning.
- [x] Browser console shows `marvel-encounter-framework | Ready`.
  - Verified 2026-11-06 via the "Marvel Encounter Framework ready" notification on world load (Foundry 14.365, system 3.17.0).
- [x] `game.marvelEncounters` exists.
- [x] Enabling Marvel Encounter Packs registers all eight encounters.
  - Verified: registry.all returned city-intersection-crisis, research-lab-breach, subway-station-attack, rooftop-chase, dockyard-warehouse, aerial-carrier-deck, superhuman-prison-breakout, alien-invasion-avenue.

## Dashboard
- [ ] GM sidebar burst button opens the dashboard and is not duplicated by sidebar rerenders.
- [ ] Settings sidebar/button opens the dashboard.
- [ ] City Intersection Crisis appears in the encounter selector.
- [ ] Activate creates encounter state.
- [ ] Dashboard can be closed and reopened.

## Persistence
- [ ] Clock changes survive refresh.
- [ ] Objective changes survive refresh.
- [ ] Phase survives refresh.
- [ ] Reset clears runtime state.
- [ ] Activating a pack creates or reuses its Scene and stores the Scene ID.
- [ ] Packaged background and foreground artwork load on the Scene's Foundry 14 Level.
- [ ] Destructible token bindings survive refresh and re-resolve to their Scene tokens.
- [ ] A deleted destructible token is reported as a missing binding after refresh.

## Clocks/phases
- [ ] Building Integrity 0–3 remains Initial Impact.
- [ ] Reaching 4 changes phase to Critical Damage.
- [ ] Reaching 6 changes phase to Collapse.
- [ ] Phase entry produces expected chat messages.

## Objectives
- [ ] Rescue objective increments.
- [ ] Reaching 6/6 marks completed.
- [ ] Completion toggle works.
- [ ] Building-standing objective toggle works.

## Combat trigger
- [ ] Create/start Combat.
- [ ] Advance one round.
- [ ] Previous round end increments Building Integrity by one.
- [ ] No duplicate increment happens for normal turn changes within a round.
- [ ] A one-time round trigger spawns its configured compendium Actors only once.
- [ ] Re-running a destructible spawn action reuses its stable `objectId` binding.
- [ ] Destructible tokens are unlinked and are excluded from Combat by default.
- [ ] Ordinary roster Actors retain their existing token-link and reinforcement behavior.

## Marvel boundary
- [ ] No actor system paths are read or written by the module.
- [ ] Roll requests call `game.marvelMultiverse.requestRoll`.
- [ ] Semantic VFX calls `game.marvelMultiverse.playEffect` and remains non-blocking when Sequencer or assets are unavailable.
- [ ] Calling an unavailable optional rules method returns an explicit compatibility result rather than failing silently.
- [ ] The module rejects Marvel Multiverse versions older than 3.10.0 and reports a missing public API.
