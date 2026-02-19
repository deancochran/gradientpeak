# Implementation Plan: Professional Multi-Goal + Multi-Target Planner

Date: 2026-02-14
Owner: Core planning + API + mobile create flow
Status: Proposed
Depends on: `design.md` in this spec folder

## Planning Approach

This plan is intentionally dependency-aware.

Each phase assumes all previous phases are complete, merged, and stable.
No phase should rely on partial work from a later phase.

Execution order is mandatory:

1. Phase 0: Contract and determinism foundation
2. Phase 1: Scoring + feasibility + readiness policy
3. Phase 2: Deterministic constrained MPC solver integration
4. Phase 3: API/UI integration and rollout guardrails
5. Phase 4: Professional release gates and stabilization

## Phase Overview

| Phase | Objective                                                                       | Hard dependency | Independent deliverable                                             |
| ----- | ------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------- |
| 0     | Add mode/risk contracts and canonical deterministic ordering                    | none            | Stable core/trpc/mobile contracts without behavior flip             |
| 1     | Implement multi-goal/multi-target scoring + GDI feasibility + readiness capping | Phase 0         | Pure core scoring engine and explainability outputs                 |
| 2     | Replace optimizer path with bounded deterministic MPC                           | Phase 1         | Core projection path with deterministic MPC and compute diagnostics |
| 3     | Wire mode/risk and assessments through preview/create + mobile UX               | Phase 2         | End-to-end product flow with explicit risk acknowledgement          |
| 4     | Enforce release gates and stabilize p95 behavior                                | Phase 3         | Production-readiness signoff package                                |

## Phase 0 - Contract and Determinism Foundation

### Assumed context from previous phases

No previous phase exists. This phase defines the only valid contracts for all later work.

### Objectives

1. Introduce planning mode and risk acceptance contracts.
2. Add constraint policy fields required by design.
3. Enforce canonical ordering and deterministic normalization.
4. Preserve current runtime behavior while expanding shape.

### Technical work

1. Core schema and type updates
   - Update `packages/core/schemas/training_plan_structure.ts`
     - Add `mode`, `risk_acceptance`, and `constraint_policy` to creation config schema.
     - Add output fields for risk/caps/overrides and goal-level assessments.
   - Update `packages/core/plan/projectionTypes.ts`
     - Add canonical interfaces for `risk_level`, `risk_flags`, `caps_applied`, `overrides_applied`, `goal_assessments`.
   - Update `packages/core/plan/index.ts` and `packages/core/schemas/index.ts` exports.

2. Deterministic canonicalization primitives
   - Add/extend canonical sort utility in core for:
     - goals: `priority`, `event_date`, `id`
     - targets: `kind`, stable target key/id
   - Ensure deterministic numeric rounding policy is centralized and reused.

3. tRPC passthrough wiring (no behavior change)
   - Update `packages/trpc/src/routers/training-plans.base.ts`
   - Update `packages/trpc/src/application/training-plan/previewCreationConfigUseCase.ts`
   - Update `packages/trpc/src/application/training-plan/createFromCreationConfigUseCase.ts`
   - Include new fields in preview snapshot token canonical payload.

4. Mobile config type alignment (no behavior change)
   - Update `apps/mobile/components/training-plan/create/SinglePageForm.tsx` form type.
   - Update `apps/mobile/lib/training-plan-form/adapters/creationConfig.ts` mapping shape.

### Risks and mitigations

1. Contract drift across layers
   - Mitigation: define core as single source of truth; no router-local redefinition.
2. Hidden nondeterminism from object key ordering
   - Mitigation: canonicalization before snapshot hashing and scoring.

### Exit criteria

1. Preview/create parse and return new fields without breaking existing callers.
2. Permuted goal/target input order yields identical normalized payload + token.
3. Type checks pass for core, trpc, mobile.

## Phase 1 - Multi-Goal + Multi-Target Scoring and Feasibility Engine

### Assumed context from previous phases

Phase 0 contracts are finalized and stable. Mode/risk fields exist and are validated at schema level.

### Objectives

1. Implement target satisfaction scoring for all target kinds.
2. Implement per-goal and plan-level aggregation with A/B/C precedence.
3. Implement GDI feasibility model and band classification.
4. Apply mode-aware readiness cap policy and explainability metadata.

### Technical work

1. Target satisfaction engine
   - Add `packages/core/plan/scoring/targetSatisfaction.ts`
   - Implement deterministic piecewise satisfaction curves with tolerance behavior.
   - Produce per-target: `score_0_100`, `unmet_gap`, `rationale_codes`.

2. Goal and plan aggregation
   - Add `packages/core/plan/scoring/goalScore.ts`
   - Add `packages/core/plan/scoring/planScore.ts`
   - Implement weighted target aggregation and tiered A/B/C plan objective terms.

3. Feasibility model
   - Add `packages/core/plan/scoring/gdi.ts`
   - Compute per-goal `PG/LG/TP/SP`, goal GDI, and plan GDI with A-goal worst-case guard.
   - Map to bands: `feasible/stretch/aggressive/nearly_impossible/infeasible`.

4. Mode-aware readiness cap policy
   - Extend `packages/core/plan/projection/safety-caps.ts`
   - Add `resolveReadinessCap` and `applyModeAwareReadinessCap`.
   - Safe mode enforces band cap; risk mode optionally lifts cap to 100 when policy allows.

5. Projection integration
   - Extend `packages/core/plan/projection/readiness.ts`
   - Extend `packages/core/plan/projectionCalculations.ts`
   - Emit `goal_assessments` and plan-level risk/feasibility metadata.

### Risks and mitigations

1. False confidence from target scoring calibration
   - Mitigation: conservative default curves and impossible-goal golden fixtures.
2. Priority semantics inconsistency
   - Mitigation: canonical priority mapping with dedicated unit tests.

### Exit criteria

1. Goal and target scores are present for every projected plan.
2. Feasibility band and readiness cap behavior match design in safe vs risk modes.
3. Property tests confirm determinism and monotonicity constraints.

## Phase 2 - Deterministic Constrained MPC Integration

### Assumed context from previous phases

Phase 1 scoring, feasibility, and readiness cap APIs are stable and already used by projection.

### Objectives

1. Replace weekly optimizer with bounded deterministic MPC loop.
2. Keep safe-mode hard constraints and policy-based risk-mode softening.
3. Guarantee bounded compute and deterministic tie-breaks.

### Technical work

1. MPC modules
   - Add `packages/core/plan/projection/mpc/lattice.ts`
   - Add `packages/core/plan/projection/mpc/constraints.ts`
   - Add `packages/core/plan/projection/mpc/objective.ts`
   - Add `packages/core/plan/projection/mpc/solver.ts`
   - Add `packages/core/plan/projection/mpc/tiebreak.ts`

2. Solver bounds and profiles
   - Encode fixed horizon/candidate bounds by profile:
     - sustainable: H=2, C=5
     - balanced: H=4, C=7
     - outcome_first: H=6, C=9
   - Enforce per-week evaluation budget and deterministic pruning.

3. Projection engine integration
   - Refactor `packages/core/plan/projectionCalculations.ts` to call MPC solve each week.
   - Apply first control action, roll state forward, repeat.
   - Preserve deterministic fallback chain:
     1. full MPC,
     2. degraded bounded MPC,
     3. legacy optimizer,
     4. cap-only baseline.

4. Diagnostics and explainability
   - Emit objective component summaries and solver diagnostics:
     - evaluated candidates,
     - pruned branches,
     - active constraints,
     - tie-break reason chain.

### Compute guardrails

1. Hard maximum solve budget per projection request.
2. No unbounded branching (`C^H` exhaustive expansion forbidden in runtime path).
3. Precompute week static context once (block membership, recovery overlap, active-goal window).
4. Evaluate only active goals/targets within horizon window.

### Risks and mitigations

1. Latency spikes under multi-goal high-horizon plans
   - Mitigation: strict budget limits + deterministic fallback.
2. Solver quality regressions on baseline feasible plans
   - Mitigation: parity golden suite and objective regression checks.

### Exit criteria

1. Deterministic MPC selected path is identical across repeated runs.
2. Safe-mode hard constraints are never bypassed.
3. p95 preview/create latency remains within agreed target envelope.

## Phase 3 - API and Mobile Integration

### Assumed context from previous phases

Phase 2 core projection payload is stable and includes mode/risk/goal-target metadata.

### Objectives

1. Expose mode selector and explicit risk acknowledgement in UX.
2. Surface per-goal/per-target assessments and conflict reasons.
3. Persist risk acceptance and override metadata in create flow.

### Technical work

1. API wiring
   - Update `packages/trpc/src/routers/training-plans.base.ts` preview/create responses.
   - Update `packages/trpc/src/application/training-plan/previewCreationConfigUseCase.ts`.
   - Update `packages/trpc/src/application/training-plan/createFromCreationConfigUseCase.ts`.
   - Enforce: `risk_accepted` mode requires acceptance payload.

2. Mobile form and review UX
   - Update `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
     - mode selector,
     - risk acknowledgement gate,
     - per-goal feasibility and per-target satisfaction display,
     - conflict trade-off messaging.
   - Update `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`
     - show mode/risk labels and key cap/override annotations.
   - Update `apps/mobile/lib/training-plan-form/validation.ts`
     - client-side guardrails aligned with server rules.

3. Persistence metadata
   - Ensure created plan metadata includes:
     - acceptance timestamp,
     - acceptance reason (if provided),
     - active overrides,
     - safe-feasibility status labels.

### Risks and mitigations

1. UX overload from dense diagnostics
   - Mitigation: progressive disclosure (headline first, expand details).
2. Unsafe defaults due to UI state handling bugs
   - Mitigation: server-side enforcement authoritative; UI is advisory.

### Exit criteria

1. User can create safe-mode and risk-mode plans with correct rules.
2. Review UI clearly shows per-goal and per-target outcomes.
3. Create flow stores acceptance/override metadata deterministically.

## Phase 4 - Professional Release Gates and Stabilization

### Assumed context from previous phases

All functionality is implemented end-to-end and feature-complete.

### Objectives

1. Verify professional quality bar and release gates from design.
2. Validate deterministic behavior, correctness, and operational stability.

### Validation strategy by phase family

1. Unit tests
   - scoring curves, GDI boundaries, readiness cap policy, risk validation, tie-break determinism, conflict attribution.

2. Property tests
   - deterministic replay,
   - goal/target permutation invariance,
   - monotonicity under tightened constraints,
   - harder target does not increase satisfaction.

3. Golden tests
   - impossible marathon low-load safe vs risk,
   - overlapping A-goal conflicts,
   - conflicting multi-target single-goal case,
   - baseline feasible parity scenario.

4. Integration tests
   - preview/create parity,
   - stale token invalidation,
   - mode/risk validation behavior,
   - mobile adapter payload parity.

### Performance guardrails

1. Track p50/p95/p99 for preview and create endpoints.
2. Track solver metrics per request: candidate count, evaluation count, prune count, fallback reason.
3. Block rollout if sustained p95 degradation exceeds threshold or fallback/error rates exceed limits.

### Exit criteria

1. All release gates in `design.md` pass.
2. CI test matrix green with determinism replay checks.
3. Performance SLO met at target concurrency.
4. Backout switch remains validated.

## Dependency Graph

```text
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
```

Rules:

1. `@repo/core` remains pure and database-independent.
2. `@repo/trpc` orchestrates only; no solver logic duplication.
3. mobile consumes contracts and projections; no independent planning engine.

## Backout and Safety Strategy

1. Keep deterministic legacy optimizer path available until Phase 4 signoff.
2. If MPC guardrails fail in production windows, force safe fallback path by feature flag.
3. If risk-mode defects are found, force mode to `safe_default` server-side while keeping preview/create operational.
4. Persist reason-coded fallback telemetry for incident diagnosis.

## Definition of Done

This implementation is done only when:

1. Multi-goal and multi-target plans are optimized and explained at target level.
2. Safe mode and risk mode behave exactly as specified.
3. Impossible goals are truthfully labeled and safe-mode readiness is constrained.
4. Deterministic constrained MPC is production path with bounded compute.
5. Professional release gates pass and remain stable post-rollout.
