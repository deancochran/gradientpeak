# Tasks: Context-First Training Plan Initialization Simplification

Date: 2026-02-16
Spec: `.opencode/specs/2026-02-16_training-plan-context-initialization-simplification/`

## Dependency Notes

- Execution order is strict: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5**.
- Hard safety bounds are non-negotiable in this effort (`max_weekly_tss_ramp_pct`, `max_ctl_ramp_per_week` schema/runtime caps unchanged).
- `@repo/core` remains canonical for initialization math and contracts.

## Current Status Snapshot

- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Phase 5 complete

## Phase 0 - Baseline Audit and Invariants

### Checklist

- [x] (owner: core+qa) Build baseline initialization fixture matrix for none/sparse/rich history contexts.
- [x] (owner: trpc+qa) Snapshot current `getCreationSuggestions` and preview bootstrap outputs for fixtures.
- [x] (owner: core+qa) Define and document acceptable initialization delta bands per metric.
- [x] (owner: core+qa) Add regression tests asserting hard safety bounds unchanged.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- deriveCreationContext deriveCreationSuggestions`
- [x] `cd packages/trpc && pnpm test -- training-plans`

## Phase 1 - Unified Load-State Bootstrap

Depends on: **Phase 0 complete**

### Checklist

- [x] (owner: core) Add shared load bootstrap utility returning `starting_ctl`, `starting_atl`, `starting_tsb` and confidence metadata.
- [x] (owner: core) Implement daily TSS series normalization with zero-fill across bootstrap window.
- [x] (owner: core) Add staleness-aware bounded fallback handling for sparse/no recent activity.
- [x] (owner: trpc) Replace route-local initialization usage with shared bootstrap output in preview/create flows.
- [x] (owner: qa) Add parity tests proving preview/create bootstrap consistency for identical history inputs.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- calculations training-plan-preview projection-calculations`
- [x] `cd packages/trpc && pnpm test -- previewCreationConfigUseCase createFromCreationConfigUseCase`

## Phase 2 - Context-Driven Initialization Defaults

Depends on: **Phase 1 complete**

### Checklist

- [x] (owner: core) Use weekly load distribution to produce baseline midpoint/range defaults.
- [x] (owner: core) Infer constraints from recent behavior (training days, session count range, duration percentiles).
- [x] (owner: core) Keep ramp-cap defaulting context-aware while clamped to existing hard bounds.
- [x] (owner: trpc) Ensure improved defaults are emitted through suggestion payloads and normalization path.
- [x] (owner: qa) Add tests for none/sparse/rich context outputs and lock-conflict preservation.

### Test Commands

- [x] `cd packages/core && pnpm test -- derive-creation-suggestions training-plan-creation-contracts`
- [x] `cd packages/trpc && pnpm test -- training-plans`

## Phase 3 - UX Simplification for Standard Creation

Depends on: **Phase 2 complete**

### Checklist

- [x] (owner: mobile) Keep standard creation flow defaults-first with minimal control surface.
- [x] (owner: mobile) Gate raw optimizer multipliers behind explicit advanced mode.
- [x] (owner: mobile) Preserve lock semantics and deterministic merge behavior for suggested values.
- [x] (owner: qa) Add UI tests for standard vs advanced mode and default seeding behavior.

### Test Commands

- [x] `cd apps/mobile && pnpm check-types && pnpm test -- SinglePageForm.blockers adapters`

## Phase 4 - Orchestration and Recompute Simplification

Depends on: **Phase 3 complete**

### Checklist

- [x] (owner: mobile) Remove calibration-only fields from suggestion recompute dependencies.
- [x] (owner: mobile+trpc) Keep preview recompute trigger set scoped to projection-impacting fields.
- [x] (owner: core+trpc) Simplify and document merge precedence path for defaults/suggestions/user locks.
- [x] (owner: qa) Add race-safety regression tests for rapid field edits.

### Test Commands

- [x] `cd apps/mobile && pnpm test -- previewRequestState training-plan-create`
- [x] `cd packages/trpc && pnpm test -- training-plans previewCreationConfigUseCase`

## Phase 5 - Validation and Rollout Gates

Depends on: **Phase 4 complete**

### Checklist

- [x] (owner: core+qa) Validate initialization acceptance bands defined in Phase 0.
- [x] (owner: core+trpc+mobile) Run full cross-package checks.
- [x] (owner: qa) Confirm determinism for repeated identical preview/create inputs.
- [x] (owner: spec) Document rollout checklist and fallback switch strategy.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`
- [x] `cd /home/deancochran/GradientPeak && pnpm check-types && pnpm lint && pnpm test`

## Definition of Done

- [x] Context-derived defaults initialize training plans without requiring optimizer slider adjustments in standard flow.
- [x] Shared CTL/ATL/TSB bootstrap is used by preview and create paths.
- [x] Hard safety bounds remain unchanged and enforced.
- [x] Suggestion and recompute orchestration is simplified and test-verified.
- [x] Core/trpc/mobile verification gates are green.
