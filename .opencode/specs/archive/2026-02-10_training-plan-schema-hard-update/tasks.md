# Tasks: Training Plan Schema Hard Update

Last Updated: 2026-02-10
Status: Ready for execution
Owner: Core + Backend + Mobile

This checklist tracks implementation of the hard schema cutover defined in:

- `./design.md`
- `./plan.md`

## Phase 0 - Alignment and Guardrails

- [x] Confirm this rollout is a hard break (no backward compatibility behavior in code paths).
- [x] Confirm multisport/triathlon target support is explicitly out of scope.
- [ ] Confirm required invariants:
  - [x] training plan `goals` min(1)
  - [x] goal `targets` min(1)
  - [x] required `target_type` per target
  - [x] required associated time for `pace_threshold`
  - [x] required associated time for `power_threshold`
- [ ] Confirm plan-level activity-category input is removed from create/update payload contracts.

## Phase 1 - Core Schema Cutover (`packages/core`)

### 1.1 Goal/Target V2 schema

- [x] Replace legacy goal metric shape with V2 `targets[]` discriminated union in `packages/core/schemas/training_plan_structure.ts`.
- [x] Enforce `goals.min(1)` on training plan schema.
- [x] Enforce `targets.min(1)` on goal schema.
- [ ] Include only supported `target_type` variants:
  - [x] `race_performance`
  - [x] `pace_threshold`
  - [x] `power_threshold`
  - [x] `hr_threshold`
- [x] Ensure multisport/triathlon variants are not present in V2 union.

### 1.2 Required time fields for threshold targets

- [x] Make `test_duration_s` required for `pace_threshold`.
- [x] Make `test_duration_s` required for `power_threshold`.

### 1.3 Domain input parsing support

- [x] Add parser/validation helpers in `packages/core/schemas/form-schemas.ts` for:
  - [x] distance input in `km`
  - [x] completion time format `h:mm:ss`
  - [x] pace format `mm:ss`

### 1.4 Normalization and derivation

- [x] Update `packages/core/plan/normalizeGoalInput.ts` to normalize V2 payloads to canonical units.
- [x] Add/replace helper to derive activity categories from all goals/targets.
- [x] Ensure no plan-level category is required by normalization path.

### 1.5 Plan expansion wiring

- [x] Update `packages/core/plan/expandMinimalGoalToPlan.ts` to consume V2 goals/targets.
- [x] Remove dependencies on legacy optional single metric fields.

### 1.6 Core exports cleanup

- [x] Update `packages/core/schemas/index.ts` exports to V2 models.
- [ ] Remove deprecated create-flow schema exports no longer used by V2.

## Phase 2 - Backend Contract Cutover (`packages/trpc`)

### 2.1 Router input updates

- [x] Update `packages/trpc/src/routers/training_plans.ts` input schemas for:
  - [ ] create
  - [x] createFromMinimalGoal (or rename if no longer minimal)
  - [x] getFeasibilityPreview
- [x] Ensure V2 goal/target contract is the only accepted payload shape.

### 2.2 Validation and rejection behavior

- [x] Add explicit validation errors for:
  - [x] empty goals
  - [x] empty targets
  - [x] unknown target type
  - [x] missing `test_duration_s` for pace/power thresholds
  - [ ] malformed `h:mm:ss` and `mm:ss` inputs
  - [x] multisport/triathlon target attempts
- [x] Ensure error responses are path-specific and actionable.

### 2.3 Feasibility and planning logic

- [x] Replace legacy single-metric references with loops over `goal.targets`.
- [x] Ensure category derivation used by planner/insight paths comes from target set.

## Phase 3 - Mobile Create Flow Cutover (`apps/mobile`)

### 3.1 Form model updates

- [x] Refactor `apps/mobile/components/training-plan/create/SinglePageForm.tsx` to support:
  - [x] multiple goals
  - [x] multiple targets per goal
  - [x] required target type selection
  - [x] type-specific required fields
- [x] Remove multisport/triathlon options from target picker.

### 3.2 Input UX and validation

- [ ] Implement user-facing input fields/formats:
  - [ ] distance in km
  - [ ] completion time `h:mm:ss`
  - [ ] pace `mm:ss`
- [x] Enforce mandatory associated time input for pace and power threshold targets.

### 3.3 Payload emission

- [x] Update `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` to emit only V2 payloads.
- [x] Remove construction of legacy `metric` payloads.
- [x] Ensure preview and create flows share the same V2 payload builder.

## Phase 4 - Tests and Validation

### 4.1 Core tests

- [ ] Add/replace schema tests for V2 validity and invalidity conditions.
- [ ] Add parser tests for `km`, `h:mm:ss`, `mm:ss` conversions/validation.
- [ ] Add category-derivation tests across multi-goal, multi-target plans.

### 4.2 tRPC tests

- [ ] Add tests that accept valid V2 create/preview payloads.
- [ ] Add tests that reject legacy payloads.
- [ ] Add tests that reject multisport/triathlon target types.

### 4.3 Mobile tests

- [ ] Add form tests to block submit when:
  - [ ] no goals
  - [ ] goal has no targets
  - [ ] pace/power target missing associated time
- [ ] Add payload-shape test for V2 submission path.

### 4.4 Type-check and runtime validation commands

- [x] Run `npx tsc --noEmit` in `packages/core`.
- [x] Run `npx tsc --noEmit` in `packages/trpc`.
- [x] Run `npx tsc --noEmit` in `apps/mobile`.
- [x] Run package test commands for affected packages and record failures.

## Phase 5 - Completion and Spec Hygiene

- [x] Update this file with completed checkboxes as implementation lands.
- [ ] Record any intentional deviations from `design.md`/`plan.md`.
- [ ] Confirm final acceptance criteria from `./plan.md` are satisfied.
