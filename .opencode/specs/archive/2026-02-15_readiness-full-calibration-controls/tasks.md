# Tasks: Full Readiness Calibration Controls

Date: 2026-02-15
Spec: `.opencode/specs/2026-02-15_readiness-full-calibration-controls/`

## Dependency Notes

- Execution order is strict: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5**.
- `@repo/core` schema/types are canonical.
- Composite weights are interactive-simplex only; invalid sums must fail boundary validation.

## Current Status Snapshot

- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Phase 5 complete

## Phase 0 - Contract Foundation and Defaults

### Checklist

- [x] (owner: core) Add `CalibrationConfigV1` schema to training-plan creation contracts.
- [x] (owner: core) Add strict range validation for every calibration field.
- [x] (owner: core) Add composite-weights sum invariant validation (`sum=1` within epsilon).
- [x] (owner: core) Add normalization/default merge for missing calibration values.
- [x] (owner: core) Add calibration versioning (`version: 1`) and default constants map.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`

## Phase 1 - Core Calibration Wiring

Depends on: **Phase 0 complete**

### Checklist

- [x] (owner: core) Replace readiness composite hardcoded weights with calibration values.
- [x] (owner: core) Replace readiness timeline/form/fatigue/smoothing constants with calibration values.
- [x] (owner: core) Replace envelope penalty constants with calibration values.
- [x] (owner: core) Replace durability penalty constants with calibration values.
- [x] (owner: core) Replace no-history confidence/demand tuning constants with calibration values.
- [x] (owner: core) Replace optimizer objective/profile internals with calibration values where independent.
- [x] (owner: core) Add finite-number guardrails and bound-clamp diagnostics.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- --runInBand`

## Phase 2 - API Transport and Persistence

Depends on: **Phase 1 complete**

### Checklist

- [x] (owner: trpc) Accept calibration in preview/create endpoints.
- [x] (owner: trpc) Pass calibration through to core projection path unchanged.
- [x] (owner: trpc) Persist calibration snapshot and calibration version with created plans.
- [x] (owner: trpc) Add strict boundary rejection for unknown calibration fields.
- [x] (owner: trpc) Add preview/create parity tests for identical calibration.

### Test Commands

- [x] `cd packages/trpc && pnpm check-types && pnpm test`

## Phase 3 - Mobile Interactive Slider UX

Depends on: **Phase 2 complete**

### Checklist

- [x] (owner: mobile) Add advanced calibration panel in create flow.
- [x] (owner: mobile) Add grouped sliders for all independent calibration attributes.
- [x] (owner: mobile) Implement interactive simplex behavior for composite weights.
- [x] (owner: mobile) Add lock-mode behavior and computed remainder handling.
- [x] (owner: mobile) Add total meter and inline validation hints.
- [x] (owner: mobile) Add preset/reset controls.
- [x] (owner: mobile) Ensure emitted payloads are always schema-valid.

### Test Commands

- [x] `cd apps/mobile && pnpm check-types && pnpm test`

## Phase 4 - Reactive Recompute and Diagnostics

Depends on: **Phase 3 complete**

### Checklist

- [x] (owner: mobile/trpc) Implement debounced preview recompute on slider interaction.
- [x] (owner: mobile/trpc) Implement stale-request cancellation and race-safe response handling.
- [x] (owner: core/trpc) Emit structured readiness-delta diagnostics for load/fatigue/feasibility impacts.
- [x] (owner: mobile) Add diagnostics panel explaining latest readiness movement.
- [x] (owner: mobile) Validate loading/error behavior under rapid slider drags.

### Test Commands

- [x] `cd apps/mobile && pnpm test -- calibration adapters SinglePageForm.blockers CreationProjectionChart.metadata`
- [x] `cd packages/trpc && pnpm test -- training-plans createFromCreationConfigUseCase previewCreationConfigUseCase`

## Phase 5 - Stabilization and Release Gates

Depends on: **Phase 4 complete**

### Checklist

- [x] (owner: core) Add deterministic golden fixtures for representative calibration presets.
- [x] (owner: core) Add fuzz/property tests over bounded random calibration values.
- [x] (owner: core) Assert bounded readiness outputs and finite objective values.
- [x] (owner: trpc/mobile) Add end-to-end parity tests for preview/create persistence replay.
- [x] (owner: spec) Add calibration release-gate artifact and rollout checklist.

### Test Commands

- [x] `cd packages/core && pnpm test -- phase4-stabilization projection-calculations projection-parity-fixtures training-plan-preview`
- [x] `cd packages/trpc && pnpm test -- training-plans createFromCreationConfigUseCase previewCreationConfigUseCase`
- [x] `cd apps/mobile && pnpm test -- calibration adapters SinglePageForm.blockers CreationProjectionChart.metadata previewRequestState`

## Definition of Done

- [x] Every independent readiness/projection coefficient is configurable through validated calibration input.
- [x] Composite readiness weights are interactively constrained to sum to 1 and server-validated.
- [x] Slider changes trigger reactive recomputation with race-safe behavior.
- [x] Persisted plans store calibration snapshot/version and replay deterministically.
- [x] Stability, determinism, and bounded-output gates are green across core/trpc/mobile.
