# Training Plan Start Date + Microcycle Projection (Schema, UX, and Preview)

Last Updated: 2026-02-11
Status: Draft for implementation planning
Owner: Product + Mobile + Core + Backend

## 1) Purpose

This specification removes arbitrary plan timeline behavior in training plan creation and upgrades preview fidelity to include deterministic microcycle-level ramping effects.

Primary outcomes:

1. Introduce explicit plan start date control in creation configuration.
2. Ensure generated plan timeline starts from user intent (or safe default) instead of hidden heuristic offsets.
3. Compute and expose microcycle-level (weekly) ramp/deload/taper/event effects in preview.
4. Reflect microcycle effects directly in projected load and fitness lines in the create chart.

## 2) Problem Statement

Current behavior creates confusion because:

1. Start date is implicitly derived from `goal_date - 84 days` when no start is provided.
2. Users perceive timeline start as arbitrary and disconnected from plan creation intent.
3. Meso-cycle level ranges are visible, but microcycle progression is not explicit enough in create preview.
4. Chart confidence is reduced when the user cannot explain why week-to-week load changes occur.

## 3) Product Principles

1. User intent over hidden heuristics.
2. Deterministic and explainable load progression.
3. Preview fidelity should match generated plan logic.
4. Mobile-first clarity with low cognitive load.
5. Safe defaults with explicit override.

## 4) In Scope

1. Add `plan_start_date` into creation configuration contract.
2. Use `plan_start_date` in preview and create pipelines.
3. Provide a default start strategy when not explicitly set.
4. Generate deterministic microcycles across full plan horizon.
5. Add microcycle metadata to preview response contract.
6. Update create UI/UX to set, display, and explain start date and microcycles.
7. Update chart rendering and supporting copy for microcycle-aware projection.

## 5) Out of Scope

1. Full calendar session scheduling in create flow.
2. Autonomous post-create rewrites.
3. Coach collaboration workflows.
4. New sports-specific periodization models beyond deterministic baseline progression.

## 6) Functional Requirements

### 6.1 Start Date Control

1. Creation input supports optional `plan_start_date` (date-only string).
2. If omitted, backend defaults to `today` in user timezone context (date-only), not `goal - 84`.
3. `plan_start_date` must be `<= latest goal target_date`.
4. If start date yields too short plan horizon (configurable threshold), preview returns clear warning/blocker.
5. UI exposes start date in creation configuration with contextual guidance.

### 6.2 Multi-Goal Horizon

1. Plan end date is the latest goal date across all goals.
2. Blocks and preview structures must remain valid for multi-goal plans.
3. Goal markers for all goals render in preview chart.

### 6.3 Microcycle Determinism

1. Preview produces weekly microcycles across plan horizon.
2. Each microcycle includes:
   - week start/end
   - pattern (`ramp`, `deload`, `taper`, `event`)
   - planned weekly TSS
   - projected CTL at end of week
   - associated phase/goal context
3. Weekly progression must be deterministic from normalized inputs.
4. Microcycle output influences projected chart lines (not decorative only).

### 6.4 Chart and UX

1. Chart remains line-first visualization.
2. Goal-date markers remain explicit points.
3. Mixed-metric line display uses disambiguation strategy (normalized mode default; exact values in details).
4. UI includes compact microcycle list/strip and pattern legend.
5. Selected point details include source microcycle context.

## 7) Data Contract Requirements

### 7.1 Creation Config Contract

Add field:

- `plan_start_date?: YYYY-MM-DD`

### 7.2 Preview Projection Contract

Ensure projection payload contains:

1. `start_date`, `end_date`
2. `points[]` (load and fitness trajectories)
3. `goal_markers[]`
4. `periodization_phases[]`
5. `microcycles[]` with deterministic week-level progression metadata

## 8) UX Requirements (Mobile)

1. Start date input appears in creation config near goals/timeline controls.
2. If user does not set a start date, UI indicates default behavior clearly.
3. Validation feedback for invalid short horizon is actionable.
4. Microcycle strip is readable on small screens (horizontal scroll allowed).
5. Chart updates reactively when start date changes.

## 9) Risks and Mitigations

### 9.1 Over-constraining Short Plans

Risk:

- User picks late start date and cannot generate valid progression.

Mitigation:

- Show blocker with recommended earliest start date and one-tap correction.

### 9.2 Perceived Complexity

Risk:

- Microcycle details overwhelm new users.

Mitigation:

- Keep summary compact; reveal advanced details progressively.

### 9.3 Contract Drift

Risk:

- Preview and create use different timeline logic.

Mitigation:

- Single shared timeline derivation in core/trpc path.

## 10) Acceptance Criteria

1. Start date is no longer arbitrary; plan starts at explicit user date or sensible default (today).
2. Preview and create both honor identical start/end timeline derivation.
3. Multi-goal plans use latest goal as horizon end and preserve goal markers.
4. Microcycles are generated deterministically and included in preview contract.
5. Microcycle effects visibly impact projected load/fitness lines.
6. Create UI clearly exposes start date control and microcycle interpretation.
7. Type checks and targeted tests cover schema, derivation, and UI behavior.
