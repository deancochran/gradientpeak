# Tasks - Phase 7 MVP (Lean Schema, Keep Existing Sync Paths)

Last Updated: 2026-03-01 (scope simplification)
Status: Active
Owner: Mobile + Backend + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock (MVP)

- [x] Lock layer model: Content (`activity_plans`,`training_plans`) / Library (`library_items`) / Calendar (`events`).
- [x] Lock essential-table policy (only new table is `library_items`).
- [x] Lock template apply behavior using `events.schedule_batch_id` lineage.
- [x] Lock read-only iCal event behavior and import idempotency rules.
- [x] Lock stable identity contract in API responses: `content_type`, `content_id`, `owner_profile_id`, `visibility`.
- [x] Lock future discover compatibility rule: per-type endpoints now, unified discover index deferred.
- [x] Lock keep-existing-sync policy: keep `synced_events` and existing `events` import identity fields unchanged in MVP.

### 0.1) Scope Guardrail (Do Not Implement)

- [x] Do not add `provider_sync_records` in this phase.
- [x] Do not add `template_source` / `template_source_id` in this phase.
- [x] Do not add `events.schedule_source_id` in this phase.
- [x] Do not perform `synced_events` replacement/cutover or sync-registry dual-write/backfill in this phase.
- [x] If old notes conflict with these tasks, treat these tasks as authoritative and defer conflicting work.

## 1) Additive Schema Changes

- [x] Update `training_plans` with minimal template column (`template_visibility`).
- [x] Update `activity_plans` with minimal template/import columns (`template_visibility`, `import_provider`, `import_external_id`).
- [x] Update `events` with `schedule_batch_id` only.
- [x] Create `library_items` table with uniqueness constraint (`profile_id`, `item_type`, `item_id`).
- [x] Add only required indexes for listing/apply/dedupe.
- [x] Add DB check constraints for allowed `template_visibility` values.
- [x] Add system-template visibility consistency constraints (`is_system_template => template_visibility = 'public'`).
- [x] Backfill existing system templates to `template_visibility = 'public'`.

## 2) Core Schemas

- [x] Add `template_library.ts` schemas for library item input and template apply input.
- [x] Export new schemas from `packages/core/schemas/index.ts`.
- [x] Add validation tests for new schema contracts.

## 3) Backend APIs

- [x] Extend training plan template list/filter endpoints with visibility filters.
- [x] Add `trainingPlans.applyTemplate` mutation generating scheduled events with `schedule_batch_id`.
- [x] Add `library` router (`add`, `remove`, `list`) and wire into root router.
- [x] Extend `activity_plans` endpoints for template visibility and import identity.
- [x] Normalize per-type list response shape to stable identity contract fields.
- [x] Keep per-type list input shape aligned for future mixed discover reuse.
- [x] Keep iCal and Wahoo sync paths on existing schema (`events` import identity + `synced_events`).

## 4) Ownership and Visibility Enforcement (MVP Model)

- [x] Enforce ownership in all mutable procedures (`profile_id = ctx.session.user.id`).
- [x] Enforce read filtering for owner + `public` + `is_system_template` in template listing paths.
- [x] Verify schema constraints reject invalid visibility values and inconsistent system-template rows.
- [x] Verify API logic does not bypass ownership constraints.

## 5) Third-Party Import MVP

- [x] Add FIT-to-template import endpoint (MVP payload path with import identity + idempotent upsert).
- [x] Add ZWO-to-template import endpoint (MVP payload path with import identity + idempotent upsert).
- [x] Keep iCal feed sync path unchanged and compatible with `schedule_batch_id` addition.
- [x] Add dedupe keys for FIT/ZWO imports on `activity_plans` (`import_provider`, `import_external_id`).
- [x] Keep existing Wahoo sync linkage through `synced_events` unchanged.

## 6) Mobile MVP UX

- [x] Add save-to-library actions in training plan and activity plan detail screens.
- [x] Add template browse filters (visibility + owner scope) in existing list UI.
- [x] Add template apply entry (start date / goal date).
- [x] Add FIT/ZWO import entry and result summary state.
- [x] Add hierarchy explainer in first training plan creation flow.

## 7) Tests

- [x] Core schema tests for library/apply contracts.
- [x] TRPC tests for library uniqueness and listing.
- [x] TRPC tests for apply template event generation (`schedule_batch_id`).
- [x] TRPC tests for FIT/ZWO import idempotency (`import_provider`, `import_external_id`).
- [x] TRPC regression tests for iCal/Wahoo existing paths.
- [x] Mobile tests for save/apply/import UX paths.
- [x] Regression tests for Phase 6 event/calendar behavior.
- [x] API contract tests for normalized identity fields across list endpoints.

## 8) Quality Gates

- [x] `pnpm --filter core check-types`
- [x] `pnpm --filter core test`
- [x] `pnpm --filter trpc check-types`
- [x] `pnpm --filter trpc test`
- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter mobile test`

## 9) Explicit Non-Requirements (Must Stay Out of Phase 7 MVP)

- [x] No `provider_sync_records` table.
- [x] No `synced_events` replacement/cutover.
- [x] No sync-registry dual-write/backfill migration.
- [x] No `template_source` / `template_source_id` columns.
- [x] No `events.schedule_source_id` column.
- [x] No RLS policy rollout in this phase.

## 10) Completion Criteria

- [x] All sections 0-9 complete.
- [x] All user stories in `design.md` verified.
- [x] Only one essential new table introduced (`library_items`).
- [x] Existing Phase 6 schedule flows still pass.
- [x] Ownership and visibility constraints are enforced and verified.
- [x] Future discover compatibility contract is implemented and verified.
- [x] Existing iCal/Wahoo sync behavior remains stable without sync-table consolidation.

(End of file)
