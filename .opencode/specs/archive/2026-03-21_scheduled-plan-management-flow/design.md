# Design: Scheduled Training Plan Management Flow

## 1. Objective

Make scheduled training plans manageable after apply, especially when the source plan is public and read-only.

Primary outcomes:

- users can clearly distinguish between editable templates and scheduled plan executions,
- users can manage an applied public plan even when they do not own the source template,
- users can remove, detach, or bulk-manage scheduled sessions from one applied plan without editing events one-by-one,
- the MVP uses the existing `events` table and `schedule_batch_id` lineage instead of introducing a new persistence model,
- the product leaves a clean path for a later first-class `applied_training_plans` model if needed.

## 2. Problem Statement

Today the product mixes three concepts that users experience as separate:

1. a source template,
2. an owned editable plan,
3. a scheduled plan currently on the calendar.

The backend treats `applyTemplate` as event materialization only. It inserts `events`, reuses the source `training_plans.id` as `events.training_plan_id`, and returns that source id as the `applied_plan_id`. This means:

- a public template can appear as the user's active plan,
- `Manage Plans` does not show it because that screen only lists owned templates,
- users have no first-class place to manage the resulting scheduled sessions as one plan execution,
- recurring-event series tooling does not help because applied sessions are not linked by `series_id`.

The result is a valid backend state with weak product ownership and poor schedule-management affordances.

## 3. Core Product Decision

### A. Separate template management from scheduled-plan management

The app must stop treating `Manage Plans` as synonymous with `My editable templates`.

For MVP, the product should expose two distinct management surfaces:

- `My Templates`: owned editable training plans,
- `Scheduled Plans`: grouped scheduled sessions generated from a training plan apply flow.

### B. Scheduled plans are event groups in MVP

For the smallest safe implementation, a scheduled plan is not a new database row. It is a derived grouping over `events` using:

- `training_plan_id` for source-plan identity,
- `schedule_batch_id` for apply-instance lineage,
- event status/date windows for active/in-progress summaries.

This keeps the data model additive and low risk while making applied public plans manageable.

### C. Public-plan apply remains distinct from duplicate

- `Duplicate` means create an owned editable private training plan.
- `Schedule Sessions` means create a scheduled plan execution from a source template.

Both actions stay available, but post-apply success should route to a scheduled-plan management surface, not back to a template detail screen.

## 4. Scope

### In scope

- add a scheduled-plan management information architecture,
- add a derived scheduled-plan list/detail model sourced from `events`,
- support bulk operations on scheduled sessions from one applied plan,
- surface lifecycle actions for active scheduled plans,
- clarify Plan-tab CTA language and routing,
- use existing `trainingPlans.updateActivePlanStatus` where possible,
- add minimal new tRPC queries/mutations needed to support the UI.

### Out of scope

- adding a new `applied_training_plans` table in this MVP,
- redesigning training-plan creation/editing,
- changing plan generation heuristics,
- changing recurrence architecture,
- web parity beyond contract-safe backend changes.

## 5. MVP User Model

### A. Template

A template is a `training_plans` record. It can be:

- owned and editable,
- public and read-only,
- system and read-only.

### B. Scheduled plan

A scheduled plan is a user-facing grouping of calendar sessions that all came from one plan-apply action.

For MVP, its effective identity is:

- `source_training_plan_id`,
- `schedule_batch_id`,
- `profile_id`.

The UI may also show aggregate derived fields:

- source plan name,
- source ownership state (`owned`, `public`, `system`),
- next session date,
- started/in-progress status,
- upcoming/completed/removed counts.

### C. Detached event

A detached event is a formerly plan-sourced scheduled event that the user chooses to keep on the calendar while removing it from plan-group operations.

In MVP, detaching an event means clearing:

- `training_plan_id`, and
- `schedule_batch_id`.

This preserves the event while removing it from scheduled-plan bulk actions.

## 6. Information Architecture

### A. Plan tab

Replace the single ambiguous `Manage Plans` CTA with two actions:

- `Manage Scheduled Plan` -> opens scheduled-plan list or active scheduled-plan detail,
- `Edit My Templates` -> opens the existing owned-template list.

The `Current Plan` card should represent a scheduled-plan execution, not just a template link.

### B. Training plan detail

For non-owned plans:

- keep `Make Editable Copy`,
- keep `Schedule Sessions`,
- after successful apply, offer `Open Scheduled Plan` and route to the scheduled-plan detail screen.

For owned plans:

- `Edit Plan` still opens composer,
- `Schedule Sessions` still creates a scheduled-plan execution.

### C. Scheduled plan list screen

This screen shows grouped scheduled plans for the current user, sorted by next upcoming session. Each row includes:

- source plan name,
- state: `Scheduled`, `In Progress`, or `Completed`/`Ended` if no future items remain,
- next session date,
- upcoming session count,
- optional source badge: `My Template`, `Public Plan`, `System Plan`.

### D. Scheduled plan detail screen

This is the new management surface for one scheduled plan execution. It should show:

- source plan summary,
- whether the source is editable or read-only,
- grouped sessions with selection controls,
- bulk actions,
- lifecycle actions.

## 7. Bulk Operations

### A. Required MVP actions

The scheduled-plan detail screen must support:

1. `Remove Future Sessions`
   - remove all future events in this scheduled plan execution.
2. `Select Sessions`
   - multi-select events from this scheduled plan execution.
3. `Remove Selected`
   - delete selected events.
4. `Detach Selected`
   - clear plan linkage so selected events remain on the calendar but are no longer managed by this scheduled plan.
5. `Open Source Template`
   - navigate to the source training plan detail.
6. `Make Editable Copy`
   - available when the source is not owned.

### B. Nice-to-have but not required for smallest safe implementation

- reschedule selected sessions by date offset,
- bulk move to another week,
- swap linked activity plans across selected sessions.

These should be deferred unless they fall out naturally from the selection architecture.

## 8. Lifecycle Behavior

### A. Active-plan rules

Current active-plan concurrency rules should remain intact for MVP:

- one plan-backed future schedule at a time,
- applying another plan still requires ending the current one first.

### B. Ending a scheduled plan

Use existing `trainingPlans.updateActivePlanStatus` for `completed` and `abandoned` actions where the target scheduled plan is the current active plan. This removes future events for that `training_plan_id`.

Because current backend behavior operates at `training_plan_id` granularity rather than `schedule_batch_id`, the MVP must keep the one-active-plan invariant. That constraint makes the implementation safe even though the mutation is coarse.

### C. Removing selected sessions

Selected-session actions must operate only within the chosen scheduled-plan grouping. The UI must prevent accidental bulk deletion outside the active grouping.

## 9. API And Data Direction

### A. Keep the database unchanged for MVP

Do not add tables or columns in the smallest safe implementation. Use existing:

- `events.training_plan_id`,
- `events.schedule_batch_id`,
- `events.status`,
- `training_plans` visibility and ownership fields.

### B. Add scheduled-plan derived queries

The backend should expose explicit scheduled-plan read APIs instead of forcing the client to infer everything from raw event lists.

Recommended MVP additions under `trainingPlans`:

- `listScheduled`
- `getScheduledByKey`
- `deleteScheduledEvents`
- `detachScheduledEvents`

Where `scheduled plan key` is a structured input composed of:

- `training_plan_id`,
- `schedule_batch_id`.

### C. Preserve path to a later first-class applied-plan model

The response shapes for the derived scheduled-plan queries should be compatible with a future persisted model. The API should already think in terms of a scheduled plan summary/detail rather than an arbitrary event bucket.

## 10. Exact MVP tRPC Contract Changes

### A. `trainingPlans.listScheduled`

Purpose:

- list grouped scheduled plans for the current user.

Behavior:

- read plan-backed events for the current user,
- group by `(training_plan_id, schedule_batch_id)` when `schedule_batch_id` is present,
- fall back to `(training_plan_id)` for legacy rows with null `schedule_batch_id`,
- join source `training_plans` rows that are accessible by ownership/public/system visibility,
- derive `next_event_at`, `upcoming_count`, `completed_count`, `started_at`, `status_label`, and source ownership metadata.

Return shape per item:

- `key: { training_plan_id, schedule_batch_id }`
- `source_training_plan`
- `next_event_at`
- `last_event_at`
- `upcoming_count`
- `past_count`
- `status`
- `source_kind`

### B. `trainingPlans.getScheduledByKey`

Purpose:

- fetch one scheduled-plan execution plus its events.

Behavior:

- validate the grouped key belongs to the current user via `events.profile_id`,
- load source plan metadata,
- return grouped events ordered by `starts_at`,
- include selection-safe ids for bulk operations.

### C. `trainingPlans.deleteScheduledEvents`

Purpose:

- bulk delete future or selected events from one scheduled-plan execution.

Input modes:

- `mode: "future"` with grouped key,
- `mode: "selected"` with grouped key plus event ids.

Safety rules:

- only delete events owned by the current user,
- only delete events matching the grouped key,
- for `future`, delete rows with `starts_at >= now`,
- reject empty selected sets.

### D. `trainingPlans.detachScheduledEvents`

Purpose:

- preserve selected events while removing them from scheduled-plan lineage.

Behavior:

- set `training_plan_id = null`,
- set `schedule_batch_id = null`,
- optionally keep `activity_plan_id` unchanged.

### E. Reuse `trainingPlans.updateActivePlanStatus`

No contract change required for MVP, but it must be surfaced from the client on the scheduled-plan detail screen.

### F. Optional cleanup to `trainingPlans.getActivePlan`

The existing procedure can remain for MVP, but the client should treat it as `current scheduled plan summary`, not as an owned template reference.

## 11. Smallest Safe Client Changes

### A. New routes/screens

- `scheduled-plans-list.tsx`
- `scheduled-plan-detail.tsx`

### B. Existing screen adjustments

- `plan.tsx`: split CTAs and route `Current Plan` to scheduled-plan detail,
- `training-plans-list.tsx`: clarify that it is an owned-template editor list,
- `training-plan-detail.tsx`: post-apply success routes to scheduled-plan detail.

### C. Event detail support

When an event has both `training_plan_id` and `schedule_batch_id`, show:

- `Part of scheduled plan`,
- `Open Scheduled Plan`,
- `Detach From Plan` as a future follow-up action if desired.

## 12. UX Copy Principles

- Use `template` for the editable source concept.
- Use `scheduled plan` for the applied calendar execution concept.
- Avoid calling scheduled public plans `your plan` unless the app means `your scheduled plan from this source`.
- Use `Make Editable Copy` for ownership transition.
- Use `Remove Future Sessions` rather than `Abandon` when the outcome is event deletion.

## 13. Success Criteria

- A user who schedules a public plan can later find and manage that schedule without owning the template.
- `Manage Scheduled Plan` never routes to an empty owned-template list for an applied public plan.
- Users can remove all future sessions from a scheduled plan in one action.
- Users can remove or detach selected sessions from a scheduled plan in one action.
- The MVP ships without a new schedule-instance table and without breaking current apply semantics.
- The API and UI terminology make template ownership distinct from scheduled execution.

## 14. Future Follow-Up

If scheduled-plan management expands beyond bulk remove/detach and summary views, the next spec should introduce first-class `applied_training_plans` persistence. Triggers for that follow-up include:

- needing multiple concurrent scheduled executions from the same source template,
- needing batch-level rename/notes/preferences,
- needing robust pause/resume semantics,
- needing audit history or coach sharing around applied plans.
