# Training Plan Start Date + Microcycle Projection (Task Checklist)

Last Updated: 2026-02-11
Status: Ready for implementation
Owner: Mobile + Core + Backend

This checklist implements `./design.md` and `./plan.md`.

## Phase 1 - Schema + Contract

- [ ] Add `plan_start_date` to creation config input contract (date-only).
- [ ] Validate `plan_start_date` format and bound against latest goal date.
- [ ] Ensure preview and create procedures both accept/start using the new field.
- [ ] Keep backward compatibility for missing `plan_start_date` clients.

## Phase 2 - Timeline Derivation Logic

- [ ] Add shared helper to derive effective timeline (`start_date`, `end_date`) from goals + optional start date.
- [ ] Set default start date to today when `plan_start_date` is omitted.
- [ ] Preserve end date as latest goal date for multi-goal plans.
- [ ] Enforce minimum horizon rules and return actionable warning/blocker details.
- [ ] Remove creation-path reliance on hidden `goal - 84` start-date heuristic.

## Phase 3 - Microcycle Computation

- [ ] Define projection `microcycles[]` contract type.
- [ ] Generate deterministic week-by-week microcycles across full plan timeline.
- [ ] Encode pattern labels (`ramp`, `deload`, `taper`, `event`) deterministically.
- [ ] Ensure microcycle weekly load affects projected load and CTL lines.
- [ ] Include microcycle metadata in preview payload.

## Phase 4 - Mobile UI/UX Updates

- [ ] Add start date control to creation form configuration UI.
- [ ] Show helper copy explaining default start date behavior.
- [ ] Trigger preview recompute when start date changes.
- [ ] Render microcycle context in chart-adjacent UI (compact strip/list).
- [ ] Keep chart legend and mixed-axis disambiguation clear (normalized display + exact detail values).
- [ ] Ensure mobile accessibility labels/hints include timeline and microcycle context.

## Phase 5 - Tests

### Core

- [ ] Test explicit start date is honored in expansion.
- [ ] Test omitted start date defaults as expected.
- [ ] Test multi-goal end date uses latest goal.
- [ ] Test blocks reference expected goal set and stay contiguous.

### tRPC

- [ ] Test preview/create reject invalid `plan_start_date` (after latest goal).
- [ ] Test preview returns `microcycles[]` with deterministic shape.
- [ ] Test microcycle-influenced projection points are non-empty and ordered.

### Mobile

- [ ] Test start date changes trigger preview refresh.
- [ ] Test start date validation messaging in create form.
- [ ] Test microcycle section rendering from preview payload.

## Phase 6 - Quality Gates

- [ ] Run `pnpm --filter @repo/core check-types`.
- [ ] Run `pnpm --filter @repo/trpc check-types`.
- [ ] Run `pnpm --filter mobile check-types`.
- [ ] Run targeted core/trpc tests for timeline and projection logic.
- [ ] Run full suite when feasible: `pnpm check-types && pnpm lint && pnpm test`.

## Definition of Done

- [ ] Start date in creation is explicit and no longer perceived as arbitrary.
- [ ] Preview and create share one timeline derivation rule.
- [ ] Multi-goal horizon is handled correctly.
- [ ] Microcycle progression is computed, visible, and influences chart projections.
- [ ] UI copy and controls make timeline behavior understandable for users.
- [ ] Type checks and targeted tests pass for touched packages.
