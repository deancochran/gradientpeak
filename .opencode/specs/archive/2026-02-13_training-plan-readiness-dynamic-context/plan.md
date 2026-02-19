# Technical Plan: Readiness Score + Dynamic Context Propagation

Last Updated: 2026-02-13
Status: Ready for execution
Depends On: `docs/plans/2026-02-12-readiness-score-design/design.md`

## Objective

Upgrade the existing projection and plan-creation pipeline in place so each microcycle is computed from prior projected state and context, with a deterministic readiness score layered onto current feasibility metadata.

## Non-Negotiables

1. No methodology rewrite and no parallel V2 system.
2. Keep CTL/ATL/TSB simulation and current safety caps authoritative.
3. No hardcoded goal-target ladders.
4. Preserve preview/create parity and deterministic outputs for identical inputs.
5. Keep contracts backward compatible via optional fields.

## Core Approach

1. Treat `starting_ctl` as first-class seed input when available.
2. Derive week-1 seed weekly TSS from CTL (`starting_ctl * 7`) with bounded context shaping.
3. For week 2+, compute requested load from rolling prior-state context (not static baseline).
4. Add readiness score/components/uncertainty into existing `projection_feasibility` metadata.
5. Keep clamp ordering unchanged: demand logic -> TSS ramp cap -> CTL ramp cap.

## Phase 1 - Contract Extension (Backward Compatible)

### Scope

Extend existing feasibility metadata with readiness/uncertainty fields without breaking consumers.

### Files

- `packages/core/plan/projectionTypes.ts`
- `packages/core/plan/index.ts`

### Deliverables

1. Add optional fields to `ProjectionFeasibilityMetadata`:
   - `readiness_score`
   - `readiness_components`
   - `projection_uncertainty`
2. Keep existing `readiness_band`, `demand_gap`, and `dominant_limiters` unchanged.
3. Export updated types from core barrel.

### Exit Criteria

1. `@repo/core` and `@repo/trpc` compile with no contract regressions.
2. Existing payload readers continue to function unchanged.

## Phase 2 - CTL-Derived Seeding + Dynamic Weekly Composition

### Scope

Refactor weekly requested-load derivation so baseline is seed/fallback only and weekly computations carry forward prior state.

### Files

- `packages/core/plan/projectionCalculations.ts`

### Deliverables

1. Derive `seed_weekly_tss` from `starting_ctl` when available; fallback to baseline.
2. Replace static baseline anchoring with rolling weekly base formula:
   - prior week projected TSS (primary)
   - block midpoint target
   - demand-floor pressure when active
3. Keep current recovery/taper/event and demand-floor semantics.
4. Preserve clamp authority and ordering.
5. Emit deterministic rationale codes for seed source and dynamic composition.

### Exit Criteria

1. Week-to-week projections depend on prior projected state.
2. Baseline affects initialization, not long-horizon anchoring.
3. Safety behavior remains equal or stricter than current behavior.

## Phase 3 - Readiness Score and Uncertainty

### Scope

Compute a lightweight composite readiness score from existing outputs and attach it to feasibility metadata.

### Files

- `packages/core/plan/projectionCalculations.ts`

### Deliverables

1. Implement `load_state`, `intensity_balance`, `specificity`, `execution_confidence` components.
2. Compute final 0-100 `readiness_score` and map to existing readiness bands.
3. Add `projection_uncertainty` (`tss_low/likely/high`, confidence).
4. Add deterministic rationale tokens for penalties/credits.

### Exit Criteria

1. Readiness score is deterministic and bounded (0-100).
2. Score decreases with higher demand gap and clamp pressure.
3. Score increases with stronger evidence confidence.

## Phase 4 - Router Threading and Snapshot Compatibility

### Scope

Thread updated metadata through preview/create flows without router-local math changes.

### Files

- `packages/trpc/src/routers/training_plans.ts`

### Deliverables

1. Pass through new optional readiness fields in existing projection payload.
2. Keep snapshot token parity behavior intact.
3. Keep conflict checks and safety decisions unchanged for this phase.

### Exit Criteria

1. Preview/create outputs match for same snapshot inputs.
2. No stale-token behavior change.

## Phase 5 - Tests and Verification

### Files

- `packages/core/plan/__tests__/projection-calculations.test.ts`
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`

### Verification Commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts
```

### Exit Criteria

1. New readiness and dynamic-seeding tests pass.
2. Existing projection/demand tests remain green.
3. No type regressions in affected packages.

## Risks and Mitigations

1. Over-reactive weekly oscillation from dynamic carry-forward -> clamp rolling weights and preserve deload/taper multipliers.
2. Hidden consumer assumptions about metadata shape -> optional fields only and router pass-through.
3. Readiness overfitting -> keep formula simple, deterministic, and bounded; tune with tests.

## Completion Criteria

This plan is complete when:

1. Baseline is no longer a persistent anchor and CTL-derived seeding is active.
2. Weekly load is context-propagated from prior microcycles.
3. Readiness score/uncertainty are emitted in existing feasibility metadata.
4. Preview/create parity and safety constraints are preserved.
