# Tasks - Phase 7 Training Plans, Templates, and Third-Party Scheduling

Last Updated: 2026-02-28 (initial draft from research)
Status: Active
Owner: Mobile + Backend + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [ ] Lock hierarchy terminology and payload naming (workout/activity plan, collection/block, training plan, template).
- [ ] Lock copy-on-apply immutability contract and lineage fields.
- [ ] Lock schedule-content linkage contract (`event_plan_links` or equivalent).
- [ ] Lock import identity keys and idempotency semantics.
- [ ] Lock read-only behavior for imported iCal events.

## 1) Current State Audit

- [ ] Inventory existing training plan/template structures in core/trpc/mobile.
- [ ] Inventory existing calendar linkage points that require additive integration.
- [ ] Inventory current iCal and Wahoo integration touchpoints relevant to Phase 7.
- [ ] Document migration-sensitive areas and backward-compatibility guardrails.

## 2) Data Model and Migrations (Additive)

- [ ] Add template metadata/visibility fields needed for MVP discovery.
- [ ] Add template lineage/version fields needed for apply-time traceability.
- [ ] Add schedule-content linkage table/fields with constraints and indexes.
- [ ] Add import job/artifact/identity tracking tables (or equivalent) with dedupe keys.
- [ ] Add audit and soft-delete columns where required for mutable entities.

## 3) Core Schemas and Rules

- [ ] Add/extend schemas for hierarchy entities and template contracts.
- [ ] Add relative offset projection rules and validation.
- [ ] Add import normalized envelope schema and adapter contracts.
- [ ] Add error taxonomy for hierarchy/apply/import validation failures.

## 4) Template API (Phase 7.2)

- [ ] Implement save-as-template for training plans.
- [ ] Implement save-as-template for collections.
- [ ] Implement template browse/search/filter endpoints.
- [ ] Implement template preview endpoint with key summary fields.
- [ ] Implement apply endpoint creating independent user-owned instance.

## 5) Scheduling Linkage and Apply Orchestration

- [ ] Generate scheduled events from relative offsets during apply.
- [ ] Persist schedule-content linkage and template lineage metadata transactionally.
- [ ] Ensure reschedule operations preserve linkage identity correctly.
- [ ] Add reconciliation path for missing linkage records if needed.

## 6) Third-Party Import (Phase 7.3)

- [ ] Implement FIT import endpoint and parser adapter.
- [ ] Implement ZWO import endpoint and parser adapter.
- [ ] Extend iCal schedule import contract for Phase 7 compatibility.
- [ ] Implement parse-normalize-validate-dedupe-persist pipeline.
- [ ] Enforce import security controls (size, timeout, URL policy, sanitization).

## 7) Mobile UX Integration

- [ ] Add save-as-template actions in relevant training plan and collection screens.
- [ ] Add template discovery and filtering UI.
- [ ] Add template preview and apply flow.
- [ ] Add FIT/ZWO import UI entry points and status reporting.
- [ ] Add first-time hierarchy explainer and persistent dismissal state.

## 8) Tests

- [ ] Core tests for copy-on-apply immutability.
- [ ] Core tests for offset scheduling and timezone edge cases.
- [ ] TRPC tests for template apply transactionality and lineage persistence.
- [ ] TRPC tests for FIT/ZWO/iCal idempotency and malformed input handling.
- [ ] Mobile tests for template apply and import UX success/failure states.
- [ ] Regression tests for existing Phase 6 calendar flows.

## 9) Quality Gates

- [ ] `pnpm --filter core check-types`
- [ ] `pnpm --filter core test`
- [ ] `pnpm --filter trpc check-types`
- [ ] `pnpm --filter trpc test`
- [ ] `pnpm --filter mobile check-types`
- [ ] `pnpm --filter mobile test`

## 10) Completion Criteria

- [ ] All sections 0-9 complete.
- [ ] `design.md` acceptance criteria satisfied.
- [ ] Existing Phase 6 schedule behavior remains functional.
- [ ] Template apply immutability and import idempotency validated end-to-end.

(End of file)
