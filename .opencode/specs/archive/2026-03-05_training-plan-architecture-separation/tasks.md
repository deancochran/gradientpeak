# Tasks: Training Plan Architecture Separation

## Phase 1: Database Migration

- [ ] Create migration to add `user_training_plans` table.
- [ ] Add `user_training_plan_id` to `events` table.
- [ ] Write data migration script to move existing active plans to `user_training_plans`.
- [ ] Drop `is_active` from `training_plans`.
- [ ] Run `pnpm db:generate` to update TypeScript types.

## Phase 2: Backend API Updates

- [ ] Update `applyTemplate` mutation in `trainingPlans` router:
  - [ ] Add input validation for `start_date` or `target_date`.
  - [ ] Add concurrency check (prevent multiple active plans).
  - [ ] Create `user_training_plans` record with `snapshot_structure`.
  - [ ] Link generated events to `user_training_plan_id`.
- [ ] Create `getActivePlan` procedure.
- [ ] Create `updateActivePlanStatus` procedure (handle pause/complete/abandon).
- [ ] Remove `is_active` references from `trainingPlans` router.
- [ ] Update `events` router to use `user_training_plan_id`.

## Phase 3: Frontend UI Split

- [x] Refactor `training-plan.tsx` into `training-plan-detail.tsx` (Template View).
  - [x] Remove execution charts and insights.
  - [x] Keep template actions (Apply, Save to Library).
  - [x] Implement "Apply" configuration modal (Start/Target date selection).
  - [x] Implement active plan concurrency warning modal.
- [x] Create `active-plan.tsx` (Execution View).
  - [x] Move `PlanVsActualChart`, `WeeklyProgressCard`, and insights here.
  - [x] Implement data fetching for the active plan.
  - [x] Add UI controls to pause or end the active plan.
- [x] Update `TrainingPlanListItem.tsx`:
  - [x] Remove `is_active` badge and related styling logic.
- [x] Update `plan.tsx` (Plan Tab):
  - [x] Update top summary card to fetch from `user_training_plans`.
  - [x] Change "Open Full Plan" button to route to `/active-plan`.
- [x] Update navigation routes in `ROUTES` constant.
- [x] Update links across the app to point to the correct new screens.

## Phase 4: Testing & Cleanup

- [ ] Verify template application flow with date configuration.
- [ ] Verify concurrency prevention logic works.
- [ ] Verify active plan dashboard renders correctly.
- [ ] Verify template detail page renders correctly for owners and non-owners.
- [ ] Clean up unused imports and components.
