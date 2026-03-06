# Training Plan Execution + Projection Alignment (MVP)

## Goal

Deliver a plan experience where users can run one active training plan at a time, instantly get scheduled events, and track planned load from real calendar events (not abstract plan totals).

MVP direction:

1. Remove cohorts from this specification.
2. Keep `events` as the only schedule source of truth.
3. Treat `training_plans` as versioned template blueprints with real session content.
4. Generate `planned_activity` and `rest_day` events when a user starts a plan.
5. Compute planned training load from scheduled `events` linked to the active plan.

## Domain Ownership (Single Source of Truth)

1. `training_plans`: reusable template blueprint content and defaults.
2. `user_training_plans`: user-specific plan enrollment/instance and personalization.
3. `activity_plans`: reusable workout definitions referenced by plan sessions.
4. `events`: concrete scheduled execution instances and planned-load query surface.

No cohort/group subscription model is included in this spec.

## Required MVP Model Changes

### A) Training Plan Content Must Be Schedulable

`training_plans.structure` must contain explicit session intents that can become events.

Required per-session shape (inside structure):

1. `session_type`: `planned_activity` | `rest_day`
2. `offset_days` (or `day_offset`) or explicit `scheduled_date`
3. `title`
4. optional `activity_plan_id` (required when `session_type=planned_activity`)
5. optional scheduling hints (`preferred_time`, `duration_min`, `load_target_tss`)

Constraint rule:

1. `rest_day` sessions never reference `activity_plan_id`.
2. `planned_activity` sessions should reference an `activity_plan_id` when available.

### B) User Enrollment Holds Personalization Inputs

Extend `user_training_plans` with minimal user-level controls:

1. `personalization` JSONB (availability, max sessions/day, hard rest days, discipline bias)
2. `template_version` text (or immutable version marker)
3. optional `projection_snapshot` JSONB (diagnostics and solved weekly targets used at apply time)

Keep existing `snapshot_structure` for reproducibility.

### C) Events Become Planned Truth

When a plan is started:

1. Create one `user_training_plans` row.
2. Generate event rows immediately from template sessions and projection-aware scheduling.
3. Write events with one `schedule_batch_id`.
4. Set `event_type` to `planned_activity` or `rest_day` explicitly.
5. Always populate `user_training_plan_id` on generated rows.

Planned load analytics must sum from scheduled events for the active plan, not from template totals.

### D) Single Active Plan Lifecycle (Keep It Simple)

Keep one active/paused `user_training_plans` row per user.

Runtime contract:

1. Applying a new template is blocked if an active/paused plan exists.
2. User must resolve current plan first (`completed` or `abandoned`).
3. Resolution must also address future scheduled events linked to that plan.

Required resolution behavior:

1. On `completed`/`abandoned`, all future scheduled events for that `user_training_plan_id` are set to `cancelled`.
2. Historical and completed events remain unchanged.
3. After resolution, user can start a new plan.

### E) Projection-Driven Scheduling Loop

Use existing projection engine outputs to drive schedule realism.

At apply (or regenerate-future) time:

1. Build projection input from template structure + creation config + user personalization.
2. Solve weekly targets and safety caps.
3. Allocate sessions across available days.
4. Insert required `rest_day` events for recovery and blocked days.
5. Select best-fit `activity_plan_id` templates for each planned session.
6. Persist diagnostics to `projection_snapshot`/metadata for explainability.

## Deterministic Scheduling Policy (MVP)

1. Week target: use projection weekly target from the active periodized block.
2. Slot count: clamp by availability, max sessions/week, and min rest-day constraints.
3. Recovery priority: recovery/taper windows reserve rest or low-load sessions first.
4. Load allocation: distribute weekly target by fixed phase weights (base/build/peak/taper/recovery).
5. Session matching: map target load to the nearest available `activity_plan` in allowed library scope.
6. Overlap policy: if conflicts exist, keep deterministic ordering and mark lower-priority events as suggested-to-move, not auto-deleted.

## Runtime Rules (Strict)

1. `events` is the only calendar query surface for planned schedule views.
2. Generated `planned_activity` events must reference `user_training_plan_id`.
3. Generated `rest_day` events must not set `activity_plan_id`.
4. Plan regeneration is future-only and batched by `schedule_batch_id`.
5. Users may cancel/remove generated events; adherence is optional.
6. Planned load aggregation excludes cancelled events and uses active-plan schedule context.
7. Imported external events remain read-only and do not mutate plan templates.
8. Starting a new plan is blocked until active-plan future events are resolved by lifecycle transition.

## Out of Scope (Explicit)

1. Cohorts, cohort lifecycle, and cohort membership rules.
2. Group follow/subscription/publication models.
3. Google OAuth/provider integration.
4. New materialized projection tables.
5. Advanced ACL/RLS redesign.

## Why This Is Better For MVP

1. Preserves modularity: templates define intent, events define reality.
2. Aligns analytics with behavior: planned load comes from what is actually scheduled.
3. Avoids ambiguous scheduling and keeps UX simple with one active plan.
4. Keeps future path open: cohorts can later attach to `user_training_plans` without rewriting `events`.
