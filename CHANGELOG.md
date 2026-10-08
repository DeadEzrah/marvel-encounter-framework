# Changelog

All notable changes to the Marvel Encounter Framework should be documented in this file.

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
