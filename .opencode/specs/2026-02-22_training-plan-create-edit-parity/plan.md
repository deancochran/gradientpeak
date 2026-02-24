# Technical Plan: Training Plan Create/Edit Parity

Last Updated: 2026-02-22
Status: Ready for implementation
Depends On: `./design.md`
Owner: Mobile + tRPC + Core

## Objective

Implement a shared training plan composer so Create and Edit experiences are nearly identical while preserving current defaults and keeping completed activity history untouched.

## Scope

### In Scope

- Shared composer orchestration for create/edit
- Edit route using same UI as create
- Reverse adapters from persisted plan structure/metadata to form/config state
- New update-from-creation-config mutation with create-parity safety flow
- Tests for parity, data integrity, and adapter determinism

### Out of Scope

- Schema migrations
- Changes to core projection math
- Changes to historical activity records
- Removing advanced controls

## Current References

- Create UI: `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- Shared form surface: `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- Existing settings-based edit surface: `apps/mobile/app/(internal)/(standard)/training-plan-settings.tsx`
- Create pipeline entrypoints:
  - `createFromCreationConfig`
  - `previewCreationConfig`
  - `getCreationSuggestions`
    in `packages/trpc/src/routers/training-plans.base.ts`

## Architecture Changes

## Phase 0 - Guardrails and Contracts

1. Define explicit mode contract:
   - `mode: "create" | "edit"`
   - `planId` required for edit mode
2. Lock invariant: edit save mutates only training plan structure/metadata.
3. Lock copy contract: edit save messaging states that completed history is unchanged.

Exit criteria:

- Mode contract documented and reflected in component typings.
- Invariant documented in code comments/tests.

## Phase 1 - Shared Composer Container

1. Extract orchestration logic from `training-plan-create.tsx` into shared container (e.g. `TrainingPlanComposerScreen`).
2. Keep all current preview scheduling, validation, and conflict handling behavior.
3. Add mode-aware labels and submit action wiring.

Exit criteria:

- Existing create route works via shared container with no behavior regression.
- Edit mode can mount same container with mode-specific props.

## Phase 2 - Edit Initialization Mapping

1. Implement reverse adapter(s):
   - `plan.structure` -> `TrainingPlanFormData`
   - `plan.structure` + metadata -> `TrainingPlanConfigFormData`
2. Prefer creation metadata/calibration snapshots when available.
3. Fallback to defaults/suggestions for missing fields.
4. Ensure deterministic round-trip behavior where representable.

Exit criteria:

- Edit opens prefilled with valid values for goals/config.
- Adapter tests pass for modern and legacy-ish plan shapes.

## Phase 3 - Edit Save API Path

1. Add `updateFromCreationConfig` mutation in `training-plans.base.ts` (or application use-case layer).
2. Reuse create pipeline dependencies:
   - config evaluation
   - projection artifacts
   - conflict derivation
   - override audit
   - structure validation
3. Update existing plan row instead of insert.
4. Preserve `id` and existing ownership/security checks.
5. Do not touch `activities` table.

Exit criteria:

- Edit save passes same blocker/override semantics as create.
- Updated row returns expected structure and summary payload.

## Phase 4 - Route Integration and UX Consolidation

1. Add dedicated edit route (e.g. `/training-plan-edit` with `id` param) using shared container in edit mode.
2. Wire edit entry points from plan dashboard/adjust/settings to new route.
3. Reduce settings page responsibility to non-composer actions (activation/deletion/basic metadata), or route structure editing to shared composer.

Exit criteria:

- User can navigate to Edit and see same experience as Create.
- No dead-end or duplicate primary editing path.

## Phase 5 - Testing and Verification

### Unit tests

- Reverse adapter mapping tests
- Mode gating tests for composer state initialization
- Determinism tests for create/edit payload shaping

### Router/use-case tests

- `updateFromCreationConfig` happy path
- blocking conflict rejection path
- override-allowed path
- stale preview token handling (if retained for edit)
- ownership/authorization path

### UI tests

- Create/Edit parity smoke tests for visible sections/tabs
- CTA copy and disabled state behavior
- "history untouched" messaging visibility in edit mode

## Quality Gates

- `pnpm check-types`
- `pnpm lint`
- targeted tests:
  - mobile training-plan create/edit component tests
  - trpc training-plans router/use-case tests
- full `pnpm test` when feasible (acknowledge unrelated baseline failures if present)

## Rollout Strategy

1. Internal rollout behind optional mobile flag (`trainingPlanUnifiedComposer`) if needed.
2. Validate telemetry:
   - create success rate
   - edit save success rate
   - blocker frequency
   - override frequency
3. Remove legacy edit path after parity confidence.

## Definition of Done

1. Create and Edit share one composer UX with mode-only differences.
2. Edit save uses create-equivalent safety/conflict logic.
3. Past/completed activity history remains unchanged.
4. Existing defaults and advanced controls are preserved.
5. Parity and integrity tests pass.
