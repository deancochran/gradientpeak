# Tasks - Phase 3 Data Model Enhancements

Last Updated: 2026-02-27
Status: Active
Owner: Backend + Core + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [ ] Finalize event taxonomy and required/optional fields.
- [ ] Finalize recurrence contract (RRULE + series/instance edit semantics).
- [ ] Finalize training hierarchy relationship contract.
- [ ] Finalize template visibility/apply-copy semantics.
- [ ] Finalize goals/targets metric identity + readiness fields.
- [ ] Finalize coaching permission set and lifecycle states.
- [ ] Finalize notification routing type contract.

## 1) Unified Event Model

- [ ] Add schema support for typed calendar events.
- [ ] Add optional link fields to planned workouts/goals/custom/imported references.
- [ ] Add start/end/all-day semantics.
- [ ] Add recurrence and series/instance linkage fields.
- [ ] Add imported source identity fields (feed URL/source key + external event ID).
- [ ] Add uniqueness constraints for import idempotency.

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

## 8) tRPC Wiring and Compatibility

- [ ] Add/adjust routers to read/write new event/hierarchy/template models.
- [ ] Add permission checks for coach-scoped procedures.
- [ ] Add conversation/message/notification procedures.
- [ ] Keep compatibility adapters for existing consumers where needed.

## 9) Data Integrity and Backfill

- [ ] Add any needed backfill scripts for legacy record linkage.
- [ ] Validate idempotent import behavior for external events.
- [ ] Validate template apply isolation (no shared mutable references).
- [ ] Validate no orphan records after migration/backfill.

## 10) Tests

- [ ] Schema constraint tests for key integrity and uniqueness rules.
- [ ] Router tests for event recurrence edit scopes.
- [ ] Router tests for template apply copy isolation.
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
