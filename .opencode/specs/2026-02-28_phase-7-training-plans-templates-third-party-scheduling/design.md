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
2. Add only one essential new table in MVP (`library_items`).
3. Prefer adding columns/indexes over introducing new relational structures.
4. Keep Phase 6 event/calendar behavior fully compatible.
5. Prefer query simplicity over abstraction depth (no complex multi-join listing paths in MVP).

### Scope resolution rules (authoritative)

1. If any older note conflicts with this document, this document wins.
2. Items listed under "Deferred" are explicit non-requirements for Phase 7 MVP.
3. Phase 7 MVP must not include schema cutovers for existing sync paths (`synced_events`, iCal identity on `events`).

## Future-Proofing Contract (Locked in Phase 7)

Phase 7 must ship MVP behavior now while preserving a low-friction path to a future mixed-content Discover experience.

### Required future-proof decisions

1. Keep canonical entities as source of truth (`training_plans`, `activity_plans`, `events`).
2. Introduce stable, shared content identity contracts now (type + id).
3. Keep list/query APIs behind lightweight abstraction boundaries so implementation can swap from direct table reads to a discover index later.
4. Defer unified discover indexing to a later phase, but ensure no Phase 7 schema choice blocks it.

### Stable ID and content-type contract

- Every listable entity must expose:
  - `content_type` (MVP: `training_plan` | `activity_plan`)
  - `content_id` (UUID from canonical table)
  - `owner_profile_id` (or null for system templates)
  - `visibility` (`private` | `public`)
- Phase 7 APIs should return these normalized fields even when backed by different tables.

### Lightweight abstraction boundary

- Keep per-type list endpoints for MVP performance.
- Standardize the query/input shape now (cursor, limit, filters) so later mixed discover can reuse the contract without breaking mobile clients.
- Treat `library_items` as a membership/pointer table only; do not duplicate content payload there.

## Performance and Query Simplicity Rules (MVP)

1. Keep listing queries to one primary table plus at most one join.
2. Avoid polymorphic UNION queries for mixed content lists.
3. Use dedicated endpoints per content type (`training_plan` and `activity_plan`) instead of one heavy mixed query.
4. Use indexed two-step reads for saved content when needed:
   - step 1: fetch IDs from `library_items`
   - step 2: fetch entities by `id in (...)` from target table
5. Keep sort keys index-backed (`created_at`, `updated_at`, and `profile_id` filters).
6. Maintain idempotency using existing unique constraints to avoid duplicate scan/cleanup work.

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
- Add one lineage column to `events` (`schedule_batch_id`) to support apply/remove behavior without new schedule tables.

## Minimal Database Adjustments (MVP)

### Reused as-is

- `training_plans`
- `activity_plans`
- `events`
- `synced_events` and existing iCal identity constraints

### New tables (essential only)

- `library_items` for user saved content pointers.

### New columns (additive, bare minimum)

- `training_plans`:
  - `template_visibility` (`private` | `public`)
- `activity_plans`:
  - `template_visibility` (`private` | `public`)
  - `import_provider` (short text, nullable)
  - `import_external_id` (short text, nullable)
- `events`:
  - `schedule_batch_id` (UUID)

Notes:

- Keep existing `is_system_template` / system-template semantics; do not add a second system flag.
- Keep existing event import identity columns as-is (`source_provider`, `integration_account_id`, `external_calendar_id`, `external_event_id`, `occurrence_key`) for iCal behavior/idempotency.
- Do not add optional discovery enrichment columns in Phase 7 MVP.

### Deferred (explicitly not in Phase 7)

- No `content_catalog`/discover index table in this phase.
- No polymorphic mixed-content feed query in this phase.
- No coach/club content tables in this phase.
- No extra template metadata columns (sport, ability, weeks, popularity) in this phase.
- No `provider_sync_records` table in this phase.
- No `template_source` / `template_source_id` columns in this phase.
- No `events.schedule_source_id` column in this phase.
- No `synced_events` replacement/cutover in this phase.
- No dual-write/backfill migration from `synced_events` into any new sync registry in this phase.

### Required indexes (performance-focused)

- `library_items(profile_id, item_type, created_at desc)` for saved lists.
- `library_items(item_type, item_id)` for reverse lookup and cleanup.
- `training_plans(profile_id, is_active)` already exists and remains primary for user plan listing.
- `activity_plans(profile_id, import_provider, import_external_id)` partial unique index for import dedupe.
- `events(profile_id, schedule_batch_id)` for apply/remove batch operations.

## Ownership and Visibility (MVP Enforcement Model)

Ownership and visibility must be explicit in schema and consistently enforced by API auth/query boundaries.

### Ownership rules

1. User-owned records must always carry `profile_id` (`activity_plans`, user `training_plans`, `library_items`, `events`).
2. Platform/system templates are represented explicitly (`is_system_template = true` and `profile_id is null`) in existing tables.
3. Foreign-key relationships must preserve owner scope through constrained references and query filters.

### Visibility rules

1. Template visibility is a database field (private/public for MVP).
2. Private templates are readable only by owner (or service role/admin paths).
3. Public templates are readable by authenticated users.
4. Write/update/delete operations are always owner-only (except service role/admin).

### Enforcement mechanisms required in MVP

- Check constraints for ownership/visibility consistency.
- Service-role backend enforcement in protected procedures (`profile_id = ctx.session.user.id` on mutable paths).
- Indexes aligned to hot predicates (`profile_id`, `template_visibility`, `is_system_template`).

### Explicit non-requirement for Phase 7 MVP

- Row Level Security policy rollout is deferred in this phase because the current architecture uses service-role server access plus protected tRPC procedures.

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
- User can browse/filter templates by visibility and owner scope.
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
   - Verify: created events have batch metadata and expected date offsets.

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
- Listing paths must stay simple enough for predictable query plans and straightforward API maintenance.
- Ownership/visibility are enforced by constraints + protected API access in this phase; RLS rollout is deferred.

## Acceptance Criteria

1. Template save, browse, apply, and library save are functional for `training_plan` and `activity_plan`.
2. Applying template creates schedule events with `schedule_batch_id` traceability.
3. FIT and ZWO imports create or update native activity plan templates idempotently.
4. iCal behavior remains read-only and idempotent.
5. One essential new table is introduced (`library_items`), with other changes additive columns/indexes.
6. Existing Phase 6 tests continue to pass.
7. Saved content listing uses index-backed simple query paths (no multi-join polymorphic query requirement).
8. Ownership and visibility access is validated via schema constraints + protected API paths.
9. Phase 7 API contracts expose stable content identity fields that are compatible with a future discover index.
10. Existing iCal/Wahoo sync behaviors remain intact without introducing a new sync registry table.

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
