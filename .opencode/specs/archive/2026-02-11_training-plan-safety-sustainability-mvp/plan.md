# Training Plan Safety + Sustainability MVP (Implementation Plan)

Last Updated: 2026-02-11
Status: Draft for implementation
Owner: Mobile + Core + Backend

This plan translates `./design.md` into phased implementation for schema, normalization, conflict handling, feasibility scoring, projection, and mobile create UX.

## 1) Scope and Non-Negotiables

- Implement exactly four MVP fields: `optimization_profile`, `post_goal_recovery_days`, `max_weekly_tss_ramp_pct`, `max_ctl_ramp_per_week`.
- Enforce explicit post-goal recovery behavior for each goal in multi-goal timelines.
- Apply hard ramp caps in both preview and create.
- Keep behavior deterministic and explainable; no hidden adaptive logic.
- Preserve backward compatibility for clients that omit new fields.

## 2) Technical Strategy

1. Extend core/trpc schemas with the four fields and strict bounds.
2. Update normalization and suggestion pipeline to derive profile defaults first, then merge valid overrides.
3. Extend conflict resolver to block impossible cap/recovery combinations.
4. Extend feasibility scoring to evaluate constrained ramps segment-by-segment.
5. Update projection generator to insert recovery windows and clamp weekly progression.
6. Surface controls and explanations in mobile create UI and projection details.

## 3) Phase Breakdown

### Phase 1 - Core Schema and Contract Wiring

1. Add new creation config fields in core schema with enum/range constraints.
2. Thread fields through preview/create input schemas and normalized config shape.
3. Ensure stored `normalized_config` includes final field values.

Primary touchpoints:

- `packages/core/schemas/training_plan_structure.ts`
- `packages/trpc/src/routers/training_plans.ts`

### Phase 2 - Normalization, Suggestions, and Conflict Resolution

1. Update creation suggestion derivation to include profile-based defaults.
2. Merge confirmed suggestions and explicit user values deterministically.
3. Extend conflict resolution with two blocking classes:
   - recovery window overlap/compression between sequential goals
   - required ramp beyond configured TSS/CTL caps
4. Return field-scoped suggestions tied to conflicts.

Primary touchpoints:

- `packages/trpc/src/routers/training_plans.ts`
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`

### Phase 3 - Feasibility Scoring Updates

1. Evaluate each goal segment using constrained ramps.
2. Reclassify feasibility states based on cap proximity and cap violations.
3. Ensure reasons are explicit and reusable in UI copy.

Primary touchpoints:

- `packages/trpc/src/routers/training_plans.ts`
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`

### Phase 4 - Projection Logic and Multi-Goal Recovery Behavior

1. Update weekly projection generation to clamp TSS/CTL progression.
2. Insert post-goal recovery windows for every goal event.
3. Ensure recovery segments are represented in projection metadata consumed by mobile charts.
4. Preserve deterministic ordering and contiguous week coverage across the full timeline.

Primary touchpoints:

- `packages/core/plan/__tests__/training-plan-preview.test.ts`
- `packages/trpc/src/routers/training_plans.ts`
- `apps/mobile/components/training-plan/create/projection-chart-types.ts` (or nearest equivalent chart type contract)

### Phase 5 - Mobile Create UI and Interaction Model

1. Add controls for optimization profile, recovery days, and ramp caps.
2. Show deterministic helper text for each control (what it limits and why).
3. Trigger preview refresh on relevant field changes.
4. Surface recovery windows and constrained ramp context in projection details.

Primary touchpoints:

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx` (or nearest equivalent form module)
- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx` (or nearest equivalent chart module)

### Phase 6 - Tests, Validation, and Rollout

1. Add/extend core + trpc + mobile tests for new deterministic behavior.
2. Run type checks and targeted tests for touched surfaces.
3. Roll out server changes first (safe defaults), then mobile controls.
4. Monitor preview conflict rates and create completion for regression signals.

Primary touchpoints:

- `packages/core/plan/__tests__/training-plan-preview.test.ts`
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`
- Mobile create tests nearest existing create flow coverage

## 4) Validation Commands

Minimum checks:

- `pnpm --filter @repo/core check-types`
- `pnpm --filter @repo/trpc check-types`
- `pnpm --filter mobile check-types`

Targeted tests:

- `pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts`
- `pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts`

Recommended full validation:

- `pnpm check-types && pnpm lint && pnpm test`

## 5) Rollout Notes

1. Backend accepts missing fields and defaults to `balanced` profile + deterministic caps/recovery.
2. Mobile ships explicit controls once backend contracts are stable.
3. If conflict rate spikes after release, maintain hard safety caps and tune defaults only.
