# Implementation Plan: Full Readiness Calibration Controls

Date: 2026-02-15
Owner: Core planning + API + mobile create flow
Status: Complete (Phase 0-5 complete)
Depends on: `design.md` in this spec folder

## Execution Order

1. Phase 0: Contract foundation and defaults
2. Phase 1: Core calibration wiring
3. Phase 2: API transport + persistence
4. Phase 3: Mobile interactive slider UX
5. Phase 4: Reactive recompute + diagnostics
6. Phase 5: Stabilization and release gates

## Phase Overview

| Phase | Objective                                                  | Deliverable                                                      |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 0     | Define calibration contract and defaults                   | Versioned schema + normalized defaults                           |
| 1     | Replace core hardcoded constants with calibration inputs   | Projection/readiness/optimizer constants externally configurable |
| 2     | Thread calibration through preview/create and persistence  | End-to-end transport + stored snapshot/version                   |
| 3     | Build interactive calibration controls                     | Slider UI with live sum=1 enforcement and presets                |
| 4     | Add reactive preview recompute and explanatory diagnostics | Debounced recompute + delta explanations                         |
| 5     | Validate stability, determinism, and migration behavior    | Test matrix + rollout checklist                                  |

## Phase 0 - Contract Foundation and Defaults

### Objectives

1. Introduce `CalibrationConfigV1` and strict schema validation.
2. Define canonical defaults for all configurable constants.
3. Add normalization for missing/partial calibration payloads.

### Technical Work

1. Add schema/type definitions in `packages/core/contracts/training-plan-creation/schemas.ts`.
2. Add defaults + normalization in `packages/core/plan/normalizeCreationConfig.ts`.
3. Add contract docs in core schema comments and spec references.

### Exit Criteria

1. Creation config accepts calibration object.
2. Unknown/invalid fields are rejected.
3. Missing calibration cleanly defaults to V1 baseline.

## Phase 1 - Core Calibration Wiring

### Objectives

1. Remove hardcoded internal constants from projection/readiness path.
2. Apply calibration values in all relevant formulas.
3. Preserve deterministic behavior and bounded readiness outputs.

### Technical Work

1. Wire calibration into `packages/core/plan/projection/readiness.ts`.
2. Wire calibration into `packages/core/plan/projection/capacity-envelope.ts`.
3. Wire calibration into `packages/core/plan/projectionCalculations.ts`.
4. Wire calibration into MPC profile/objective surfaces.
5. Add core-level clamp/fallback diagnostics.

### Exit Criteria

1. All independent coefficients consumed from calibration/defaults.
2. Hard safety constraints remain enforced.
3. Readiness remains bounded `0..100` across tested inputs.

## Phase 2 - API Transport and Persistence

### Objectives

1. Include calibration in preview/create requests.
2. Preserve preview/create parity with identical calibration.
3. Persist calibration snapshot with version on plan creation.

### Technical Work

1. Update `packages/trpc/src/routers/training-plans.base.ts` input/output surfaces.
2. Update create use-case persistence payload to include calibration snapshot.
3. Ensure strict parsing at API boundary mirrors core schema.

### Exit Criteria

1. Preview and create both honor calibration input.
2. Persisted plan includes `calibration_version` and calibration data.
3. Round-trip parity tests pass.

## Phase 3 - Mobile Interactive Slider UX

### Objectives

1. Expose all independent calibration fields via grouped controls.
2. Enforce weight sum=1 interactively without requiring manual math.
3. Provide reset/default/preset experiences.

### Technical Work

1. Add slider sections in create flow advanced panel.
2. Implement simplex interaction for composite weights:
   - active-slider rebalance mode,
   - optional lock mode.
3. Show always-visible total meter and constraint hints.
4. Add preset buttons: conservative, balanced, aggressive, reset.

### Exit Criteria

1. User can adjust all independent attributes from UI.
2. Composite weights cannot leave valid simplex state.
3. UI emits valid calibration payloads only.

## Phase 4 - Reactive Recompute and Diagnostics

### Objectives

1. Recompute projections smoothly while users drag sliders.
2. Avoid stale response races and flicker.
3. Explain why readiness moved after each change.

### Technical Work

1. Debounced preview mutation with cancellation semantics.
2. Delta diagnostics panel with change drivers.
3. Stable loading and error UI behavior under rapid edits.

### Exit Criteria

1. Preview updates within acceptable latency under interaction.
2. No stale-response overwrites.
3. Delta explanations are present and meaningful.

## Phase 5 - Stabilization and Release Gates

### Objectives

1. Validate numerical stability across full slider space.
2. Lock deterministic behavior and parity.
3. Document migration and release checklist.

### Technical Work

1. Add expanded unit/integration/property tests.
2. Add fuzz tests for bounded random calibration combinations.
3. Add release-gate artifact for calibration launch.

### Exit Criteria

1. Core/trpc/mobile type checks and tests pass.
2. Determinism and bounded-output gates pass.
3. Migration path for no-calibration historical plans is verified.
