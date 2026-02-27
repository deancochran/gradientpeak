# Phase 3 Specification - Data Model Enhancements

Date: 2026-02-27
Owner: Backend + Core + Mobile/Web + QA
Status: Draft (implementation-ready)
Type: Data model expansion and contract hardening

## Executive Summary

Phase 3 establishes the canonical data relationships needed for calendar scheduling, reusable templates, goals/readiness, and coaching/social features.

This phase is about representational correctness and safe evolution of existing data, not UI redesign.

## Scope

### In Scope

- Unified calendar event model that can represent:
  - planned workouts
  - rest days
  - races/goal events
  - custom events
  - imported iCal feed entries
- Training hierarchy model support:
  - training plan -> phase -> activity plan collection -> activity plan -> interval -> step
- Template abstraction for training plans and collections (private/public, apply/copy semantics).
- Goals model expansion for multi-goal and multi-target support with readiness storage.
- Coaching relationship model with per-relationship permissions.
- Conversations/messages and server-backed notifications data model support.

### Out of Scope

- Net-new coaching/messaging UI implementation (Phase 10).
- Calendar UI implementation (Phase 6).
- Recommendation/readiness algorithm implementation changes beyond required storage contracts.

## Problem Statement

- Existing records do not yet provide a complete, unified structure for mixed event types and recurring schedule semantics.
- Hierarchy and template concepts are not yet fully normalized for reuse across users/plans.
- Goal and target relationships need explicit multi-target support to power readiness/ranking logic.
- Coaching permissions and messaging require first-class relational modeling before UI can ship safely.

## Required Outcomes

1. Calendar-capable event abstraction exists and supports recurrence + series edit scope.
2. `planned_activities` is removed from the Phase 3 schema; planned activities are represented as `events` with `event_type='planned_activity'`.
3. Training hierarchy is representable without ambiguity and supports reuse of plans/collections/workouts.
4. Template application always creates independent instances (no shared mutable state).
5. Multi-goal and multi-target structures support per-target readiness and aggregation.
6. Coaching relationships, permission scopes, messaging, and notifications are modeled with clear ownership and lifecycle.
7. All schema changes are type-safe and reflected in generated Supabase artifacts.

## Functional Requirements

### A) Unified Event Model

- A single event abstraction must support typed sub-kinds and optional links to domain records.
- Events support start/end or all-day semantics.
- Recurrence must support RRULE-compatible expression.
- Recurring edits must represent scope: single instance, future instances, full series.
- Imported iCal entries must preserve source identity to support idempotent sync updates.
- Planned workout scheduling uses `events` as source of truth; there is no `planned_activities` table in the Phase 3 target schema.

### B) Training Hierarchy

- Activity plans are reusable and not tied to a date.
- Collections represent ordered groupings with relative offsets.
- Training plans can organize collections by optional named phases.
- Reuse relationships must allow one plan/workout to appear in many parent structures.

### C) Templates

- Plans and collections can be template-designated.
- Templates support visibility (`private`/`public`) and social metadata (likes/saves).
- Applying a template creates a fully independent copy graph for the target user.

### D) Goals and Targets

- One plan may contain multiple goals.
- One goal may contain multiple measurable targets.
- Target stores metric identity, unit, target value, optional checkpoint date, and readiness score.

### E) Coaching and Permissions

- Directional coach-athlete relationship with lifecycle states (pending/active/suspended/ended).
- Per-relationship permission set (view activities, edit plans, edit profile metrics, edit efforts/notes).

### F) Messaging and Notifications

- Conversation model supports one-to-one and group.
- Message model supports soft deletion and per-participant read tracking.
- Notification model supports typed routing and read state persistence.

## Contract Decisions (Locked Before Migration)

- Canonical scheduling storage is `events` (not `planned_activities`):
  - `event_type='planned_activity'` represents planned workout records
  - all read/write APIs, app consumers, and integrations must use `events` contracts only
  - all direct references to `planned_activities` are removed in this phase

- Recurrence storage model is `series + exceptions`:
  - one canonical series record owns RRULE/timezone/base event fields
  - exception records store only per-occurrence overrides or cancellations keyed by occurrence
- Edit scope behavior is fixed:
  - single instance: write/update exception only
  - this-and-future: split series at boundary (old series truncated, new series created)
  - full series: mutate canonical series definition
- External import idempotency key is fixed to source identity + occurrence identity:
  - key components: `provider`, `integration_account_id`, `external_calendar_id`, `external_event_id`, `occurrence_key`
  - `occurrence_key` is required for recurring instances and normalized to provider instance identity/start timestamp when missing
- Template apply uses copy-on-write graph cloning:
  - applied plans/collections/workouts are new owned records, never shared mutable rows
  - lineage metadata is required (`template_source_id`, `applied_from_user_id`, `applied_at`, optional `template_version`)
- Coaching permissions are relationship-scoped grants only:
  - permissions attach to a coach-athlete relationship record
  - no global coach permission flags on user profile
- Messaging unread state uses participant checkpoint model:
  - each conversation participant stores `last_read_seq`
  - unread count = `max_seq - last_read_seq`
  - per-message read receipts are explicitly deferred and optional for later phase
- Notification routing uses typed target references and deterministic dedupe:
  - route target is (`target_type`, `target_id`) with constrained enums
  - dedupe key is (`user_id`, `notification_type`, `target_type`, `target_id`, `dedupe_window_or_version`)

## Minimal Viable Relational Footprint

- Use a lean core table set for Phase 3: events (+ series/exceptions), plan hierarchy joins, templates metadata, goals/targets, coaching relationships/grants, conversations/participants/messages, notifications.
- Do not preserve a compatibility `planned_activities` table/view in target architecture; migration output must reference `events` only.
- Prefer typed columns and enums over subtype table explosion; do not create one table per event kind unless a hard integrity requirement appears.
- Keep template social metadata minimal (likes/saves relations only); defer analytics/materialized counters until usage proves need.
- Store unread state at participant checkpoint level (`last_read_seq`) instead of per-message receipt rows for every read.
- Normalize only where ownership/integrity changes independently; keep value-object fields embedded to reduce migration and query overhead.
- Anti-over-normalization rule: if a table would have 1:1 cardinality, no independent lifecycle, and no separate ACL/query pattern, keep it in parent row for this phase.

## Non-Functional Requirements

- Additive-first migration strategy where possible.
- Single-schema cutover to `events` with coordinated router/client updates in same phase.
- Idempotent synchronization keys for imported events/messages where relevant.
- Strict generated type alignment after each schema change.

## Data Integrity Rules

- No orphan links between events and linked domain entities.
- No duplicate imported event records for same source feed + external event identifier.
- No shared mutable references between templates and applied instances.
- Permission checks must be relationship-scoped, not global user-scoped.
- No residual references to `planned_activities` remain in schema, generated types, routers, integrations, or first-party app clients.

## Acceptance Criteria

1. Event model can represent all required event kinds and recurrence semantics.
2. Planned-activity features resolve from canonical `events` model with `event_type='planned_activity'`.
3. Training hierarchy relations support reuse and preserve ordering/offsets.
4. Template apply flow produces independent instances verified by tests.
5. Multi-goal/multi-target model supports per-target readiness persistence.
6. Coaching permissions enforce expected access boundaries.
7. Conversation/message/notification tables support unread state and soft delete semantics.
8. Supabase schema, migrations, and generated types are synchronized.

## Exit Criteria

- `tasks.md` checklist complete.
- Contract-level integration tests pass.
- Zero `planned_activities` references remain in active Phase 3 code paths.
