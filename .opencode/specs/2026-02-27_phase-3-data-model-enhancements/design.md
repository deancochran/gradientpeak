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
2. Training hierarchy is representable without ambiguity and supports reuse of plans/collections/workouts.
3. Template application always creates independent instances (no shared mutable state).
4. Multi-goal and multi-target structures support per-target readiness and aggregation.
5. Coaching relationships, permission scopes, messaging, and notifications are modeled with clear ownership and lifecycle.
6. All schema changes are type-safe and reflected in generated Supabase artifacts.

## Functional Requirements

### A) Unified Event Model

- A single event abstraction must support typed sub-kinds and optional links to domain records.
- Events support start/end or all-day semantics.
- Recurrence must support RRULE-compatible expression.
- Recurring edits must represent scope: single instance, future instances, full series.
- Imported iCal entries must preserve source identity to support idempotent sync updates.

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

## Non-Functional Requirements

- Additive-first migration strategy where possible.
- Backward-compatible reads during rollout.
- Idempotent synchronization keys for imported events/messages where relevant.
- Strict generated type alignment after each schema change.

## Data Integrity Rules

- No orphan links between events and linked domain entities.
- No duplicate imported event records for same source feed + external event identifier.
- No shared mutable references between templates and applied instances.
- Permission checks must be relationship-scoped, not global user-scoped.

## Acceptance Criteria

1. Event model can represent all required event kinds and recurrence semantics.
2. Training hierarchy relations support reuse and preserve ordering/offsets.
3. Template apply flow produces independent instances verified by tests.
4. Multi-goal/multi-target model supports per-target readiness persistence.
5. Coaching permissions enforce expected access boundaries.
6. Conversation/message/notification tables support unread state and soft delete semantics.
7. Supabase schema, migrations, and generated types are synchronized.

## Exit Criteria

- `tasks.md` checklist complete.
- Contract-level integration tests pass.
- Backward compatibility validated for existing read paths.
