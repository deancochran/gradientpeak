# Implementation Plan: Profile Goals + Training Plans (MVP)

## Scope

This plan implements a simplified model with minimal schema churn:

1. Add `profile_goals` as the goal system.
2. Use `training_plans` for both templates and user plans.
3. Keep `events` as the only operational schedule and planned-load source.
4. Keep `activity_plans` as workout-definition source of truth.

## Target Schema (Architecture / Data Contracts)

### 1) Add `profile_goals`

Required columns:

- `id uuid primary key`
- `profile_id uuid not null` FK -> `profiles.id`
- `training_plan_id uuid null` FK -> `training_plans.id`
- `milestone_event_id uuid null` FK -> `events.id`
- `title text not null`
- `goal_type text not null`
- `target_date date null`
- `target_metric text null`
- `target_value numeric null`
- `importance integer not null default 5` check (`importance >= 0 and importance <= 10`)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Required indexes:

- `idx_profile_goals_profile_date` on (`profile_id`, `target_date`)
- `idx_profile_goals_plan` on (`training_plan_id`)
- `idx_profile_goals_milestone_event` on (`milestone_event_id`)

### 2) Extend `training_plans`

Keep existing fields and add minimal lifecycle fields. System templates are identified by `profile_id IS NULL`.

- `primary_goal_id uuid null` FK -> `profile_goals.id`
- `sessions_per_week_target integer null` check (`sessions_per_week_target > 0`)
- `duration_hours numeric null` (derived from associated activity plans)
- `status text not null` check in (`draft`,`active`,`paused`,`completed`,`abandoned`) default `draft`

Indexes and lifecycle integrity:

- `idx_training_plans_profile_status` on (`profile_id`, `status`)
- partial unique for single active/paused user plan: unique (`profile_id`) where `profile_id IS NOT NULL and status in ('active','paused')`

## Data Flow & API Contracts

### Apply / Duplicate Plan

1. Validate no active/paused plan exists for the user.
2. Duplicate the source plan into a new `training_plans` row, setting the user's `profile_id`.
3. Calculate and set `duration_hours` derived from the associated activity plans.
4. Seed optional `profile_goals` from defaults and/or user input.
5. Generate future `events` from plan structure.

**Apply Request (Minimal):**

```json
{
  "template_id": "uuid",
  "start_date": "2026-03-10",
  "goals": [
    {
      "title": "Run half marathon",
      "goal_type": "race",
      "target_date": "2026-06-01",
      "importance": 10
    }
  ]
}
```

**Status Update Request:**

```json
{
  "training_plan_id": "uuid",
  "status": "completed"
}
```

## Migration Strategy (Low Risk)

1. Add `profile_goals` table.
2. Add new nullable columns to `training_plans`.
3. Backfill existing template rows to ensure `profile_id` is null and `status='draft'`.
4. Add checks/indexes and then add partial unique active-plan constraint.
5. Update apply flow to duplicate plans in `training_plans` instead of new plan-instance storage.
6. Keep existing event generation and analytics contracts stable.
