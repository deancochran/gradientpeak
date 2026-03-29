# Tasks

## Coordination Notes

- Keep this spec focused on completed historical activity import only.
- Do not expand into workout template imports in this pass.
- Do not introduce complex orchestration, retry, or broad dedupe systems unless the implementation proves they are truly required.
- The core decision surface is how imported activities affect `activities`, `activity_efforts`, and `profile_metrics`.
- All derived calculations must follow time-causal rules: an activity can only see prior state at or before its timestamp.
- Prefer dynamic read-time calculations for stale-prone threshold-dependent values instead of persisting them back onto activities.
- Current implementation kickoff is `FIT` only; `TCX`, `GPX`, `ZWO`, and other formats stay deferred.

## Open

### Phase 1 - Narrow Import Contract

- [x] Define the first-pass mobile entry point for historical activity import.
- [x] Define the first-pass backend parse-and-store contract for `FIT`, with later formats deferred.
- [x] Define and implement the minimal provenance required for a manually imported historical activity so it is distinguishable from recorded FIT uploads and preserves source file metadata explicitly.
- [x] Confirm whether the first pass extends `packages/trpc/src/routers/fit-files.ts` or adds a small dedicated import router.

### Phase 2 - Parse And Store

- [x] Add file-based historical activity import entry in `apps/mobile/app/(internal)/(standard)/integrations.tsx`.
- [x] Add supported file picking, submit, and clear success/failure states.
- [x] Parse supported files into a normalized activity shape.
- [x] Persist imported historical activities as canonical `activities` rows.
- [x] Add focused tests for supported-type validation and parse-and-store behavior.

### Phase 3 - Downstream State Policy

- [x] Define and implement when imported activities should create `activity_efforts`.
- [x] Define and implement when imported activities should append inferred `profile_metrics`.
- [x] Define and implement the as-of timestamp lookup rule for thresholds, efforts, and inferred metrics used during import calculations.
- [x] Define the shared dynamic activity-analysis payload shape used by routers and mobile consumers.
- [x] Add the first-cut `activityDerivedMetricsSchema` and `activityListDerivedSummarySchema` in `packages/core/activity-analysis/contracts.ts` and export them through `@repo/core`.
- [x] Extend `activities.getById`, `activities.list`, and `activities.listPaginated` with a `derived` payload instead of returning stale-prone dynamic values on raw activity rows.
- [x] Implement the first-cut response-shape change on `activities.getById` before list/feed migrations.
- [x] Follow the first-PR scope in `design.md`: schemas + context helper + response mapper + `activities.getById` + `activity-detail.tsx`, with list/feed/home/trends/schema-removal explicitly deferred.
- [x] Identify which current activity-level derived fields should stop being treated as stored truth because they become stale after backfill.
- [x] Remove these stale-prone `activities` columns in the migration: `training_stress_score`, `intensity_factor`, `trimp`, `trimp_source`, `training_effect`, `hr_zone_1_seconds` through `hr_zone_5_seconds`, and `power_zone_1_seconds` through `power_zone_7_seconds`.
- [x] Define dynamic calculation behavior for threshold-dependent stress/load views so out-of-order imports stay correct without later activity rewrites.
- [x] Follow the implementation order in `design.md`: dynamic payload shape -> write-path cleanup -> dynamic read helpers -> router migrations -> mobile migrations -> schema migration -> type regeneration.
- [x] Update `packages/trpc/src/routers/home.ts`, `packages/trpc/src/routers/trends.ts`, and `packages/trpc/src/routers/profiles.ts` to stop reading removed stress fields directly from `activities`.
- [x] Add shared helpers for `resolveActivityContextAsOf`, `analyzeActivityDerivedMetrics`, `buildDynamicStressSeries`, `buildDynamicIntensitySeries`, and response mapping.
- [x] Start with the exact first helper signatures defined in `design.md` and keep the first implementations intentionally narrow.
- [x] Place pure dynamic analysis contracts/calculations in `packages/core/activity-analysis/*` and DB-backed orchestration helpers in `packages/trpc/src/lib/activity-analysis/*`.
- [x] Update `packages/trpc/src/routers/planning/training-plans/base.ts`, `packages/core/calculations/training-quality.ts`, and `packages/core/plan/deriveCreationContext.ts` to stop depending on stored zone-second and TSS/IF activity columns.
- [x] Update `packages/trpc/src/routers/fit-files.ts` and `apps/mobile/lib/hooks/useActivitySubmission.ts` so write payloads stop persisting removed columns.
- [x] Update `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`, `apps/mobile/app/(internal)/(standard)/activities-list.tsx`, `apps/mobile/components/feed/ActivityFeedItem.tsx`, and `apps/mobile/components/ActivityListModal.tsx` to consume dynamic derived values or remove stale-prone displays.
- [x] Start the UI migration with `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`, consuming `activityData.activity` and `activityData.derived` before changing list/feed surfaces.
- [x] Remove or defer `sort_by: "tss"` in `activities.listPaginated` unless a dedicated dynamic sort path is introduced.
- [x] Remove stale-prone derived columns from the database schema once the dynamic read-time model is adopted.
- [x] Generate the schema migration with the Supabase CLI.
- [x] Apply the schema migration with `supabase migration up`.
- [x] Regenerate database types with `pnpm run update-types` after the migration is applied.
- [x] Confirm required refresh/invalidation behavior for activity-driven views like home and trends.
- [x] Add focused regression tests for the approved `activity_efforts` and `profile_metrics` side effects.
- [x] Add regression tests proving older imports cannot use future-derived state and that later dynamic reads incorporate the older history correctly.

### Phase 4 - Documentation And References

- [x] Update `apps/mobile/docs/INTERACTION_INVENTORY.md` to reflect the real historical activity import flow.
- [ ] Update `.opencode/instructions/project-reference.md` only if the narrow import path becomes a stable architecture pattern.
- [ ] Decide later whether broader release documentation is needed once the feature ships.

## Pending Validation

- [x] Run focused mobile tests for the integrations/import screen changes.
- [x] Run focused `packages/trpc` tests for parse-and-store behavior and downstream side effects.
- [x] Verify generated Supabase types reflect the migrated schema after `pnpm run update-types`.
- [x] Run the narrowest relevant typecheck/test commands for touched packages before handoff.

## Completed Summary

- Narrowed the historical import spec to focus on manual completed-activity upload, parsing, canonical activity storage, and explicit policy for how imports affect `activity_efforts` and `profile_metrics`.
- Implementation prep review completed: the safest first PR is still the `activities.getById` + `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` `derived` contract slice; no validation was run in that review-only pass, and the remaining prep gaps for the later import surface are FIT provenance storage shape plus how non-FIT detail/stream behavior should work once other formats are reintroduced.
- First PR slice landed for the dynamic read model: `packages/core/activity-analysis/*` now defines shared derived contracts plus a narrow pure analysis helper, `packages/trpc/src/lib/activity-analysis/*` now resolves as-of context and maps responses, `packages/trpc/src/routers/activities.ts` now returns `{ activity, has_liked, derived }` from `getById`, and `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` now reads TSS/IF/zones from `derived` instead of stale-prone raw activity columns.
- FIT-only mobile import UI is now live in `apps/mobile/app/(internal)/(standard)/integrations.tsx`: users can pick a `.fit` file, review basic file metadata, enter activity name/notes/type, upload through the existing signed FIT storage flow, process the file through `fitFiles.processFitFile`, invalidate activity/home/trends queries, and jump directly to the imported activity detail screen.
- Implementation prep review refreshed the current vision and migration surface: the spec still aims for FIT-first manual imports backed by canonical `activities` storage, minimal provenance, and time-causal dynamic derived reads; the main remaining execution hotspots are provenance/storage policy in `fit-files`, dynamic list/feed/home/trends/planning migrations off stale `activities` columns, generated Supabase type fallout, and the follow-up doc update in `apps/mobile/docs/INTERACTION_INVENTORY.md`. No validation was run in this review-only pass.
- Dynamic derived summaries now flow through list/feed/load surfaces: `activities.list` and `activities.listPaginated` return `derived` summaries, `feed.getFeed`, `home.getDashboard`, `trends`, and `profiles.getStats` no longer read persisted TSS/IF columns directly, `fit-files.processFitFile` and `useActivitySubmission` stop writing stale-prone stress/zone columns, and the mobile activity list/feed/trends modal consume `derived` values instead of raw activity stress fields.
- Follow-up audit/implementation pass completed after the schema migration and regenerated types: `packages/core/calculations/training-quality.ts` now accepts dynamic zone payloads, `packages/core/plan/deriveCreationContext.ts` forwards those richer signals, `packages/trpc/src/routers/home.ts` and `packages/trpc/src/routers/trends.ts` now compute rolling training quality and workload envelopes from dynamic derived TSS/IF values, and `packages/trpc/src/routers/feed.ts` no longer selects the removed `activities.comments_count` column, instead rebuilding comment counts from the `comments` table for feed responses.
- Historical FIT import processing is now time-causal on the write path too: `packages/trpc/src/routers/fit-files.ts` resolves baseline metrics and prior best-effort FTP context only as of the imported activity completion timestamp, stamps imported `activity_efforts` and inferred `profile_metrics` at that historical completion time, and no longer creates notifications as a side effect. Focused router coverage in `packages/trpc/src/routers/__tests__/fit-files.test.ts` now locks those historical-import side-effect rules in place.
- Completion pass landed for the remaining spec gaps: `activities` now persist explicit manual-import provenance (`import_source`, `import_file_type`, `import_original_file_name`) through a new Supabase migration and regenerated types, `apps/mobile/app/(internal)/(standard)/integrations.tsx` now sends that provenance when importing historical FIT files, focused Jest coverage now exercises the integrations import flow, and the derived-analysis regression suite now explicitly proves later dynamic reads incorporate older backfilled history without rewriting later activity rows.
