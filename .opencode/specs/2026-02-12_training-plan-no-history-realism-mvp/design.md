# Training Plan No-History Realism MVP (Minimal, High-Impact)

Last Updated: 2026-02-12
Status: Draft for implementation planning
Owner: Product + Core + Backend + Mobile

## Purpose

Improve projection realism for no-history users by correcting unrealistically low absolute load and fitness values while keeping existing safety controls unchanged.

Primary outcomes:

1. Raise no-history baseline projection anchors for high-demand goals (like marathon).
2. Preserve deterministic safety behavior (ramp caps, feasibility, conflicts).
3. Add transparent metadata so users can understand when a no-history floor was applied.

## Problem Statement

No-history users can currently see projected values around ~100 weekly TSS and ~14 CTL even for long-horizon marathon goals. The chart shape can look plausible, but the absolute values are often too low to be credible.

This appears to come from low/no-history start-state anchors and conservative block derivation, compounded by taper/recovery reductions.

## Principles

1. Keep this MVP minimal: no new user-facing controls.
2. Prioritize absolute-value realism over adding new planner complexity.
3. Preserve existing safety caps and conflict logic exactly.
4. Keep behavior deterministic and explainable.
5. Ensure preview and create use the same projection path.

## Scope

### In Scope

1. Introduce a deterministic no-history bootstrap floor for projection anchors.
2. Apply floor only when history availability is `none`.
3. Return floor provenance metadata in preview/create responses.

### Out of Scope

1. New periodization systems.
2. New config inputs, toggles, or advanced UI settings.
3. Changes to existing safety cap ranges/profile semantics.
4. Behavior changes for users with `sparse` or `rich` history.

## Functional Requirements

### 1) No-History Gate

1. Floor logic activates only when creation context history state is `none`.
2. For `sparse` or `rich` history, projection behavior remains unchanged.

### 2) Goal-Demand Floor Tiers

1. Determine a single floor tier from primary goal demand using existing goal typing/difficulty signals.
2. Apply deterministic floor constants:

| Tier                     | Weekly TSS Floor | CTL Floor |
| ------------------------ | ---------------: | --------: |
| low                      |              120 |        18 |
| medium                   |              160 |        24 |
| high (includes marathon) |              200 |        30 |

3. Floors are anchors, not forced weekly targets. Existing ramp and feasibility logic still governs progression.

### 3) Projection Ordering (Deterministic)

For `history=none`, calculation order is:

1. Normalize creation config.
2. Derive no-history floor tier and values.
3. Initialize projection state using `max(current_estimate, floor)`.
4. Run existing week-by-week projection with existing cap clamps.
5. Run existing feasibility/conflict classification.

### 4) Metadata Transparency

Preview/create responses expose:

1. `projection_floor_applied: boolean`
2. `projection_floor_tier: "low" | "medium" | "high" | null`
3. `projection_floor_values: { weekly_tss: number; ctl: number } | null`

## Data Contract Changes

### Creation Input

No new creation-config fields.

### Preview/Create Output Additions

Add non-breaking metadata fields for floor provenance:

1. `projection_floor_applied`
2. `projection_floor_tier`
3. `projection_floor_values`

## Algorithm Changes

1. Add a pure helper in `@repo/core` to map no-history goal demand to floor values.
2. Add a projection initializer step that applies floor anchors before existing clamped weekly projection.
3. Keep all existing safety clamps unchanged:
   - `max_weekly_tss_ramp_pct`
   - `max_ctl_ramp_per_week`
   - post-goal recovery behavior

## Risks and Mitigations

### 1) Floors Too High for True Beginners

Risk:

- Some users may still be undertrained relative to floor anchors.

Mitigation:

- Floors are conservative and still constrained by existing ramp caps and feasibility safeguards.

### 2) Perceived Inconsistency Across Goal Types

Risk:

- Users may ask why tiers differ.

Mitigation:

- Keep tier mapping deterministic and expose floor metadata in preview output.

### 3) Preview/Create Drift

Risk:

- Floor could apply differently between endpoints.

Mitigation:

- Implement a shared floor initializer path reused by preview and create.

## Acceptance Criteria

1. No-history high-demand (marathon) projections no longer anchor near ~100 weekly TSS / ~14 CTL.
2. For no-history + high-demand goals, projection anchors are at least 200 weekly TSS and 30 CTL before week-level caps are applied.
3. Existing ramp caps remain strictly enforced; no cap regressions.
4. `sparse` and `rich` history behaviors are unchanged.
5. Preview and create return identical floor metadata and values for identical inputs.
6. Tests cover tier mapping, floor application ordering, and cap-preservation.

## Minimal Implementation Checklist

- [ ] Add no-history floor tier helper in `@repo/core`.
- [ ] Apply floor anchors in shared projection initialization path.
- [ ] Thread floor metadata through preview/create response payloads.
- [ ] Add targeted tests for no-history marathon realism and unchanged cap behavior.
