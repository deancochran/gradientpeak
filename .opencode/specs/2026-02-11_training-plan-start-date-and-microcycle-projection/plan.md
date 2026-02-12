# Training Plan Start Date + Microcycle Projection (Implementation Plan)

Last Updated: 2026-02-11
Status: Draft for implementation
Owner: Mobile + Core + Backend

This plan translates `./design.md` into implementation phases across schema, timeline derivation, preview compute, and create UX.

## 1) Scope and Non-Negotiables

- Timeline derivation must be deterministic and shared across preview/create.
- Start date behavior must be explicit and explainable.
- Microcycle progression must affect charted load/fitness outputs.
- No silent overrides of user-entered values.
- Preserve existing compatibility where safe while migrating contracts.

## 2) Technical Strategy

1. Add `plan_start_date` into creation config schema and tRPC input schemas.
2. Centralize timeline derivation helper to resolve start/end using:
   - user start date (if provided)
   - fallback to today
   - latest goal date as end
3. Use shared helper in:
   - `previewCreationConfig`
   - `createFromCreationConfig`
   - any internal expansion path using minimal goals
4. Extend projection builder with deterministic weekly microcycle synthesis.
5. Surface new data in mobile create UI with clear affordances.

## 3) Phase Breakdown

### Phase 1 - Schema and Input Contract

1. Add `plan_start_date?: YYYY-MM-DD` to core creation config schema.
2. Thread field through tRPC input schemas for preview/create.
3. Validate date format and bounds (`<= latest goal date`).
4. Add typed helper for deriving normalized timeline boundaries.

### Phase 2 - Core Timeline Derivation

1. Update plan expansion path to accept explicit start date from creation input.
2. Replace implicit `goal - 84 days` fallback in creation preview/create path with `today` fallback.
3. Keep legacy internal heuristic only where non-creation call sites still require it.
4. Add tests:
   - explicit start date honored
   - default today used when omitted
   - invalid late start blocked
   - multi-goal latest end date preserved

### Phase 3 - Microcycle Computation and Projection Contract

1. Define microcycle output type in projection contract.
2. Generate deterministic weekly progression with pattern assignment.
3. Apply microcycle loads into CTL progression and projected chart points.
4. Include microcycles in preview response and plan preview metadata as needed.
5. Add tests for deterministic progression and pattern sequencing behavior.

### Phase 4 - Mobile UX and Chart Integration

1. Add start date input/control in creation form config area.
2. Show explicit helper text for start date default behavior.
3. Trigger preview recompute on start date edits with existing debounced flow.
4. Update chart/summary UI to show microcycle context and interpretation.
5. Ensure small-screen readability and accessibility labels remain intact.

### Phase 5 - Hardening and Validation

1. Confirm no regressions in create flow success and preview reliability.
2. Run type checks and targeted tests for core/trpc/mobile.
3. Add telemetry events for start date edits and microcycle interaction (if analytics layer exists).
4. Document rollout guidance and rollback criteria.

## 4) File-Level Change Map

### Core

- `packages/core/schemas/training_plan_structure.ts`
  - add `plan_start_date` to creation config structures (if represented there)
- `packages/core/plan/expandMinimalGoalToPlan.ts`
  - support explicit start date path used by creation
- `packages/core/plan/__tests__/*`
  - add/expand timeline derivation + multi-goal tests

### tRPC

- `packages/trpc/src/routers/training_plans.ts`
  - extend preview/create input schemas
  - apply shared timeline derivation
  - ensure projection includes microcycles
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`
  - add start-date and microcycle contract tests

### Mobile

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
  - thread `plan_start_date` into preview/create payloads
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
  - add start date control and validation feedback surface
- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`
  - render microcycle context and update selected point details
- `apps/mobile/components/training-plan/create/projection-chart-types.ts`
  - include `microcycles` and any timeline metadata updates

## 5) Test and Validation Commands

Minimum checks:

- `pnpm --filter @repo/core check-types`
- `pnpm --filter @repo/trpc check-types`
- `pnpm --filter mobile check-types`

Targeted tests:

- `pnpm --filter @repo/core exec vitest run plan/__tests__/expandMinimalGoalToPlan.test.ts`
- `pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts`

Recommended full validation:

- `pnpm check-types && pnpm lint && pnpm test`

## 6) Rollout Notes

1. Keep backward compatibility for clients that do not yet send `plan_start_date`.
2. Apply defaulting server-side first, then ship UI field.
3. Monitor preview error rate and creation completion rate post-release.
