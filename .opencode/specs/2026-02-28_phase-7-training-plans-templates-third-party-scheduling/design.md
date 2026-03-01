# Phase 7 Specification - Training Plans, Templates, and Third-Party Scheduling

Date: 2026-02-28
Owner: Mobile + Backend + Core Logic + QA
Status: Draft (research-backed, MVP-first)
Type: Training hierarchy formalization, template system, and import pipeline

## Executive Summary

Phase 7 builds on the completed Phase 6 calendar/event foundation and introduces a practical MVP for:

- Canonical training hierarchy behavior (training plan -> phase -> collection/block -> activity plan/workout)
- Save/apply template workflows for training plans and collections
- Third-party import paths for FIT planned workouts, ZWO workouts, and iCal schedule ingestion

The design prioritizes additive schema evolution, backward compatibility with current calendar flows, and strict copy-on-apply immutability so template changes never mutate applied athlete instances.

## Scope

### In Scope

- Lock and enforce Phase 7 terminology and hierarchy semantics in API and UI copy.
- Introduce MVP template metadata and apply mechanics for training plans and collections.
- Add database-safe lineage and linkage patterns for template application and calendar scheduling.
- Implement import pipeline contracts and normalization strategy for FIT, ZWO, and iCal inputs.
- Ensure idempotent dedupe/update behavior for imports and safe validation boundaries.

### Out of Scope

- Full coach collaboration UX and permission flows (Phase 10).
- Production-grade async outbox/worker infrastructure (post-MVP hardening).
- Full bitemporal history or advanced branching template workflows.
- Provider-specific OAuth scheduling imports for every third-party platform.

## Research Synthesis (Best Practices)

### Industry Pattern Alignment (Conceptual)

Public product behavior across major platforms (TrainingPeaks, TrainerRoad, Zwift, Garmin ecosystems) converges on these practices:

1. Reusable workout definitions are independent from scheduled instances.
2. Plans/blocks are reusable assets, while applied schedules are independent copies.
3. Imported records require stable external identity keys and idempotent upsert behavior.
4. Calendar scheduling stays operationally simple when event instances remain the source of truth.

### Database Design Best Practices Applied

- Keep scheduling entities and definition entities separate.
- Use explicit many-to-many join tables for reusable composition.
- Use immutable template versions or lineage markers for historical correctness.
- Add additive linkage tables rather than overloading existing event records.
- Enforce uniqueness via source identity keys and partial unique indexes for active rows.
- Keep row-level security and tenant/user ownership constraints explicit and index-backed.

## MVP Architecture Decisions

1. `events` remains the authoritative scheduled instance model from Phase 6.
2. Add `event_plan_links` (additive) to capture semantic linkage:
   - link target type (`activity_plan`, `collection_item`, `training_plan_session`)
   - source lineage (`template_source_id`, `template_version`, `generated_by`)
3. Template apply is copy-on-apply:
   - applying template creates new independent user-owned plan/collection instances
   - source template records are never mutated by downstream edits
4. Imports normalize all formats into one internal envelope before persistence.
5. iCal remains read-only import schedule source; FIT and ZWO become native workout definitions.

## Data Model Requirements (Conceptual)

The implementation must represent, at minimum:

- Template metadata: name, description, sport, ability, visibility, likes count.
- Template lineage/version identity: stable reference to source and version at apply time.
- Reuse composition:
  - activity plans reusable across collections
  - collections reusable across training plans
- Scheduling linkage:
  - scheduled event references content identity without collapsing event and definition concepts
- Import identity:
  - source type, source reference, external id, optional occurrence id, semantic hash
- Auditability:
  - created/updated timestamps and actor identity on mutable records
- Soft deletion for mutable records where historical trace is required.

## Functional Requirements

### A) Phase 7.1 - Hierarchy Clarity

- UI terminology is consistent for workout/activity plan, collection/training block, training plan, and template.
- First-time creation flow includes concise hierarchy explainer with dismiss capability.
- API contracts and payload naming use consistent hierarchy semantics.

### B) Phase 7.2 - Template Workflows

- User can save a training plan or collection as template.
- Template save strips absolute dates and keeps relative offsets.
- User can mark template visibility private/public.
- User can browse/filter/search templates by sport, duration, ability, popularity.
- User can apply template by start date or goal date.
- Apply produces independent instance with lineage metadata and no shared mutable references.

### C) Phase 7.3 - Third-Party Import

- FIT import path converts supported planned workout structures to native activity plans.
- ZWO import path converts XML workout structures to native activity plans.
- iCal import path maps schedule entries to read-only calendar events with idempotent updates.
- Import pipeline validates structure, semantics, and policy constraints before persistence.
- Duplicate prevention uses stable external identity and semantic hash keys.

## Non-Functional Requirements

- Backward compatibility with existing Phase 6 calendar behavior.
- Type-safe contracts via shared `@repo/core` schemas.
- Deterministic import handling and explicit diagnostics for invalid inputs.
- Security controls for file and URL imports (size, timeout, SSRF defense, sanitization).
- Performance baseline acceptable for mobile-triggered imports and template apply workflows.

## Acceptance Criteria

1. Template apply is copy-on-apply and does not mutate source templates.
2. Relative scheduling offsets map correctly to absolute calendar dates.
3. `event_plan_links` (or equivalent additive linkage) preserves schedule-content identity.
4. FIT/ZWO/iCal imports are idempotent, validated, and observable with clear error states.
5. Public/private template visibility and filtering work for MVP discovery needs.
6. Existing planned-workout scheduling flows remain functional.

## Exit Criteria

- `tasks.md` checklist complete for MVP sections.
- Required test suite for core/trpc/mobile Phase 7 contracts passes.
- Import reliability, dedupe behavior, and timezone handling verified on representative fixtures.

## References

- PostgreSQL Constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL Indexes: https://www.postgresql.org/docs/current/indexes.html
- PostgreSQL Partial Indexes: https://www.postgresql.org/docs/current/indexes-partial.html
- PostgreSQL Row Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- TrainingPeaks (product behavior reference): https://www.trainingpeaks.com/
- TrainerRoad Plans (product behavior reference): https://www.trainerroad.com/features/training-plans
- `fit-file-parser` package info: https://www.npmjs.com/package/fit-file-parser
- `fast-xml-parser` package info: https://www.npmjs.com/package/fast-xml-parser
- `node-ical` package info: https://www.npmjs.com/package/node-ical

(End of file)
