# Continuous Predictive Training Engine - Direct Replacement Specification

Date: 2026-02-17
Status: proposed
Owner: training-plan-core

## 1) Purpose

Replace the current training-plan projection/scoring internals with a continuous mathematical model that:

- predicts forward trajectories for load and readiness outcomes,
- infers inverse user state from observed history and signals,
- optimizes across multiple goals and multiple targets with user-defined priority,
- remains safety-first by default while preserving explicit user override controls,
- retains only theoretical hard bounds (not heuristic hard-coded behavior cliffs).

This is a direct replacement of the existing feature, not a v2 side path.

## 2) Required Capabilities

The engine MUST be bidirectional.

### 2.1 Forward prediction

Given inferred current state + planned schedule, predict:

- daily and weekly TSS,
- CTL, ATL,
- TSB, SLB,
- readiness score and confidence,
- target-level attainment likelihood,
- goal-level readiness and feasibility/risk diagnostics.

### 2.2 Inverse state inference

Given historical data (activities, efforts, profile metrics, prior state), infer current latent state and uncertainty:

- `CTL_t`, `ATL_t`, `TSB_t`, `SLB_t`,
- durability/fatigue-resistance state,
- readiness latent state,
- uncertainty/posterior confidence.

The inverse state estimator is first-class and runs whenever preview/create calculations run.

## 3) Inputs and Evidence

The model must consume all available evidence, with explicit uncertainty propagation when data is sparse.

### 3.1 Activity history

- date/time, duration, modality,
- TSS (or inferred load where missing),
- session frequency and spacing,
- monotony/strain/ramp context.

### 3.2 Activity effort signals

- threshold efforts (pace/power/HR),
- interval quality markers,
- effort confidence and consistency cues.

### 3.3 Profile metrics

- threshold pace/power/HR,
- relevant anthropometrics and profile completeness,
- historical training consistency markers.

### 3.4 Previous state

- prior posterior state and uncertainty,
- last update timestamp,
- evidence quality and missingness counters.

## 4) State-Space Model

Define daily latent state:

- `x_t = [CTL_t, ATL_t, D_t, R_t, U_t]`
  - `D_t`: durability/fatigue resistance
  - `R_t`: readiness latent state
  - `U_t`: uncertainty scale

Derived outputs:

- `TSB_t = CTL_t - ATL_t`
- `SLB_t = ATL_t / max(CTL_t, 1)`
- `readiness_score_t = map(R_t, U_t, safety_context)` to `[0, 100]`

### 4.1 Continuous transitions

Daily update functions are continuous, differentiable where practical, and athlete-conditioned:

- `CTL_t = CTL_{t-1} + alpha_c * (Load_t - CTL_{t-1})`
- `ATL_t = ATL_{t-1} + alpha_a * (Load_t - ATL_{t-1})`
- `D_t = D_{t-1} + beta_r * recovery_t - beta_o * overload_t`
- `R_t = w_ctl*f(CTL_t) + w_tsb*g(TSB_t) + w_d*h(D_t) + w_e*evidence_t`
- `U_t = decay(U_{t-1}) + missingness_penalty + model_error_term`

No discrete week-pattern multipliers should directly determine state transitions.

## 5) Inference Engine (Inverse Estimation)

Use a filtering framework (EKF/UKF-like deterministic implementation) with optional smoother pass.

### 5.1 Per-step logic

1. Predict state from prior.
2. Assimilate observations from activities/efforts/profile markers.
3. Update posterior mean and uncertainty.
4. Persist posterior for next run.

### 5.2 Output contract

Each projection output must include inferred current state block:

- `inferred_current_state.mean`
- `inferred_current_state.uncertainty`
- `inferred_current_state.evidence_quality`
- `inferred_current_state.as_of`

## 6) Goal and Target Utility Model

### 6.1 Target-level

For each target, estimate a continuous attainment distribution:

- `P(attainment_k | state_at_goal_date)`

Compute target utility as expected value over gap/risk penalties, not threshold pass/fail bins.

### 6.2 Goal-level

- `goal_score_g = weighted_mean(target_utility_k, target_weight_k)`
- targets without explicit weight default to 1.0

### 6.3 Plan-level

- `plan_score = weighted_mean(goal_score_g, priority_weight_g)`
- priority is explicit user input `0..10` where `10` is highest importance
- equal priorities imply equal optimization pressure

Recommended priority mapping:

- `priority_weight_g = epsilon + (priority_g / 10)^gamma`
- defaults: `epsilon = 0.1`, `gamma = 2.0`

## 7) Optimization Objective

The engine optimizes a continuous objective across planning horizon:

- maximize goal utility,
- minimize risk/overload and volatility/churn,
- respect theoretical hard bounds.

Objective form:

- `J = U_goals - lambda_risk*Risk - lambda_vol*Volatility - lambda_churn*Churn`

User override semantics:

- override modifies `lambda_*` and risk budget,
- override never bypasses theoretical invariant bounds.

## 8) Safety and Guardrails Policy

### 8.1 Keep as hard bounds (invariants)

- non-negative and finite loads/metrics,
- physiological max ramp bounds,
- session count/duration cannot exceed availability domain,
- optimizer numerical bounds for stability,
- schema and unit validity constraints.

### 8.2 Convert to soft penalties

All other current hard-coded behavior cliffs (tier jumps, fixed multiplier discontinuities, binary clamping outside invariants) become smooth penalty terms with diagnostics.

## 9) API and Data Contract Requirements

Keep existing endpoint names and core payload structure for compatibility:

- previewCreationConfig
- createFromCreationConfig

Additive fields required:

- `inferred_current_state`
- `prediction_uncertainty`
- `goal_target_distributions` (compact diagnostics)
- `optimization_tradeoff_summary`

Maintain `goal_assessments.goal_readiness_score` as primary UI signal.

## 10) Persistence

Persist daily state snapshot per profile/plan context:

- `state_mean`
- `state_uncertainty`
- `evidence_quality`
- `updated_at`

Bootstrap from historical data when state is absent.

## 11) Direct Replacement Scope (Code Modules)

Replace internals in:

- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/projection/readiness.ts`
- `packages/core/plan/scoring/targetSatisfaction.ts`
- `packages/core/plan/scoring/goalScore.ts`
- `packages/core/plan/scoring/planScore.ts`
- `packages/core/plan/scoring/gdi.ts`
- `packages/core/plan/projection/safety-caps.ts`
- `packages/core/schemas/training_plan_structure.ts` (add state/inference schema blocks)

Route layer remains, but must preserve blocking semantics and explicit override behavior.

## 12) Acceptance Criteria

### 12.1 Core modeling

- engine performs inverse state inference on every preview/create compute,
- forward predictions are generated from inferred posterior state,
- readiness and goal attainment are continuous and uncertainty-aware.

### 12.2 Multi-goal/target behavior

- supports multiple goals each with multiple targets,
- honors user priorities `0..10` with monotonic weighting,
- equal priorities behave approximately equally,
- overlapping goals produce realistic tradeoff behavior.

### 12.3 Safety

- impossible stacked goals cannot all score near 100 under sparse evidence,
- invariant bounds are never violated,
- unsafe profiles are reflected continuously in risk diagnostics,
- blocking conditions remain blocking unless explicit override policy applies.

## 13) Validation and QA

Required test classes:

- deterministic replay tests with fixed fixtures,
- calibration tests (predicted attainment vs observed outcomes),
- stress tests for overlapping/conflicting goals,
- invariant property tests (bound safety never violated),
- regression tests for preview/create consistency and stale-state handling.

Metrics to monitor:

- calibration error,
- safety incident proxy rate,
- weighted goal attainment,
- plan volatility/churn,
- confidence reliability under sparse history.

## 14) Migration Notes

- This is a direct replacement at engine level.
- No dual v1/v2 user path is required.
- Existing UI surfaces continue; they consume improved outputs.
- Hard-coded constants retained only when they define invariant theoretical bounds.
