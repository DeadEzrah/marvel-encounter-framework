# Changelog

All notable changes to the Marvel Encounter Framework should be documented in this file.

## [0.6.2] - 2026-10-08

### Changed
- Activating an encounter now switches the GM to its imported Scene before phase-entry actions run.
- The dashboard now distinguishes the encounter selected for activation from the currently active encounter.

## [0.6.1] - 2026-10-08

### Fixed
- Compendium-backed encounter reinforcements now import and reuse a world Actor before token creation, so spawned tokens retain valid Actor references and can be opened normally.

## [0.6.0] - 2026-10-08

### Added
- A GM-only Marvel Encounters launcher in the Token scene controls.
- Regression coverage for refreshing existing encounter artwork through Foundry 14 Scene Levels.

### Changed
- Existing encounter scenes now refresh packaged background and foreground artwork while preserving their level configuration.
- Verified Health damage, Focus damage, and status actions against the Marvel Multiverse 3.2.0 public mutation API.

### Fixed
- Settings launchers now handle both native elements and legacy element wrappers.
- Existing scene artwork no longer falls back to deprecated top-level background and foreground fields.

## [0.5.0] - 2026-10-08

### Added
- Optional FXMaster and FXMaster+ particle/filter actions with core-tier fallbacks.
- Persisted FXMaster effect IDs, targeted stop actions, Region effect controls, and encounter-reset cleanup.
- Validation and tests for FXMaster action payloads and unavailable-module behavior.

### Changed
- FXMaster is recommended rather than required, so encounter rules continue when the visual module is inactive.
- City Intersection Critical Damage now layers optional embers and fog over its semantic JB2A dust effect.

## [0.4.0] - 2026-10-08

### Added
- One-time encounter triggers and roster-based reinforcement spawning.
- A GM-only burst button beside Foundry's Settings control for opening the Encounter Dashboard.
- Regression coverage for trigger persistence, actor spawning, and Foundry 14 scene artwork conversion.

### Changed
- Encounter backgrounds and foreground overlays now populate Foundry 14 Scene Levels while preserving existing level configuration.
- Encounter manifests validate actor rosters, triggers, and phase action collections.

### Fixed
- Packaged encounter artwork now appears when an encounter scene is created or activated in Foundry 14.
