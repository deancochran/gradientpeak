# Training Plan No-History Realism MVP (Minimal, High-Impact)

Last Updated: 2026-02-12
Status: Draft for implementation planning (revised)
Owner: Product + Core + Backend + Mobile

## Purpose

Improve projection realism for no-history users by correcting unrealistically low absolute load and fitness values, while preserving existing deterministic safety controls.

Primary outcomes:

1. Raise no-history projection anchors for high-demand goals (marathon-level).
2. Keep current ramp caps, feasibility grading, and conflict behavior unchanged.
3. Add transparent metadata explaining how no-history anchors were chosen.
4. Align calibration to practical TrainingPeaks-style CTL/TSS planning ranges without adding planner complexity.

## Problem Statement

No-history users currently see projection scales around ~100 weekly TSS and ~14 CTL, even for long-horizon marathon goals. The shape can look reasonable, but the absolute values are too low for credible marathon preparation.

Observed root causes:

1. No-history state starts from very low anchors.
2. Early block targets remain conservative relative to marathon demand.
3. Existing taper/recovery reductions can further suppress already-low values.

TSS research note:

1. Training Stress Score (TSS) is driven by duration and intensity.
2. Without user history (no P_max or VO2max-derived calibration), no-history projections must use typical intensity distributions to establish realistic absolute baselines.

## Design Principles

1. Minimal surface area: no new user-facing controls.
2. High impact: calibrate absolute anchors, not full planner redesign.
3. Deterministic and explainable: same inputs produce same outputs.
4. Safety-first invariant: caps and conflict logic remain authoritative.
5. Shared contract: preview and create must execute identical logic.
6. Single source of truth: CTL floor is canonical, weekly TSS floor is derived.

## Scope

### In Scope

1. No-history bootstrap floors calibrated by goal demand and inferred fitness class.
2. Timeline feasibility classification for floor confidence (metadata-only).
3. Non-breaking preview/create metadata for floor provenance and confidence.
4. Deterministic no-history CTL/ATL/TSB starting prior.
5. Floor clamping by existing availability inputs (no new controls).
6. Deterministic no-history intensity assumptions for TSS estimation with sensible fallbacks.

### Out of Scope

1. Full ATP period-by-period planning wizard.
2. New toggles, advanced settings, or user-entered CTL targets.
3. Changes to cap semantics (`max_weekly_tss_ramp_pct`, `max_ctl_ramp_per_week`).
4. Behavior changes for users with `sparse` or `rich` history.

## Functional Requirements

### 1) No-History Gate

1. Floor logic activates only when `history_availability_state === "none"`.
2. For `sparse` and `rich`, current behavior remains unchanged.

### 2) Fitness-Class + Goal-Tier Floors

Use two inferred fitness classes to keep complexity low:

1. `weak`: limited endurance background (default when uncertain).
2. `strong`: larger endurance background (inferred from existing signals only).

Apply floor matrix using goal demand tier (`low | medium | high`):

| Fitness | Tier            | Start CTL Floor (canonical) | Derived Start Weekly TSS Floor (`7 * CTL`) | Event CTL Target |
| ------- | --------------- | --------------------------: | -----------------------------------------: | ---------------: |
| weak    | low             |                          20 |                                        140 |               35 |
| weak    | medium          |                          28 |                                        196 |               50 |
| weak    | high (marathon) |                          35 |                                        245 |               70 |
| strong  | low             |                          30 |                                        210 |               45 |
| strong  | medium          |                          40 |                                        280 |               60 |
| strong  | high (marathon) |                          50 |                                        350 |               85 |

Rules:

1. CTL floor is the only stored anchor; weekly TSS floor is always derived as `round(7 * ctl_floor)` in one shared helper.
2. Floors are starting anchors, not forced weekly values.
3. Existing caps still limit week-over-week increases.
4. Event CTL target is advisory metadata for realism checks and UX explanation.
5. Floors are clamped by existing availability constraints before projection start (see Requirement 3).

Fitness inference rule (deterministic):

1. Default to `weak` when uncertain.
2. Promote to `strong` only when at least two independent existing signals indicate higher endurance readiness.
3. Return compact reason tokens for explainability/debugging in metadata.

### 3) Availability Clamp (No New Controls)

Use existing time-availability inputs already present in plan construction to avoid unrealistic floor anchors.

1. Compute maximum feasible weekly duration from current availability fields.
2. Convert that duration to a no-history feasible weekly TSS ceiling using deterministic assumed intensity distributions.
3. Clamp derived floor weekly TSS to this ceiling.
4. Re-derive effective start CTL as `clamped_weekly_tss / 7`.
5. If clamped, emit warning metadata token `floor_clamped_by_availability`.

### 4) Minimal Timeline Feasibility Check

Classify build-time sufficiency by goal tier:

1. `high`: full >=16 weeks, limited 12-15, insufficient <12.
2. `medium`: full >=12 weeks, limited 8-11, insufficient <8.
3. `low`: full >=8 weeks, limited 6-7, insufficient <6.

If `limited` or `insufficient`, return warning metadata and lower confidence. Do not add new blocking rules in this MVP.

Confidence rule:

1. `full -> high`
2. `limited -> medium`
3. `insufficient -> low`

### 5) Deterministic Projection Order

For `history=none`, calculation order is:

1. Normalize config (existing path).
2. Infer fitness class from existing context signals and capture reason tokens.
3. Map primary goal to demand tier.
4. Derive canonical CTL floor + derived weekly TSS floor + event CTL target.
5. Clamp floor by existing availability-derived feasible weekly TSS ceiling.
6. Initialize no-history prior state explicitly when floor is applied:
   - `starting_ctl = effective_floor_ctl`
   - `starting_atl = starting_ctl` (neutral fatigue prior)
   - `starting_tsb = 0`
7. Mark metadata `starting_state_is_prior = true` when floor path is used.
8. Run existing projection engine with existing clamps/recovery/taper logic.
9. Run existing feasibility/conflict classification unchanged.

### 6) Metadata Transparency

Preview/create responses include the minimal MVP contract:

1. `projection_floor_applied: boolean`
2. `projection_floor_values: { start_ctl: number; start_weekly_tss: number } | null`
3. `fitness_level: "weak" | "strong" | null`
4. `fitness_inference_reasons: string[]`
5. `projection_floor_confidence: "high" | "medium" | "low" | null`
6. `floor_clamped_by_availability: boolean`

Deferred/internal-only for MVP unless active product/UI consumer exists:

1. `projection_floor_tier`
2. `starting_state_is_prior`
3. `target_event_ctl`
4. `weeks_to_event`
5. `periodization_feasibility`
6. `build_phase_warnings`
7. `days_until_reliable_projection`
8. `assumed_intensity_model_version`

Invariant note:

1. If CTL/ATL/TSB values are exposed in preview/create payloads, enforce `TSB = CTL - ATL` at each output step.

### 7) CTL Definition (Explicit)

For this MVP, CTL is treated as blended all-sport training load, consistent with current system behavior. Floor and target values above are calibrated for this blended interpretation.

### 8) No-History Intensity Assumption Layer (MVP)

To keep no-history workout-level TSS deterministic without new user inputs:

1. Use one default no-history intensity model for floor derivation and availability clamp calculations.
2. Select weak/strong variant using inferred fitness class.
3. If the intensity model is unavailable/incomplete, fall back deterministically to a conservative baseline profile.
4. Keep this assumption layer internal (no new UI controls).

## Data Contract Changes

### Creation Input

No new creation config fields.

### Preview/Create Output Additions

Add non-breaking fields listed in Functional Requirement 6.

## Algorithm Changes

1. Add a shared orchestrator `resolveNoHistoryAnchor(context)` in `@repo/core` to centralize evidence fusion and fallbacks.
2. Within orchestrator, implement small composable helpers:
   - `collectNoHistoryEvidence(context)`
   - `determineNoHistoryFitnessLevel(evidence)` -> `{ fitnessLevel, reasons[] }`
   - `deriveNoHistoryProjectionFloor(goalTier, fitnessLevel)`
   - `clampNoHistoryFloorByAvailability(floor, availabilityContext, intensityModel)`
   - `classifyBuildTimeFeasibility(goalTier, weeksToEvent)` and confidence mapping
3. Use deterministic fallback ladder in orchestrator:
   - uncertain/insufficient signals -> `weak`
   - missing availability inputs -> skip clamp + reason token
   - missing intensity model -> conservative baseline profile
4. Apply explicit no-history prior initialization (CTL/ATL/TSB neutral) in shared preview/create projection path.
5. Preserve all current cap and recovery/taper logic as-is.

## Risks and Mitigations

### 1) Overestimating Beginner Capacity

Risk:

- Floors may still be high for some true beginners.

Mitigation:

- Default uncertain users to `weak`, require two independent strong signals for `strong`, keep existing caps, surface warnings for short timelines.

### 2) Misclassification of Fitness Level

Risk:

- Inferred `weak/strong` may be wrong.

Mitigation:

- Conservative default to `weak`; expose inferred class and reason tokens in metadata for transparency.

### 3) Perceived Methodology Complexity

Risk:

- TrainingPeaks-inspired ranges could imply large scope.

Mitigation:

- Keep only one minimal calibration layer (floors + metadata), no phase planner.

### 4) Preview/Create Drift

Risk:

- Floors could diverge between endpoints.

Mitigation:

- Use one shared floor initializer + parity tests.

## Acceptance Criteria

1. No-history marathon projections no longer anchor near ~100 weekly TSS / ~14 CTL.
2. Canonical invariant holds: `derived_start_weekly_tss_floor = round(7 * start_ctl_floor)`.
3. `weak + high` no-history goals anchor at >=245 weekly TSS and >=35 CTL before availability clamp.
4. `strong + high` no-history goals anchor at >=350 weekly TSS and >=50 CTL before availability clamp.
5. Existing ramp caps remain strictly enforced with no regressions.
6. `sparse` and `rich` users show unchanged behavior.
7. Preview/create parity holds for projected values and all new metadata fields.
8. Tests cover floor mapping, availability clamp behavior, fitness classification fallback + reasons, timeline feasibility + confidence, no-history prior initialization, cross-metric sanity (TSB identity), and cap preservation.

## Minimal Implementation Checklist

- [ ] Add shared no-history anchor orchestrator with deterministic evidence fusion and fallback ladder.
- [ ] Add fitness-level inference helper (`weak/strong`) using existing context signals + reason tokens.
- [ ] Add goal-tier floor helper with canonical CTL floor and derived weekly TSS floor.
- [ ] Add availability clamp helper using existing availability inputs and simplified no-history intensity model.
- [ ] Add timeline feasibility helper (`full/limited/insufficient`) and confidence mapping (`high/medium/low`) for internal fusion output.
- [ ] Apply explicit no-history prior initialization (CTL/ATL/TSB neutral) in shared projection path used by preview/create.
- [ ] Thread minimal MVP metadata fields through API response contracts; keep additional fields internal unless consumed.
- [ ] Add targeted tests for invariants, clamp behavior, fallback determinism, preview/create parity, and unchanged safety behavior.
