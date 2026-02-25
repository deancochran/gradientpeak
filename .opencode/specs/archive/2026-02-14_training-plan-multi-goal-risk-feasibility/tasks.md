# Tasks: Multi-Goal Feasibility and Risk-Accepted Readiness

Date: 2026-02-14  
Spec: `.opencode/specs/2026-02-14_training-plan-multi-goal-risk-feasibility/`

## Dependency Notes

- Execution order is strict: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4**.
- Do not start a phase until prior phase exit criteria are green.
- Core contracts are the single source of truth; trpc and mobile must consume core types.
- Phase 0 has been partially implemented in code already: mode/risk contracts, canonicalization, preview snapshot payload updates, and some mobile shape wiring.
- This checklist marks known completed Phase 0 groundwork as `[x]` and tracks remaining completion/verification items as `[ ]`.

## Phase 0 - Contract and Determinism Foundation

### Checklist

- [x] (owner: core) Add `mode`, `risk_acceptance`, and `constraint_policy` to creation config schema in `packages/core/schemas/training_plan_structure.ts`.
- [x] (owner: core) Add projection output contract fields for `risk_level`, `risk_flags`, `caps_applied`, `overrides_applied`, and `goal_assessments` in `packages/core/plan/projectionTypes.ts`.
- [x] (owner: core) Implement deterministic canonical ordering for goals (`priority`, `event_date`, `id`) and targets (`kind`, stable id/key), including centralized rounding policy.
- [x] (owner: trpc) Include new mode/risk fields in preview/create config flow and canonical snapshot payload used for tokening.
- [x] (owner: mobile) Align create form/adapters with expanded config shape (initial wiring only; no behavior change).
- [x] (owner: core) Verify canonicalization invariance for equivalent permuted goal/target input payloads.
- [x] (owner: trpc) Verify preview/create passthrough remains behavior-neutral while returning expanded fields.
- [x] (owner: mobile) Complete type-level parity checks for all create flow adapters consuming projection/config fields.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`

## Phase 1 - Multi-Goal + Multi-Target Scoring and Feasibility Engine

Depends on: **Phase 0 complete**

### Checklist

- [x] (owner: core) Add deterministic target satisfaction engine for all target kinds in `packages/core/plan/scoring/targetSatisfaction.ts` with tolerance-aware piecewise curves.
- [x] (owner: core) Add per-goal aggregation in `packages/core/plan/scoring/goalScore.ts` and plan-level A/B/C weighted aggregation in `packages/core/plan/scoring/planScore.ts`.
- [x] (owner: core) Implement GDI model in `packages/core/plan/scoring/gdi.ts` (PG/LG/TP/SP, per-goal GDI, plan GDI worst-case A-goal guard, feasibility band mapping).
- [x] (owner: core) Extend readiness cap policy in `packages/core/plan/projection/safety-caps.ts` to enforce safe-mode caps and optional risk-mode cap lift to 100.
- [x] (owner: core) Integrate scoring + feasibility metadata into projection outputs in `packages/core/plan/projection/readiness.ts` and `packages/core/plan/projectionCalculations.ts`.
- [x] (owner: trpc) Pass through new plan/goal/target assessment fields unchanged in preview/create responses.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/core && pnpm test -- --runInBand`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`

## Phase 2 - Deterministic Constrained MPC Integration

Depends on: **Phase 1 complete**

### Checklist

- [x] (owner: core) Add MPC modules: `lattice.ts`, `constraints.ts`, `objective.ts`, `solver.ts`, and `tiebreak.ts` under `packages/core/plan/projection/mpc/`.
- [x] (owner: core) Encode fixed profile bounds (sustainable H=2/C=5, balanced H=4/C=7, outcome_first H=6/C=9) with deterministic pruning and hard compute budget.
- [x] (owner: core) Refactor weekly projection loop in `packages/core/plan/projectionCalculations.ts` to MPC receding-horizon execution (apply first action, roll forward, repeat).
- [x] (owner: core) Enforce safe-mode hard constraints and policy-driven risk-mode softening without nondeterministic branches.
- [x] (owner: core) Preserve deterministic fallback chain (full MPC -> degraded bounded MPC -> legacy optimizer -> cap-only baseline) with reason-coded diagnostics.
- [x] (owner: core) Emit diagnostics (`evaluated candidates`, `pruned branches`, `active constraints`, `tiebreak chain`) in projection metadata.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/core && pnpm test -- --runInBand`
- [x] `pnpm check-types && pnpm lint`

## Phase 3 - API and Mobile Integration

Depends on: **Phase 2 complete**

### Checklist

- [x] (owner: trpc) Enforce server validation: `mode = risk_accepted` requires `risk_acceptance.accepted === true`.
- [x] (owner: trpc) Wire full mode/risk/assessment payload fields through preview/create use cases and router responses.
- [x] (owner: mobile) Add mode selector and risk acknowledgement gate in `apps/mobile/components/training-plan/create/SinglePageForm.tsx`.
- [x] (owner: mobile) Surface per-goal feasibility, per-target satisfaction, and conflict trade-off reasons in create/review UI.
- [x] (owner: mobile) Add mode/risk/cap/override annotations to projection review in `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`.
- [x] (owner: mobile) Align client validation in `apps/mobile/lib/training-plan-form/validation.ts` with server-side risk-mode requirements.
- [x] (owner: trpc) Persist acceptance timestamp/reason and active overrides in create metadata.

### Test Commands

- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`
- [x] `pnpm check-types && pnpm lint`

## Phase 4 - Professional Release Gates and Stabilization

Depends on: **Phase 3 complete**

### Checklist

- [x] (owner: core) Complete unit suite for scoring curves, GDI bands, readiness caps, risk validation, tie-break determinism, and conflict attribution.
- [x] (owner: core) Complete property suite for deterministic replay, permutation invariance, constraint monotonicity, and harder-target monotonicity.
- [x] (owner: core) Complete golden scenarios: impossible marathon safe vs risk, overlapping A goals, conflicting multi-target goals, baseline feasible parity.
- [x] (owner: trpc) Add integration coverage for preview/create parity, stale token invalidation, and mode/risk validation behavior.
- [x] (owner: mobile) Add adapter and UI integration coverage for payload parity and risk acknowledgement flow.
- [x] (owner: core/trpc) Validate p50/p95/p99 latency and solver diagnostics thresholds; block rollout if sustained regression exceeds agreed limits.
- [x] (owner: trpc) Validate backout controls: force-safe fallback and reason-coded telemetry remain operational.

### Test Commands

- [x] `pnpm check-types && pnpm lint && pnpm test`
- [x] `cd packages/core && pnpm test`
- [x] `cd packages/trpc && pnpm test`
- [x] `cd apps/mobile && pnpm test`

## Definition of Done (Design Gate Aligned)

- [x] Mode/risk model is implemented end-to-end across schema, optimizer, API, and mobile UX.
- [x] Per-goal and per-target scoring/assessment is visible in preview/create outputs.
- [x] Determinism, property, and golden suites pass, including goal/target permutation invariance.
- [x] Impossible-goal scenarios are labeled truthfully and safe mode readiness remains constrained by feasibility band.
- [x] Bounded-compute MPC path meets p95 preview/create latency guardrails with stable diagnostics.
