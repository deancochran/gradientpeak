# Implementation Plan: No-History Adaptive Demand Model

Last Updated: 2026-02-12
Status: Ready for execution
Depends On: `design.md`, `technical-spec.md`

## Objective

Implement V2 no-history adaptive demand modeling in a deterministic, test-first way while preserving existing safety semantics and preview/create parity.

## Non-Negotiables

1. Keep ramp-cap, CTL-cap, recovery, and taper logic authoritative.
2. Keep no-history default start as never-trained (`starting_ctl_for_projection = 0`) unless override provided.
3. Do not duplicate projection decision logic outside `@repo/core`.
4. Maintain preview/create output parity for identical inputs.
5. Preserve backward compatibility during migration (dual-write metadata).

## Implementation Phases

## Phase 1 - Core Contract Extension

### Scope

Add demand-band contracts and feasibility/readiness metadata to projection types without breaking existing consumers.

### Files

- `packages/core/plan/projectionTypes.ts`
- `packages/core/plan/index.ts`

### Deliverables

1. Add `DemandBand`, `ProjectionDemandGap`, `ProjectionFeasibilityMetadata`, `ReadinessBand`, `DemandConfidence`.
2. Extend `NoHistoryProjectionMetadata` with optional V2 fields.
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
3. Replace floor-only week override behavior with demand-band-first override behavior.
4. Keep current clamp ordering and semantics unchanged.
5. Emit enriched week metadata (`demand_band_minimum_weekly_tss`, unmet demand where applicable).
6. Emit top-level feasibility metadata (`demand_gap`, `readiness_band`, `dominant_limiters`).

### Exit Criteria

1. Weekly projections remain deterministic for same inputs.
2. Hard goals do not immediately collapse unless constrained.
3. Clamp behavior remains unchanged relative to safety rules.

## Phase 3 - Router Threading and Snapshot Parity

### Scope

Thread V2 metadata through preview and create flows, keeping stale snapshot protections intact.

### Files

- `packages/trpc/src/routers/training_plans.ts`

### Deliverables

1. Ensure no-history context provides all inputs needed for core demand derivation.
2. Ensure `buildCreationProjectionArtifacts` surfaces V2 metadata unchanged from core.
3. Include V2 metadata in snapshot token inputs.
4. Bump preview snapshot version if token payload shape changes.

### Exit Criteria

1. `previewCreationConfig` and `createFromCreationConfig` produce matching projection metadata.
2. Snapshot stale-token detection still works exactly as before.

## Phase 4 - Mobile V2 Explainability Cues

### Scope

Render demand-band insights in projection UI with backward-compatible fallback to legacy fields.

### Files

- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`

### Deliverables

1. Show readiness band and demand-gap cues when V2 metadata exists.
2. Surface dominant limiters and confidence labels.
3. Retain fallback rendering for floor-era metadata.
4. Keep UI read-only (no local projection math).

### Exit Criteria

1. Chart renders with both V2 and legacy payloads.
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
3. Mobile tests for V2 rendering + legacy fallback.

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

## Release A - Dual Write

1. Emit both legacy floor fields and V2 demand fields.
2. Keep existing tokens accepted where needed (`no_history_floor`).

## Release B - V2-First UI

1. Mobile prefers V2 fields.
2. Legacy fallback remains active.

## Release C - Deprecation

1. Mark floor-era fields as deprecated in type docs.
2. Keep wire compatibility until next planned contract cleanup.

## Risks and Mitigations

1. Over-prescription risk -> mitigated by existing clamp authority and availability constraints.
2. Under-prescription risk for hard goals -> mitigated by demand-floor persistence through build horizon.
3. Contract drift between preview/create -> mitigated by shared projection artifacts and snapshot parity tests.
4. UI confusion during migration -> mitigated by V2-first labels with legacy fallback.

## Completion Criteria

This plan is complete when:

1. V2 demand metadata is produced in core and surfaced end-to-end.
2. Hard no-history goals show believable progressive demand unless constrained.
3. Constrained projections explicitly report gap and dominant limiters.
4. Safety and determinism are preserved.
5. Tests and type checks pass for all affected packages.
