# Spec Audit

## Audit Goal

Review the narrowed historical import specification and confirm that it stays scoped to parse-and-store behavior plus a simple, dynamic downstream-state model for `activity_efforts`, `profile_metrics`, and threshold-dependent read-time calculations.

## Assumptions

- The first implementation only covers completed historical activity files.
- The first implementation does not include workout template import.
- The first implementation does not require a broad job-orchestration or dedupe subsystem.
- Existing activity-driven views continue to read from canonical `activities`.

## Scope Review

### Scope now matches the requested constraint

- The spec is now centered on upload, parse, and store.
- Broader template-import and generalized orchestration work was removed from active scope.
- The remaining design emphasis is on determining the effect on `activities`, `activity_efforts`, and `profile_metrics`.

### Correctly retained complexity

- The spec still calls for explicit policy around `activity_efforts` creation.
- The spec still calls for explicit policy around inferred `profile_metrics` creation.
- The spec still calls out that home/trends should preferably benefit through existing `activities` reads rather than new infrastructure.
- The spec now correctly captures the time-causal requirement: imported activities must only use prior state at or before their timestamp.
- The spec now intentionally avoids a full later-activity recomputation requirement by moving stale-prone threshold-dependent values toward dynamic reads.
- The spec now also correctly requires schema cleanup so removed derived activity fields do not survive as misleading database truth.

## Affected Code References

- `apps/mobile/app/(internal)/(standard)/integrations.tsx`
- `apps/mobile/app/(internal)/(standard)/_layout.tsx`
- `apps/mobile/app/(internal)/(standard)/route-upload.tsx`
- `apps/mobile/lib/hooks/useActivitySubmission.ts`
- `packages/trpc/src/routers/fit-files.ts`
- `packages/trpc/src/routers/activities.ts`
- `packages/trpc/src/routers/activity_efforts.ts`
- `packages/trpc/src/routers/profile-metrics.ts`
- `packages/trpc/src/routers/home.ts`
- `packages/trpc/src/routers/trends.ts`

## Current `fit-files.ts` Reuse Audit

### Reuse candidates

- `getSignedUploadUrl` style direct-to-storage upload flow is a good fit for manual historical import.
- `processFitFile` already contains the core FIT parse-and-store backbone: storage download, `parseFitFileWithSDK`, summary extraction, and canonical `activities` insertion.
- The existing best-effort insertion logic is a reasonable starting point for high-fidelity FIT imports.
- The current `detectLTHR` append-to-`profile_metrics` behavior is a reasonable candidate to keep, but only as an explicitly approved side effect.

## Explicit Schema Recommendation

The spec now makes the column split explicit.

### Keep on `activities`

- raw and summary facts such as timestamps, duration, distance, avg/max HR, avg/max power, cadence, speed, calories, elevation, swim metrics, device metadata, map/file fields, and social metadata
- activity-local derived metrics that do not depend on threshold history, such as `normalized_power`, `normalized_speed_mps`, `normalized_graded_speed_mps`, `efficiency_factor`, and `aerobic_decoupling`

### Remove from `activities`

- `training_stress_score`
- `intensity_factor`
- `trimp`
- `trimp_source`
- `training_effect`
- `hr_zone_1_seconds` through `hr_zone_5_seconds`
- `power_zone_1_seconds` through `power_zone_7_seconds`

These removals align the schema with the MVP dynamic model so stale-prone threshold-dependent values are not preserved as false database truth.

## Most Impacted References

The highest-risk follow-up files after the migration are:

- `packages/trpc/src/routers/home.ts`
- `packages/trpc/src/routers/trends.ts`
- `packages/trpc/src/routers/profiles.ts`
- `packages/trpc/src/routers/planning/training-plans/base.ts`
- `packages/trpc/src/routers/fit-files.ts`
- `packages/core/calculations/training-quality.ts`
- `packages/core/plan/deriveCreationContext.ts`
- `apps/mobile/lib/hooks/useActivitySubmission.ts`
- `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
- `apps/mobile/app/(internal)/(standard)/activities-list.tsx`
- `apps/mobile/components/feed/ActivityFeedItem.tsx`
- `apps/mobile/components/ActivityListModal.tsx`
- `packages/supabase/database.types.ts`
- `packages/supabase/supazod/schemas.ts`

These should be treated as the primary migration breakpoints once the schema is changed.

## Execution Guidance Added

The spec now includes two additional implementation aids:

- a recommended implementation order that reduces schema-migration breakage risk
- explicit dynamic payload sketches for `activity-detail`, list/feed surfaces, `home`, `trends`, and planning consumers

This makes the migration path more actionable without expanding the product scope.

## Concrete Contract Guidance Added

The spec now also defines:

- a concrete direction for extending `activities.getById`, `activities.list`, and `activities.listPaginated` with `derived` payloads
- a helper plan for `resolveActivityContextAsOf`, `analyzeActivityDerivedMetrics`, `buildDynamicStressSeries`, `buildDynamicIntensitySeries`, and response mapping
- an MVP recommendation to remove or defer DB-backed `sort_by: "tss"` in paginated activity lists unless a dedicated dynamic sort path is built

## File Placement Guidance Added

The spec now also separates helper ownership clearly:

- pure dynamic analysis contracts/calculations belong in `packages/core/activity-analysis/*`
- Supabase-backed context resolution, series builders, and response mappers belong in `packages/trpc/src/lib/activity-analysis/*`

It also now recommends `activities.getById` as the first router response-shape migration so mobile detail can switch to `derived` values before broader list/feed changes.

## First-Cut Schema Guidance Added

The spec now includes:

- an exact first-cut Zod schema for `activityDerivedMetricsSchema` and `activityListDerivedSummarySchema`
- a focused first implementation diff that changes `activities.getById` and `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` before broader list/feed migrations

This keeps the first code slice narrow while proving the new `derived` contract end to end.

## First-PR Guidance Added

The spec now also includes:

- an implementation-ready first-PR checklist
- exact first helper signatures for `resolveActivityContextAsOf`, `analyzeActivityDerivedMetrics`, and `mapActivityToDerivedResponse`

This should be enough to start implementation without reopening major contract questions.

### Logic that should be treated as optional, not required

- FTP/LTHR/resting-HR fallback lookups used to calculate TSS and IF.
- Advanced enrichment like normalized graded speed, efficiency factor, aerobic decoupling, training effect, and weather fetch.
- VO2 max estimation that is computed but not meaningfully persisted.

These calculations may remain for FIT if already cheap and stable, but they should not drive scope for the first manual historical import implementation.

### Logic that should likely be excluded from first-pass historical import

- notification creation for inferred metrics
- placeholder FIT status/list surfaces unrelated to the import submission flow
- behavior that would force a broader import-job or orchestration system

## Practical Recommendation

For the first implementation, the cleanest approach is to reuse the existing FIT parse-and-store backbone selectively, then layer conservative format-specific rules on top:

- `FIT`: reuse parse, activity insert, and approved high-confidence derived-state logic
- `TCX`: implement parse and activity insert first, with gated derived-state behavior
- `GPX`: implement parse and activity insert only, with no default effort or profile-metric side effects

For derived-state correctness, add one more rule:

- process each activity against prior state only, and prefer dynamic read-time calculation for stale-prone values so out-of-order imports do not require rewriting later raw activities

## Document Follow-Up Review

### Still likely needed if implementation lands

- `apps/mobile/docs/INTERACTION_INVENTORY.md`
  - It currently documents placeholder import behavior and should be updated once the real narrow import flow is implemented.

- `.opencode/instructions/project-reference.md`
  - Update only if manual historical import becomes a stable architectural pattern worth documenting at the project-reference level.

### No longer needed in this narrowed spec

- Template-import-related reference updates are no longer part of active scope.
- Broader provider-archive documentation is no longer part of active scope.
- Job dashboard, retry workflow, and generalized import-router documentation are no longer required by this spec.

## Audit Outcome

The spec is now appropriately scoped and simpler. The main implementation work is still narrow: add manual historical activity upload, parse and store the activity, and make deliberate decisions about whether the imported activity should create `activity_efforts` and inferred `profile_metrics`. The important added rule is causal correctness: each activity must be calculated using only prior state. The MVP simplification is also now explicit: avoid storing stale-prone threshold-dependent derived values as durable activity truth when possible, and prefer dynamic read-time calculation even when it is more computationally expensive. The only obvious reference update still worth tracking is `apps/mobile/docs/INTERACTION_INVENTORY.md`, with project-reference updates remaining optional unless the import path becomes a durable architecture pattern.

Implementation workflow now also needs to include the schema transition steps explicitly captured in `tasks.md`:

- remove stale-prone columns with a Supabase CLI-generated migration
- apply it with `supabase migration up`
- regenerate DB types with `pnpm run update-types`
