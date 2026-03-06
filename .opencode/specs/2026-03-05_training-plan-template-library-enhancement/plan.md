# Implementation Plan: Event-Driven Training Plan Execution (MVP)

## Scope

This plan covers the minimum schema and backend behavior needed to support:

1. Rich training-plan templates with schedulable session content.
2. Single active plan lifecycle with explicit plan handoff.
3. Automatic generation of `planned_activity` and `rest_day` events at plan start.
4. Projection-aware scheduling using current core projection logic.
5. Planned-load analytics derived from `events` only.

MVP constraints:

1. Keep `events` as canonical calendar/feed surface.
2. No cohort model in this phase.
3. No new projection materialization tables.
4. No Google OAuth/provider work in this phase.

## Implementation Changes Required

### Existing tables (required changes)

1. `training_plans`
   - keep template structure contract
   - require explicit schedulable sessions in `structure`
   - add/confirm `plan_duration_days` (`> 0`)
   - add optional `goal_category`
2. `user_training_plans`
   - add `personalization` JSONB
   - add `template_version` text
   - add optional `projection_snapshot` JSONB
   - keep `snapshot_structure` for applied-plan reproducibility
3. `events`
   - keep canonical linkage through `user_training_plan_id`
   - enforce event semantics:
     - `planned_activity` => `activity_plan_id` set when available
     - `rest_day` => `activity_plan_id` null
   - keep `schedule_batch_id` for generation lineage

### Runtime/API changes (required)

1. Keep and enforce single-active-plan rule in apply/status endpoints.
2. Add explicit active-plan handoff action when completing/abandoning a plan.
3. Ensure future scheduled events are cancelled during handoff before new plan apply.
4. Regenerate only future events for the active user plan; keep historical events untouched.

## Phase 1: Template + Schema Hardening

1. Update template structure contract to require `session_type` and date anchors.
2. Add/confirm `training_plans.plan_duration_days` and discovery metadata.
3. Extend `user_training_plans` with personalization/version/snapshot fields.
4. Add DB checks/indexes for `events` semantic integrity and schedule-batch lookups.

## Phase 2: Apply Flow and Event Generation

1. Keep apply-template guard: block start when user has active/paused plan.
2. Build derived session intents from `snapshot_structure` plus user personalization.
3. Emit mixed event rows (`planned_activity`, `rest_day`) with shared `schedule_batch_id`.
4. Keep activity plan access checks for referenced `activity_plan_id` values.

## Phase 3: Projection-Aware Scheduling

1. Build projection input from applied structure + creation snapshots + personalization.
2. Use solved weekly targets and safety constraints to adjust session allocation.
3. Apply deterministic allocation policy for available days and required rest days.
4. Persist scheduling diagnostics (`projection_snapshot`) for explainability/debugging.

## Phase 4: Analytics and Query Model Alignment

1. Move planned-load aggregation to `events`-derived calculations.
2. Aggregate planned load from events linked to the active user training plan.
3. Exclude cancelled events from planned-load totals.
4. Keep completed-load comparison against activity completions.

## Phase 5: Integrity and Validation

1. Validate single-active-plan enforcement end-to-end.
2. Validate active-plan handoff behavior: complete/abandon transitions cancel future scheduled events.
3. Validate event semantics (`planned_activity` vs `rest_day`) and linkage requirements.
4. Validate deterministic regeneration behavior (future-only, batch lineage).
5. Validate projection feasibility guardrails for impossible schedules.
6. Validate planned-vs-completed metrics under skipped/cancelled sessions.

## Explicitly Deferred

1. Cohorts and cohort lifecycle.
2. Group publication/subscription/follow models.
3. Google provider integration and OAuth flow.
4. New event materialization/projection tables.
5. Complex ACL/RLS model expansion.
