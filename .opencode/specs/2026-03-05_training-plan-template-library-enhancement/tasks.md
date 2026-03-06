# Tasks: Profile Goals + Training Plans (MVP)

## Phase 1: Schema Refactor

- [ ] Create `profile_goals` table with FK links to `profiles`, optional `training_plans`, optional `events` (`milestone_event_id`).
- [ ] Add `training_plans.plan_kind` (`template` | `user`) with default `template`.
- [ ] Add `training_plans.source_template_id` self-FK for template lineage.
- [ ] Add `training_plans.primary_goal_id` FK to `profile_goals`.
- [ ] Add `training_plans` strategy fields: `strategy_style`, `aggressiveness`, `recovery_bias`, `sessions_per_week_target`.
- [ ] Add `training_plans.status` (`draft`, `active`, `paused`, `completed`, `abandoned`).
- [ ] Add check constraints for numeric strategy bounds and enum-style text constraints.
- [ ] Add indexes for `profile_goals` and `training_plans` query paths.
- [ ] Add partial unique constraint enforcing one active/paused user plan per profile.

## Phase 2: Backfill + Compatibility

- [ ] Backfill existing template rows in `training_plans` to `plan_kind='template'`.
- [ ] Backfill existing rows with `status='draft'` where null.
- [ ] Validate legacy queries keep working after new columns exist.
- [ ] Keep `training_plans.structure` reference-first (`day_offset`, `session_type`, `activity_plan_id`).

## Phase 3: Apply Flow Rewrite

- [ ] Update apply flow to create a new `training_plans` row with `plan_kind='user'`.
- [ ] Set `source_template_id` on applied user plans.
- [ ] Accept optional strategy override payload at apply-time.
- [ ] Seed optional `profile_goals` on apply and attach them to the new user plan.
- [ ] Set `primary_goal_id` on the applied user plan when provided.
- [ ] Materialize future `events` from the applied plan structure.

## Phase 4: Lifecycle + Event Semantics

- [ ] Enforce active-plan guard using `training_plans` (`plan_kind='user'`, status active/paused).
- [ ] On complete/abandon, cancel future scheduled events linked to that user plan.
- [ ] Keep historical events unchanged during lifecycle transitions.
- [ ] Ensure `rest_day` events have null `activity_plan_id`.
- [ ] Ensure `planned_activity` events use referenced `activity_plan_id` when available.

## Phase 5: Goals + Analytics Alignment

- [ ] Implement profile-goal CRUD scoped to profile ownership.
- [ ] Support optional goal milestone linkage via `milestone_event_id`.
- [ ] Build active-goal views from `profile_goals` + event context.
- [ ] Keep planned-load and prediction inputs computed from `events` only.
- [ ] Exclude cancelled events from planned-load totals.

## Phase 6: Validation

- [ ] Validate FK integrity and same-profile ownership checks in API paths.
- [ ] Validate one-active-plan constraint for user plans.
- [ ] Validate template apply creates user plan + events + optional goals.
- [ ] Validate goal lifecycle transitions (`active`, `achieved`, `archived`, `abandoned`).
- [ ] Validate strategy updates affect future scheduling behavior only.

## Explicitly Deferred

- [ ] Dedicated strategy table.
- [ ] Dedicated optimization/projection run tables.
- [ ] Cohort/group planning model.
- [ ] Provider OAuth/integration changes.
