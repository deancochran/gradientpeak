# Design: Training Load Controls Reframe

Date: 2026-02-24
Owner: Product + Mobile + Core Planning
Status: Active - Hard Cutover
Type: UX Simplification + Optimization Control Model

## Executive Summary

The current training-plan tuning UI exposes several sliders that appear meaningful but have limited
or inconsistent effect on projected weekly load. This creates confusion and undermines trust.

We will replace cap-centric controls with behavior-centric controls that map directly to plan
shape and optimizer behavior:

1. Progression aggressiveness
2. Load variability
3. Spike frequency
4. Periodization shape
5. Recovery priority
6. Starting fitness confidence

Hard safety caps remain in the engine as internal guardrails, not primary user-facing controls.

## Problem

Current issues in the creation flow:

- Multiple sliders manipulate low-level bounds or internal values that do not reliably change
  observed weekly TSS trajectory.
- Cap/bound controls dominate perception, while users actually want to control training rhythm
  (spikes, smoothness, front-load/back-load, recovery bias).
- There is weak explainability when controls have no visible effect due to constraints
  or readiness-preservation behavior.

Observed implementation mismatch:

- Projection controls influence optimizer weights/search and curvature preferences, but users do not
  see a clear intent-based mapping.
- Safety rails and suppression behavior can flatten trajectory differences, reducing visible control
  effect.

## Goals

1. Make all primary sliders athlete-intuitive and behavior-oriented.
2. Ensure each primary slider causes measurable downstream trajectory changes when not constrained.
3. Keep hard safety boundaries active while minimizing direct exposure in default UX.
4. Improve explainability when requested behavior cannot be applied.
5. Preserve deterministic, stable projection generation.

## Non-Goals

- No removal of core safety protections.
- No immediate rewrite of all readiness science; this reframe focuses on control surface and
  optimizer mapping.

## Control Model (Target)

### Primary (Simple Mode)

1. **Progression aggressiveness**
   - Higher: increases readiness-seeking utility relative to risk penalties.
   - Lower: prioritizes sustainable progression.

2. **Load variability**
   - Higher: allows larger week-to-week swings.
   - Lower: emphasizes smoother weekly progression and lower monotony/strain.

3. **Spike frequency**
   - Higher: allows more high-load weeks within a time window.
   - Lower: enforces fewer spike weeks and stronger spacing.

4. **Periodization shape**
   - Negative: front-load progression.
   - Positive: back-load progression.
   - Strength determines how strongly this preference is enforced.

### Advanced (Optional)

5. **Recovery priority**
   - Controls taper/recovery protection against load re-accumulation.

6. **Starting fitness confidence**
   - High: trajectory stays close to inferred initial CTL/ATL state.
   - Low: trajectory allows broader adaptation around uncertain initial state.

## UX Strategy

Two-tier controls:

- **Simple mode default**: 4 sliders (aggressiveness, variability, spikes, shape).
- **Advanced mode**: explicit decomposition knobs and diagnostics.
- **No cap/bound controls** in user-facing tuning UI.

Diagnostics and trust:

- Show active constraints and "no visible change" explanations.
- Show dominant driver of changes (load, fatigue, feasibility).
- Show per-control contribution where possible (objective term deltas).

## Technical Design

### 1) Schema Evolution

Replace projection tuning schema with an intent-based control block
(`behavior_controls_v1`) as the only supported tuning input.

Proposed fields:

- `aggressiveness` (0..1)
- `variability` (0..1)
- `spike_frequency` (0..1)
- `shape_target` (-1..1)
- `shape_strength` (0..1)
- `recovery_priority` (0..1)
- `starting_fitness_confidence` (0..1)

Hard cutover:

- Remove `projection_control_v2` from create/edit and preview payload contracts.
- Remove deprecated cap slider fields from create/edit tuning UI contracts.
- Remove legacy normalization and mapping paths instead of maintaining dual support.
- Treat deprecated projection-control helpers/tests as in-scope removals,
  not deferred cleanup.

Current implementation target: complete all deprecated projection-control removals in the
same delivery scope as the contract cutover.

### 2) Objective Mapping

Map behavior controls into effective optimizer terms:

- aggressiveness -> preparedness vs risk weighting, lookahead/candidate breadth
- variability -> volatility/churn/monotony penalties
- spike_frequency -> spike-budget penalty and spacing rules
- shape_target/shape_strength -> curvature target/weight and phase envelope behavior
- recovery_priority -> taper/recovery penalty weighting
- starting_fitness_confidence -> anchoring pressure around inferred initial state

### 3) Guardrails and Bounds

- Keep hard safety caps internal and always enforced.
- Use learned/user profile bounds as hidden constraints.
- Surface constraints as explainability artifacts instead of primary controls.

### 4) Explainability

Extend projection diagnostics with:

- effective behavior controls after normalization
- binding constraints list
- control suppression reasons (why requested behavior could not move trajectory)
- response sensitivity summary (delta in load/fatigue/feasibility due to control updates)

### 5) UI Simplification

- Replace cap sliders in default composer tuning tab.
- Remove deprecated tuning controls and related lock/provenance wiring.
- Group controls by athlete intent:
  - "How hard to progress"
  - "How smooth vs variable"
  - "How often to spike"
  - "Where load is concentrated"
- Keep advanced collapsible section for expert controls.

## Validation Strategy

1. **Sensitivity contract tests**
   - Each primary control shifted low->high must alter at least one trajectory metric by epsilon,
     unless hard constraints are active.

2. **Constraint-aware tests**
   - Validate suppression explanations appear when controls are blocked.

3. **Regression tests**
   - Preserve deterministic outputs for identical inputs.
   - Preserve no-history and readiness-delta behavior stability.

4. **UX tests**
   - Verify simple mode shows only athlete-intuitive controls.
   - Verify advanced mode and diagnostics visibility.

## Risks and Mitigations

- Risk: Overfitting controls to synthetic scenarios.
  - Mitigation: sensitivity tests across low/sparse/rich history fixtures and multiple goal horizons.

- Risk: Hard cutover can break stale clients or old payload shapes.
  - Mitigation: coordinated release gating, strict server validation errors, and immediate client
    updates in same release window.

- Risk: More controls but still low perceived effect.
  - Mitigation: mandatory sensitivity thresholds and explicit suppression diagnostics.

## Acceptance Criteria

1. Default tuning UI no longer exposes cap/bound sliders as primary controls.
2. Primary sliders map to behavior controls and produce measurable trajectory changes when feasible.
3. Hard bounds remain enforced as internal safety constraints.
4. Users can see why a slider did not visibly change load (binding constraints/suppression).
5. Deprecated tuning fields and code paths are removed from core, trpc, and mobile.
