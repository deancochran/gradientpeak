# Profile Goals + Training Plans Minimal Model (MVP)

## Goal

Refactor the MVP to a simpler domain model that uses only two planning records:

1. `profile_goals` for user outcomes.
2. `training_plans` for both templates and user-applied plans.

Keep `events` as the only scheduling source of truth.

## Core Ownership

1. `profile_goals`: user outcomes and milestones.
2. `training_plans`: reusable templates plus user-specific applied plan records.
3. `events`: concrete scheduled rows used for planned-load and prediction calculations.
4. `activity_plans`: workout-definition source of truth referenced by scheduled events.

No new plan-instance table is introduced in this refactor.

## Canonical Model

### A) `profile_goals` Is The Goal System

Each profile can have multiple goals.

Required columns:

1. `id uuid primary key`
2. `profile_id uuid not null` FK -> `profiles.id`
3. `training_plan_id uuid null` FK -> `training_plans.id` (goal created by or attached to a plan)
4. `milestone_event_id uuid null` FK -> `events.id` (optional event anchor)
5. `title text not null`
6. `goal_type text not null`
7. `target_date date null`
8. `target_metric text null`
9. `target_value numeric null`
10. `importance integer not null default 5` (0-10 scale: 0 = don't care, 10 = absolutely want to reach)
11. timestamps

Rules:

1. Goals are profile-owned and never cross profiles.
2. Goals may exist without a plan (`training_plan_id` nullable).
3. Goals may be event-anchored (`milestone_event_id`) but events remain canonical schedule records.
4. Goals have a singular target.
5. Goals can be on the same date.
6. Goals don't support multi-type activity types (e.g., a triathlon goal would be 3 separate goals).
7. Goals don't need a status column; they either exist or not. They are considered inactive if the target date has passed.

### B) `training_plans` Handles Templates And User Plans

Use one table for both system templates and user plans. A plan is considered a system template if `profile_id` is null. Users simply duplicate plans to use them.

Add minimal columns:

1. `primary_goal_id uuid null` FK -> `profile_goals.id`
2. `sessions_per_week_target integer null`
3. `duration_hours numeric null` (derived from the activity plans associated with the training plan)
4. `status text not null` (`draft`, `active`, `paused`, `completed`, `abandoned`)

_Note: Training plans do not need `strategy_type`, `aggressiveness`, or `recovery` columns since the user's profile specifies this information._

`structure` remains reference-first:

1. session intent keeps `day_offset`, `session_type`, `activity_plan_id`
2. no embedded workout JSON in sessions
3. workout details resolve from `activity_plans` at read-time

### C) `events` Remains Operational Truth

No new scheduling table is introduced.

Rules:

1. Applying a user plan materializes future `events` rows.
2. Planned load and prediction inputs are computed from `events` only.
3. Users can modify future events without mutating template records.
4. Historical rows are not rewritten during regeneration/handoff.
5. Rendered workout details may change if referenced `activity_plan` changes.
6. Rest days don't need to be explicit; they are inferred from days without planned activity events.

## Lifecycle Model

### Duplicating / Applying a Plan

1. Select a source plan (often a system template where `profile_id` is null).
2. Duplicate the plan row, assigning the user's `profile_id`.
3. Optionally create/attach `profile_goals` from defaults.
4. Materialize schedule into `events` linked by the new `training_plan_id`.

### Active Plan Guard

1. One active/paused plan per profile.
2. Starting a new plan requires existing active/paused plan to be resolved.
3. On complete/abandon, cancel future scheduled events for the old plan.

### Goal Lifecycle

1. Goals are soft-lifecycle entities based on their `target_date`.
2. Goal updates never rewrite historical events.
3. Goal retirement does not delete historical event records.

## Runtime Rules

1. `events` is the only schedule query surface.
2. `planned_activity` events should reference `activity_plan_id` when available.
3. Rest days are inferred dynamically, not stored as explicit events.
4. `profile_goals` is the only goal table in MVP.
5. No duplicate schedule truth in `profile_goals` or plan metadata.

## Out Of Scope

1. Cohort/group models.
2. Dedicated optimization-run tables.
3. Any new materialized projection or recommendation storage.

## Why This Refactor

1. Keeps schema minimal while enabling goals-first product UX.
2. Uses foreign keys for integrity without adding many tables.
3. Preserves existing event-driven analytics and prediction path.
4. Supports system templates and user customization in one plan table without complex lineage tracking.
