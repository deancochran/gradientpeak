# Training Plan Safety + Sustainability MVP (Optimization Profile, Ramp Caps, Recovery Windows)

Last Updated: 2026-02-11
Status: Draft for implementation planning
Owner: Product + Mobile + Core + Backend

## Purpose

This specification adds deterministic safety and sustainability controls to training plan creation so users can avoid all-year aggressive loading while still targeting outcomes.

Primary outcomes:

1. Introduce explicit optimization intent with `optimization_profile`.
2. Add explicit post-goal recovery windows in multi-goal timelines.
3. Cap weekly load and fitness ramping with hard, explainable limits.
4. Ensure preview, feasibility, and generated plans all use the same constraints.

## Problem Statement

Current creation behavior can drift toward sustained aggressiveness because:

1. There is no explicit user intent signal for balancing outcomes vs sustainability.
2. Post-goal recovery is implicit and inconsistent, especially across multi-goal plans.
3. Weekly TSS and CTL progression can exceed practical limits for some users.
4. Feasibility signals and projection behavior are not consistently constrained by safety-first rules.

Result: users can unintentionally generate plans that are technically possible but not sustainably trainable over long horizons.

## Principles

1. Safety constraints are deterministic and non-negotiable at generation time.
2. Sustainability defaults win unless user explicitly selects more aggressive intent.
3. Multi-goal planning must include explicit recovery windows after each goal.
4. Preview and create must share one contract and one calculation path.
5. MVP favors clear constraints over adaptive complexity.

## Scope

### In Scope

1. New creation config fields:
   - `optimization_profile: "outcome_first" | "balanced" | "sustainable"`
   - `post_goal_recovery_days: number`
   - `max_weekly_tss_ramp_pct: number`
   - `max_ctl_ramp_per_week: number`
2. Normalization defaults, suggestion behavior, and conflict handling for new fields.
3. Feasibility/safety scoring updates to evaluate ramp caps and recovery adequacy.
4. Projection logic updates so week-to-week progression respects caps and recovery windows.
5. Mobile create UX updates for input, explanation, and preview transparency.

### Out of Scope

1. Coach-authored dynamic periodization models.
2. Automatic intra-week workout scheduling changes.
3. New analytics surfaces outside create/preview + resulting plan metadata.

## Functional Requirements

### 1) Optimization Profile

1. Creation config requires `optimization_profile`.
2. Profile semantics are deterministic:
   - `outcome_first`: allows highest safe progression within explicit hard caps.
   - `balanced`: default blend of performance progression and durability.
   - `sustainable`: conservative progression prioritized for durability and consistency.
3. Profile selection influences derived suggestions and default ramp limits.

### 2) Post-Goal Recovery Windows

1. Creation config supports `post_goal_recovery_days` as integer days.
2. Multi-goal plans must enforce a recovery window immediately after each goal event.
3. Recovery windows are explicit in projection metadata (week labels/pattern tags).
4. During recovery windows, planned load must be reduced relative to pre-goal ramp.
5. If recovery window conflicts with the next goal timeline, feasibility must degrade and expose actionable conflict details.

### 3) Ramp Cap Controls

1. Creation config supports user-set hard limits for:
   - `max_weekly_tss_ramp_pct`
   - `max_ctl_ramp_per_week`
2. Projection and generation must clamp progression to these values.
3. Feasibility must classify goals as `feasible | aggressive | unsafe` using capped progression.
4. Conflicts are blocking when target goals cannot be reached without violating hard caps.

### 4) Shared Behavior Across Preview/Create

1. Normalized config used by preview must be persisted and used by create.
2. No silent cap overrides in create path.
3. Response payloads must expose enough detail for UI to explain why progression was constrained.

## Data Contracts

### Creation Config (Normalized)

Required fields for MVP:

1. `optimization_profile: "outcome_first" | "balanced" | "sustainable"`
2. `post_goal_recovery_days: number` (integer, min 0, max 28)
3. `max_weekly_tss_ramp_pct: number` (min 0, max 20)
4. `max_ctl_ramp_per_week: number` (min 0, max 8)

Defaulting policy:

1. `optimization_profile` default: `balanced`
2. `post_goal_recovery_days` defaults by profile:
   - `outcome_first`: 3
   - `balanced`: 5
   - `sustainable`: 7
3. Ramp caps defaults by profile (hard upper limits still enforced):
   - `outcome_first`: `max_weekly_tss_ramp_pct=10`, `max_ctl_ramp_per_week=5`
   - `balanced`: `max_weekly_tss_ramp_pct=7`, `max_ctl_ramp_per_week=3`
   - `sustainable`: `max_weekly_tss_ramp_pct=5`, `max_ctl_ramp_per_week=2`

### Preview/Create Response Additions

1. `normalized_creation_config` includes final values for all four fields.
2. `conflicts` include field paths and deterministic suggestions when constraints collide.
3. `feasibility_safety` includes reasons tied to ramp/recovery constraints.
4. Projection metadata includes explicit recovery segments after each goal.

## Algorithm/Calculation Changes

1. **Normalization/Suggestions**
   - Resolve profile first.
   - Apply profile defaults for recovery and ramp caps when user does not provide overrides.
   - Respect explicit user overrides when inside hard safety bounds.

2. **Conflict Resolution**
   - Detect impossible timelines where `post_goal_recovery_days` plus required preparation window overlap the next goal window.
   - Detect impossible ramps where required TSS/CTL growth exceeds user hard caps.
   - Mark these conflicts as blocking with deterministic suggestions (earlier start, lower targets, less aggressive profile).

3. **Feasibility Scoring**
   - Compute required weekly TSS and CTL progression per goal segment.
   - Evaluate with user caps, not unconstrained ramps.
   - Downgrade to `aggressive` near cap boundaries; mark `unsafe` when caps must be violated.

4. **Projection Logic**
   - Apply weekly ramping using clamped TSS and CTL deltas.
   - Insert explicit recovery windows after each goal in multi-goal timelines.
   - Recovery windows reduce weekly load before resuming build toward next goal.
   - All projection points and labels are deterministic from normalized config.

## Risks/Mitigations

### 1) User Perceives Reduced Ambition

Risk:

- Safer defaults may feel less performance-focused.

Mitigation:

- Keep `outcome_first` available with clear language that it still honors hard safety caps.

### 2) Multi-Goal Timeline Compression

Risk:

- Required recovery windows can create blocked plans for tightly spaced goals.

Mitigation:

- Return blocking conflicts with explicit alternatives (reduce goal demand, extend horizon, reduce recovery days within bounds).

### 3) Contract Drift Between Preview/Create

Risk:

- Preview may show safe behavior that create does not preserve.

Mitigation:

- Persist normalized config and make create consume the exact normalized values.

## Acceptance Criteria

1. Creation config supports all four MVP fields with deterministic defaults and bounds.
2. Preview and create both use the same normalized values and cap logic.
3. Multi-goal plans always include explicit post-goal recovery windows.
4. Projection never exceeds configured weekly TSS/CTL caps.
5. Feasibility/conflict output clearly explains cap or recovery-driven blockers.
6. Mobile create UI exposes and explains optimization profile, recovery days, and ramp caps.
7. Targeted tests cover normalization, conflict detection, feasibility scoring, and projection behavior.
