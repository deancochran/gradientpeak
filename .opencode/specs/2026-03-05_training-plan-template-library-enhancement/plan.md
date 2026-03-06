# Implementation Plan: Profile Goals + Training Plans (MVP)

## Scope

This plan implements a simplified model with minimal schema churn:

1. Add `profile_goals` as the goal system.
2. Use `training_plans` for both templates and user plans.
3. Keep `events` as the only operational schedule and planned-load source.
4. Keep `activity_plans` as workout-definition source of truth.

## Target Schema

### 1) Add `profile_goals`

Required columns:

1. `id uuid primary key`
2. `profile_id uuid not null` FK -> `profiles.id`
3. `training_plan_id uuid null` FK -> `training_plans.id`
4. `milestone_event_id uuid null` FK -> `events.id`
5. `title text not null`
6. `goal_type text not null`
7. `target_date date null`
8. `target_metric text null`
9. `target_value numeric null`
10. `priority integer not null default 5`
11. `importance integer not null default 5` check (`importance >= 0 and importance <= 10`)
12. `created_at timestamptz not null default now()`
13. `updated_at timestamptz not null default now()`

Required indexes:

1. `idx_profile_goals_profile_date` on (`profile_id`, `target_date`)
2. `idx_profile_goals_plan` on (`training_plan_id`)
3. `idx_profile_goals_milestone_event` on (`milestone_event_id`)

### 2) Extend `training_plans`

Keep existing template fields and add minimal applied-plan lifecycle fields:

1. `plan_kind text not null` check in (`template`,`user`) default `template`
2. `source_template_id uuid null` FK -> `training_plans.id`
3. `primary_goal_id uuid null` FK -> `profile_goals.id`
4. `sessions_per_week_target integer null` check (`sessions_per_week_target > 0`)
5. `duration_hours numeric null` (derived from associated activity plans)
6. `status text not null` check in (`draft`,`active`,`paused`,`completed`,`abandoned`) default `draft`

Indexes and lifecycle integrity:

1. `idx_training_plans_profile_kind_status` on (`profile_id`, `plan_kind`, `status`)
2. partial unique for single active/paused user plan:
   - unique (`profile_id`) where `plan_kind = 'user' and status in ('active','paused')`

### 3) Keep `events` canonical

No structural redesign of `events` in this phase.

Required runtime semantics:

1. generated scheduled rows link by `training_plan_id`
2. `planned_activity` rows use `activity_plan_id` when available
3. rest days are not explicitly stored; they are inferred from days without planned activity events
4. planned-load/prediction calculations read from `events` only (excluding cancelled rows)

## Data Flow

### Apply Template

1. Validate no active/paused user plan exists.
2. Copy template row into a new `training_plans` row with `plan_kind='user'` and `source_template_id`.
3. Calculate and set `duration_hours` derived from the associated activity plans.
4. Seed optional `profile_goals` from template defaults and/or user input.
5. Generate future `events` from plan structure.

### Ongoing Use

1. Users edit future events directly.
2. Goal progress reads from events + completed activities.

### Plan Resolution

1. On `completed` or `abandoned`, cancel future scheduled events for that plan.
2. Keep past events immutable as schedule rows.
3. Allow new plan apply after resolution.

## Migration Strategy (Low Risk)

1. Add `profile_goals` table.
2. Add new nullable columns to `training_plans` (`plan_kind`, `source_template_id`, `primary_goal_id`, `sessions_per_week_target`, `duration_hours`, `status`).
3. Backfill existing template rows to `plan_kind='template'` and `status='draft'`.
4. Add checks/indexes and then add partial unique active-plan constraint.
5. Update apply flow to create user plan rows in `training_plans` instead of new plan-instance storage.
6. Keep existing event generation and analytics contracts stable.

## API Contract Adjustments

Apply request (minimal):

```json
{
  "template_id": "uuid",
  "start_date": "2026-03-10",
  "goals": [
    {
      "title": "Run half marathon",
      "goal_type": "race",
      "target_date": "2026-06-01",
      "priority": 1,
      "importance": 10
    }
  ]
}
```

Status update request:

```json
{
  "training_plan_id": "uuid",
  "status": "completed"
}
```

## Acceptance Criteria

1. `profile_goals` exists and supports multiple goals per profile.
2. `training_plans` supports template and user-plan rows via `plan_kind`.
3. One active/paused user plan per profile is enforced.
4. Template apply creates a user plan row, optional goals, and future events.
5. Planned load and prediction inputs are computed from `events` only.
6. Future event edits are supported without mutating template rows.
7. Rest days are inferred dynamically.

## Explicitly Deferred

1. New recommendation/projection materialization tables.
2. Cohort or social planning models.
3. Provider/OAuth integrations.
