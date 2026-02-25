# Design: Multi-Goal Feasibility and Risk-Accepted Readiness

Date: 2026-02-14
Owner: Core planning
Status: Proposed

## Problem

Current planning can produce internally inconsistent outcomes for difficult goals (for example, very low weekly load with unrealistically high readiness for world-class targets). The model also needs to scale from one goal to many goals, and from one target metric to multiple target metrics per goal.

The user requirement is to replace the current optimizer with a deterministic constrained MPC-style optimizer while preserving safe defaults and explicit risk-accepted override behavior.

We need a deterministic planning specification that:

1. Uses sensible, safety-first defaults.
2. Represents feasibility honestly.
3. Supports multi-goal and multi-target optimization.
4. Still allows a user to intentionally configure high-risk outcomes when they explicitly accept risk.

## Goals

1. Introduce a unified feasibility + readiness framework for single-goal and multi-goal plans.
2. Support multiple targets per goal (time, pace, power, split, completion probability).
3. Keep safe defaults active for all users by default.
4. Add explicit risk-acceptance controls that can relax safety/feasibility constraints.
5. Allow a risk-accepted plan to target `readiness_score = 100` even when safe feasibility is not satisfied.
6. Preserve deterministic output for identical inputs.
7. Replace the weekly-load optimizer with a deterministic constrained MPC-style optimizer.
8. Deliver plan quality and explainability at a level appropriate for paid, professional use.

## Non-Goals

- No backward-compatibility bridge fields (for example no `schema_version`, no transport/socket compatibility field, no dual payload model).
- No hidden auto-upgrade layer for old planning payloads.
- No silent suppression of risk flags when user enables risk override.
- No A/B rollout requirement for optimizer release.

## Product Principles

1. **Default-safe:** New plans start with conservative, feasible defaults.
2. **Truthful state:** Feasibility and risk remain visible even in aggressive mode.
3. **User agency:** Users can intentionally pursue extreme outcomes with explicit risk acceptance.
4. **Deterministic:** Same input => same output.
5. **Explainable:** Every cap, override, and infeasibility condition is inspectable.
6. **Professionally credible:** Recommendations reflect known training principles, realistic progression limits, and explicit uncertainty.

## Professional Quality Bar

This planner is intended to be credible enough for premium use. The design must therefore satisfy all of the following:

1. **Physiology-aware realism:** Prevent obviously unrealistic progressions in safe mode.
2. **Goal-truthfulness:** Difficult or impossible goals must be labeled clearly, not hidden by a high synthetic score.
3. **Target-level accountability:** Every goal target must have a measurable satisfaction score and rationale.
4. **Conflict transparency:** Multi-goal trade-offs must be explicit and ranked by impact.
5. **Deterministic reproducibility:** Same inputs produce the same output and explanations.
6. **Operational boundedness:** Runtime is bounded and suitable for responsive preview/create flows.

## Core Behavior Model

Planning behavior is split into two operational modes:

1. `safe_default` (default)
2. `risk_accepted` (explicit user opt-in)

### 1) `safe_default` mode

- Safety constraints are hard constraints.
- Feasibility constraints are enforced.
- Readiness is capped by feasibility band.
- Planner objective maximizes realistic goal attainment under safe load/ramp rules.

### 2) `risk_accepted` mode

- Safety constraints become configurable (selected constraints can be softened or disabled).
- Feasibility no longer blocks plan generation.
- Readiness cap from feasibility can be lifted, allowing optimization to target up to 100.
- Plan remains annotated as high-risk or infeasible-under-safe-constraints.
- Risk acceptance is explicit and required in config.

## Domain Model

### `PlanConfiguration`

```ts
type PlanningMode = "safe_default" | "risk_accepted";

type PlanConfiguration = {
  mode: PlanningMode;

  // Required when mode === "risk_accepted"
  risk_acceptance?: {
    accepted: boolean;
    reason?: string;
    accepted_at_iso?: string;
  };

  optimization_style: "sustainable" | "balanced" | "outcome_first";

  // Constraint policy only applies in risk_accepted mode
  constraint_policy?: {
    enforce_safety_caps: boolean;
    enforce_feasibility_caps: boolean;
    readiness_cap_enabled: boolean;
    max_weekly_tss_ramp_pct?: number;
    max_ctl_ramp_per_week?: number;
  };
};
```

### `GoalDefinition`

```ts
type GoalPriority = "A" | "B" | "C";

type GoalDefinition = {
  id: string;
  sport: "run" | "bike" | "swim" | "triathlon";
  event_date_iso: string;
  priority: GoalPriority;
  weight: number; // normalized during scoring
  targets: GoalTarget[];
  conflict_policy?: "strict" | "flexible";
};
```

### `GoalTarget`

```ts
type GoalTarget =
  | {
      kind: "finish_time";
      value_seconds: number;
      tolerance_seconds?: number;
      weight?: number;
    }
  | {
      kind: "pace";
      value_seconds_per_km: number;
      tolerance_seconds?: number;
      weight?: number;
    }
  | {
      kind: "power";
      value_watts: number;
      tolerance_watts?: number;
      weight?: number;
    }
  | {
      kind: "split";
      split_id: string;
      value_seconds: number;
      tolerance_seconds?: number;
      weight?: number;
    }
  | {
      kind: "completion_probability";
      value_pct: number;
      weight?: number;
    };
```

### `ProjectionOutput` additions

```ts
type ProjectionOutput = {
  readiness_score: number; // 0..100
  confidence_score: number; // 0..100
  feasibility_band:
    | "feasible"
    | "stretch"
    | "aggressive"
    | "nearly_impossible"
    | "infeasible";
  risk_level: "low" | "moderate" | "high" | "extreme";
  risk_flags: string[];
  mode_applied: PlanningMode;
  caps_applied: string[];
  overrides_applied: string[];
  goal_assessments: Array<{
    goal_id: string;
    priority: GoalPriority;
    feasibility_band:
      | "feasible"
      | "stretch"
      | "aggressive"
      | "nearly_impossible"
      | "infeasible";
    target_scores: Array<{
      kind: GoalTarget["kind"];
      score_0_100: number;
      unmet_gap?: number;
      rationale_codes: string[];
    }>;
    conflict_notes: string[];
  }>;
};
```

## Multi-Goal and Multi-Target Objective Model

### Target satisfaction functions

Each target returns `target_satisfaction in [0,1]` from a deterministic piecewise curve using value, tolerance, and sport-specific scaling. Satisfaction is 1 when target is met, decays smoothly within tolerance, and decays sharply beyond tolerance.

### Goal score

```text
goal_score_g = sum(normalized_target_weight_t * target_satisfaction_t)
```

### Plan score

```text
plan_goal_score =
  wA * mean(goal_score for A goals)
  + wB * mean(goal_score for B goals)
  + wC * mean(goal_score for C goals)
```

Where default tier weights satisfy `wA > wB > wC` and are deterministic constants.

### Conflict accounting

When improving one goal degrades another beyond threshold, planner emits:

1. impacted goals,
2. estimated score delta per goal,
3. chosen precedence reason (`priority`, `timeline`, `safety`, `mode_override`).

## Feasibility and Readiness Computation

### Goal Difficulty Index (GDI)

For each goal `g`, compute:

- `PG_g`: performance gap
- `LG_g`: load gap (required vs safely achievable load)
- `TP_g`: timeline pressure
- `SP_g`: data sparsity penalty

```text
GDI_g = 0.45*PG_g + 0.35*LG_g + 0.20*TP_g + SP_g
```

Plan-level GDI is a priority-weighted aggregation with worst-case guard:

```text
GDI_plan = max(
  weighted_mean(GDI_g by goal priority weights),
  max(GDI_g for A goals)
)
```

### Feasibility bands

- `feasible`: `< 0.30`
- `stretch`: `0.30 - 0.49`
- `aggressive`: `0.50 - 0.74`
- `nearly_impossible`: `0.75 - 0.94`
- `infeasible`: `>= 0.95`

### Readiness cap behavior

In `safe_default` mode:

- feasible: cap 95
- stretch: cap 85
- aggressive: cap 72
- nearly_impossible: cap 55
- infeasible: cap 40

In `risk_accepted` mode:

- If `constraint_policy.readiness_cap_enabled = false`, cap is lifted (hard upper bound remains 100).
- If enabled, same cap table as `safe_default`.

## Deterministic Constrained MPC Optimizer

### Overview

The planner will use a deterministic constrained Model Predictive Control (MPC) loop over weekly control inputs (`applied_weekly_tss`) to optimize goal readiness and target attainment.

At each week `k`, the optimizer:

1. Builds current state (`CTL`, `ATL`, `TSB`, demand pressure, recovery flags, goal proximity).
2. Solves a bounded constrained optimization problem over a finite horizon `H` weeks.
3. Applies only the first control action for week `k`.
4. Rolls forward to week `k+1` and repeats.

### Deterministic requirements

1. Fixed candidate grid generation per mode/profile.
2. Fixed horizon lengths per profile.
3. Stable goal and target sorting before scoring.
4. Stable tie-breakers (`objective`, `delta_from_prev`, `goal_date`, `goal_id`).
5. No random exploration or stochastic restarts.

### MPC objective

Within each solve window, maximize:

```text
J = w_goal * goal_attainment
  + w_readiness * projected_readiness
  - w_risk * overload_penalty
  - w_volatility * load_volatility_penalty
  - w_churn * plan_change_penalty
  - w_monotony * monotony_penalty
  - w_strain * strain_penalty
```

Goal attainment is priority-aware:

```text
goal_attainment = A_tier_score + B_tier_score + C_tier_score
tier_score = sum(target_weight * target_satisfaction)
```

Additional objective constraints for professional quality:

1. discourage excessive week clustering (monotony),
2. discourage sustained high strain without deload,
3. penalize repeated constraint-edge operation,
4. preserve taper freshness near A-goal events.

### Constraint handling

In `safe_default` mode:

- Safety constraints are hard constraints in MPC solve.
- Feasibility caps and readiness caps are enforced.
- Monotony/strain boundaries are hard constraints.

In `risk_accepted` mode:

- Safety constraints are policy-driven (can be softened/disabled per `constraint_policy`).
- Feasibility constraints can move from hard constraints to penalties.
- Readiness cap can be disabled to allow optimization up to 100.
- Monotony/strain boundaries can be softened only when explicitly permitted by `constraint_policy`.

### Horizon and search bounds (MVP settings)

1. Horizon `H` is bounded by profile (example: 2/4/6 weeks).
2. Candidate actions per week are bounded (example: 5/7/9).
3. Early-stop branch pruning is allowed when candidate cannot beat current best bound.
4. Total compute budget remains bounded to protect app responsiveness.

### Bounded-compute execution requirements

1. Precompute week-level static context (block membership, recovery overlap, active-goal windows) once per solve.
2. Restrict objective evaluation to active goals/targets in horizon window.
3. Use fixed candidate lattice per profile to keep cost predictable.
4. No recursive re-solves for fallback behavior; baseline comparison must be side-by-side in one bounded run.

### Multi-goal conflict behavior

When goals conflict:

1. Higher priority goals retain precedence in objective weight and tie-breaks.
2. Lower priority goals receive best-effort optimization.
3. Output includes conflict trade-off reasons in `risk_flags` and `overrides_applied`.

## Safety Defaults by Sport (Seed Ranges)

These are planning defaults, not athlete identity claims.

### Running weekly load defaults (run-TSS estimate)

- beginner: 150-350
- novice: 300-500
- experienced amateur: 500-850
- elite/pro reference: 850-1300+

### Cycling weekly load defaults (bike TSS)

- beginner: 250-400
- novice: 400-650
- experienced amateur: 650-900
- elite/pro reference: 900-1250+

### Swimming defaults (session-RPE AU as primary)

- beginner: 600-1200 AU
- novice: 1200-2200 AU
- experienced amateur: 2200-3800 AU
- elite/pro reference: 3800-7000+ AU

### Safe ramp defaults

- novice: +6% weekly load target
- experienced: +8% weekly load target
- absolute hard recommendation in safe mode: <= +10%
- deload every 3-4 weeks by 20-30%

## Risk Acceptance Controls

Risk mode requires explicit opt-in:

```text
mode = "risk_accepted"
risk_acceptance.accepted = true
```

If not present, planner rejects risk mode and falls back to safe mode.

In risk mode, user-configurable behavior includes:

1. disable readiness cap,
2. relax ramp constraints,
3. ignore feasibility caps.

Even with these relaxations, output must include:

- `risk_level`,
- all active `risk_flags`,
- explicit statement that plan is outside safe feasibility envelope.

Risk mode persistence requirements:

1. Persist acceptance timestamp and acceptance statement.
2. Persist which constraints were softened/disabled.
3. Include mode + override metadata in preview and create outputs.

## Missing-Dimension Coverage (Required for Professional Planner)

The planner must account for the following dimensions, even if some start as lightweight heuristics:

1. **Sport-specific load semantics:** run/bike/swim calibration and non-1:1 transfer assumptions.
2. **Durability signals:** monotony, strain, deload debt, clamp-pressure streak.
3. **Execution realism:** available days, session duration limits, schedule compression.
4. **Evidence confidence:** sparse/stale history and profile completeness impact confidence and caps.
5. **Event context:** taper freshness targets and post-goal recovery obligations.
6. **Goal interaction:** explicit cross-goal interference and precedence rationale.

## Determinism Rules

1. Stable goal ordering: priority, date, id.
2. Stable target ordering: kind, id/key.
3. Fixed rounding and normalization rules for scoring.
4. Stable tie-breakers in optimizer ranking.
5. No randomness in final selected path.

## API and UI Requirements

1. UI must expose planning mode selector:
   - Safe default (recommended)
   - Risk accepted (advanced)
2. Switching to risk mode requires explicit acknowledgement checkbox.
3. UI must show realistic-state labels even when readiness is high:
   - "Readiness optimized via risk-accepted settings"
   - "Feasibility under safe defaults: nearly impossible/infeasible"
4. Goal cards must show per-goal feasibility, not only global readiness.
5. Goal cards must show per-target satisfaction and unmet-gap reasons.
6. Preview must display conflict trade-offs when multi-goal targets compete.
7. Risk mode preview must display persisted acceptance state and active overrides.

## Validation Rules

1. If `mode = risk_accepted` and `risk_acceptance.accepted !== true`, return validation error.
2. If risk mode is active and caps are disabled, readiness can reach 100 but confidence must still reflect uncertainty.
3. If any goal has missing required target fields, fail validation before optimization.
4. For multi-goal conflicts, generate plan plus conflict flags unless hard constraints (enabled) block generation.
5. Goal and target ordering must be canonicalized deterministically (`priority`, `date`, `id`, then target `kind`, `id`).
6. In safe mode, infeasible/nearly impossible bands must constrain readiness cap regardless of optimization profile.

## Testing Specification

### Unit tests

1. GDI calculation for each component.
2. Band classification boundaries.
3. Readiness capping rules by mode.
4. Risk mode validation behavior.
5. Multi-goal priority ordering determinism.
6. MPC tie-break determinism for equal-score candidates.
7. Hard-constraint enforcement in safe mode.
8. Constraint softening behavior in risk mode when enabled.
9. Per-target satisfaction curve behavior and tolerance handling.
10. Multi-goal conflict attribution reason codes.
11. Canonical ordering invariance for equivalent goal/target sets.
12. Priority-tier weighting correctness (A/B/C precedence).

### Property tests

1. Identical input generates identical output.
2. Tightening enabled constraints cannot increase safe-mode readiness.
3. Removing readiness cap in risk mode can only keep or increase readiness.
4. With same inputs and policy, MPC selected sequence is identical across repeated runs.
5. Reordering goals/targets in input does not change output.
6. Tightening any safe-mode constraint cannot improve feasibility band.
7. Harder target values cannot increase target satisfaction.

### Golden scenarios

1. Impossible marathon target under low load:
   - safe mode -> low cap + infeasible band
   - risk mode -> possible high readiness with explicit extreme risk flags
2. Overlapping A goals across sports with constrained calendar.
3. Multiple targets per goal with conflicting satisfaction curves.
4. MPC replacement parity scenario: no regression in determinism and safety-capped behavior for baseline feasible plans.
5. Multi-target single-goal scenario with conflicting targets (for example pace vs completion probability).
6. Priority inversion guard scenario verifies A-goal precedence over later B/C goals.

## Release Gates (Professional Readiness)

Release is blocked unless all gates pass:

1. Mode/risk model implemented end-to-end (schema, optimizer, API, UI).
2. Per-goal + per-target scoring visible in outputs.
3. Determinism/property/golden suite passing for multi-goal permutations.
4. Impossible-goal scenarios correctly labeled with constrained readiness in safe mode.
5. Bounded-compute budget respected at p95 preview/create latency targets.

## Implementation Plan (High Level)

1. Add new plan mode and risk acceptance config in `@repo/core` planning input schema.
2. Implement deterministic constrained MPC solver for weekly control selection.
3. Integrate existing multi-goal + multi-target score aggregation into MPC objective.
4. Add feasibility gate that can operate in enforce or annotate-only mode.
5. Add readiness cap policy with mode-aware behavior.
6. Wire projection output metadata (`risk_level`, `risk_flags`, `overrides_applied`).
7. Update mobile create flow to expose mode and acknowledgement UI.
8. Add deterministic, constraint, and golden tests for MPC path.
9. Add target satisfaction engine and per-goal scoring aggregation.
10. Add conflict attribution and trade-off metadata generation.
11. Add monotony/strain heuristics and integrate as constraints/penalties.
12. Add release-gate checks for professional readiness criteria.

## Acceptance Criteria

1. Safe mode always returns sensible conservative defaults.
2. Safe mode never returns unrealistic high readiness for clearly infeasible targets.
3. Risk mode can intentionally target readiness up to 100 when user accepts risk.
4. Risk mode always surfaces explicit risk and feasibility warnings.
5. Multi-goal plans produce stable deterministic outputs with per-goal explainability.
6. No backward-compatibility version bridge fields are introduced for this change.
7. Optimizer path is deterministic constrained MPC (no stochastic solver behavior).
8. No A/B release requirement; single production path is acceptable.
9. Multi-goal conflicts are explained with deterministic precedence reasons.
10. Multi-target goals report target-level satisfaction and unmet gaps.
11. Safe mode cannot mask infeasible goals with high readiness.
12. Planner output and rationale quality meet professional review checklist.
