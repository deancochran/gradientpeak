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

Schema scope rule for this MVP:

1. Do not add catalog/business metadata that is not required for scheduling, projection, lifecycle, or user outcomes.
2. Template records may keep only scheduling-relevant defaults.
3. User-instance records hold user-specific knobs and resolved scheduling state.

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
4. `scheduling_mode`: `default_template` | `projection_tuned`

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

## Default + Custom Interaction Model (MVP)

### Two-Lane Scheduling Model

Lane A: Default for everyone (instant, low compute).

Lane B: Optional optimize flow (deterministic projection-tuned scheduler).

### Lane A: Default Apply Path (Template-Faithful)

1. User selects a template and start date.
2. System applies sessions exactly as authored when valid references already exist.
3. Predetermined `activity_plan_id` references are scheduled directly (no remapping by default).
4. Generated events use one `schedule_batch_id` and link to `user_training_plan_id`.
5. Planned load is computed from generated events (excluding cancelled rows).

### Lane B: Projection-Tuned Optimize Path

At apply time, users may opt into projection tuning.

Required apply-time controls:

1. `scheduling_mode`: `default_template` | `projection_tuned`
2. `target_source`: projection target (default in projection mode) or bounded manual weekly target
3. constraints: availability, hard rest days, max sessions/day
4. `aggressiveness`: `conservative` | `balanced` | `performance`

Behavior when projection mode is enabled:

1. Preserve required session/rest intent from template structure.
2. Reallocate day placement and session load against projection targets and safety caps.
3. Match each session to best-fit `activity_plan` by estimated load proximity within allowed scope.
4. Persist diagnostics and target-vs-scheduled deltas to `projection_snapshot`.

### Deterministic Optimization Model (MVP)

Use a deterministic scheduler so identical inputs produce identical outputs.

Hard constraints:

1. Keep required workout/rest sequence ordering.
2. Respect hard rest days, availability, and max sessions/day.
3. Enforce safety caps (weekly/ramp constraints).
4. Keep all scheduling inside plan horizon to target date.

Optimization objective (soft constraints):

1. Minimize weekly target-vs-scheduled load error.
2. Minimize cumulative load drift across the full horizon.
3. Minimize session-intent distortion and day drift.
4. Minimize unscheduled required sessions.

Recommended solver style for MVP:

1. Greedy seed using hardest-to-place sessions first.
2. Deterministic beam-style search over candidate placements/matches.
3. Local repair pass to reduce load gap without violating hard constraints.

### Post-Apply Customization (Future-Only)

1. Plan-level: `rebalance_future_weeks` regenerates future events only, with new `schedule_batch_id`.
2. Week-level: adjust weekly target load (for future dates) and rematch session events for that week.
3. Event-level: user may manually swap a single future `activity_plan`.
4. Users can choose rewrite scope when optimizing: `selected_week`, `future_horizon`, or `full_remaining_plan`.
5. Manual edits are preserved by default during regeneration unless user explicitly selects overwrite behavior.

### Projection Feasibility and Guardrails

1. If constraints make target load infeasible, scheduler degrades safely (never violates hard constraints).
2. Persist infeasibility diagnostics and unmet target gap in `projection_snapshot`.
3. UX should expose planned target, scheduled total, and remaining gap for explainability.

## Runtime Rules (Strict)

1. `events` is the only calendar query surface for planned schedule views.
2. Generated `planned_activity` events must reference `user_training_plan_id`.
3. Generated `rest_day` events must not set `activity_plan_id`.
4. Plan regeneration is future-only and batched by `schedule_batch_id`.
5. Users may cancel/remove generated events; adherence is optional.
6. Planned load aggregation excludes cancelled events and uses active-plan schedule context.
7. Imported external events remain read-only and do not mutate plan templates.
8. Starting a new plan is blocked until active-plan future events are resolved by lifecycle transition.
9. Default apply behavior is template-faithful (`default_template`) unless user enables projection tuning.
10. Projection-tuned optimization is deterministic and explainable.
11. Users can explicitly rewrite as much future schedule as they want via rewrite scope controls.
12. Future regeneration preserves manual edits by default unless explicit overwrite is requested.

## Out of Scope (Explicit)

1. Cohorts, cohort lifecycle, and cohort membership rules.
2. Group follow/subscription/publication models.
3. Google OAuth/provider integration.
4. New materialized projection tables.
5. Advanced ACL/RLS redesign.
6. Non-scheduling catalog business fields (pricing, marketplace badges, merchandising metadata).

## Why This Is Better For MVP

1. Preserves modularity: templates define intent, events define reality.
2. Aligns analytics with behavior: planned load comes from what is actually scheduled.
3. Avoids ambiguous scheduling and keeps UX simple with one active plan.
4. Keeps future path open: cohorts can later attach to `user_training_plans` without rewriting `events`.
