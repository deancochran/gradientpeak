# Tasks - Readiness + Dynamic Context Projection

## Phase 1: Contracts (Minimal, Backward Compatible)

- [x] Update `packages/core/plan/projectionTypes.ts`:
  - [x] Add optional `readiness_score` to `ProjectionFeasibilityMetadata`.
  - [x] Add optional `readiness_components` to `ProjectionFeasibilityMetadata`.
  - [x] Add optional `projection_uncertainty` to `ProjectionFeasibilityMetadata`.
  - [x] Preserve existing fields and enums unchanged.
- [x] Export updated projection types from `packages/core/plan/index.ts`.

## Phase 2: CTL-Derived Seed and Rolling Weekly Base

- [x] In `packages/core/plan/projectionCalculations.ts`, derive week-1 seed load from CTL when available:
  - [x] `seed_weekly_tss_from_ctl = round(starting_ctl * 7)`.
  - [x] Apply bounded context shaping factors (availability/horizon) if configured.
  - [x] Fall back to baseline weekly TSS only when CTL-derived seed is unavailable.
- [x] Replace static weekly base anchoring with rolling context composition:
  - [x] Prior projected week TSS as primary signal.
  - [x] Block target midpoint as structural signal.
  - [x] Demand-floor signal when active.
- [x] Keep existing clamp order and semantics unchanged:
  - [x] recovery/taper adjustments,
  - [x] demand floor,
  - [x] TSS ramp cap,
  - [x] CTL ramp cap.
- [x] Add deterministic rationale tokens for seed source and dynamic composition path.

## Phase 3: Readiness Score + Uncertainty Metadata

- [x] Add readiness component calculation in `packages/core/plan/projectionCalculations.ts`:
  - [x] `load_state`
  - [x] `intensity_balance`
  - [x] `specificity`
  - [x] `execution_confidence`
- [x] Add final readiness score mapping:
  - [x] 0-100 score
  - [x] map to existing readiness band thresholds.
- [x] Add projection uncertainty metadata:
  - [x] `tss_low`
  - [x] `tss_likely`
  - [x] `tss_high`
  - [x] confidence value
- [x] Emit rationale codes for readiness penalties/credits.

## Phase 4: Router Pass-Through + Parity

- [x] In `packages/trpc/src/routers/training_plans.ts`, ensure new optional feasibility metadata fields are forwarded unchanged.
- [x] Keep router conflict/safety logic unchanged.
- [x] Verify preview/create parity still uses shared projection artifacts and snapshot token behavior remains stable.

## Phase 5: Core Tests

- [x] Update/add in `packages/core/plan/__tests__/projection-calculations.test.ts`:
  - [x] score bounded 0-100 and deterministic.
  - [x] larger demand gap lowers readiness score.
  - [x] more clamp pressure lowers readiness score.
  - [x] higher evidence confidence improves readiness score.
  - [x] readiness band thresholds map correctly from score.
  - [x] uncertainty widens as confidence decreases.
  - [x] CTL-provided seed takes precedence over baseline fallback.
  - [x] baseline influence decays over weeks vs rolling prior-state.

## Phase 6: Router Tests

- [x] Update/add in `packages/trpc/src/routers/__tests__/training-plans.test.ts`:
  - [x] preview includes new optional readiness fields in `projection_feasibility`.
  - [ ] create path preserves same fields for same snapshot.
  - [x] snapshot stale-token behavior remains unchanged.

## Phase 7: Verification

- [x] Run:
  - [x] `pnpm --filter @repo/core check-types`
  - [x] `pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts`
  - [x] `pnpm --filter @repo/trpc check-types`
  - [x] `pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts`

## Phase 8: Acceptance Validation

- [x] Confirm baseline is now seed/fallback only, not persistent weekly anchor.
- [x] Confirm weekly calculations use prior microcycle outputs deterministically.
- [x] Confirm existing safety caps remain hard constraints.
- [x] Confirm no required API payload changes.
- [x] Confirm no hardcoded goal-tier ladders introduced.
