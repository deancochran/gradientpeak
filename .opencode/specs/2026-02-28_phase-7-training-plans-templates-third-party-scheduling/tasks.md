# Tasks - Phase 7 MVP (Minimal Tables, Maximum Reuse)

Last Updated: 2026-03-01 (MVP simplification)
Status: Active
Owner: Mobile + Backend + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock (MVP)

- [ ] Lock Layer model: Content (`activity_plans`,`training_plans`) / Library (`library_items`) / Calendar (`events`).
- [ ] Lock essential-table policy (`library_items` + `provider_sync_records`).
- [ ] Lock template apply behavior using `events.schedule_batch_id` lineage.
- [ ] Lock read-only iCal event behavior and import idempotency rules.
- [ ] Lock stable identity contract in API responses: `content_type`, `content_id`, `owner_profile_id`, `visibility`.
- [ ] Lock future discover compatibility rule: per-type endpoints now, unified discover index deferred.
- [ ] Lock provider sync source-of-truth policy (`provider_sync_records`) and redundant-table removal path.

## 1) Additive Schema Changes

- [ ] Update `training_plans` with minimal template columns (`template_visibility`, `template_source`, `template_source_id`).
- [ ] Update `activity_plans` with minimal template/import columns (`template_visibility`, `template_source`, `template_source_id`, `source_provider`, `source_external_id`).
- [ ] Update `events` with schedule batch/source columns.
- [ ] Create `library_items` table with uniqueness constraint.
- [ ] Create `provider_sync_records` table with unique provider identity key.
- [ ] Add only required indexes for filters and dedupe.
- [ ] Add DB check constraints for allowed `template_visibility` values.

## 2) Core Schemas

- [ ] Add `template_library.ts` schemas for library item input and template apply input.
- [ ] Export new schemas from `packages/core/schemas/index.ts`.
- [ ] Add validation tests for new schema contracts.

## 3) Backend APIs

- [ ] Extend training plan template list/filter endpoints with metadata filters.
- [ ] Add `trainingPlans.applyTemplate` mutation generating scheduled events with `schedule_batch_id`.
- [ ] Add `library` router (`add`, `remove`, `list`) and wire into root router.
- [ ] Extend `activity_plans` endpoints for template visibility/import identity.
- [ ] Normalize per-type list response shape to stable identity contract fields.
- [ ] Keep per-type list input shape aligned for future mixed discover reuse.
- [ ] Add provider sync registry module and route FIT/ZWO/iCal mapping writes through it.

## 4) Ownership and Visibility Enforcement (DB-Level)

- [ ] Enable RLS on `training_plans`, `activity_plans`, and `library_items`.
- [ ] Add owner-write policies (`profile_id = auth.uid()`) for mutable operations.
- [ ] Add read policies allowing owner + `public` + `is_system_template` where appropriate.
- [ ] Ensure API logic aligns with and does not bypass DB policy guarantees.

## 5) Third-Party Import MVP

- [ ] Add FIT-to-template import endpoint using existing FIT parsing stack.
- [ ] Add ZWO-to-template import endpoint with XML parsing + normalization.
- [ ] Keep iCal feed sync path and confirm compatibility with new schedule metadata.
- [ ] Add dedupe keys for FIT/ZWO imports (provider + external id/hash).
- [ ] Upsert sync identity/provenance rows into `provider_sync_records` for all providers.
- [ ] Backfill and cut over any redundant mapping tables (e.g., `synced_events`).

## 6) Mobile MVP UX

- [ ] Add save-to-library actions in training plan and activity plan detail screens.
- [ ] Add template browse filters (visibility + owner scope) in existing list UI.
- [ ] Add template apply entry (start date / goal date).
- [ ] Add FIT/ZWO import entry and result summary state.
- [ ] Add hierarchy explainer in first training plan creation flow.

## 7) Tests

- [ ] Core schema tests for library/apply contracts.
- [ ] TRPC tests for library uniqueness and listing.
- [ ] TRPC tests for apply template event generation (`schedule_batch_id`).
- [ ] TRPC tests for FIT/ZWO import idempotency.
- [ ] Mobile tests for save/apply/import UX paths.
- [ ] Regression tests for Phase 6 event/calendar behavior.
- [ ] DB policy tests for ownership and visibility access paths.
- [ ] API contract tests for normalized identity fields across list endpoints.
- [ ] Sync registry tests for identity uniqueness + idempotent resync updates.
- [ ] Backfill parity tests before dropping redundant mapping tables.

## 8) Quality Gates

- [ ] `pnpm --filter core check-types`
- [ ] `pnpm --filter core test`
- [ ] `pnpm --filter trpc check-types`
- [ ] `pnpm --filter trpc test`
- [ ] `pnpm --filter mobile check-types`
- [ ] `pnpm --filter mobile test`

## 9) Completion Criteria

- [ ] All sections 0-8 complete.
- [ ] All user stories in `design.md` verified.
- [ ] Only essential tables introduced (`library_items`, `provider_sync_records`).
- [ ] Existing Phase 6 schedule flows still pass.
- [ ] Ownership and visibility are enforced and verified at DB policy level.
- [ ] Future discover compatibility contract is implemented and verified.
- [ ] Third-party sync provenance is centralized in `provider_sync_records`.

(End of file)
