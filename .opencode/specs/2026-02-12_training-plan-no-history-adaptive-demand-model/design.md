# Training Plan No-History Adaptive Demand Model

Last Updated: 2026-02-12
Status: Draft for implementation planning
Owner: Product + Core + Backend + Mobile

## Purpose

Define a dynamic, programmatic no-history planning model that:

1. Assumes "never trained" when user history is absent.
2. Supports optional user-configurable starting fitness override.
3. Uses intrinsic goal demand properties (distance, target outcome, sport) to determine required race-day capability.
4. Builds weekly load progressively toward that demand, instead of applying static floors or one-off spikes.
5. Adapts as new evidence arrives, with deterministic behavior and transparent reasoning.

## Problem Statement

Current no-history behavior can produce implausible trajectories for high-demand goals because initial assumptions and weekly target generation are not fully coupled.

Observed failure mode:

1. A no-history prior may be applied (or overridden) at projection start.
2. Downstream weekly targets can still be generated at much lower absolute load.
3. CTL then decays toward the lower steady-state implied by weekly TSS.

This creates an untrustworthy user experience, especially for demanding goals (for example, sub-3 marathon, 70.3/IM race prep, cycling race blocks).

## Design Principles

1. Programmatic over lookup: rely on model equations and constraints, not static calibration tables.
2. Goal-aware demand: each goal/target contributes explicit intrinsic demand.
3. Athlete-aware adaptation: no-history starts conservative, then updates with evidence.
4. Deterministic and explainable: same inputs produce same trajectory and reason tokens.
5. Safety invariant: ramp caps, recovery, and taper semantics remain authoritative.
6. Preview/create parity: one shared engine path and one shared contract.

## Scope

### In Scope

1. New adaptive no-history demand model in `@repo/core`.
2. Intrinsic goal demand scoring and required race-day capability estimation.
3. Dynamic no-history trajectory generation (start, build, hold, taper/recovery constraints).
4. Optional starting fitness override when user has no history.
5. Explicit explainability metadata for demand, feasibility, overrides, and uncertainty.

### Out of Scope

1. Real-time ML training infrastructure.
2. New mandatory onboarding questionnaire fields.
3. Redesign of existing taper/recovery conflict semantics.
4. Fully personalized biomechanical/physiology model beyond available evidence.

## Conceptual Model

### 1) Goal Demand Model (Intrinsic)

Compute a `goal_demand_profile` from each goal target using intrinsic properties:

1. Sport/domain (`run`, `bike`, `tri`, etc).
2. Event duration and distance.
3. Target outcome severity (for example sub-3 marathon vs completion).
4. Multi-goal interactions (priority, spacing, overlap).

Output (per goal):

1. `required_event_ctl_range` (min, target, stretch).
2. `required_peak_weekly_tss_range`.
3. `required_build_weeks` and minimum feasible ramp envelope.
4. `demand_confidence` and rationale codes.

### 2) Athlete State Model (No-History Prior)

For `history_availability_state === "none"`:

1. Default start state is `starting_ctl = 0` (never-trained assumption).
2. Optional `starting_ctl_override` allows user-provided start estimate.
3. Convert to initial weekly load via canonical relation: `starting_weekly_tss = round(7 * starting_ctl)`.
4. Initialize neutral fatigue prior (`starting_atl = starting_ctl`, `starting_tsb = 0`).

### 3) Adaptive Trajectory Model

Generate weekly load path with two simultaneous targets:

1. **Near-term adaptation target**: feasible weekly progression from current state.
2. **Goal-demand target**: required trajectory to reach event capability on time.

Weekly requested load is the deterministic blend of:

1. block structure baseline,
2. progressive adaptation floor,
3. goal-demand floor,
4. existing taper/recovery modifiers,
5. hard safety caps.

If required demand exceeds feasible capped growth, mark infeasible pressure explicitly rather than silently under-targeting.

## Core Equations (V1)

1. `steady_state_ctl ~= weekly_tss / 7`
2. `required_ctl_progress(t) = interpolate(start_ctl, target_event_ctl, t / weeks_to_event)`
3. `required_weekly_tss_progress(t) = round(7 * required_ctl_progress(t))`
4. `requested_weekly_tss(t) = max(base_request(t), adaptation_floor(t), demand_floor(t))`
5. `applied_weekly_tss(t) = clamp_by_existing_ramp_caps_and_recovery(requested_weekly_tss(t))`

Deterministic rule:

1. Demand floor may be active until event week (except taper/event/recovery weeks).
2. If floor drives request above raw block request, emit explicit override reason.

## No-History Personalization Inputs (Without History)

Use available evidence only:

1. Goal targets and timelines.
2. Availability windows and session constraints.
3. Profile metrics if present (weight, threshold metrics), as uncertainty reducers and demand scalers.
4. Optional user override for starting CTL.

No-history users without profile metrics remain valid; uncertainty rises and confidence lowers.

## Data Contract (Preview/Create)

Add/maintain non-breaking metadata in projection payload:

1. `no_history.starting_ctl_for_projection`
2. `no_history.starting_weekly_tss_for_projection`
3. `no_history.goal_demand_profile` (compact summary)
4. `no_history.required_event_ctl`
5. `no_history.required_peak_weekly_tss`
6. `microcycle.metadata.tss_ramp.raw_requested_weekly_tss`
7. `microcycle.metadata.tss_ramp.floor_override_applied`
8. `microcycle.metadata.tss_ramp.weekly_load_override_reason`
9. `microcycle.metadata.tss_ramp.floor_minimum_weekly_tss`
10. `projection_feasibility.demand_gap` (required vs feasible under caps)

Contract rule:

1. Preview and create must use identical core calculation and emit identical metadata for same input snapshot.

## Explainability Requirements

Return concise reason tokens for major decisions:

1. Starting prior source (`default_never_trained` vs `user_override`).
2. Goal demand derivation (`goal_distance_high`, `target_time_aggressive`, etc).
3. Floor/override application (`no_history_floor`, `availability_clamp`, `ramp_cap_clamp`).
4. Confidence downgrades (`long_horizon`, `multi_goal`, `low_signal_quality`).
5. Infeasibility pressure (`required_growth_exceeds_caps`).

## Architecture Placement

### `@repo/core`

1. Own demand model, trajectory model, and reason-token generation.
2. Export canonical projection and metadata types.

### `@repo/trpc`

1. Thread optional `starting_ctl_override` through preview/create.
2. Orchestrate calls; do not duplicate demand math.

### Mobile

1. Surface concise cues for demand level, confidence, and overrides.
2. Keep UI non-blocking; no local projection math.

## Risks and Mitigations

1. Over-prescription risk -> mitigate with availability constraints and ramp caps.
2. Under-prescription risk for hard goals -> mitigate with demand floor active through build horizon.
3. False confidence in no-history -> mitigate with uncertainty-aware confidence and explicit demand-gap reporting.
4. Complexity creep -> keep v1 to deterministic equations and bounded metadata.

## Acceptance Criteria

1. No-history users with demanding goals no longer show immediate CTL collapse after start.
2. Weekly load trajectories progress toward goal demand unless constrained by safety caps or availability.
3. If constrained, payload explicitly reports why and by how much (`demand_gap`, override reason tokens).
4. Optional starting CTL override is supported end-to-end for no-history users.
5. Preview/create parity holds for projection outputs and metadata.
6. Existing safety semantics (ramp caps, recovery/taper) remain intact.

## Minimal Implementation Checklist

- [ ] Add intrinsic goal demand scorer in core (target-aware, sport-aware).
- [ ] Add required race-day capability estimator (`required_event_ctl`, `required_peak_weekly_tss`).
- [ ] Add adaptive weekly demand trajectory floor that persists through build horizon.
- [ ] Keep no-history default start at never-trained state; support optional start override.
- [ ] Emit explicit override and feasibility-pressure metadata.
- [ ] Thread override input and new metadata through trpc preview/create.
- [ ] Update mobile projection cues for new explainability fields.
- [ ] Add tests for no-history hard-goal progression, demand-gap reporting, and parity.
