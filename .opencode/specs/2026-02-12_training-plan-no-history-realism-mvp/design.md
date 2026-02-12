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

## Scope

### In Scope

1. No-history bootstrap floors calibrated by goal demand and inferred fitness class.
2. Timeline feasibility classification for floor confidence (metadata-only).
3. Non-breaking preview/create metadata for floor provenance and confidence.

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

| Fitness | Tier            | Start CTL Floor | Start Weekly TSS Floor | Event CTL Target |
| ------- | --------------- | --------------: | ---------------------: | ---------------: |
| weak    | low             |              20 |                    140 |               35 |
| weak    | medium          |              28 |                    196 |               50 |
| weak    | high (marathon) |              35 |                    245 |               70 |
| strong  | low             |              30 |                    210 |               45 |
| strong  | medium          |              40 |                    280 |               60 |
| strong  | high (marathon) |              50 |                    350 |               85 |

Rules:

1. Floors are starting anchors, not forced weekly values.
2. Existing caps still limit week-over-week increases.
3. Event CTL target is advisory metadata for realism checks and UX explanation.

### 3) Minimal Timeline Feasibility Check

Classify build-time sufficiency by goal tier:

1. `high`: full >=16 weeks, limited 12-15, insufficient <12.
2. `medium`: full >=12 weeks, limited 8-11, insufficient <8.
3. `low`: full >=8 weeks, limited 6-7, insufficient <6.

If `limited` or `insufficient`, return warning metadata. Do not add new blocking rules in this MVP.

### 4) Deterministic Projection Order

For `history=none`, calculation order is:

1. Normalize config (existing path).
2. Infer fitness class from existing context signals.
3. Map primary goal to demand tier.
4. Derive floor anchors + event CTL target.
5. Initialize projection with `max(current_estimate, floor)`.
6. Run existing projection engine with existing clamps/recovery/taper logic.
7. Run existing feasibility/conflict classification unchanged.

### 5) Metadata Transparency

Preview/create responses include:

1. `projection_floor_applied: boolean`
2. `projection_floor_tier: "low" | "medium" | "high" | null`
3. `projection_floor_values: { start_ctl: number; start_weekly_tss: number } | null`
4. `fitness_level: "weak" | "strong" | null`
5. `target_event_ctl: number | null`
6. `weeks_to_event: number`
7. `periodization_feasibility: "full" | "limited" | "insufficient" | null`
8. `build_phase_warnings: string[]`
9. `days_until_reliable_projection: number` (countdown to 42 days)

## Data Contract Changes

### Creation Input

No new creation config fields.

### Preview/Create Output Additions

Add non-breaking fields listed in Functional Requirement 5.

## Algorithm Changes

1. Add `determineNoHistoryFitnessLevel(context)` helper in `@repo/core`.
2. Add `deriveNoHistoryProjectionFloor(goalTier, fitnessLevel, weeksToEvent)` helper in `@repo/core`.
3. Add `classifyBuildTimeFeasibility(goalTier, weeksToEvent)` helper in `@repo/core`.
4. Apply floor initialization in shared preview/create projection path.
5. Preserve all current cap and recovery/taper logic as-is.

## Risks and Mitigations

### 1) Overestimating Beginner Capacity

Risk:

- Floors may still be high for some true beginners.

Mitigation:

- Default uncertain users to `weak`, keep existing caps, surface warnings for short timelines.

### 2) Misclassification of Fitness Level

Risk:

- Inferred `weak/strong` may be wrong.

Mitigation:

- Conservative default to `weak`; expose inferred class in metadata for transparency.

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
2. `weak + high` no-history goals anchor at >=245 weekly TSS and >=35 CTL.
3. `strong + high` no-history goals anchor at >=350 weekly TSS and >=50 CTL.
4. Existing ramp caps remain strictly enforced with no regressions.
5. `sparse` and `rich` users show unchanged behavior.
6. Preview/create parity holds for floor metadata and projected values.
7. Tests cover floor mapping, fitness classification fallback, timeline feasibility labels, and cap preservation.

## Minimal Implementation Checklist

- [ ] Add fitness-level inference helper (`weak/strong`) using existing context signals.
- [ ] Add goal-tier floor helper with calibrated matrix values.
- [ ] Add timeline feasibility helper (`full/limited/insufficient`).
- [ ] Apply floor initialization in shared projection path used by preview/create.
- [ ] Thread metadata fields through API response contracts.
- [ ] Add targeted tests for no-history marathon realism and unchanged safety behavior.
