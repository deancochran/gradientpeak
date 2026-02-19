# Training Plan Schema Hard Update (Implementation Plan)

Last Updated: 2026-02-10
Status: Draft for implementation
Owner: Core + Backend + Mobile

This plan translates `./design.md` into concrete code changes.

## 1) Scope and Hard Rules

- This is a hard schema cutover (no backward compatibility).
- No multisport or triathlon target support in this phase.
- Training plan requires at least one goal.
- Every goal requires at least one target.
- Target types in scope only:
  - `race_performance`
  - `pace_threshold`
  - `power_threshold`
  - `hr_threshold`
- `pace_threshold` and `power_threshold` must include required associated time.
- Plan-level activity categories are removed from user input and derived from goals/targets.

## 2) Implementation Summary

Hard cutover requires coordinated updates in:

1. `@repo/core` schemas and normalization
2. `@repo/trpc` input contracts and validation
3. Mobile create/edit payload construction and form validation

No partial rollout where old and new goal payloads coexist.

## 3) Target Contract (V2)

### 3.1 Core schema targets

- Replace goal metric model with required target arrays.
- Canonical model:
  - `trainingPlan.goals: GoalV2[]` with `min(1)`
  - `GoalV2.targets: GoalTargetV2[]` with `min(1)`
  - `GoalTargetV2.target_type` discriminated union

### 3.2 Input normalization

- User units accepted:
  - distance in `km`
  - completion time as `h:mm:ss`
  - pace as `mm:ss`
- Normalize to storage/compute units:
  - `distance_m`
  - `target_time_s`
  - `target_speed_mps`
  - `test_duration_s`

### 3.3 Category derivation

- Compute category set from all goal targets.
- Remove requirement to send plan-level category config in create/update payloads.

## 4) File-Level Change Plan

## 4.1 Core (`packages/core`)

1. `packages/core/schemas/training_plan_structure.ts`
   - Introduce `goalTargetV2Schema` and `goalV2Schema`.
   - Enforce:
     - `goals.min(1)`
     - `targets.min(1)`
     - no multisport target variants.
     - required `test_duration_s` for `pace_threshold` and `power_threshold`.
   - Remove legacy single-metric goal schema references from plan create/update contracts.

2. `packages/core/schemas/form-schemas.ts`
   - Add parsers/validators for:
     - `h:mm:ss` completion time
     - `mm:ss` pace
     - decimal `km`

3. `packages/core/plan/normalizeGoalInput.ts`
   - Replace old goal normalization with V2 normalization.
   - Convert user units to normalized SI-style units.
   - Validate and reject invalid formatting/ranges.

4. `packages/core/plan/expandMinimalGoalToPlan.ts`
   - Consume V2 goals/targets model.
   - Remove assumptions that depend on legacy optional `metric`.
   - Call shared category-derivation helper from all targets.

5. `packages/core/schemas/index.ts` and exports
   - Export new V2 schemas/types.
   - Remove deprecated exports referenced by create/edit flows.

## 4.2 Backend (`packages/trpc`)

1. `packages/trpc/src/routers/training_plans.ts`
   - Update `create`, `createFromMinimalGoal`, and `getFeasibilityPreview` inputs to V2.
   - Reject old payload shapes with clear `BAD_REQUEST` messages.
   - Run V2 normalization before persistence and preview calculations.
   - Ensure feasibility reads from goal targets, not legacy singular goal metric fields.

2. Any related router helpers in the same package
   - Replace any logic depending on `goal.metric` optional semantics.
   - Ensure all assessment loops iterate through `goal.targets`.

## 4.3 Mobile (`apps/mobile`)

1. `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
   - Replace single-goal optional-metric helper UX with:
     - multi-goal editor
     - per-goal multi-target editor
     - mandatory target type selector
     - type-specific required inputs
   - Remove multisport/triathlon options.

2. `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
   - Build and submit V2 payload only.
   - Stop constructing legacy `metric` object.
   - Validate required time fields for pace/power targets before preview/create.

3. Related create/review screens (if still routed)
   - Remove or update paths that emit legacy goal payloads.

## 5) Derivation Rules (Implementation Contract)

Centralize in core helper (single source of truth):

1. Race performance:
   - Input combinations allowed:
     - `distance_km + completion_time`
     - `distance_km + pace`
     - `completion_time + pace`
   - Derive the missing value and normalize.

2. Pace threshold:
   - Require `target_speed_mps` (or parse from pace input) and `test_duration_s`.

3. Power threshold:
   - Require `target_watts` and `test_duration_s`.

4. HR threshold:
   - Require `target_lthr_bpm`.

5. Category derivation:
   - Derive category footprint from all targets and return as computed metadata used by planners.

## 6) Validation and Error Handling

- Validation must fail fast at API boundary.
- Error responses must include path-specific messages (goal index, target index, field name).
- Required failures to enforce:
  - empty goals array
  - empty targets array
  - unsupported `target_type`
  - missing `test_duration_s` for pace/power thresholds
  - malformed time/pace input formats

## 7) Testing Plan

## 7.1 Core tests

- Add/replace tests for:
  - V2 schema acceptance/rejection cases
  - normalization from user units to normalized units
  - required target-time behavior for pace/power thresholds
  - category derivation from multiple goals/targets

## 7.2 tRPC tests

- Add router tests for:
  - create and preview with valid V2 payloads
  - rejection of legacy payloads
  - rejection of multisport/triathlon target types

## 7.3 Mobile validation tests

- Add component/form tests for:
  - cannot submit goal without targets
  - cannot submit pace/power target without associated time
  - payload shape matches V2 contract

## 7.4 Command validation

Run package-level checks after implementation:

- `apps/mobile`: `npx tsc --noEmit` and test command
- `packages/core`: `npx tsc --noEmit` and test command
- `packages/trpc`: `npx tsc --noEmit` and test command

Lint execution should follow current repo lint baseline policy.

## 8) Execution Phases

Phase 1 - Core schema cutover

- Replace goal/target schemas and exports.
- Add parsers and normalization helpers.

Phase 2 - Router cutover

- Switch create/preview/update inputs and validators.
- Remove legacy payload acceptance.

Phase 3 - Mobile cutover

- Replace create form data model and payload generation.
- Enforce required target entries and target-type field requirements.

Phase 4 - Validation pass

- Execute type-check/tests for affected packages.
- Fix regressions until V2 creation flow is stable.

## 9) Acceptance Checklist

1. Any create/update call using legacy goal schema fails validation.
2. New plan creation requires at least one goal and each goal at least one target.
3. Pace and power thresholds fail without mandatory associated time.
4. Multisport/triathlon target types are unavailable in UI and rejected by API.
5. Activity categories for planning are derived from submitted targets, not plan-level manual category input.
