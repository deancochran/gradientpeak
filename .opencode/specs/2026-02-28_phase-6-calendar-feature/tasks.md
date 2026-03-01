# Tasks - Phase 6 Interactive Calendar Feature

Last Updated: 2026-02-28 (Step 5 move interactions and Step 7 consistency complete)
Status: Active
Owner: Mobile + Backend + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [ ] Lock event type matrix (planned, rest day, race/target, custom, imported).
- [ ] Lock recurrence scope semantics (single, this-and-future, entire series).
- [ ] Lock imported event read-only and source identity rules.
- [ ] Lock planned-workout linkage update behavior on move/reschedule.
- [ ] Lock explicit event-completion linkage model.

## 1) Current Flow Audit

- [ ] Inventory all mobile calendar entry points and deep-link paths.
- [ ] Confirm and document route parameter mismatches and dead codepaths.
- [ ] Document current router behavior that is planned-workout-only.
- [ ] Freeze priority defects and expected behavior before implementation.

## 2) Event Domain and Schema

- [x] Extend core event schemas for all Phase 6 event types.
- [x] Define recurrence and exception schema constraints.
- [x] Define lifecycle fields/semantics for non-destructive delete/cancel behavior.
- [x] Define source metadata schema for imported iCal entries.

## 3) Events Router Generalization

- [x] Refactor list/get endpoints to return all supported event types.
- [x] Refactor create/update/delete to enforce type-specific rules.
- [x] Implement recurrence-aware scoped mutations.
- [x] Implement explicit event-to-activity linkage updates.
- [x] Keep backward compatibility for existing planned-workout clients.

## 4) iCal Import and Sync

- [x] Add endpoints for feed add/list/update/remove.
- [x] Implement ICS fetch and parse pipeline.
- [x] Normalize imported events into canonical event records.
- [x] Deduplicate/update-in-place using feed source identity.
- [x] Mark imported events as read-only in mutation paths.

## 5) Mobile Calendar Views

- [x] Implement month/week/day view toggle and rendering.
- [x] Build event detail bottom sheet with type-specific metadata/actions.
- [x] Implement event create flow with type-first selection.
- [x] Implement edit/delete flows with recurrence scope prompts.
- [x] Implement move actions (drag/drop in week/day, picker in month).

## 6) Navigation and Overlay Reliability

- [x] Fix calendar route reachability from all app entry points.
- [x] Ensure overlays dismiss before navigation transitions.
- [x] Remove duplicate or stale scheduling modal states and dead routes.
- [x] Guard lifecycle-triggered navigation against unmounted states.

## 7) Completion and Consistency

- [x] Replace date-only completion inference with authoritative linkage where possible.
- [x] Add reconciliation job/path for existing historical records.
- [x] Ensure moved events preserve linked planned content consistency.
- [x] Validate timezone consistency across create/list/render paths.

## 8) Tests

- [x] Add router tests for event type matrix CRUD behavior.
- [x] Add recurrence scope mutation tests.
- [x] Add import sync tests for idempotent updates.
- [x] Add mobile tests for view switching and event detail interactions.
- [x] Add navigation regression tests for plan/calendar entry points.

## 9) Quality Gates

- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter mobile test`
- [x] `pnpm --filter trpc check-types`
- [x] `pnpm --filter trpc test`

## 10) Completion Criteria

- [ ] All sections 0-9 complete.
- [ ] `design.md` acceptance criteria satisfied.
- [ ] Existing planned-workout scheduling flows remain functional.
- [ ] Imported and recurring calendar scenarios pass end-to-end validation.
