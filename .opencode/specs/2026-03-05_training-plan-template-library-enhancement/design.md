# Profile Goals + Training Plans Minimal Model (MVP)

## Context & Constraints

- **Goal:** Refactor the MVP to a simpler domain model that uses only two planning records: `profile_goals` for user outcomes and `training_plans` for both templates and user-applied plans. Keep `events` as the only scheduling source of truth.
- **Tech Stack:** Supabase (PostgreSQL), TypeScript, Zod (for schemas in `@repo/core`), tRPC (for API layer).
- **Relevant Files:**
  - `packages/core/schemas/` (for Zod schemas)
  - `packages/trpc/src/routers/` (for API routes)
  - `supabase/migrations/` (for database schema changes)
- **Rules:**
  1. DO NOT introduce a new plan-instance table.
  2. DO NOT modify the structure of the `events` table in this phase.
  3. DO NOT add `strategy_type`, `aggressiveness`, or `recovery` columns to `training_plans` (this lives in the profile).
  4. DO NOT embed workout JSON in sessions; resolve from `activity_plans` at read-time.
  5. DO NOT rewrite historical events during goal updates or plan retirement.

## Core Ownership

1. `profile_goals`: user outcomes and milestones.
2. `training_plans`: reusable templates plus user-specific applied plan records.
3. `events`: concrete scheduled rows used for planned-load and prediction calculations.
4. `activity_plans`: workout-definition source of truth referenced by scheduled events.

## Canonical Model

### A) `profile_goals` Is The Goal System

Each profile can have multiple goals.

- Goals are profile-owned and never cross profiles.
- Goals may exist without a plan (`training_plan_id` nullable).
- Goals may be event-anchored (`milestone_event_id`) but events remain canonical schedule records.
- Goals have a singular target and can be on the same date.
- Goals don't support multi-type activity types (e.g., a triathlon goal would be 3 separate goals).
- Goals don't need a status column; they either exist or not. They are considered inactive if the target date has passed.

### B) `training_plans` Handles Templates And User Plans

Use one table for both system templates and user plans. A plan is considered a system template if `profile_id` is null. Users simply duplicate plans to use them.

- `structure` remains reference-first: session intent keeps `day_offset`, `session_type`, `activity_plan_id`.

### C) `events` Remains Operational Truth

No new scheduling table is introduced.

- Applying a user plan materializes future `events` rows.
- Planned load and prediction inputs are computed from `events` only.
- Users can modify future events without mutating template records.
- Rest days are inferred dynamically from days without planned activity events.

## Lifecycle Model

- **Duplicating / Applying a Plan:** Select source plan -> Duplicate row with user's `profile_id` -> Optionally create `profile_goals` -> Materialize schedule into `events`.
- **Active Plan Guard:** One active/paused plan per profile. Starting a new plan requires resolving the existing one. On complete/abandon, cancel future scheduled events.
- **Goal Lifecycle:** Soft-lifecycle based on `target_date`. Updates/retirement never rewrite historical events.

## Out Of Scope

1. Cohort/group models.
2. Dedicated optimization-run tables.
3. Any new materialized projection or recommendation storage.
4. Provider/OAuth integrations.
