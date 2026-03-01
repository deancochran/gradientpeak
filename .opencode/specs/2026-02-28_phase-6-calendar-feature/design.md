# Phase 6 Specification - Interactive Calendar Feature

Date: 2026-02-28
Owner: Mobile + Backend + Core Logic + QA
Status: Draft (implementation-ready)
Type: Calendar domain expansion and mobile scheduling UX refactor

## Executive Summary

Phase 6 upgrades the existing plan calendar into a fully interactive, event-type-aware scheduling surface that supports month/week/day workflows, drag and move interactions, recurrence editing scopes, and imported calendar entries.

The current codebase already has a strong planned-workout scheduling foundation (`events` table, mobile plan tab, schedule modal, list/detail screens), but behavior is still effectively planned-workout-only. This phase generalizes that foundation into a canonical calendar event system that supports planned workouts, rest days, race/target events, custom events, and imported read-only entries.

## Scope

### In Scope

- Fix and harden calendar routing paths so the calendar is reliably reachable from all navigation entry points.
- Expand calendar domain behavior from planned-workout-only to multi-type events.
- Add interactive month/week/day calendar views with consistent event detail and edit interactions.
- Support event creation and editing flows for planned workout, rest day, race/target event, custom, and imported entries.
- Implement recurrence behavior with explicit edit scopes (single, future, entire series).
- Implement move/reschedule interactions (drag in week/day, picker in month) with linked record updates.
- Support iCal feed import, storage of source identity, dedupe, and read-only rendering for imported entries.

### Out of Scope

- Training template library behavior (Phase 7).
- Goal readiness and recommendation engine logic (Phase 8).
- Coaching permissions UX (Phase 10), except that data shape must remain compatible.
- New UI dependency libraries unless already approved in repository conventions.

## Current State Review (Codebase Findings)

- Mobile already renders a month-style plan calendar and day drill-down in `apps/mobile/app/(internal)/(tabs)/plan.tsx`.
- Scheduling CRUD exists in `packages/trpc/src/routers/events.ts`, but list/create/update/delete logic is currently centered on planned workouts.
- Database supports richer event fields (recurrence, series, source identity), but those capabilities are mostly not surfaced in API behavior or UI.
- Deletes currently behave as hard deletes in router flows, conflicting with recurring-instance edit/delete requirements.
- Completion state is inferred by date-based matching against activities in some flows instead of using a first-class explicit linkage model.
- Third-party schedule import is not yet generalized (Wahoo integration exists, but iCal feed ingestion and generic external event sync are not complete).

## Problem Statement

- Calendar navigation is not yet fully reliable and consistent across all app entry points.
- Event abstractions in UI/API are narrower than the intended Phase 6 product model.
- Recurrence and per-instance exception management are not end-to-end implemented.
- Imported schedule data cannot yet be represented and maintained as first-class read-only events.
- Without these changes, downstream training plan scheduling and template workflows remain constrained.

## Required Outcomes

1. Calendar is reliably reachable and behaves consistently from all intended entry points.
2. Event model behavior supports all Phase 6 event types as first-class calendar records.
3. Month/week/day views are interactive and support create/edit/move/delete flows.
4. Recurrence and exception edits support single instance, this-and-future, and whole-series operations.
5. Imported iCal events are deduped, read-only, and visibly distinguished from native events.
6. Moving planned-workout events updates linked planned content consistently.

## Functional Requirements

### A) Navigation and Reachability

- Calendar route opens reliably from all app entry points.
- Route parameter handling is explicit and validated before side effects.
- Navigation actions from overlays close overlays first, then navigate.

### B) Calendar Views and Interaction Model

- Month view with per-day event indicators and day summary interaction.
- Week view with 7-column time slots and swipe navigation.
- Day view with time slots and swipe navigation.
- Event tap opens event detail bottom sheet with type-specific metadata.

### C) Event Types and Creation Flows

- Planned workout event linked to an activity plan.
- Rest day event with optional notes.
- Race/target event linked to goal context where available.
- Custom event with title/time/notes.
- Imported external event rendered read-only with source attribution.

### D) Reschedule/Move Behavior

- Week/day drag-and-drop move interactions.
- Month move via date picker.
- Planned workout move updates linked schedule record consistency.

### E) Recurrence and Exceptions

- Recurrence represented with iCal RRULE-compatible strings.
- Editing recurring events prompts for scope: one occurrence, this and future, or entire series.
- Deleting recurring events supports same scope options and preserves series integrity.

### F) Imported Calendar Feeds

- User can add one or more iCal feed URLs.
- Feed origin URL and source event identity are stored for update-in-place sync.
- Re-sync updates existing entries instead of duplicating.
- Imported entries remain read-only in UI and API mutation paths.

### G) Lifecycle and Data Integrity

- Event lifecycle supports cancellation/deletion semantics without destructive loss of recurring series meaning.
- Completion linkage between scheduled events and completed activities is explicit and authoritative.
- Timezone handling is consistent across create/list/render and recurrence expansion.

## Non-Functional Requirements

- Maintain existing design system and React Native performance constraints.
- Keep API contracts type-safe and aligned with `@repo/core` schemas.
- Preserve backward compatibility for existing planned-workout schedule consumers during migration.
- Add test coverage for router behavior, recurrence rules, and mobile navigation interactions.

## Acceptance Criteria

1. Users can toggle month/week/day views and interact with events in each view.
2. All five event types can be created or rendered according to product rules.
3. Move/edit/delete operations behave correctly for recurring and non-recurring events.
4. Imported iCal entries sync idempotently and appear as read-only entries.
5. Planned-workout move operations keep linked scheduling records consistent.
6. Calendar navigation and overlays behave predictably without stale overlay artifacts.

## Exit Criteria

- `tasks.md` checklist complete.
- Mobile calendar flow tests and router tests pass.
- Event API supports multi-type calendar behavior without regressions in existing planned-workout flows.
