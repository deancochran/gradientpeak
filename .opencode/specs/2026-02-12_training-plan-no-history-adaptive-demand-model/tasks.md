# Tasks - Training Plan Adaptive Demand (Confidence-Weighted)

## Phase 1: Core Contracts

- [ ] Update `packages/core/plan/projectionTypes.ts` with confidence-weighted projection metadata:
  - [ ] Add `DemandBand`.
  - [ ] Add `ProjectionDemandGap`.
  - [ ] Add `ProjectionFeasibilityMetadata`.
  - [ ] Add `ReadinessBand` and `DemandConfidence`.
  - [ ] Extend `NoHistoryProjectionMetadata` with `evidence_confidence` fields.
- [ ] Export new/updated projection types from `packages/core/plan/index.ts`.
- [ ] Ensure upstream barrel exports remain valid (no duplicate local type contracts).

## Phase 2: Core Confidence-Weighted Demand Engine

- [ ] In `packages/core/plan/projectionCalculations.ts`, add deterministic evidence weighting helpers:
  - [ ] `deriveEvidenceWeighting(...)` for freshness/sample/source confidence.
  - [ ] `blendDemandWithConfidence(...)` to combine demand-floor and conservative baseline.
  - [ ] Keep deterministic behavior for identical snapshots.
- [ ] Keep no-history baseline start behavior deterministic:
  - [ ] Baseline `starting_ctl_for_projection = 0` when no strong evidence is present.
  - [ ] Honor `starting_ctl_override` when provided.
- [ ] Update weekly requested-load composition to use confidence-weighted demand before clamp pipeline.
- [ ] Keep all safety semantics unchanged and authoritative:
  - [ ] Weekly TSS ramp cap.
  - [ ] CTL ramp cap.
  - [ ] Recovery/taper/event-week semantics.
- [ ] Emit updated week-level explainability metadata:
  - [ ] `demand_band_minimum_weekly_tss`.
  - [ ] `demand_gap_unmet_weekly_tss`.
  - [ ] `weekly_load_override_reason` (demand-band semantics).
- [ ] Emit updated top-level explainability metadata:
  - [ ] `projection_feasibility`.
  - [ ] `evidence_confidence` (`score`, `state`, `reasons`).

## Phase 3: Router Threading and Preview/Create Parity

- [ ] In `packages/trpc/src/routers/training_plans.ts`, ensure preview/create pass identical evidence inputs into shared core projection path.
- [ ] Ensure each request derives context from live DB data (`activities`, `activity_efforts`, `profile_metrics`).
- [ ] Thread weighting reason tokens/confidence outputs without router-local math.
- [ ] Update snapshot token inputs if needed for new metadata fields.
- [ ] Preserve stale snapshot token behavior exactly as-is.

## Phase 4: Mobile Explainability Rendering

- [ ] In `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`, render confidence-weighted explainability from payload only.
- [ ] Show `readiness_band`, `demand_gap`, and `dominant_limiters` when present.
- [ ] Show `evidence_confidence` cues (`score/state/reasons`) with concise copy.
- [ ] Keep chart component read-only: no local projection math duplication.

## Phase 5: Tests (Core)

- [ ] Update/add tests in `packages/core/plan/__tests__/projection-calculations.test.ts`:
  - [ ] No blocking creation path for none/sparse/stale/rich contexts.
  - [ ] Confidence decreases with stale/low-sample evidence.
  - [ ] Confidence increases with fresh/rich evidence.
  - [ ] Monotonic confidence behavior for equivalent signals as freshness improves.
  - [ ] Demand weighting blends toward conservative baseline at low confidence.
  - [ ] Demand weighting blends toward observed demand at high confidence.
  - [ ] Safety caps still clamp identically to prior semantics.
  - [ ] Start-state determinism remains intact (default vs override).
- [ ] Update/add tests in `packages/core/plan/__tests__/training-plan-preview.test.ts`:
  - [ ] Preview/create parity on weighted metadata.
  - [ ] Updated no-history metadata contract shape remains stable.

## Phase 6: Tests (tRPC + Mobile)

- [ ] Update/add tests in `packages/trpc/src/routers/__tests__/training-plans.test.ts`:
  - [ ] Preview/create parity for `projection_feasibility` and `evidence_confidence`.
  - [ ] Snapshot stale-token behavior unchanged.
  - [ ] Dynamic DB evidence changes reflected on next preview/create call.
- [ ] Add/update tests in `apps/mobile/components/training-plan/create/__tests__/CreationProjectionChart.test.tsx`:
  - [ ] Renders readiness/demand-gap details from payload.
  - [ ] Renders evidence confidence cues from payload.
  - [ ] Handles missing metadata gracefully (no crash/fallback blocking UI).

## Phase 7: Verification

- [ ] Run:
  - [ ] `pnpm --filter @repo/core check-types`
  - [ ] `pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts`
  - [ ] `pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts`
  - [ ] `pnpm --filter @repo/trpc check-types`
  - [ ] `pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts`
  - [ ] `pnpm --filter mobile check-types`

## Phase 8: Acceptance Validation

- [ ] Confirm no blocking UX for none/sparse/stale/rich data states.
- [ ] Confirm real DB data is used dynamically on every preview/create request.
- [ ] Confirm weighted evidence influences demand continuously (no binary mode switch).
- [ ] Confirm rich/fresh evidence dominates naturally through confidence, not alternate code path.
- [ ] Confirm safety invariants and deterministic outputs are preserved.
