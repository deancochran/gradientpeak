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
   - keep only scheduling-relevant defaults (no pricing/merchandising metadata)
2. `user_training_plans`
   - add `personalization` JSONB
   - add `template_version` text
   - add optional `projection_snapshot` JSONB
   - add `scheduling_mode` (`default_template` | `projection_tuned`)
   - keep `snapshot_structure` for applied-plan reproducibility
3. `events`
   - keep canonical linkage through `user_training_plan_id`
   - enforce event semantics:
     - `planned_activity` => `activity_plan_id` set when available
     - `rest_day` => `activity_plan_id` null
   - keep `schedule_batch_id` for generation lineage

## Detailed Schema Updates (Desired MVP Schema)

This section defines the concrete schema target for implementation.

### 1) `training_plans` (template blueprint contract)

Required columns and constraints:

1. `id uuid primary key` (existing)
2. `name text not null` (existing)
3. `structure jsonb not null` (existing; contract hardened)
4. `plan_duration_days integer not null check (plan_duration_days > 0)` (add or enforce)
5. `version text not null` (existing or add immutable version marker)
6. `created_at timestamptz not null default now()` (existing)
7. `updated_at timestamptz not null default now()` (existing)

`structure` required session contract (validation-level, optionally db-level via check/function):

1. `session_type`: `planned_activity` | `rest_day` (required)
2. date anchor: `offset_days` (or `day_offset`) or explicit `scheduled_date` (required)
3. `title` (required)
4. `activity_plan_id` optional, but required when `session_type=planned_activity` and omitted only when selector logic is explicitly supported
5. scheduling hints optional: `preferred_time`, `duration_min`, `load_target_tss`

Desired indexes:

1. `idx_training_plans_version` on (`version`)

### 2) `user_training_plans` (applied plan instance)

Required columns and constraints:

1. `id uuid primary key` (existing)
2. `user_id uuid not null` (existing)
3. `training_plan_id uuid not null` (existing)
4. `status text not null` with allowed: `active`, `paused`, `completed`, `abandoned` (existing/enforce)
5. `snapshot_structure jsonb not null` (existing; remains required)
6. `personalization jsonb not null default '{}'::jsonb` (add)
7. `template_version text not null` (add)
8. `projection_snapshot jsonb null` (add)
9. `scheduling_mode text not null check (scheduling_mode in ('default_template','projection_tuned'))` (add)
10. `started_at timestamptz not null` (existing)
11. `ended_at timestamptz null` (existing)
12. `created_at timestamptz not null default now()` (existing)
13. `updated_at timestamptz not null default now()` (existing)

Behavioral integrity constraints:

1. one active/paused plan per user via partial unique index:
   - unique (`user_id`) where `status in ('active','paused')`
2. optional lifecycle check:
   - `ended_at` required when status in (`completed`,`abandoned`)

Desired indexes:

1. `idx_user_training_plans_user_status` on (`user_id`, `status`)
2. `idx_user_training_plans_training_plan_id` on (`training_plan_id`)
3. `idx_user_training_plans_started_at` on (`started_at`)
4. `idx_user_training_plans_user_mode_status` on (`user_id`, `scheduling_mode`, `status`)

`personalization` desired shape (json schema-level contract):

1. `availability`: per-day windows or trainable day booleans
2. `max_sessions_per_day`: integer >= 1
3. `hard_rest_days`: array of weekday ints or explicit dates
4. `discipline_bias`: map of discipline -> weight

`projection_snapshot` desired shape:

1. input summary (resolved constraints and mode)
2. solved weekly targets
3. per-week scheduled totals
4. target-vs-scheduled gap diagnostics
5. infeasibility flags/reasons

### 2b) Deterministic optimization contract (projection lane)

Required optimize controls (API-level, persisted in snapshot/metadata):

1. `rewrite_scope`: `selected_week` | `future_horizon` | `full_remaining_plan`
2. `target_bias`: `under` | `exact` | `over`
3. `aggressiveness`: `conservative` | `balanced` | `performance`
4. optional bounded weekly target override

Deterministic solver requirements:

1. hard constraints: sequence order, rest-day rules, availability, max sessions/day, safety caps
2. objective: minimize weekly/cumulative load error and session-intent drift
3. deterministic tie-breaks so identical inputs return identical schedules
4. phased solver flow: greedy seed -> bounded search -> local repair

### 3) `events` (planned schedule source of truth)

Required columns and constraints:

1. `id uuid primary key` (existing)
2. `user_id uuid not null` (existing)
3. `event_type event_type_enum not null` including `planned_activity`, `rest_day` (existing enum)
4. `status text not null` including at least `scheduled`, `completed`, `cancelled` (existing/enforce)
5. `scheduled_start timestamptz not null` / `scheduled_date date` depending existing model (existing)
6. `activity_plan_id uuid null` (existing)
7. `training_plan_id uuid null` (existing linkage)
8. `user_training_plan_id uuid null` (required for generated plan events)
9. `schedule_batch_id uuid null` (required for generated runs)
10. `created_at timestamptz not null default now()` (existing)
11. `updated_at timestamptz not null default now()` (existing)

Event semantic checks (db constraints):

1. if `event_type='rest_day'` then `activity_plan_id is null`
2. if `event_type='planned_activity'` then `user_training_plan_id is not null`
3. if generated by plan apply/regenerate then `schedule_batch_id is not null`
4. planned-load aggregation excludes `status='cancelled'`

Desired indexes:

1. `idx_events_user_training_plan` on (`user_training_plan_id`)
2. `idx_events_user_training_plan_start` on (`user_training_plan_id`, `scheduled_start`)
3. `idx_events_schedule_batch_id` on (`schedule_batch_id`)
4. `idx_events_user_status_start` on (`user_id`, `status`, `scheduled_start`)
5. partial index for active planned load queries:
   - on (`user_training_plan_id`, `scheduled_start`) where `status <> 'cancelled'`

### 4) Compatibility + Migration Strategy

1. Add new nullable columns first (`personalization`, `template_version`, `projection_snapshot`, `scheduling_mode`) and backfill.
2. Backfill `scheduling_mode` for existing rows to `default_template`.
3. Backfill `template_version` from template metadata/version source before making not null.
4. Backfill `personalization` to `'{}'::jsonb` before making not null.
5. Add constraints in non-breaking order: checks -> indexes -> unique partial index.
6. Validate existing `events` rows before enabling strict `rest_day`/`planned_activity` checks.
7. Keep `snapshot_structure` backward-compatible to replay old plans.
8. Roll out API writes to new fields before enforcing hard db constraints.

### Runtime/API changes (required)

1. Keep and enforce single-active-plan rule in apply/status endpoints.
2. Add explicit active-plan handoff action when completing/abandoning a plan.
3. Ensure future scheduled events are cancelled during handoff before new plan apply.
4. Regenerate only future events for the active user plan; keep historical events untouched.
5. Add apply-time scheduling mode contract: template-faithful default with optional projection tuning.
6. Preserve manual future event edits during regeneration by default; support explicit overwrite option.
7. Add rewrite-scope controls so optimization can rewrite selected week, future horizon, or full remaining plan.

## Phase 1: Template + Schema Hardening

1. Update template structure contract to require `session_type` and date anchors.
2. Add/confirm `training_plans.plan_duration_days` and remove non-scheduling metadata from MVP scope.
3. Extend `user_training_plans` with personalization/version/snapshot fields.
4. Add DB checks/indexes for `events` semantic integrity and schedule-batch lookups.

## Phase 2: Apply Flow and Event Generation

1. Keep apply-template guard: block start when user has active/paused plan.
2. Build derived session intents from `snapshot_structure` plus user personalization and scheduling mode.
3. Implement default template-faithful path (`default_template`) that schedules predetermined `activity_plan_id` sessions as-authored.
4. Emit mixed event rows (`planned_activity`, `rest_day`) with shared `schedule_batch_id`.
5. Keep activity plan access checks for referenced `activity_plan_id` values.

## Phase 3: Projection-Aware Scheduling

1. Build projection input from applied structure + creation snapshots + personalization.
2. Implement optional projection-tuned path (`projection_tuned`) with bounded target-source controls.
3. Use solved weekly targets and safety constraints to adjust session allocation.
4. Apply deterministic allocation policy for available days and required rest days.
5. Add best-fit session-to-`activity_plan` matching by estimated load proximity.
6. Persist scheduling diagnostics (`projection_snapshot`) and target-vs-scheduled deltas for explainability.
7. Implement deterministic solver phases: greedy seed, bounded search, local repair.

## Phase 4: Post-Apply Customization and Regeneration

1. Add plan-level `rebalance_future_weeks` flow (future-only, new `schedule_batch_id`).
2. Add week-level target adjustment for future dates with deterministic rematch behavior.
3. Add event-level manual swap of future `activity_plan` references.
4. Add rewrite-scope controls so users can rewrite as much future schedule as desired.
5. Ensure regeneration preserves manual edits by default unless explicit overwrite is requested.
6. Keep historical events immutable in all rebalance/regenerate flows.

## Phase 5: Analytics and Query Model Alignment

1. Move planned-load aggregation to `events`-derived calculations.
2. Aggregate planned load from events linked to the active user training plan.
3. Exclude cancelled events from planned-load totals.
4. Keep completed-load comparison against activity completions.

## Phase 6: Integrity and Validation

1. Validate single-active-plan enforcement end-to-end.
2. Validate active-plan handoff behavior: complete/abandon transitions cancel future scheduled events.
3. Validate event semantics (`planned_activity` vs `rest_day`) and linkage requirements.
4. Validate deterministic regeneration behavior (future-only, batch lineage).
5. Validate projection feasibility guardrails for impossible schedules.
6. Validate planned-vs-completed metrics under skipped/cancelled sessions.
7. Validate template-faithful default behavior when projection mode is disabled.
8. Validate projection target gap reporting (target vs scheduled) for constrained schedules.
9. Validate deterministic reproducibility (same inputs => same outputs).
10. Validate rewrite-scope behavior (`selected_week`, `future_horizon`, `full_remaining_plan`).

## Explicitly Deferred

1. Cohorts and cohort lifecycle.
2. Group publication/subscription/follow models.
3. Google provider integration and OAuth flow.
4. New event materialization/projection tables.
5. Complex ACL/RLS model expansion.
6. Pricing and other non-scheduling catalog metadata.
