# Training Plan MVP - Execution Tasks

Status: Ready for implementation  
Last Updated: 2026-02-09

This checklist follows the chronological phase order in `./plan.md`.

---

## Phase 0 - Preflight and Guardrails

### Scope and safety

- [ ] Confirm no DB migrations are required in this phase.
- [ ] Confirm additive schema strategy only (no root training-plan schema replacement).
- [ ] Confirm feature flag strategy for staged rollout (`feature.trainingPlanInsightsMvp`).

### Acceptance

- [ ] Implementation plan explicitly states zero DB schema changes.
- [ ] Backward compatibility expectations documented for existing plan records.

---

## Phase 1 - Core Contracts and Schema Normalization

### Core schema updates

- [ ] Update `packages/core/schemas/training_plan_structure.ts`:
  - [ ] Ensure goal priority always exists (default when omitted).
  - [ ] Ensure metric contracts use normalized units (`distance_m`, `target_time_s`, `target_speed_mps`).
  - [ ] Ensure no raw pace-string contract reliance.
- [ ] Update `packages/core/schemas/form-schemas.ts` with canonical form-layer schemas.
- [ ] Update `packages/core/schemas/index.ts` exports for new/updated form schemas.

### Core helpers

- [ ] Create `packages/core/plan/normalizeGoalInput.ts`.
- [ ] Create `packages/core/plan/expandMinimalGoalToPlan.ts`.
- [ ] Create `packages/core/plan/goalPriorityWeighting.ts`.

### Validation

- [ ] Validate normalization and compatibility via schema checks and manual verification.

### Acceptance

- [ ] Minimal input can compile to valid existing periodized structure.
- [ ] Priority is guaranteed in normalized plan data.
- [ ] Existing plan structures remain valid.

---

## Phase 2 - Backend API Alignment (tRPC)

### Training plan router

- [ ] Update `packages/trpc/src/routers/training_plans.ts`:
  - [ ] Add `getFeasibilityPreview`.
  - [ ] Add `createFromMinimalGoal`.
  - [ ] Add/complete `getInsightTimeline` canonical payload support.
  - [ ] Return per-goal and plan-wide feasibility + safety assessments.
  - [ ] Keep existing `create` and legacy endpoints backward compatible.

### Planned activities alignment

- [ ] Update `packages/trpc/src/routers/planned_activities.ts`:
  - [ ] Unify status interpretation helper usage.
  - [ ] Ensure schedule updates can trigger fresh insight reads.

### Acceptance

- [ ] Minimal-create endpoint returns same record shape as existing create flow.
- [ ] Feasibility/safety responses include both per-goal and plan-wide states with reasons.

---

## Phase 3 - Training Plan Create Flow Consolidation (Mobile)

### Default path simplification

- [ ] Update `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`:
  - [ ] Require only goal name + target date.
  - [ ] Run feasibility preview before create.
  - [ ] Show both per-goal and plan-wide feasibility/safety summaries before confirm.
  - [ ] Submit through `createFromMinimalGoal`.
  - [ ] Route successful create to training plan view.
- [ ] Update `apps/mobile/components/training-plan/create/SinglePageForm.tsx`:
  - [ ] Minimal default form section only.
  - [ ] Optional collapsed precision helper.
  - [ ] Remove upfront advanced-required validation.

### Route consolidation

- [ ] Update `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx` to remove from default first-plan path.
- [ ] Update `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx` to advanced-only or retired state.
- [ ] Update `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx` to lightweight confirm or retired state.

### Acceptance

- [ ] One default training-plan create entry in navigation.
- [ ] First plan can be created with only required inputs.
- [ ] Advanced configuration is post-create.

---

## Phase 4 - Plan Tab and View UX Integration

### Plan tab updates

- [ ] Update `apps/mobile/app/(internal)/(tabs)/plan.tsx`:
  - [ ] Status summary + boundary/feasibility visibility at both goal and plan-wide levels.
  - [ ] Dynamic refresh on active plan updates.
  - [ ] No manual recalculate control.
- [ ] Update `apps/mobile/components/charts/PlanVsActualChart.tsx`.
- [ ] Update `apps/mobile/components/charts/TrainingLoadChart.tsx`.

### Supporting UI components

- [ ] Create `apps/mobile/components/plan/PlanStatusSummaryCard.tsx`.
- [ ] Create `apps/mobile/components/plan/PlanAdherenceMiniChart.tsx`.
- [ ] Create `apps/mobile/components/plan/PlanCapabilityMiniChart.tsx`.

### Acceptance

- [ ] Ideal/Scheduled/Actual + adherence visible in one scroll.
- [ ] Lightweight interactions only (no long-press modal patterns).

---

## Phase 5 - Activity Plan and Scheduling Simplification

### Activity-plan authoring

- [ ] Update `apps/mobile/app/(internal)/(standard)/create-activity-plan.tsx`.
- [ ] Update `apps/mobile/app/(internal)/(standard)/create-activity-plan-structure.tsx`.
- [ ] Update `apps/mobile/app/(internal)/(standard)/create-activity-plan-repeat.tsx`.
- [ ] Update `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts` for cleaner schema-driven form flow.
- [ ] Update `apps/mobile/lib/stores/activityPlanCreation.ts` to reduce flow fragmentation.

### Scheduling from detail/calendar

- [ ] Update `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`.
- [ ] Update `apps/mobile/components/ScheduleActivityModal.tsx`.
- [ ] Update `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx`.
- [ ] Update `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx`.

### Acceptance

- [ ] Scheduling from activity detail is clear and low-friction.
- [ ] Schedule changes reflect quickly in plan insight surfaces.

---

## Phase 6 - Validation, Rollout, Cleanup

### Validation

- [ ] Run type checks: `pnpm check-types`.
- [ ] Run lint: `pnpm lint`.
- [ ] Verify compatibility with existing training plans and legacy create path consumers.
- [ ] Verify per-goal and plan-wide feasibility/safety reasoning is visible and understandable.

### Rollout

- [ ] Enable behind feature flag for internal users.
- [ ] Expand to small cohort after stability checks.
- [ ] Roll out broadly after error/latency thresholds pass.

### Cleanup

- [ ] Remove dead navigation branches after stabilization window.
- [ ] Update docs to reflect final retained screens/routes.

---

## Cross-Phase Quality Gates

- [ ] Normalized units only (`m`, `s`, `m/s`) in contracts and persistence.
- [ ] Goal priority always present and used in conflict-aware weighting.
- [ ] No recommendation-engine or auto-prescription behavior introduced.
- [ ] No DB schema migration introduced.
