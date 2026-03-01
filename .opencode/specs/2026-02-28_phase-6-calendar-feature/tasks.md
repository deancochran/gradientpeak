# Tasks - Phase 6 Interactive Calendar Feature

Last Updated: 2026-02-28
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

- [ ] Extend core event schemas for all Phase 6 event types.
- [ ] Define recurrence and exception schema constraints.
- [ ] Define lifecycle fields/semantics for non-destructive delete/cancel behavior.
- [ ] Define source metadata schema for imported iCal entries.

## 3) Events Router Generalization

- [ ] Refactor list/get endpoints to return all supported event types.
- [ ] Refactor create/update/delete to enforce type-specific rules.
- [ ] Implement recurrence-aware scoped mutations.
- [ ] Implement explicit event-to-activity linkage updates.
- [ ] Keep backward compatibility for existing planned-workout clients.

## 4) iCal Import and Sync

- [ ] Add endpoints for feed add/list/update/remove.
- [ ] Implement ICS fetch and parse pipeline.
- [ ] Normalize imported events into canonical event records.
- [ ] Deduplicate/update-in-place using feed source identity.
- [ ] Mark imported events as read-only in mutation paths.

## 5) Mobile Calendar Views

- [ ] Implement month/week/day view toggle and rendering.
- [ ] Build event detail bottom sheet with type-specific metadata/actions.
- [ ] Implement event create flow with type-first selection.
- [ ] Implement edit/delete flows with recurrence scope prompts.
- [ ] Implement move actions (drag/drop in week/day, picker in month).

## 6) Navigation and Overlay Reliability

- [ ] Fix calendar route reachability from all app entry points.
- [ ] Ensure overlays dismiss before navigation transitions.
- [ ] Remove duplicate or stale scheduling modal states and dead routes.
- [ ] Guard lifecycle-triggered navigation against unmounted states.

## 7) Completion and Consistency

- [ ] Replace date-only completion inference with authoritative linkage where possible.
- [ ] Add reconciliation job/path for existing historical records.
- [ ] Ensure moved events preserve linked planned content consistency.
- [ ] Validate timezone consistency across create/list/render paths.

## 8) Tests

- [ ] Add router tests for event type matrix CRUD behavior.
- [ ] Add recurrence scope mutation tests.
- [ ] Add import sync tests for idempotent updates.
- [ ] Add mobile tests for view switching and event detail interactions.
- [ ] Add navigation regression tests for plan/calendar entry points.

## 9) Quality Gates

- [ ] `pnpm --filter mobile check-types`
- [ ] `pnpm --filter mobile test`
- [ ] `pnpm --filter trpc check-types`
- [ ] `pnpm --filter trpc test`

## 10) Completion Criteria

- [ ] All sections 0-9 complete.
- [ ] `design.md` acceptance criteria satisfied.
- [ ] Existing planned-workout scheduling flows remain functional.
- [ ] Imported and recurring calendar scenarios pass end-to-end validation.
