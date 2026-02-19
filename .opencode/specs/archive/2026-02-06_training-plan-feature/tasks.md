# Training Plan MVP - Execution Tasks

Status: Ready for implementation  
Last Updated: 2026-02-09

This checklist follows the chronological phase order in `./plan.md`.

---

## Phase 0 - Preflight and Guardrails

### Scope and safety

- [x] Confirm no DB migrations are required in this phase.
- [x] Confirm additive schema strategy only (no root training-plan schema replacement).
- [x] Confirm feature flag strategy for staged rollout (`feature.trainingPlanInsightsMvp`).
- [x] Confirm training plan templates are excluded from this phase.
- [x] Confirm activity series/collections are excluded from this phase.
- [x] Confirm bulk scheduling workflows are excluded from this phase.

### Acceptance

- [x] Implementation plan explicitly states zero DB schema changes.
- [x] Backward compatibility expectations documented for existing plan records.

---

## Phase 1 - Core Contracts and Schema Normalization

### Core schema updates

- [x] Update `packages/core/schemas/training_plan_structure.ts`:
  - [x] Ensure goal priority always exists (default when omitted).
  - [x] Ensure metric contracts use normalized units (`distance_m`, `target_time_s`, `target_speed_mps`).
  - [x] Ensure no raw pace-string contract reliance.
- [x] Update `packages/core/schemas/form-schemas.ts` with canonical form-layer schemas.
- [x] Update `packages/core/schemas/index.ts` exports for new/updated form schemas.

### Core helpers

- [x] Create `packages/core/plan/normalizeGoalInput.ts`.
- [x] Create `packages/core/plan/expandMinimalGoalToPlan.ts`.
- [x] Create `packages/core/plan/goalPriorityWeighting.ts`.

### Validation

- [x] Validate normalization and compatibility via schema checks and manual verification.

### Acceptance

- [x] Minimal input can compile to valid existing periodized structure.
- [x] Priority is guaranteed in normalized plan data.
- [x] Existing plan structures remain valid.

---

## Phase 2 - Backend API Alignment (tRPC)

### Training plan router

- [x] Update `packages/trpc/src/routers/training_plans.ts`:
  - [x] Add `getFeasibilityPreview`.
  - [x] Add `createFromMinimalGoal`.
  - [x] Add/complete `getInsightTimeline` canonical payload support.
  - [x] Return per-goal and plan-wide feasibility + safety assessments.
  - [x] Keep existing `create` and legacy endpoints backward compatible.

### Planned activities alignment

- [x] Update `packages/trpc/src/routers/planned_activities.ts`:
  - [x] Unify status interpretation helper usage.
  - [x] Ensure schedule updates can trigger fresh insight reads.

### Acceptance

- [x] Minimal-create endpoint returns same record shape as existing create flow.
- [x] Feasibility/safety responses include both per-goal and plan-wide states with reasons.

---

## Phase 3 - Training Plan Create Flow Consolidation (Mobile)

### Default path simplification

- [x] Update `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`:
  - [x] Require only goal name + target date.
  - [x] Run feasibility preview before create.
  - [x] Show both per-goal and plan-wide feasibility/safety summaries before confirm.
  - [x] Submit through `createFromMinimalGoal`.
  - [x] Route successful create to training plan view.
- [x] Update `apps/mobile/components/training-plan/create/SinglePageForm.tsx`:
  - [x] Minimal default form section only.
  - [x] Optional collapsed precision helper.
  - [x] Remove upfront advanced-required validation.

### Route consolidation

- [x] Update `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx` to remove from default first-plan path.
- [x] Update `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx` to advanced-only or retired state.
- [x] Update `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx` to lightweight confirm or retired state.

### Acceptance

- [x] One default training-plan create entry in navigation.
- [x] First plan can be created with only required inputs.
- [x] Advanced configuration is post-create.

---

## Phase 4 - Plan Tab and View UX Integration

### Plan tab updates

- [x] Update `apps/mobile/app/(internal)/(tabs)/plan.tsx`:
  - [x] Status summary + boundary/feasibility visibility at both goal and plan-wide levels.
  - [x] Dynamic refresh on active plan updates.
  - [x] No manual recalculate control.
- [x] Update `apps/mobile/components/charts/PlanVsActualChart.tsx`.
- [x] Update `apps/mobile/components/charts/TrainingLoadChart.tsx`.

### Supporting UI components

- [x] Create `apps/mobile/components/plan/PlanStatusSummaryCard.tsx`.
- [x] Create `apps/mobile/components/plan/PlanAdherenceMiniChart.tsx`.
- [x] Create `apps/mobile/components/plan/PlanCapabilityMiniChart.tsx`.

### Acceptance

- [x] Ideal/Scheduled/Actual + adherence visible in one scroll.
- [x] Lightweight interactions only (no long-press modal patterns).

---

## Phase 5 - Activity Plan and Scheduling Simplification

### Activity-plan authoring

- [x] Update `apps/mobile/app/(internal)/(standard)/create-activity-plan.tsx`.
- [x] Update `apps/mobile/app/(internal)/(standard)/create-activity-plan-structure.tsx`.
- [x] Update `apps/mobile/app/(internal)/(standard)/create-activity-plan-repeat.tsx`.
- [x] Update `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts` for cleaner schema-driven form flow.
- [x] Update `apps/mobile/lib/stores/activityPlanCreation.ts` to reduce flow fragmentation.

### Scheduling from detail/calendar

- [x] Update `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`.
- [x] Update `apps/mobile/components/ScheduleActivityModal.tsx`.
- [x] Update `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx`.
- [x] Update `apps/mobile/app/(internal)/(standard)/scheduled-activity-detail.tsx`.

### Acceptance

- [x] Scheduling from activity detail is clear and low-friction.
- [x] Schedule changes reflect quickly in plan insight surfaces.

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
- [ ] No training plan template feature work added in this phase.
- [ ] No activity series/collections feature work added in this phase.
- [ ] No bulk activity scheduling feature work added in this phase.
