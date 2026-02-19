# Tasks: Single-Mode Capacity-Envelope Planning

Date: 2026-02-15
Spec: `.opencode/specs/2026-02-15_training-plan-single-mode-capacity-envelope/`

## Dependency Notes

- Execution order is strict: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7**.
- Do not begin a phase until prior phase exit criteria are satisfied.
- `@repo/core` types and schemas are the source of truth.

## Current Status Snapshot

- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Phase 5 complete
- [x] Phase 6 complete
- [x] Phase 7 complete

## Current Execution Focus (2026-02-15)

- [x] Complete Phase 5 core/trpc/mobile coherence path by introducing a canonical chart display series contract and consuming it in mobile without local synthetic point injection.
- [x] Add cross-layer readiness coherence assertions (core projection fixture + trpc parity + mobile rendering fixture) for headline readiness and displayed curve consistency.
- [x] Start Phase 6 objective hardening by making preparedness-first objective semantics explicit in optimizer scoring and adding deterministic tests for safe-best outcome behavior.

## Phase 0 - Contract Migration Scaffolding

### Checklist

- [x] (owner: core) Remove active `mode`, `risk_acceptance`, and `constraint_policy` fields from `packages/core/schemas/training_plan_structure.ts`.
- [x] (owner: core) Add temporary legacy-field migration parser with deprecation warning code emission.
- [x] (owner: core) Remove `mode_applied` and `overrides_applied` from `packages/core/plan/projectionTypes.ts`.
- [x] (owner: core) Add `readiness_confidence` and `capacity_envelope` output contracts in `packages/core/plan/projectionTypes.ts`.
- [x] (owner: core) Confirm canonical ordering and rounding utilities still apply identically for goal/target permutations.
- [x] (owner: trpc) Accept new single-mode payload shapes in preview/create without local type redefinition.
- [x] (owner: mobile) Align create-form adapters/types to remove mode/risk inputs.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`

## Phase 1 - Single Readiness + Capacity Envelope

Depends on: **Phase 0 complete**

### Checklist

- [x] (owner: core) Implement envelope bound computation in `packages/core/plan/projection/capacity-envelope.ts` (profile/history-aware low/high/ramp bounds).
- [x] (owner: core) Implement weekly envelope penalties and final `envelope_score`.
- [x] (owner: core) Implement single readiness composite in `packages/core/plan/projection/readiness.ts`.
- [x] (owner: core) Emit only one readiness headline: `readiness_score`.
- [x] (owner: core) Emit `readiness_confidence`, `readiness_rationale_codes`, and `capacity_envelope` diagnostics.
- [x] (owner: core) Ensure CTL/ATL/TSB remain in `training_state` block only and no suitability classification fields are emitted.
- [x] (owner: core) Integrate updated readiness/envelope pipeline in `packages/core/plan/projectionCalculations.ts`.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/core && pnpm test -- --runInBand`

## Phase 2 - API + Persistence Migration

Depends on: **Phase 1 complete**

### Checklist

- [x] (owner: trpc) Remove mode/risk validation branches from preview/create use cases.
- [x] (owner: trpc) Remove `mode_applied` and `overrides_applied` from API response contracts.
- [x] (owner: trpc) Pass through `readiness_score`, `readiness_confidence`, and `capacity_envelope` unchanged.
- [x] (owner: trpc) Stop persisting override acceptance metadata for new plans.
- [x] (owner: trpc) Stop persisting override-policy metadata for new plans.
- [x] (owner: trpc) Keep historical records readable without backfill.
- [x] (owner: trpc) Implement legacy-field cutoff flag and deprecation telemetry.

### Test Commands

- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `pnpm check-types && pnpm lint`

## Phase 3 - UX Migration

Depends on: **Phase 2 complete**

### Checklist

- [x] (owner: mobile) Remove mode selector UI from `apps/mobile/components/training-plan/create/SinglePageForm.tsx`.
- [x] (owner: mobile) Remove acknowledgement gate UI and validation.
- [x] (owner: mobile) Keep constraints editor always accessible and user-editable.
- [x] (owner: mobile) Update review chart/UI to show single readiness headline + confidence.
- [x] (owner: mobile) Add envelope state display (`inside/edge/outside`) with limiting factors.
- [x] (owner: mobile) Present CTL/ATL/TSB under training-state labeling with explicit non-suitability wording.
- [x] (owner: mobile) Update adapters/validation to stop sending legacy mode/risk fields.

### Test Commands

- [x] `cd apps/mobile && pnpm check-types && pnpm test`
- [x] `pnpm check-types && pnpm lint`

## Phase 4 - Hard Cutoff + Stabilization

Depends on: **Phase 3 complete**

### Checklist

- [x] (owner: core/trpc) Remove temporary legacy parser path and hard-reject removed mode/risk fields.
- [x] (owner: core) Complete unit coverage for readiness composite, envelope penalties, and schema rejection behavior.
- [x] (owner: core) Complete property tests for determinism, permutation invariance, and monotonicity.
- [x] (owner: core/trpc) Complete golden tests for migrated high-risk scenarios and sparse-history realism behavior.
- [x] (owner: trpc/mobile) Verify preview/create parity and client adapter parity after field removals.
- [x] (owner: core/trpc) Validate p50/p95/p99 latency, error rate, and fallback metrics remain within guardrails.
- [x] (owner: core/api/mobile) Complete rollout checklist and release gate signoff.

### Test Commands

- [x] `pnpm check-types && pnpm lint && pnpm test`
- [x] `cd packages/core && pnpm test`
- [x] `cd packages/trpc && pnpm test`
- [x] `cd apps/mobile && pnpm test`

## Definition of Done

- [x] No safe/risk mode toggle exists in schemas, API, or UI.
- [x] No acknowledgement requirement exists for aggressive custom settings.
- [x] No persistence/reporting of override metadata exists for new plans.
- [x] Single readiness metric is the only readiness headline and includes capacity-envelope realism.
- [x] CTL/ATL/TSB are exposed only as training-state metrics, never suitability labels.
- [x] Determinism and performance gates pass at release threshold.
- [x] Default planner objective is safety-first and maximizes highest achievable preparedness toward 100.
- [x] Readiness timeline and headline semantics remain coherent in core/trpc/mobile outputs.
- [x] No derivable duplicate input aliases remain in active creation/projection contracts.

## Phase 5 - Readiness Coherence + Visual Truth Alignment

Depends on: **Phase 4 complete**

### Checklist

- [x] (owner: core/mobile) Remove standalone readiness metadata card from chart review UI to avoid duplicate/conflicting readiness narratives.
- [x] (owner: core) Cap goal-anchored point readiness to plan readiness when plan readiness is supplied.
- [x] (owner: core) Refactor readiness orchestration to avoid semantic overwrite between feasibility and composite stages.
- [x] (owner: core) Provide explicit chart-ready readiness series contract (`display_points`) to minimize client-side reshaping.
- [x] (owner: mobile) Consume canonical readiness display series from API/core payload and reduce local synthetic point manipulation.
- [x] (owner: core/trpc/mobile) Add cross-layer readiness coherence fixture test (headline, point series, goal-date behavior).

### Test Commands

- [x] `cd packages/core && pnpm test -- --runInBand`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`

## Phase 6 - Safety-First Objective Hardening

Depends on: **Phase 5 complete**

### Checklist

- [x] (owner: core) Make optimizer objective explicit: maximize safe achievable preparedness toward readiness 100.
- [x] (owner: core) Preserve ramp/CTL/recovery as hard constraints in default path and assert no violations under optimization.
- [x] (owner: core/trpc) Ensure infeasible goals still yield best-safe plan progression without create blocking.
- [x] (owner: core) Add objective-coherence tests (preparedness-first ordering with deterministic tie-break behavior).
- [x] (owner: trpc/mobile) Reflect safety-first default policy in preview/create explanatory copy and diagnostics.

### Test Commands

- [x] `cd packages/core && pnpm test -- --runInBand`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`

## Phase 7 - Schema Governance + Maintainability Cleanup

Depends on: **Phase 6 complete**

### Checklist

- [x] (owner: core/trpc/mobile) Remove derived duplicate suggestions input alias `recent_influence_score` and use canonical `recent_influence.influence_score` object path.
- [x] (owner: spec) Document no-derived-duplicates schema policy in design spec.
- [x] (owner: core) Identify and remove remaining low-risk duplicate/legacy schema aliases in active contracts.
- [x] (owner: trpc) Add write-boundary canonicalization tests to ensure persisted structures use canonical parsed shapes.
- [x] (owner: mobile) Add adapter contract tests that fail on reintroduction of deprecated/inferred alias fields.
- [x] (owner: core/trpc/mobile) Add schema release-gate checklist execution artifact in this spec folder.

### Test Commands

- [x] `cd packages/core && pnpm test -- --runInBand`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`
