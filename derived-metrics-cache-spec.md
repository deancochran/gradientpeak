# Derived Metrics Cache Specification

## Scope

- Add a server-side cache for user-derived estimation outputs such as TSS, IF, duration, calories, zone summaries, and related projection fields.
- Keep canonical entity truth in the main tables. Do not duplicate route distance, ascent, polyline, plan structure, or other persisted facts into the cache.
- Make `estimator_version` a required cache key so logic changes invalidate old projections cleanly.
- Replace client-side detail-screen estimation with API-served derived projections.

## Problem Statement

Today the repo computes estimation results directly from current profile state and entity inputs in multiple read paths:

- `packages/api/src/utils/estimation-helpers.ts` computes plan estimations server-side for lists and mutations.
- `apps/mobile/components/activity-plan/useActivityPlanDetailViewModel.ts` recomputes estimates on the client for detail display.
- `packages/api/src/routers/profiles.ts` separately derives profile performance snapshots from metrics and efforts.

These values are not stable fields. They change when any of the following changes:

- profile metrics such as FTP, threshold HR, weight, or threshold pace
- recent activity efforts used to infer FTP or threshold pace
- derived fitness state used by scheduled projections
- activity-plan structure or attached route references
- route geometry-backed truth such as distance or ascent
- estimation code itself

Recomputing these values on every read is wasteful, but storing them as authoritative columns on `activity_plans` or `activity_routes` would make them stale and user-incorrect.

## Current Repo State

### Existing truth tables

- `packages/db/src/schema/tables.ts:67` defines `activity_routes` with canonical route facts such as `total_distance`, `total_ascent`, `total_descent`, and `polyline`.
- `packages/db/src/schema/tables.ts:106` defines `activity_plans` with canonical structure, route linkage, and user ownership.
- `packages/db/src/schema/tables.ts:501` defines `activity_efforts`, which currently feed inferred FTP and threshold pace.
- `packages/db/src/schema/tables.ts:548` defines `profile_metrics`, which currently feed weight, resting HR, max HR, and LTHR.

### Existing estimation surfaces

- `packages/api/src/utils/estimation-helpers.ts` already centralizes most estimation logic by building a shared `@repo/core` estimation context.
- `packages/api/src/infrastructure/repositories/drizzle-event-read-repository.ts:239` provides a single `getEstimationInputs()` repository call that fetches profile, efforts, metrics, and route facts together.
- `packages/api/src/routers/profiles.ts:172` builds a profile performance snapshot separately from metrics and efforts.
- `apps/mobile/components/activity-plan/useActivityPlanDetailViewModel.ts` still computes estimates client-side and should be removed from the long-term design.

### Gaps

- No versioned projection cache exists.
- No explicit dependency revision state exists for estimation inputs.
- No API contract exposes estimate freshness or cache provenance.
- No unified server path serves all derived estimates for plan detail, route detail, and future list/detail consumers.

## Goals

- Cache only user-derived metrics.
- Keep cache invalidation cheap and deterministic.
- Avoid hashing large raw tables on every request.
- Avoid fan-out rewrites of `activity_plans` or `activity_routes` when user metrics change.
- Support `activity_plan`, `route`, and later `planned_activity` derived projections with one pattern.
- Support synchronous compute-on-miss for detail reads and batch cache lookup for list reads.

## Non-Goals

- Do not change canonical route or activity-plan storage.
- Do not cache route distance, ascent, descent, or polyline independently of the source row.
- Do not introduce a separate queue system in the first iteration.
- Do not backfill every historic entity for every user immediately.

## Proposed Architecture

Use an activity-plan-specific server-side projection cache keyed by:

- `activity_plan_id`
- `profile_id`
- `estimator_version`
- `input_fingerprint`

The cache stores only derived outputs. Canonical inputs remain in the source tables.

### Canonical vs cached boundaries

Canonical truth remains in:

- `activity_routes`
- `activity_plans`
- `profile_metrics`
- `activity_efforts`
- future fitness snapshot source tables

Cached derived outputs include:

- `estimated_tss`
- `intensity_factor`
- `estimated_duration_seconds`
- `estimated_calories`
- estimated zones or zone summary JSON
- confidence fields
- future fatigue or readiness-derived fields when needed

## Database Design

### 1. Add `activity_plan_derived_metrics_cache`

Add a new table in `packages/db/src/schema/tables.ts`.

Recommended columns:

- `id uuid primary key`
- `activity_plan_id uuid not null`
- `profile_id uuid not null`
- `estimator_version text not null`
- `input_fingerprint text not null`
- `estimated_tss integer`
- `estimated_duration_seconds integer`
- `intensity_factor real`
- `estimated_calories integer`
- `estimated_distance_meters integer`
- `estimated_zones jsonb`
- `confidence text`
- `confidence_score integer`
- `status text not null default 'fresh'`
- `computed_at timestamptz not null`
- `last_accessed_at timestamptz not null`
- `expires_at timestamptz null`
- `failure_reason text null`
- `metrics_json jsonb null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints and indexes:

- unique index on `(activity_plan_id, profile_id, estimator_version, input_fingerprint)`
- index on `(profile_id, activity_plan_id)` for invalidation and lookup
- index on `(status, expires_at)` for optional background maintenance
- check constraint for allowed `status` values:
  - `fresh`
  - `failed`

Notes:

- `metrics_json` is optional overflow for future metrics without forcing repeated schema churn.
- Common fields remain first-class columns because they will be read and filtered often.

### 2. Add `profile_estimation_state`

Add one row per profile to track revision counters for mutable estimation inputs.

Recommended columns:

- `profile_id uuid primary key`
- `metrics_revision integer not null default 0`
- `performance_revision integer not null default 0`
- `fitness_revision integer not null default 0`
- `updated_at timestamptz not null default now()`

Meaning:

- `metrics_revision`: bumps when `profile_metrics` change in a way that can affect estimates.
- `performance_revision`: bumps when new `activity_efforts` or activity-derived effort facts can change inferred thresholds, FTP, or pace.
- `fitness_revision`: bumps when the current fitness/progression snapshot changes and that snapshot participates in estimation.

This avoids computing a heavyweight fingerprint from live raw rows on every request. The fingerprint can combine entity timestamps with a small version payload.

### Why two tables instead of one

- `activity_plan_derived_metrics_cache` stores reusable outputs.
- `profile_estimation_state` stores invalidation state for user-sensitive dependencies.

Keeping them separate makes invalidation cheap and avoids rewriting cache rows just to note that dependencies changed.

## Estimator Version Contract

Add a single version constant in the estimation stack, likely under `packages/core/estimation/`.

Recommended export:

```ts
export const ESTIMATOR_VERSION = "2026-04-derived-metrics-v1";
```

Rules:

- Every cached projection row stores the exact `ESTIMATOR_VERSION` used to compute it.
- Every API response that includes cached estimates also returns `estimator_version`.
- Any change to estimation logic that can affect outputs must bump this constant.
- Old rows do not need to be eagerly deleted. They naturally fall out of use because lookups include the version.

This is mandatory. Logic changes must never silently reuse old cached values.

## Fingerprint Contract

Use fingerprints derived from normalized dependency versions and entity timestamps, not raw row dumps.

### Activity plan fingerprint inputs

- `activity_plan.id`
- `activity_plan.updated_at`
- `activity_plan.version`
- `activity_plan.route_id`
- attached route `updated_at` if a route is linked
- `profile_estimation_state.metrics_revision`
- `profile_estimation_state.performance_revision`
- `profile_estimation_state.fitness_revision`
- optional estimation context flags if the route uses scheduled-date-sensitive logic later

### Implementation note

The fingerprint helper should create a compact stable string from ordered inputs and hash it, for example via SHA-256. The code should not embed large JSON structures directly into the cache key.

## Read Path

### Detail screens

For detail reads:

1. load canonical entity data
2. load profile estimation state
3. build input fingerprint
4. look up a cache row by entity, profile, estimator version, and fingerprint
5. if found, return cached values
6. if missing, compute on the server, persist the projection row, and return it

This gives predictable correctness and keeps detail screens responsive after the first read.

### List screens

For list reads:

1. fetch entities normally
2. batch-build fingerprints for all visible items
3. load matching cache rows in one query
4. compute only misses, preferably in a bounded batch helper
5. persist fresh rows for misses

This replaces the current repeated in-request `addEstimationToPlans()` behavior with a cache-aware path.

## Invalidation Strategy

Use lazy invalidation by revision bump.

### When to bump `metrics_revision`

- profile metric create
- profile metric update
- profile metric delete if supported later
- profile onboarding flows that seed or replace metric data

### When to bump `performance_revision`

- activity ingest that creates or changes efforts relevant to FTP or pace inference
- activity delete that removes a relevant effort
- manual FTP effort creation or replacement
- any recomputation job that changes the best-effort set used by estimation

### When to bump `fitness_revision`

- fitness snapshot recalculation that can change fatigue- or readiness-sensitive estimation
- planned-load recomputation if it becomes an explicit estimation dependency

### Why lazy invalidation is preferred

- no need to fan out writes across all cached rows
- no need to track individual dependent entities at write time in v1
- old rows remain harmless because reads use the latest revisions when building fingerprints
- stale rows are not proactively recomputed in bulk; only plans accessed within the recent-analysis window are refreshed on read

## API Surface Changes

### New server-side service layer

Add a new cache-aware service in `packages/api/src/utils/` or a new `packages/api/src/lib/derived-metrics/` folder.

Recommended responsibilities:

- load profile estimation state
- build fingerprints
- read matching cache rows
- compute on miss using existing `buildEstimationContext()` and `estimateActivity()` helpers
- upsert projection rows
- return unified derived-metric payloads

Suggested entry points:

- `getActivityPlanDerivedMetrics()`
- `getActivityPlanDerivedMetricsBatch()`

### Repository changes

Extend the read/write repositories to support:

- reading `profile_estimation_state`
- upserting `profile_estimation_state`
- reading cache rows by `(activity_plan_id, profile_id, estimator_version, input_fingerprint)`
- batch reading cache rows for visible entity sets
- upserting projection rows

The current `EventReadRepository.getEstimationInputs()` can remain the source for profile, effort, and route facts in the first iteration.

### Router changes

Replace direct estimation helper calls in these areas with the cache-aware service:

- `packages/api/src/routers/activity-plans.ts`
- `packages/api/src/routers/events.ts`
- `packages/api/src/routers/home.ts`
- `packages/api/src/routers/planning/training-plans/base.ts`

Replace the mobile client-side detail computation with server-provided values:

- `apps/mobile/components/activity-plan/useActivityPlanDetailViewModel.ts`

### Response contract additions

Where derived metrics are returned, add metadata:

- `estimator_version`
- `estimate_source: "cache" | "computed"`
- `estimate_computed_at`

Avoid overloading existing source-of-truth fields. The payload should still make it clear these are derived values.

## Entity-Specific Design

### Activity plans

Use the cache for all user-derived metrics returned from plan list and detail routes.

Important:

- do not treat `activity_plans` as the storage location for user-specific `estimated_tss` or duration
- creation and update mutations may still compute once for immediate response, but should persist into the projection cache rather than into the plan row

### Routes

Route detail should continue to read route truth from `activity_routes`:

- `total_distance`
- `total_ascent`
- `total_descent`
- `polyline`

Then attach user-derived cached estimates separately.

This keeps spatial truth authoritative while allowing user-specific route projections to vary safely.

### Planned activities

This is the best place to use `fitness_revision` because scheduled-date-aware calculations are most likely here.

The first phase can defer full planned-activity caching if needed, but the table design should support it now so the pattern does not have to change later.

## Implementation Plan

### Phase 1: Foundation

- add `ESTIMATOR_VERSION`
- add `activity_plan_derived_metrics_cache`
- add `profile_estimation_state`
- add repository methods for projection read/write and revision read/write
- implement fingerprint helpers

### Phase 2: Server cache service

- build a cache-aware estimation service around the existing `estimation-helpers.ts`
- support `activity_plan` and `route` first
- support batch reads for list endpoints
- return cache metadata in responses

### Phase 3: First integrations

- migrate `activity-plans` router list/detail paths
- migrate `home` plan estimation reads
- migrate route detail estimation reads if route estimates are exposed
- remove mobile client-side estimation from `useActivityPlanDetailViewModel.ts`

### Phase 4: Invalidation wiring

- bump `metrics_revision` from profile metrics mutations and onboarding metric seed paths
- bump `performance_revision` from activity/effort ingestion or edits that affect threshold inference
- bump `fitness_revision` from fitness snapshot updates once that source is clearly owned in the repo

### Phase 5: Planned activity adoption

- add cache support for scheduled-date-sensitive planned activity estimations
- migrate any route or calendar surfaces that currently recompute inline

## Testing Strategy

### Unit tests

- fingerprint helper stability
- estimator version propagation
- cache hit vs miss behavior
- revision bump invalidates old fingerprint
- route and activity-plan cache keys include the expected dependencies

### Repository tests

- projection row upsert and lookup
- batch lookup correctness
- profile estimation state read and update semantics

### Router tests

- list endpoints return cached estimates without recompute on hit
- detail endpoints compute once and reuse afterward
- estimator version changes bypass previous cache rows

### App tests

- activity plan detail reads API values and does not run local estimation
- route detail renders canonical route facts plus server-provided derived metrics

## Open Questions

- What table or service will own the authoritative fitness snapshot that should drive `fitness_revision`?
- Do any current route estimates depend on scheduled date or weekly planned load, or only on profile state and route facts?
- Should `estimated_distance_meters` remain part of the derived cache for plans, or should it be omitted until a clear consumer needs it?

## Recommended First Implementation Slice

Start with `activity_plan` projections only.

That slice is the highest-value path because:

- estimation already exists in one helper layer
- list and detail screens both consume it
- the mobile detail screen currently does local recomputation
- it exercises the full design without bringing in date-sensitive planned-activity complexity immediately

Once the pattern is proven there, add `route` projections and then `planned_activity` projections.
