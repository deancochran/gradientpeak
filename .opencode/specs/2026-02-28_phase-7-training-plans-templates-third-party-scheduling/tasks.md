# Tasks - Phase 7 MVP (Minimal Tables, Maximum Reuse)

Last Updated: 2026-03-01 (MVP simplification)
Status: Active
Owner: Mobile + Backend + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock (MVP)

- [ ] Lock Layer model: Content (`activity_plans`,`training_plans`) / Library (`library_items`) / Calendar (`events`).
- [ ] Lock "one new table" policy (`library_items` only).
- [ ] Lock template apply behavior using `events.schedule_batch_id` lineage.
- [ ] Lock read-only iCal event behavior and import idempotency rules.
- [ ] Lock stable identity contract in API responses: `content_type`, `content_id`, `owner_profile_id`, `visibility`.
- [ ] Lock future discover compatibility rule: per-type endpoints now, unified discover index deferred.

## 1) Additive Schema Changes

- [ ] Update `training_plans` with template metadata columns.
- [ ] Update `activity_plans` with template metadata + import identity columns.
- [ ] Update `events` with schedule batch/source columns.
- [ ] Create `library_items` table with uniqueness constraint.
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

## 6) Mobile MVP UX

- [ ] Add save-to-library actions in training plan and activity plan detail screens.
- [ ] Add template browse filters (sport/ability/weeks) in existing list UI.
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
- [ ] Only one new table introduced.
- [ ] Existing Phase 6 schedule flows still pass.
- [ ] Ownership and visibility are enforced and verified at DB policy level.
- [ ] Future discover compatibility contract is implemented and verified.

(End of file)
