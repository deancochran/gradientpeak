# Tasks: Scheduled Training Plan Management Flow

## Coordination Rules

- [ ] Template management and scheduled-plan management remain separate user concepts throughout the implementation.
- [ ] A task is complete only when code lands and focused validation passes.
- [ ] Do not add new database tables or columns in this MVP.
- [ ] Use `schedule_batch_id` when present and preserve safe fallback behavior for legacy rows without it.

## Phase 1: Spec And IA Lock

- [ ] Task A - Register the scheduled-plan management spec. Success: `design.md`, `plan.md`, and `tasks.md` exist under `.opencode/specs/2026-03-21_scheduled-plan-management-flow/`.
- [ ] Task B - Lock the product language split. Success: screens and copy clearly distinguish `templates` from `scheduled plans`.

## Phase 2: Backend Read Model

- [ ] Task C - Add scheduled-plan grouping helpers in `training-plans.base.ts`. Success: backend can derive grouped scheduled-plan summaries from `events`.
- [ ] Task D - Add `trainingPlans.listScheduled`. Success: mobile can query grouped scheduled plans without inferring them client-side from raw events.
- [ ] Task E - Add `trainingPlans.getScheduledByKey`. Success: mobile can open one scheduled plan execution with grouped events and source metadata.

## Phase 3: Backend Bulk Actions

- [ ] Task F - Add `trainingPlans.deleteScheduledEvents`. Success: users can remove future or selected sessions from one scheduled-plan execution.
- [ ] Task G - Add `trainingPlans.detachScheduledEvents`. Success: users can keep selected events on the calendar while removing scheduled-plan lineage.
- [ ] Task H - Reuse `trainingPlans.updateActivePlanStatus` from scheduled-plan detail. Success: active scheduled plans can be completed or abandoned from the new management surface.

## Phase 4: Mobile Scheduled-Plan Surface

- [ ] Task I - Add scheduled-plan routes and screens. Success: `scheduled-plans-list` and `scheduled-plan-detail` load from the new router contracts.
- [ ] Task J - Split Plan-tab CTAs. Success: users can independently reach `Manage Scheduled Plan` and `Edit My Templates`.
- [ ] Task K - Update apply success routing. Success: training-plan apply opens scheduled-plan detail using `training_plan_id` and `schedule_batch_id`.

## Phase 5: UX Cleanup

- [ ] Task L - Clarify owned-template list copy. Success: `training-plans-list` no longer implies it contains applied public plans.
- [ ] Task M - Add scheduled-plan context to event detail where applicable. Success: plan-backed scheduled events can link back to scheduled-plan management.

## Validation Gate

- [ ] Validation 1 - `@repo/trpc` typechecks.
- [ ] Validation 2 - focused `@repo/trpc` scheduled-plan tests pass.
- [ ] Validation 3 - `mobile` typechecks.
- [ ] Validation 4 - focused mobile scheduled-plan tests pass.
