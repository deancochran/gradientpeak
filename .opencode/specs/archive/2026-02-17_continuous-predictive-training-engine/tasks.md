# Tasks: Continuous Predictive Training Engine (Direct Replacement)

Date: 2026-02-17
Spec: `.opencode/specs/2026-02-17_continuous-predictive-training-engine/`

## Dependency Notes

- Execution order is strict: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6**.
- This is a direct replacement of existing engine internals; no v1/v2 fork path.
- Keep existing endpoint names and base payload compatibility (`previewCreationConfig`, `createFromCreationConfig`).
- Preserve blocking semantics by default; overrides must be explicit and bounded by invariant limits.
- Retain hard bounds only for true invariants; replace heuristic cliffs with continuous penalties/objective terms.

## Current Status Snapshot

- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Phase 5 complete
- [x] Phase 6 complete

## Phase 0 - Specification Baseline and Traceability

### Checklist

- [x] (owner: spec) Finalize direct-replacement design requirements and invariants policy in `design.md`.
- [x] (owner: spec) Finalize implementation workstreams and sequencing in `plan.md`.
- [x] (owner: spec+qa) Define acceptance criteria and validation classes for regression/calibration/safety.

## Phase 1 - Inverse State Estimation and Schema Plumbing (WS-A)

Depends on: **Phase 0 complete**

### Checklist

- [x] (owner: core) Add schema/types for `inferred_current_state.mean`, `inferred_current_state.uncertainty`, and `evidence_quality`.
- [x] (owner: core) Add `inferred_current_state.as_of` and snapshot metadata (`updated_at`, missingness/evidence counters).
- [x] (owner: core) Implement deterministic daily predict/update inference pass (EKF/UKF-like deterministic filter).
- [x] (owner: core) Thread previous state and evidence quality through projection build path.
- [x] (owner: core+trpc) Bootstrap inverse state from historical evidence when no prior snapshot exists.
- [x] (owner: core+trpc) Return inferred state block in preview/create projection payloads.
- [x] (owner: trpc) Persist posterior state snapshots for reuse in subsequent runs.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- projection-calculations projection-parity-fixtures`
- [x] `cd packages/trpc && pnpm check-types && pnpm test -- training-plans`

## Phase 2 - Continuous Forward Projection Replacement (WS-B)

Depends on: **Phase 1 complete**

### Checklist

- [x] (owner: core) Refactor state evolution to continuous state-based updates (remove discrete phase multiplier cliffs).
- [x] (owner: core) Remove direct week-pattern multipliers from transition logic (continuous objective terms only).
- [x] (owner: core) Keep only invariant hard bounds in safety caps and optimizer rails.
- [x] (owner: core) Convert non-invariant constraints into smooth penalty/objective contributions.
- [x] (owner: core) Emit optimization tradeoff diagnostics (goal utility, risk, volatility, churn).
- [x] (owner: core+qa) Add deterministic convergence guards and numerical stability assertions.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- projection-calculations projection-mpc-modules phase4-stabilization`

## Phase 3 - Goal/Target Utility and Priority Unification (WS-C)

Depends on: **Phase 2 complete**

### Checklist

- [x] (owner: core) Replace fallback target scoring with distribution-based target attainment utility.
- [x] (owner: core) Formalize `target.weight` in schema normalization and scoring contracts.
- [x] (owner: core) Enforce one monotonic interpretation of goal priority `0..10` across all scoring layers.
- [x] (owner: core) Centralize priority mapping (`epsilon + (priority/10)^gamma`) and reuse across score/GDI utilities.
- [x] (owner: core) Align `goalScore`, `planScore`, and `gdi` aggregation semantics with shared weighting function.
- [x] (owner: core+qa) Add impossible-overlap scenarios to prevent unrealistic near-100 multi-goal outcomes.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- target-satisfaction goal-plan-score gdi`

## Phase 4 - Safety Enforcement and Override Policy (WS-D)

Depends on: **Phase 3 complete**

### Checklist

- [x] (owner: trpc) Remove blanket `blocking -> warning` severity downgrades in preview/create use cases.
- [x] (owner: trpc) Add explicit `override_policy` input contract and audit-trace fields.
- [x] (owner: trpc+core) Ensure override scope adjusts objective/risk budget terms only (never invariant gates).
- [x] (owner: trpc+core) Ensure invariant-bound violations remain non-overridable.
- [x] (owner: mobile) Enforce create gating when unresolved blocking issues exist without explicit override.
- [x] (owner: qa) Add end-to-end tests for blocking behavior and explicit override flow.

### Test Commands

- [x] `cd packages/trpc && pnpm check-types && pnpm test -- training-plans createFromCreationConfigUseCase previewCreationConfigUseCase`
- [x] `cd apps/mobile && pnpm check-types && pnpm test -- training-plan-create SinglePageForm.blockers`

## Phase 5 - API Compatibility and UI Integration (WS-E)

Depends on: **Phase 4 complete**

### Checklist

- [x] (owner: core+trpc) Add additive contract fields: `inferred_current_state`, `prediction_uncertainty`, `goal_target_distributions`, `optimization_tradeoff_summary`.
- [x] (owner: core+trpc) Preserve backward compatibility for existing consumers and route names.
- [x] (owner: core+trpc+mobile) Preserve `goal_assessments.goal_readiness_score` as primary readiness UI signal.
- [x] (owner: mobile) Keep readiness-first review UI behavior powered by continuous model outputs.
- [x] (owner: mobile) Add non-blocking uncertainty/confidence hints where diagnostics are available.
- [x] (owner: qa) Add compatibility tests ensuring old request/response flows still parse and render.

### Test Commands

- [x] `cd packages/core && pnpm test -- training-plan-creation-contracts`
- [x] `cd packages/trpc && pnpm test -- training-plans`
- [x] `cd apps/mobile && pnpm test -- SinglePageForm CreationProjectionChart.metadata`

## Phase 6 - Validation, Calibration, and Release Gates (WS-F)

Depends on: **Phase 5 complete**

### Checklist

- [x] (owner: core+qa) Add inverse-inference output tests covering state mean/uncertainty and evidence quality.
- [x] (owner: core+qa) Add calibration tests comparing predicted attainment distributions vs observed outcomes.
- [x] (owner: core+qa) Add equal-priority and mixed-priority tradeoff tests across multi-goal scenarios.
- [x] (owner: core+qa) Add invariant property tests proving bounds never violate under stress.
- [x] (owner: trpc+qa) Add preview/create parity and stale-state handling regression tests.
- [x] (owner: spec+qa) Verify all acceptance criteria from `design.md` and definition-of-done from `plan.md`.
- [x] (owner: core+trpc+mobile) Run full monorepo validation gate.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`
- [x] `cd /home/deancochran/GradientPeak && pnpm check-types && pnpm lint && pnpm test`

## Definition of Done

- [x] Every preview/create run performs inverse inference and returns inferred current state plus uncertainty.
- [x] Forward projection is continuous, uncertainty-aware, and free of heuristic hard cliffs outside invariants.
- [x] No discrete week-pattern multipliers remain in state transition logic.
- [x] Multi-goal and multi-target optimization uses consistent target weighting and priority `0..10` semantics.
- [x] Blocking conditions remain blocking by default; override is explicit, auditable, and invariant-bounded.
- [x] Existing routes and core UI flow remain compatible with additive diagnostics only.
- [x] Deterministic regression, calibration, and safety/invariant tests are green.
