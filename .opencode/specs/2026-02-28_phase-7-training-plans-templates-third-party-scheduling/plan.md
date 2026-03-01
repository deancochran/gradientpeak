# Technical Implementation Plan - Phase 7 Training Plans, Templates, and Third-Party Scheduling

Date: 2026-02-28
Status: Ready for implementation
Owner: Mobile + Backend + Core Logic + QA
Inputs: `design.md`

## 1) Architecture and Ownership

- `packages/core`:
  - define/extend schemas for hierarchy entities, template metadata, apply commands, and import envelope
  - centralize pure rules for relative offset scheduling, copy-on-apply validation, and import normalization checks
- `packages/trpc`:
  - add template save/list/search/apply endpoints and linkage-aware scheduling orchestration
  - add FIT/ZWO import endpoints and integrate with existing iCal pipeline
  - enforce idempotency keys, dedupe semantics, and source-specific read-only protections
- `packages/supabase`:
  - additive schema updates for template metadata/lineage/linkage/import tracking tables and indexes
  - preserve existing event model as schedule source of truth
- `apps/mobile`:
  - terminology updates, onboarding explainer, template browse/apply flows, import entry points, and status UX

## 2) Contract Lock Before Implementation

1. `events` remains canonical scheduled instance model.
2. Linkage between schedule and content is additive and explicit (`event_plan_links` or equivalent).
3. Template apply is copy-on-apply and immutable with source lineage tracking.
4. Relative offsets are deterministic and timezone-safe when projected to dates.
5. iCal imports remain read-only; FIT/ZWO imports create native definitions.
6. Import operations are idempotent and externally identifiable.

## 3) Workstreams

### A) Hierarchy and Terminology Freeze (Phase 7.1)

- Lock terminology mapping in product copy and API contracts.
- Add concise onboarding explainer in first-time training plan flow.
- Verify naming consistency in route labels, mutation names, and schema types.

### B) Data Model Additions (MVP)

- Add template metadata and visibility fields.
- Add template lineage/version fields required for apply-time source tracing.
- Add schedule-content linkage table/fields for event semantic linkage.
- Add import job and import identity tracking entities.
- Add indexes and constraints for uniqueness, query performance, and active-row semantics.

### C) Core Contract and Rule Layer

- Add Zod schemas for template apply command/result.
- Add schema/rule module for relative offset projection.
- Add normalized import envelope schema for FIT/ZWO/iCal adapters.
- Add explicit error taxonomies for invalid hierarchy, invalid offsets, and import policy violations.

### D) Template API and Apply Orchestration (Phase 7.2)

- Implement template save/list/search endpoints (private/public visibility).
- Implement template preview endpoint (duration, phase breakdown, sample week/TSS summary where available).
- Implement apply endpoint:
  - clone source to user-owned instance
  - generate scheduled events from relative offsets
  - persist linkage rows and lineage metadata transactionally

### E) Import API and Adapter Pipeline (Phase 7.3)

- Add FIT file ingest endpoint and adapter.
- Add ZWO file ingest endpoint and adapter.
- Reuse/extend iCal feed strategy from Phase 6 for schedule import continuity.
- Implement parse -> normalize -> validate -> dedupe -> persist pipeline with diagnostics.

### F) Mobile UX and Flow Integration

- Add template discovery/apply UI and filters.
- Add save-as-template actions on training plan and collection views.
- Add import entry points for FIT and ZWO files.
- Add robust import result UI (created/updated/skipped/failed counts).

### G) QA, Reliability, and Observability

- Add contract tests for copy-on-apply immutability.
- Add relative-offset scheduling tests (including timezone edge cases).
- Add parser/normalizer tests for FIT/ZWO/iCal malformed and duplicate scenarios.
- Add telemetry events/metrics for apply success, import failures, dedupe counts, timezone fallback.

## 4) Validation and Quality Gates

- `pnpm --filter core check-types`
- `pnpm --filter core test`
- `pnpm --filter trpc check-types`
- `pnpm --filter trpc test`
- `pnpm --filter mobile check-types`
- `pnpm --filter mobile test`

## 5) Test Strategy (MVP Minimum Suite)

- Core: copy-on-apply contract and offset projection contract tests.
- TRPC: template apply transactionality, lineage persistence, and import idempotency tests.
- Mobile: template apply flow, import flow (success/failure), and schedule rendering correctness.
- Regression: existing calendar/planned-workout behavior from Phase 6 remains intact.

## 6) Rollout Notes

- Ship in additive slices to reduce migration risk:
  1. contract lock and schema additions
  2. template read/write and preview
  3. apply orchestration and schedule linkage
  4. FIT/ZWO import endpoints and mobile UX
  5. stabilization, telemetry-based hardening
- Use feature flags if needed for import adapters while template core ships.
- Keep import parser choices replaceable behind adapter interfaces.

(End of file)
