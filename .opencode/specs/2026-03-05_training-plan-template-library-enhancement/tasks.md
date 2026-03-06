# Tasks: Event-Driven Training Plan Execution (MVP)

## Phase 1: Template + Schema Hardening

- [ ] Enforce schedulable session contract in `training_plans.structure` (`session_type`, date anchor, title).
- [ ] Add/confirm `training_plans.plan_duration_days` (required, `> 0`).
- [ ] Add optional `training_plans.goal_category` for discovery.
- [ ] Extend `user_training_plans` with `personalization`, `template_version`, optional `projection_snapshot`.
- [ ] Keep `snapshot_structure` backward-compatible and required for apply replay.

## Phase 2: Single-Plan Lifecycle and Handoff

- [ ] Keep single-active-plan guard in `trainingPlans.applyTemplate`.
- [ ] Keep single-active-plan guard in `trainingPlans.updateActivePlanStatus`.
- [ ] Add explicit handoff policy when completing/abandoning active plan.
- [ ] Cancel future scheduled events for the old active plan during handoff.

## Phase 3: Apply and Generate Scheduled Events

- [ ] Update session derivation to emit both `planned_activity` and `rest_day` intents.
- [ ] Enforce `planned_activity` linkage to `activity_plan_id` when template reference exists and is accessible.
- [ ] Enforce `rest_day` generation with null `activity_plan_id`.
- [ ] Persist generated events with shared `schedule_batch_id` per apply/regenerate run.
- [ ] Add/confirm DB constraints for event-type/linkage consistency.

## Phase 4: Projection-Aware Allocation

- [ ] Build projection input from template structure + creation snapshots + user personalization.
- [ ] Use projection weekly targets and safety caps to allocate session load.
- [ ] Respect availability constraints, hard rest days, and max sessions/day.
- [ ] Add deterministic session-to-`activity_plan` matching policy.
- [ ] Persist projection diagnostics in `user_training_plans.projection_snapshot`.

## Phase 5: Planned-Load Analytics Alignment

- [ ] Move planned-load queries to `events`-derived aggregation.
- [ ] Aggregate planned load from events linked to the active `user_training_plan`.
- [ ] Exclude cancelled events from planned-load totals.
- [ ] Keep planned-vs-completed comparisons stable under skipped/deleted sessions.

## Phase 6: Validation and Safety

- [ ] Validate strict single-active-plan enforcement.
- [ ] Validate active-plan handoff flow before allowing new plan apply.
- [ ] Validate deterministic regeneration (future-only replacement by `schedule_batch_id`).
- [ ] Validate rest-day insertion in taper/recovery and blocked-day windows.
- [ ] Validate impossible-schedule guardrails (availability too low for target projection).
- [ ] Validate no drift between projection targets and generated event totals.

## Explicitly Deferred

- [ ] Cohorts and cohort lifecycle.
- [ ] Group follow/subscription/publication models.
- [ ] Google OAuth/provider calendar integration.
- [ ] New event materialization/projection tables.
- [ ] Advanced permission hierarchy and ACL expansion.
