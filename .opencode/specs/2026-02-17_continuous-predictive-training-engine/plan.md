# Continuous Predictive Training Engine - Implementation Plan

Date: 2026-02-17
Related design: `.opencode/specs/2026-02-17_continuous-predictive-training-engine/design.md`
Goal: direct replacement of training-plan projection/scoring internals with a continuous bidirectional model.

## 1) Requirements Review -> Current Implementation Gaps

### R1. Forward directional modeling (forward prediction of user state and training load/readiness/etc)

- Requirement:
  - Infer current user state from history/efforts/profile/prior state.
  - Predict future load and readiness from inferred state.

### R2. Continuous model replacing heuristic cliffs

- Requirement:
  - Keep only invariant hard bounds.
  - Convert heuristic discrete multipliers/cliffs to continuous penalties/objective terms.
- Current gap:
  - Fixed week multipliers/pattern logic and multiple hard-coded heuristic transitions exist in `packages/core/plan/projectionCalculations.ts`.
  - `packages/core/plan/projection/safety-caps.ts` includes profile presets that currently act as strong behavioral rails.

### R3. Multi-goal/multi-target optimization with explicit priorities

- Requirement:
  - Optimize across all goals and targets with priority `0..10` and target weights.
- Current gap:
  - Goal priority handling is improving but still split across scoring/readiness/GDI modules with inconsistent semantics.
  - Target weight is not formally part of core target schema contract and can be implicit/fallback in scoring.

### R4. Safety-first unless overridden, preserving true blocking semantics

Users are not forced to fix risky training plans, but accept risk of those plans and are allowed to make them for themselves/have a coach make it for them

- Requirement:
  - Unsafe states remain blocking by default.
  - Overrides are explicit and bounded by invariants.
- Current gap:
  - Blocking conflicts are downgraded to warnings in preview/create use cases:
    - `packages/trpc/src/application/training-plan/previewCreationConfigUseCase.ts`
    - `packages/trpc/src/application/training-plan/createFromCreationConfigUseCase.ts`
  - UI create gate currently does not enforce blocking issues:
    - `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

### R5. Rich evidence ingestion and uncertainty-aware outputs

- Requirement:
  - Use activities, efforts, profile metrics, and previous state with uncertainty propagation.
- Current gap:
  - Evidence is partially integrated, but outputs are mostly deterministic scores with limited uncertainty exposure.

### R6. API compatibility + additive diagnostics

- Requirement:
  - Keep existing endpoints and payload compatibility while adding inferred state and uncertainty fields.
- Current gap:
  - Current payload does not include full inferred state mean/uncertainty block.

## 2) Implementation Workstreams

## WS-A: State Estimation and Persistence (Inverse model)

### Deliverables

- Add core types/schemas for inferred state and uncertainty.
- Build deterministic filter pipeline (predict/update) in core.
- Persist posterior state snapshot for reuse.
- Bootstrap inferred state from historical evidence when snapshot is absent.

### Files

- `packages/core/schemas/training_plan_structure.ts`
- `packages/core/plan/projectionTypes.ts`
- `packages/core/plan/projection/readiness.ts`
- `packages/core/plan/projectionCalculations.ts`
- `packages/trpc/src/routers/training-plans.base.ts` (wiring)

### Tasks

1. Add schema blocks:
   - `inferred_current_state.mean`
   - `inferred_current_state.uncertainty`
   - `evidence_quality`
   - `inferred_current_state.as_of`
2. Implement state update functions using continuous equations.
3. Thread previous-state input into preview/create projection build path.
4. Return inferred state in `projection_chart` payload.

### Acceptance checks

- Preview and create both run inverse inference on every compute.
- Posterior snapshot persists (`state_mean`, `state_uncertainty`, `evidence_quality`, `updated_at`) and is reused.
- Missing prior snapshot bootstraps from historical activity/effort/profile evidence.

## WS-B: Continuous Forward Projection Replacement

### Deliverables

- Replace heuristic discontinuities in weekly planning with continuous objective-driven evolution.
- Maintain invariant bounds only.

### Files

- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/projection/safety-caps.ts`
- `packages/core/plan/projection/effective-controls.ts`
- `packages/core/plan/projection/mpc/lattice.ts`

### Tasks

1. Refactor week evolution to state-based updates, not phase-multiplier cliffs.
2. Keep absolute physiological/domain bounds; convert non-invariant rules into soft penalties.
3. Expose optimization tradeoff diagnostics (goal utility vs risk/volatility/churn).

### Acceptance checks

- No discrete week-pattern multipliers directly control state transitions.
- Invariants remain hard bounds; all other guardrails are continuous penalties/objective terms.
- Tradeoff diagnostics are emitted in projection outputs.

## WS-C: Goal/Target Utility and Priority Consistency

### Deliverables

- Unified scoring semantics across target, goal, plan, and feasibility layers.

### Files

- `packages/core/plan/scoring/targetSatisfaction.ts`
- `packages/core/plan/scoring/goalScore.ts`
- `packages/core/plan/scoring/planScore.ts`
- `packages/core/plan/scoring/gdi.ts`
- `packages/core/schemas/training_plan_structure.ts`

### Tasks

1. Replace fallback target satisfaction with distribution-based attainment from inferred state.
2. Formalize `target.weight` in target schema and payload normalization.
3. Ensure `priority 0..10` has one monotonic interpretation everywhere.
4. Align GDI aggregation with the same continuous priority weighting used by plan score.

### Acceptance checks

- Shared priority mapping function is used across target/goal/plan/GDI layers.
- Equal priorities produce approximately equal optimization pressure.
- Conflicting goals show realistic tradeoffs rather than dual near-100 outcomes.

## WS-D: Safety Enforcement and Override Policy

### Deliverables

- Blocking remains blocking by default end-to-end.
- Explicit override flow with bounded effects.

### Files

- `packages/trpc/src/application/training-plan/previewCreationConfigUseCase.ts`
- `packages/trpc/src/application/training-plan/createFromCreationConfigUseCase.ts`
- `packages/trpc/src/routers/training-plans.base.ts`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

### Tasks

1. Stop blanket severity downgrade from `blocking` -> `warning`.
2. Add explicit `override_policy` input contract and audit trail fields.
3. Gate create in UI for blocking unless override is explicitly set.
4. Ensure invariant-bound violations are non-overridable.

### Acceptance checks

- Blocking remains blocking by default across preview and create.
- Override only adjusts objective/risk-budget behavior and is auditable.
- Invariant violations remain hard non-overridable failures.

## WS-E: API/Contract Compatibility and UI Signal Integration

### Deliverables

- Keep route names and existing response compatibility.
- Additive payload fields for inferred state and uncertainty consumed by current UI.

### Files

- `packages/core/contracts/training-plan-creation/schemas.ts`
- `packages/core/plan/projectionTypes.ts`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`

### Tasks

1. Add optional fields in contract schemas for new diagnostics.
2. Keep existing readiness ring behavior, now driven by continuous model outputs.
3. Add confidence/uncertainty display hints where useful (non-blocking UI enhancement).

### Acceptance checks

- Existing route names and request/response contracts remain compatible (additive fields only).
- `goal_assessments.goal_readiness_score` remains primary UI readiness signal.
- New diagnostics render without blocking existing create/review flows.

## WS-F: Validation, Calibration, and Regression Coverage

### Deliverables

- Strong automated verification for modeling correctness and safety guarantees.

### Files (test focus)

- `packages/core/plan/__tests__/projection-calculations.test.ts`
- `packages/core/plan/__tests__/projection-parity-fixtures.test.ts`
- `packages/core/plan/__tests__/target-satisfaction.test.ts`
- `packages/core/plan/__tests__/goal-plan-score.test.ts`
- `packages/core/plan/__tests__/gdi.test.ts`
- `packages/trpc/src/routers/__tests__/training-plans.test.ts`
- `apps/mobile/components/training-plan/create/__tests__/SinglePageForm.blockers.test.tsx`

### Tasks

1. Add tests for inverse inference outputs (state + uncertainty).
2. Add impossible-overlap scenario tests (no unrealistic dual-100 readiness).
3. Add equal-priority and mixed-priority tradeoff tests.
4. Add invariant property tests (bounds never violated).
5. Add API compatibility tests for additive fields.
6. Add calibration checks for predicted attainment distributions vs observed outcomes.

### Acceptance checks

- Deterministic regression, calibration, and invariant/property suites pass.
- Preview/create parity and stale-state handling regressions are covered.
- Full monorepo gate passes: `pnpm check-types && pnpm lint && pnpm test`.

## 3) Execution Sequence (Direct Replacement)

1. WS-A (state schema + inference plumbing)
2. WS-B (continuous projection replacement)
3. WS-C (utility/scoring unification)
4. WS-D (blocking/override enforcement)
5. WS-E (contract + UI wiring)
6. WS-F (test hardening and calibration checks)

No feature fork and no alternate engine path.

Ordering constraint: WS-E can start after WS-A and WS-C outputs are stable, but release must still follow WS-D safety policy enforcement.

## 4) Definition of Done

- Inferred current state is produced and returned on preview/create.
- Forward projection is generated from inferred state, with uncertainty-aware outputs.
- Multi-goal/multi-target optimization uses consistent priority + target weighting.
- Blocking semantics are preserved by default; override is explicit and bounded.
- Invariant hard bounds are enforced; non-invariant heuristics are continuous penalties.
- Existing route/UI flow works without renaming endpoints.
- Required tests pass and new scenario regressions are covered.

## 5) Risks and Mitigations

- Risk: numerical instability in continuous optimizer
  - Mitigation: bounded parameter domains, deterministic lattice bounds, convergence guards.
- Risk: behavioral drift from current outputs
  - Mitigation: fixture-based regression with acceptance thresholds and calibration metrics.
- Risk: user confusion during transition
  - Mitigation: keep UI structure stable; add concise uncertainty/readiness rationale text.
