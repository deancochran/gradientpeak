# Implementation Plan: No-History Adaptive Demand Model

Last Updated: 2026-02-12
Status: Ready for execution
Depends On: `design.md`, `technical-spec.md`

## Objective

Implement no-history adaptive demand modeling in a deterministic, test-first way while preserving existing safety semantics and preview/create parity.

## Non-Negotiables

1. Keep ramp-cap, CTL-cap, recovery, and taper logic authoritative.
2. Keep no-history default start as never-trained (`starting_ctl_for_projection = 0`) unless override provided.
3. Do not duplicate projection decision logic outside `@repo/core`.
4. Maintain preview/create output parity for identical inputs.
5. Update the current contract and behavior directly (no parallel version track).
6. Adaptive demand must use a single confidence-weighted model across none/sparse/stale/rich states (no hard mode switching).
7. User flow must not change or break based on data state; creation works for none/sparse/stale/rich.
8. The system must use live database evidence at request time with no manual user steps.

## Evidence Weighting Rules

Adaptive demand must always run using all available evidence, with confidence-based weighting:

1. Use all available `activities`, `activity_efforts`, `profile_metrics`, and creation inputs.
2. Apply freshness decay and sample-quality weighting to each signal.
3. Blend weighted evidence with conservative baselines deterministically.
4. Let `none/sparse/stale/rich` influence confidence strength, not model eligibility.

## Data Freshness and Dynamic Utilization Rules

1. Every `previewCreationConfig` and `createFromCreationConfig` call must derive context from current DB records.
2. Newly logged `activities`, `activity_efforts`, and `profile_metrics` must be reflected in the next preview/create request.
3. Query failures or empty sources must degrade gracefully to conservative baselines, never blocking creation.

## Implementation Phases

## Phase 1 - Core Contract Extension

### Scope

Add demand-band contracts and feasibility/readiness metadata to projection types without breaking existing consumers.

### Files

- `packages/core/plan/projectionTypes.ts`
- `packages/core/plan/index.ts`

### Deliverables

1. Add `DemandBand`, `ProjectionDemandGap`, `ProjectionFeasibilityMetadata`, `ReadinessBand`, `DemandConfidence`.
2. Update `NoHistoryProjectionMetadata` with demand-model fields.
3. Export all new types via core barrel.

### Exit Criteria

1. Types compile in `@repo/core`, `@repo/trpc`, and mobile.
2. No existing projection consumers break at compile-time.

## Phase 2 - Core Demand Model Pipeline

### Scope

Implement deterministic chained demand estimation and integrate it into weekly requested-load generation.

### Files

- `packages/core/plan/projectionCalculations.ts`

### Deliverables

1. Add deterministic goal-demand derivation helper(s).
2. Add weekly demand-floor function for build-horizon weeks.
3. Replace floor-only week override behavior with confidence-weighted demand-band behavior.
4. Keep current clamp ordering and semantics unchanged.
5. Emit enriched week metadata (`demand_band_minimum_weekly_tss`, unmet demand where applicable).
6. Emit top-level feasibility metadata (`demand_gap`, `readiness_band`, `dominant_limiters`).
7. Add evidence weighting utility (freshness/sample/source-quality -> confidence score).
8. Ensure weighting utility is failure-safe and never blocks projection generation.

### Exit Criteria

1. Weekly projections remain deterministic for same inputs.
2. Hard goals do not immediately collapse unless constrained.
3. Clamp behavior remains unchanged relative to safety rules.
4. Rich/fresh users remain on history-driven projection path.

## Phase 3 - Router Threading and Snapshot Parity

### Scope

Thread updated demand metadata through preview and create flows, keeping stale snapshot protections intact.

### Files

- `packages/trpc/src/routers/training_plans.ts`

### Deliverables

1. Ensure no-history context provides all inputs needed for core demand derivation.
2. Ensure `buildCreationProjectionArtifacts` surfaces updated metadata unchanged from core.
3. Include updated metadata in snapshot token inputs.
4. Add/forward weighting reason tokens and confidence breakdown for explainability.
5. Enforce dynamic context derivation from live DB state on every request path.

### Exit Criteria

1. `previewCreationConfig` and `createFromCreationConfig` produce matching projection metadata.
2. Snapshot stale-token detection still works exactly as before.
3. Confidence weighting outcomes are identical between preview and create for the same snapshot.
4. Empty/partial data states still return successful preview/create responses.

## Phase 4 - Mobile Explainability Cues

### Scope

Render demand-band insights in projection UI using the updated metadata semantics.

### Files

- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`

### Deliverables

1. Show readiness band and demand-gap cues from updated metadata.
2. Surface dominant limiters and confidence labels.
3. Keep UI read-only (no local projection math).

### Exit Criteria

1. Chart renders updated demand/readiness metadata correctly.
2. Constrained-week context remains accurate and understandable.

## Phase 5 - Test Coverage and Verification

### Scope

Add and update tests for demand model behavior, parity, and UI rendering.

### Files

- `packages/core/plan/__tests__/projection-calculations.test.ts`
- `packages/core/plan/__tests__/training-plan-preview.test.ts`
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`
- `apps/mobile/components/training-plan/create/__tests__/CreationProjectionChart.test.tsx` (new)

### Deliverables

1. Core tests for demand-band progression, demand-gap emission, override behavior, and deterministic start-state handling.
2. Router tests for preview/create parity and snapshot token behavior.
3. Mobile tests for updated demand/readiness rendering.
4. Weighting tests for none/sparse/stale confidence discounting and rich/fresh confidence dominance.
5. Dynamic data tests validating updated outputs after new DB evidence appears.

### Verification Commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts
pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts
pnpm --filter mobile check-types
```

### Exit Criteria

1. All updated tests pass.
2. No type regressions across affected packages.

## Rollout Strategy

## Single Cutover

1. Update core projection contract and calculations in place.
2. Update router snapshot token inputs to match the new metadata shape.
3. Update mobile rendering in the same implementation window.
4. Validate parity and safety semantics before merge.

## Risks and Mitigations

1. Over-prescription risk -> mitigated by existing clamp authority and availability constraints.
2. Under-prescription risk for hard goals -> mitigated by demand-floor persistence through build horizon.
3. Contract drift between preview/create -> mitigated by shared projection artifacts and snapshot parity tests.
4. UI interpretation drift -> mitigated by updating labels and tests in the same change set.
5. Incorrect confidence scaling -> mitigated by explicit weighting function, monotonic tests, and parity tests for preview/create.
6. User-visible disruptions when data missing -> mitigated by strict no-block conservative baseline behavior and null-safe defaults.

## Completion Criteria

This plan is complete when:

1. Demand metadata is produced in core and surfaced end-to-end.
2. Hard no-history goals show believable progressive demand unless constrained.
3. Constrained projections explicitly report gap and dominant limiters.
4. Safety and determinism are preserved.
5. Tests and type checks pass for all affected packages.
6. Rich/fresh users are evidence-dominant through confidence weighting (without separate fallback mode).
7. No end-user friction is introduced by data availability differences.
8. Plan creation adapts automatically as real data is logged to the database.
