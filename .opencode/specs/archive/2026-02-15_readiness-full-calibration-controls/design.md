# Design: Full Readiness Calibration Controls

Date: 2026-02-15
Owner: Core planning + API + mobile create flow
Status: Proposed

## Problem

Readiness and projection behavior currently relies on many hardcoded constants in core logic. Users can adjust only a limited safety subset, which blocks advanced coaching workflows where users want direct control of how readiness reacts to load, fatigue, evidence quality, and feasibility pressure.

We need a calibration system that exposes all independent algorithm attributes while preserving deterministic behavior, numerical stability, and clear UX.

## Goals

1. Make all independent readiness/projection constants user-configurable.
2. Expose controls as interactive sliders/toggles with sensible ranges and validation.
3. Ensure every slider change reactively recomputes preview projection and readiness.
4. Keep deterministic outputs for identical input + calibration.
5. Prevent invalid combinations from breaking model behavior.
6. Enforce readiness composite weights sum to exactly 1 through interaction design and server validation.

## Non-Goals

- No removal of hard safety caps already required by product policy.
- No unbounded free-text coefficient editing in user-facing UI.
- No backward-incompatible break of existing plan creation without migration path.

## Product Constraints (Hard)

1. Every exposed coefficient must have a bounded min/max range.
2. No NaN/Infinity/invalid values can cross core boundary.
3. Readiness composite weights must always sum to 1.0 (within epsilon at parse-time).
4. Preview endpoint must support rapid recalculation under slider interaction.
5. Saved plans must persist an explicit calibration snapshot and version.

## Calibration Model

Add versioned calibration object to creation config:

```ts
type CalibrationConfigV1 = {
  version: 1;

  readiness_composite: {
    target_attainment_weight: number;
    envelope_weight: number;
    durability_weight: number;
    evidence_weight: number;
  };

  readiness_timeline: {
    target_tsb: number;
    form_tolerance: number;
    fatigue_overflow_scale: number;
    feasibility_blend_weight: number;
    smoothing_iterations: number;
    smoothing_lambda: number;
    max_step_delta: number;
  };

  envelope_penalties: {
    over_high_weight: number;
    under_low_weight: number;
    over_ramp_weight: number;
  };

  durability_penalties: {
    monotony_threshold: number;
    monotony_scale: number;
    strain_threshold: number;
    strain_scale: number;
    deload_debt_scale: number;
  };

  no_history: {
    reliability_horizon_days: number;
    confidence_floor_high: number;
    confidence_floor_mid: number;
    confidence_floor_low: number;
    demand_tier_time_pressure_scale: number;
  };

  optimizer: {
    preparedness_weight: number;
    risk_penalty_weight: number;
    volatility_penalty_weight: number;
    churn_penalty_weight: number;
    lookahead_weeks: number;
    candidate_steps: number;
  };
};
```

## Composite Weights UX + Validation

Users should not directly submit an unconstrained weight object and manually ensure sums.

Interactive requirement:

1. UI shows four independent sliders for the four readiness components.
2. Total meter is always visible.
3. Interaction model enforces simplex constraint (`sum = 1`) in real time:
   - Option A (default): active slider increases/decreases; remaining unlocked sliders are proportionally rebalanced.
   - Option B (advanced toggle): lock up to 3 sliders, compute the final unlocked slider as `1 - sum(locked)`.
4. If interaction would violate bounds, UI clamps and shows inline explanation.
5. API still validates sum with epsilon tolerance and rejects invalid payloads.

Server invariant:

```text
abs(
  target_attainment_weight + envelope_weight + durability_weight + evidence_weight - 1
) <= 1e-6
```

## Recommended Slider Ranges (V1)

These are defaults and min/max bounds for UX + schema:

1. `readiness_composite.*_weight`: `0.0 .. 1.0` (sum must be 1)
2. `readiness_timeline.target_tsb`: `-5 .. 20`
3. `readiness_timeline.form_tolerance`: `8 .. 40`
4. `readiness_timeline.fatigue_overflow_scale`: `0.10 .. 1.00`
5. `readiness_timeline.feasibility_blend_weight`: `0.00 .. 1.00`
6. `readiness_timeline.smoothing_iterations`: `0 .. 80` (integer)
7. `readiness_timeline.smoothing_lambda`: `0.00 .. 0.90`
8. `readiness_timeline.max_step_delta`: `1 .. 20` (integer)
9. `envelope_penalties.*_weight`: `0.00 .. 1.50`
10. `durability_penalties.monotony_threshold`: `1.0 .. 4.0`
11. `durability_penalties.strain_threshold`: `400 .. 2000`
12. `no_history.reliability_horizon_days`: `14 .. 120`
13. `no_history.confidence_floor_*`: `0.10 .. 0.95`
14. `optimizer.preparedness_weight`: `0.0 .. 30.0`
15. `optimizer.risk_penalty_weight`: `0.0 .. 2.0`
16. `optimizer.volatility_penalty_weight`: `0.0 .. 2.0`
17. `optimizer.churn_penalty_weight`: `0.0 .. 2.0`
18. `optimizer.lookahead_weeks`: `1 .. 8` (integer)
19. `optimizer.candidate_steps`: `3 .. 15` (integer)

## Reactive Recompute Requirements

1. Every calibration change triggers preview recompute.
2. Mobile/client debounces requests (150-300ms) and cancels in-flight stale requests.
3. API responses include diagnostics explaining readiness deltas from prior run:
   - fatigue overflow effect
   - clamp pressure effect
   - unmet demand effect
4. Recompute must remain deterministic and idempotent for identical inputs.

## Data Contracts and Persistence

1. Extend creation config schema to include `calibration` object.
2. Store `calibration` snapshot and `calibration_version` with created plan.
3. Preview/create parity must include calibration echo and derived diagnostics.
4. Unknown calibration fields are rejected (strict parsing).

## Safety and Stability

1. Keep hard safety constraints active regardless of user calibration.
2. Add runtime guardrail pass in core:
   - clamp to schema bounds,
   - verify finite numeric values,
   - fallback to defaults for invalid/missing values.
3. Emit diagnostics when fallbacks/clamps are applied.

## Testing Specification

### Unit

1. Schema tests for each calibration field range + strictness.
2. Composite weights sum invariant tests (`sum=1` accepted, otherwise rejected).
3. Determinism tests with fixed calibration fixtures.
4. Numeric stability tests at min/max bounds.

### Integration

1. Preview/create parity with identical calibration.
2. Reactive update tests for rapid slider changes (debounce + cancellation).
3. Persistence round-trip tests for calibration snapshot/version.

### Property/Fuzz

1. Random calibration generation inside bounds should never crash.
2. Readiness outputs must remain bounded `0..100`.
3. Objective evaluation must remain finite and deterministic.

## Migration

1. Backfill path: plans without calibration use `CalibrationConfigV1` defaults.
2. Introduce `calibration_version` for forward compatibility.
3. Add migration policy document for V1 -> future V2 transforms.
