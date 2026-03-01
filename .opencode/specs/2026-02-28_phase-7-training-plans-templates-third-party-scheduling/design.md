# Phase 7 Specification - Training Plans, Templates, and Third-Party Scheduling (MVP)

Date: 2026-02-28
Owner: Mobile + Backend + Core Logic + QA
Status: Draft (MVP-only)
Type: Additive enhancement to existing training/calendar systems

## Executive Summary

This Phase 7 MVP keeps the existing architecture intact and adds only the minimum required to deliver the promised user-facing behavior:

- A clear content model (workouts/activity plans and training plans as reusable definitions)
- A lightweight library model (save templates for quick reuse)
- A schedule model (events as materialized calendar instances)
- Practical import paths (FIT, ZWO, iCal) with idempotent behavior

The implementation goal is: maximize user value with minimal schema change and minimal new tables.

## Guiding MVP Constraints

1. Reuse existing tables/routes where possible.
2. Add only one new table unless absolutely necessary.
3. Prefer adding columns/indexes over introducing new relational structures.
4. Keep Phase 6 event/calendar behavior fully compatible.

## MVP Product Model (Aligned to Requested Approach)

### Content Layer (already exists, reused)

- `activity_plans`: atomic workout/activity templates.
- `training_plans`: higher-level plan templates and user plans.
- `training_plans.structure` remains the source for ordered offsets and blocks.

### Library Layer (new, minimal)

- New `library_items` table stores saved pointers to reusable content.
- Supports saving `activity_plan` and `training_plan` only in MVP.
- No nested playlists in MVP (avoids recursion/cycle complexity).

### Calendar Layer (already exists, extended)

- `events` remains canonical schedule surface.
- Add small lineage columns to `events` (batch/source metadata) to support apply/remove behavior without new schedule tables.

## Minimal Database Adjustments (MVP)

### Reused as-is

- `training_plans`
- `activity_plans`
- `events`
- `synced_events` and existing iCal identity constraints

### New table (exactly one)

- `library_items` for user saved content pointers.

### New columns (additive)

- `training_plans`: template metadata for discovery and lineage.
- `activity_plans`: template metadata + import identity metadata.
- `events`: schedule batch/source fields to support apply/remove and traceability.

## Functional Requirements (MVP)

### A) Phase 7.1 - Hierarchy Clarity

- UI and API use consistent terms:
  - Workout / Activity Plan
  - Training Plan
  - Template
  - Schedule
- First-time training plan flow includes a concise explainer and dismiss flag.

### B) Phase 7.2 - Templates and Library

- User can save training plans and activity plans as templates.
- Template visibility supports `private` and `public`.
- User can browse/filter templates by sport, duration, and ability level.
- User can save template pointers to personal library.
- Applying a template creates independent schedule instances (copy-on-apply behavior in practice).

### C) Phase 7.3 - Third-Party Scheduling and Import

- FIT import converts supported planned workout structures into native `activity_plans`.
- ZWO import converts supported XML workout structures into native `activity_plans`.
- iCal remains feed-based and maps to read-only imported `events`.
- Imports are idempotent via source identity and/or content hash.

## User Stories and Verification (Required)

1. As an athlete, I can save my training plan as a template and reuse it later.
   - Verify: template appears in template list and can be applied again.

2. As an athlete, I can discover public templates and save them to my library.
   - Verify: library contains pointer, no duplicate row (`UNIQUE` on user/item/type).

3. As an athlete, I can apply a template by start date and see calendar events generated.
   - Verify: created events have batch/source metadata and expected date offsets.

4. As an athlete, I can remove one applied schedule without deleting source templates.
   - Verify: delete by schedule batch removes events only, source template rows remain.

5. As an athlete, I can import FIT and ZWO workouts into my native workout library.
   - Verify: duplicate import updates/skips via dedupe key, no duplicate templates.

6. As an athlete, I can subscribe to iCal feed and see read-only imported events.
   - Verify: imported events remain non-editable in user mutation paths.

7. As an existing user, my Phase 6 plan/calendar flows keep working.
   - Verify: existing event CRUD tests pass unchanged.

## Non-Functional Requirements

- Backward compatible with current routers and mobile screens.
- Strict input validation with shared schemas in `@repo/core`.
- Import safety controls: URL validation, timeout, size limit, malformed-file handling.
- Query performance preserved via targeted indexes only.

## Acceptance Criteria

1. Template save, browse, apply, and library save are functional for `training_plan` and `activity_plan`.
2. Applying template creates schedule events with source/batch traceability.
3. FIT and ZWO imports create or update native activity plan templates idempotently.
4. iCal behavior remains read-only and idempotent.
5. Only one new table is introduced (`library_items`), with other changes additive columns/indexes.
6. Existing Phase 6 tests continue to pass.

## Exit Criteria

- `tasks.md` MVP checklist complete.
- All listed quality gates pass.
- User stories above verified in test or manual QA notes.

## References

- PostgreSQL Constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL Indexes: https://www.postgresql.org/docs/current/indexes.html
- PostgreSQL Partial Indexes: https://www.postgresql.org/docs/current/indexes-partial.html
- TrainingPeaks (behavior reference): https://www.trainingpeaks.com/
- TrainerRoad plans (behavior reference): https://www.trainerroad.com/features/training-plans
- `fit-file-parser`: https://www.npmjs.com/package/fit-file-parser
- `fast-xml-parser`: https://www.npmjs.com/package/fast-xml-parser
- `node-ical`: https://www.npmjs.com/package/node-ical

(End of file)
