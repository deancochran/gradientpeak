# Calculated Threshold Management Specification

## Purpose

Provide athlete-owned visibility into calculated thresholds and the activities that produced them. The feature remains calculated-data only: an athlete removes an unwanted activity by deleting it, rather than modifying a threshold or excluding an activity from calculation.

This document defines functional and contract requirements only. It intentionally does not prescribe page structure, wording, navigation, controls, or visual design.

## Scope

The delivery includes:

1. Current calculated threshold facts for bike, run, and swim.
2. A read-only history of published calculated threshold changes.
3. Source-activity references for published calculated threshold changes.
4. Consumption of those read models by existing web and mobile application surfaces.
5. Reuse of existing activity deletion as the only mechanism for removing an activity's influence on calculated thresholds.

## Out of Scope

- Manual threshold creation, editing, deletion, or overrides.
- Activity threshold-inclusion or exclusion state.
- Raw telemetry trimming, local activity revisions, or activity data corrections.
- Excluding an activity from training load, fitness, fatigue, consistency, or activity history.
- Provider write-back or provider-side deletion.
- Provider-resource tombstones that prevent a deleted provider activity from being re-imported.
- Threshold model configuration, notifications, forecasting, charts, coaching workflows, and UI/UX design.

## Existing Authority

Calculated threshold truth is already represented by the immutable effective-dated `thresholds` chain. Every published threshold is backed by a qualified `threshold_evaluations` row and preserved activity/effort provenance.

The calculated threshold lifecycle and selection rules in `@repo/core` remain authoritative. This feature must not weaken those provenance or evaluation requirements.

## Functional Rules

### Current threshold facts

For each supported activity category (`bike`, `run`, and `swim`), consumers receive the current calculated fact at a requested instant. The response preserves the existing available/unavailable, freshness, effective-date, metric, unit, and provenance semantics.

No client supplies threshold values, confidence, effective date, source activity, or source evaluation identifiers as input.

### Published threshold history

History contains published calculated threshold-chain entries, not candidate evidence or rejected evaluations. Each item contains enough information to identify:

- the threshold identity: activity category, metric, and unit;
- the published value and effective timestamp;
- policy/version metadata already required by the canonical fact;
- the source evaluation and its source activities; and
- a minimal activity reference for navigation or later presentation.

History is profile-scoped, reverse chronological, bounded, and keyset-paginated. It must remain stable when new threshold entries are published between page requests.

### Activity deletion

Deleting an owned activity is the sole MVP action that removes it from calculated threshold participation.

The existing deletion workflow is required to continue to:

1. establish profile ownership;
2. discover affected threshold identities before deleting source records;
3. remove the activity's active threshold evidence;
4. remove/rebuild affected immutable calculated threshold chains under the profile advisory lock;
5. request athlete recalculation from the earliest affected instant; and
6. preserve completed-activity target snapshots already captured.

No separate exclusion state, mutation, filter predicate, or restoration workflow is added.

## Provider Sync Semantics

Activity deletion is local GradientPeak deletion. It does not delete or alter upstream provider data.

This scope does not add import suppression. If a later provider reconciliation creates a new local activity from the same upstream provider resource, that activity follows ordinary ingestion and may qualify for calculated thresholds again.

No provider calls occur as part of the threshold-history read model. Existing activity deletion/provider reconciliation behavior remains otherwise unchanged.

## Package Requirements

### `packages/db`

No database schema, migration, RLS, generated type, fingerprint, or database-tooling change is required.

Existing `activities`, `threshold_evaluations`, `threshold_evaluation_efforts`, and `thresholds` tables remain the persistence authority.

### `packages/core`

No Core algorithm or public contract change is required for this scope.

Existing threshold lifecycle, effective-dated fact materialization, provenance, freshness, and completed-activity snapshot behavior remain unchanged.

### `packages/api`

Add an authored, owner-scoped read procedure:

```ts
athleteIntelligence.getThresholdOverview({
  historyLimit?: number;
  historyCursor?: ThresholdHistoryCursor;
})
```

The procedure returns:

```ts
{
  current: AthletePerformanceTargetFacts;
  history: {
    items: CalculatedThresholdHistoryItem[];
    nextCursor: ThresholdHistoryCursor | null;
  };
  publication: {
    status: "available" | "stale" | "unavailable";
    publishedRevision: number | null;
  };
}
```

`CalculatedThresholdHistoryItem` is an API DTO, not a database row. It includes only the fields necessary to identify the calculated threshold and its source activity references. It must not expose raw diagnostics, provider payloads, artifact locations, or persistence-only fields.

The router must:

- require an authenticated actor;
- scope all reads to the actor's profile;
- validate a strict bounded `historyLimit` and versioned cursor;
- return explicit unavailable/stale results rather than treating failures as empty history; and
- keep transport logic in the router, orchestration in application code, and persistence reads in repositories.

The repository read must source history from published `thresholds` joined to their qualified evaluation and activity provenance. It must not use raw `threshold_evidence` as history.

No new mutation is introduced. Existing `activities.delete` remains the activity-management boundary.

## Consumer Contract

Web and mobile consumers may use:

- the existing current athlete-performance read model, or `getThresholdOverview.current`, for current facts;
- `getThresholdOverview.history` for calculated threshold history; and
- existing activity-detail navigation using the returned source activity references.

Consumers must handle available, stale, unavailable, loading, and failed query outcomes as distinct states. They must not reinterpret threshold source data or calculate threshold history locally.

Deleting an activity must invalidate/refetch consumers of current performance, threshold overview, activity detail, and dashboard data through the existing athlete recalculation/revision behavior.

## Authorization and Data Boundaries

- A caller can retrieve only their own threshold overview and source activities through this procedure.
- Source activities that no longer exist must not be returned as live references in threshold history.
- Cross-profile threshold, evaluation, effort, and activity joins are prohibited.
- Persistence rows, raw threshold diagnostics, provider artifacts, and untrusted provider data are not public DTOs.

## Verification Requirements

### API and repository

- The overview returns only actor-owned threshold facts and history.
- History is produced from published thresholds, never raw evidence.
- Pagination is deterministic, bounded, and profile-scoped.
- Available, stale, unavailable, empty-history, and failure behavior are covered.
- Deleted source activities do not appear as live history references.
- Existing activity deletion still rebuilds affected threshold chains and requests recalculation.
- Completed-activity target snapshots remain unchanged after deletion.

### Consumer integration

- Web and mobile type-check against the public API contract.
- Each consumer handles current facts and history without duplicating threshold selection logic.
- Existing activity deletion invalidates/refetches dependent performance reads.

### Commands

Run the narrowest relevant tests while iterating, then at integration scope:

```sh
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/api check-types
pnpm --filter @repo/api test
pnpm --filter web check-types
pnpm --filter mobile check-types
pnpm quality:agent
```

## Delivery Order

1. Add strict API DTOs, cursor contract, repository read, and procedure tests.
2. Verify the existing activity-deletion threshold rebuild behavior remains covered.
3. Integrate the read contract in web consumers.
4. Integrate the read contract in mobile consumers.
5. Run focused verification and the integration gate.

## Explicit Product Decision

This MVP maintains calculated threshold provenance by making activity deletion the only means to remove an activity from threshold calculations. Any future requirement to retain an activity while preventing its use in calculation requires a separately approved persistence model and specification.
