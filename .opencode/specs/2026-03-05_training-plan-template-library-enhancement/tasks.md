# Tasks: Profile Goals + Training Plans (MVP)

## Phase 1: Schema Refactor

- [ ] Create `profile_goals` table with FK links to `profiles`, optional `training_plans`, optional `events` (`milestone_event_id`).
- [ ] Add `profile_goals.importance` integer column with check constraint (0-10).
- [ ] Add `training_plans.primary_goal_id` FK to `profile_goals`.
- [ ] Add `training_plans.sessions_per_week_target` and `training_plans.duration_hours` (numeric).
- [ ] Add `training_plans.status` (`draft`, `active`, `paused`, `completed`, `abandoned`).
- [ ] Add check constraints for numeric bounds and enum-style text constraints.
- [ ] Add indexes for `profile_goals` and `training_plans` query paths.
- [ ] Add partial unique constraint enforcing one active/paused plan per profile (`profile_id IS NOT NULL`).

## Phase 2: Backfill + Compatibility

- [ ] Backfill existing template rows in `training_plans` to ensure `profile_id` is null.
- [ ] Backfill existing rows with `status='draft'` where null.
- [ ] Validate legacy queries keep working after new columns exist.
- [ ] Keep `training_plans.structure` reference-first (`day_offset`, `session_type`, `activity_plan_id`).

## Phase 3: Apply Flow Rewrite

- [ ] Update apply flow to duplicate the source plan into a new `training_plans` row, assigning the user's `profile_id`.
- [ ] Calculate and set `duration_hours` based on associated activity plans during apply.
- [ ] Seed optional `profile_goals` on apply and attach them to the new user plan.
- [ ] Set `primary_goal_id` on the applied user plan when provided.
- [ ] Materialize future `events` from the applied plan structure.

## Phase 4: Lifecycle + Event Semantics

- [ ] Enforce active-plan guard using `training_plans` (`profile_id IS NOT NULL`, status active/paused).
- [ ] On complete/abandon, cancel future scheduled events linked to that user plan.
- [ ] Keep historical events unchanged during lifecycle transitions.
- [ ] Ensure rest days are inferred dynamically from days without planned events (do not create explicit rest day events).
- [ ] Ensure `planned_activity` events use referenced `activity_plan_id` when available.

## Phase 5: Goals + Analytics Alignment

- [ ] Implement profile-goal CRUD scoped to profile ownership.
- [ ] Support optional goal milestone linkage via `milestone_event_id`.
- [ ] Build active-goal views from `profile_goals` + event context (goals are inactive if `target_date` has passed).
- [ ] Keep planned-load and prediction inputs computed from `events` only.
- [ ] Exclude cancelled events from planned-load totals.

## Phase 6: Validation

- [ ] Validate FK integrity and same-profile ownership checks in API paths.
- [ ] Validate one-active-plan constraint for user plans.
- [ ] Validate template apply creates user plan + events + optional goals.
- [ ] Validate goal importance is constrained between 0 and 10.
- [ ] Validate training plan duration is correctly derived from activity plans.

## Explicitly Deferred

- [ ] Dedicated optimization/projection run tables.
- [ ] Cohort/group planning model.
- [ ] Provider OAuth/integration changes.
