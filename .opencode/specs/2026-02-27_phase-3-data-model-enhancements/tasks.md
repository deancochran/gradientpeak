# Tasks - Phase 3 Data Model Enhancements

Last Updated: 2026-02-27
Status: Active
Owner: Backend + Core + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [ ] Publish contract lock artifact (`phase-3-contract-lock.md` or ADR) with approved owners and date.
- [ ] Finalize event taxonomy and required/optional fields.
- [ ] Finalize recurrence contract (RRULE + series/instance edit semantics).
- [ ] Lock recurrence split contract for `this-and-future` (boundary selection, truncation rule, new-series linkage).
- [ ] Finalize training hierarchy relationship contract.
- [ ] Finalize template visibility/apply-copy semantics.
- [ ] Lock external import idempotency key shape (`provider + integration + calendar + event + occurrence`).
- [ ] Finalize goals/targets metric identity + readiness fields.
- [ ] Finalize coaching permission set and lifecycle states.
- [ ] Finalize notification routing type contract.

## 1) Unified Event Model

- [ ] Introduce canonical `events` storage for planned scheduling and remove `planned_activities` from target schema.
- [ ] Add schema support for typed calendar events.
- [ ] Add optional link fields to planned workouts/goals/custom/imported references.
- [ ] Add start/end/all-day semantics.
- [ ] Add recurrence and series/instance linkage fields.
- [ ] Add imported source identity fields (feed URL/source key + external event ID).
- [ ] Add uniqueness constraints for import idempotency.
- [ ] Add and validate occurrence-level idempotency uniqueness for recurring imports.

## 1.1) `planned_activities` to `events` Cutover Program

- [ ] Backfill existing `planned_activities` rows to canonical `events` with deterministic idempotent mapping.
- [ ] Replace `plannedActivities` router usage with `events` router usage across app clients.
- [ ] Update integration flows (including Wahoo sync/import) to resolve planned records through events identity.
- [ ] Delete `planned_activities` table and any dependent DB objects from Phase 3 schema/migrations.
- [ ] Remove all `planned_activities` references from generated DB types and supazod outputs.
- [ ] Remove `planned_activities` router file and related query-client keys.

## 2) Training Hierarchy Support

- [ ] Add/confirm plan -> phase -> collection -> workout relationship model.
- [ ] Add/confirm ordering fields and relative day/week offsets.
- [ ] Add/confirm many-to-many reuse where required.
- [ ] Add indexes for ordered retrieval by plan and phase.

## 3) Template Abstraction

- [ ] Add template designation metadata for plans and collections.
- [ ] Add visibility state (`private`/`public`).
- [ ] Add likes/saves relation model.
- [ ] Add apply lineage metadata and copy-isolation guarantees.
- [ ] Verify template apply copy-on-write isolation with lineage metadata persistence checks.

## 4) Goals and Multi-Target Support

- [ ] Add one-to-many goal -> targets support.
- [ ] Add target metric type/value/unit/checkpoint-date fields.
- [ ] Add per-target readiness score storage.
- [ ] Add indexes for active-plan and target-date lookups.

## 5) Coaching Relationships and Permissions

- [ ] Add directional coach-athlete relationship model.
- [ ] Add relationship lifecycle fields (pending/active/suspended/ended + timestamps).
- [ ] Add per-relationship permission grants.
- [ ] Add constraints preventing duplicate active relationships.

## 6) Messaging and Notifications

- [ ] Add conversation model (direct/group).
- [ ] Add participant membership and last-read checkpoint support.
- [ ] Add message model with soft-delete semantics.
- [ ] Add notification model with typed route target references.
- [ ] Add read/unread state support and indexes.

## 7) DB Workflow and Type Generation

- [ ] Update `packages/supabase/schemas/init.sql` first for each schema change set.
- [ ] Run `supabase db diff` and review generated migration SQL.
- [ ] Run `supabase migration up` and verify local DB applies cleanly.
- [ ] Run `pnpm --filter @repo/supabase run update-types`.
- [ ] Verify `database.types.ts`, `supazod/schemas.ts`, and `supazod/schemas.types.ts` updated.

## 8) tRPC Wiring and Cutover

- [ ] Add/adjust routers to read/write new event/hierarchy/template models.
- [ ] Update `activities` router planned linkage semantics to avoid `plannedActivityId`/`activity_plan_id` ambiguity.
- [ ] Add permission checks for coach-scoped procedures.
- [ ] Add conversation/message/notification procedures.
- [ ] Remove `plannedActivities` router surface and replace all internal usage with events procedures.
- [ ] Rename/update client query keys to events-only naming and invalidate old planned-activities keys.

## 9) Data Integrity and Backfill

- [ ] Add any needed backfill scripts for pre-cutover record linkage.
- [ ] Define backfill invariants before execution (row parity, ownership parity, recurrence parity, orphan count).
- [ ] Validate idempotent import behavior for external events.
- [ ] Validate template apply isolation (no shared mutable references).
- [ ] Validate no orphan records after migration/backfill.
- [ ] Execute migration replay and drift checks on clean + seeded datasets.
- [ ] Document rollback decision criteria and observed thresholds.

## 10) Tests

- [ ] Schema constraint tests for key integrity and uniqueness rules.
- [ ] Router tests for event recurrence edit scopes.
- [ ] Router tests for recurrence series split behavior (`this-only`, `this-and-future`, `all`) with boundary assertions.
- [ ] Router tests for template apply copy isolation.
- [ ] Router tests for idempotent sync uniqueness across provider/integration/calendar/event/occurrence keys.
- [ ] Router tests for multi-goal/multi-target CRUD/readiness fields.
- [ ] Router tests for coaching permission enforcement.
- [ ] Router tests for conversation unread/read and message soft-delete.
- [ ] Router tests for notification routing metadata.

## 11) Quality Gates

- [ ] `pnpm --filter @repo/supabase run update-types`
- [ ] `pnpm --filter @repo/trpc test`
- [ ] `pnpm --filter @repo/trpc check-types`
- [ ] `pnpm check-types`
- [ ] `pnpm lint`

## 12) Completion Criteria

- [ ] All sections 0-11 complete.
- [ ] `design.md` acceptance criteria satisfied.
- [ ] `plan.md` architecture and migration strategy reflected in implementation.
- [ ] No unresolved schema drift for Phase 3 artifacts.
- [ ] Zero remaining `planned_activities` references checkpoint signed off with evidence.
