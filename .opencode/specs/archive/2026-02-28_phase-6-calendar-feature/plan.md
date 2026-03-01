# Technical Implementation Plan - Phase 6 Interactive Calendar Feature

Date: 2026-02-28
Status: Ready for implementation
Owner: Mobile + Backend + Core Logic + QA
Inputs: `design.md`

## 1) Architecture and Ownership

- `apps/mobile`:
  - evolve current plan tab into full month/week/day interactive calendar surface
  - add event detail bottom sheet and type-specific create/edit flows
  - ensure robust routing and overlay-dismiss-before-navigation behavior
- `packages/trpc`:
  - expand `events` router contracts from planned-workout-centric behavior to multi-type event handling
  - implement recurrence/edit-scope semantics and non-destructive lifecycle behavior
  - add iCal feed ingestion/sync endpoints and read-only external event protections
- `packages/core`:
  - define/extend calendar event schemas for type-safe inputs/outputs
  - centralize recurrence-related validation and event-type constraints
- `packages/supabase`:
  - align schema and generated types for lifecycle, recurrence, source identity, and linkage fields

## 2) Contract Lock Before Implementation

1. Calendar domain supports planned, rest day, race/target, custom, and imported events.
2. Recurrence edits require explicit scope selection (single, future, series).
3. Imported events are read-only and updated in place by source identity.
4. Planned-workout reschedules must keep linked content synchronized.
5. Event-to-activity completion linkage is explicit, not heuristic-only.
6. Overlay dismissal and navigation sequencing follows Expo Router best practices.

## 3) Workstreams

### A) Current Flow Audit and Gap Freeze

- Inventory all current calendar/schedule entry points in mobile navigation.
- Freeze known defects (routing mismatch, param handling, stale overlay risk).
- Lock event lifecycle terminology and behavior matrix.

### B) Event Domain and Schema Expansion

- Extend event input/output contracts to support all required event types.
- Lock recurrence and exception schema semantics.
- Lock source provenance model for imported iCal events.
- Define soft-delete or non-destructive cancellation behavior compatible with recurrence.

### C) Events Router Refactor

- Refactor list/get/create/update/delete to be event-type-aware.
- Add recurrence-aware expansion and scoped mutation behavior.
- Add explicit event-activity linking and reconciliation behavior.
- Maintain compatibility for existing planned-workout consumers.

### D) iCal Import and Sync Pipeline

- Add feed registration/update/remove endpoints.
- Implement fetch/parse/normalize/dedupe pipeline for ICS events.
- Store source UID and feed URL metadata for idempotent re-sync.
- Enforce read-only semantics for imported event records.

### E) Mobile Calendar UX Refactor

- Upgrade calendar surface to month/week/day views with cohesive interactions.
- Build event detail bottom sheet with type-specific actions.
- Implement create/edit flows for each event type.
- Implement drag/drop and date-picker move semantics by view type.

### F) Navigation and Overlay Reliability

- Normalize route params and deep-link handling.
- Ensure overlays dismiss before navigation transitions.
- Remove duplicate or dead schedule modal paths.

### G) Test and Validation Hardening

- Add router tests for event types, recurrence scopes, and lifecycle behavior.
- Add iCal sync tests for dedupe/update-in-place behavior.
- Add mobile tests for navigation, view switching, and event interactions.
- Add regression tests ensuring existing planned-workout scheduling still works.

## 4) Validation and Quality Gates

- `pnpm --filter mobile check-types`
- `pnpm --filter mobile test`
- `pnpm --filter trpc check-types`
- `pnpm --filter trpc test`
- Targeted integration tests for event sync and recurrence mutation logic.

## 5) Test Strategy

- Contract tests for each event type across create/list/get/update/delete.
- Recurrence scope tests covering single/future/series edits and deletes.
- Timezone tests covering local-day rendering versus stored timestamps.
- Import tests validating idempotent updates by external source UID.
- Mobile interaction tests for month/week/day toggling, move actions, and detail sheet behavior.

## 6) Rollout Notes

- Deliver in slices: domain contract -> router parity -> mobile multi-view UX -> import sync -> stabilization.
- Keep existing planned-workout user flows operational during migration.
- Introduce feature flags if needed for recurrence or import subfeatures.
- Validate behavior on iOS and Android navigation/back gesture patterns.
