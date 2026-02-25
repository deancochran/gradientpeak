# Design: Continuous Projection Controls and User Autonomy

Date: 2026-02-16
Owner: Core + Mobile + tRPC
Status: Proposed

## Problem

Training plan projection currently trends toward conservative, low-curvature trajectories even when users want aggressive progression. Users can tune some values today, but control is fragmented and does not map clearly to objective behavior.

Key pain points:

- Objective and tie-break behavior favor low week-to-week deltas, which can flatten trajectories.
- Safety caps and profile bounds are enforced, but users cannot intuit how these constraints shape output.
- Existing controls expose technical multipliers but do not provide direct control over curve shape.
- Reset behavior exists but is not organized around clear autonomy rules for user-owned values.

## Goals

1. Provide continuous controls that directly influence projection behavior and curvature.
2. Preserve sensible initialization defaults so first preview is safe and useful.
3. Preserve full user autonomy after interaction: user-owned values are never silently overwritten.
4. Maintain deterministic projection outputs and existing hard safety bounds.
5. Keep advanced direct optimizer tuning available for expert users.

## Non-Goals

- No requirement for hard peak weekly TSS target input in this phase.
- No removal of existing hard schema/runtime cap boundaries.
- No change to auth, routing, or data persistence architecture.
- No breaking contract changes for existing create/preview consumers.
- No new cards, tabs, collapsible sections, or net-new component surfaces in create flow UI.

## Design Principles

1. Semantic controls first, technical controls optional.
2. Continuous domains, not coarse presets, for projection behavior.
3. User ownership is explicit and durable.
4. Safety remains enforced and explainable.
5. Deterministic in, deterministic out.
6. Enhance existing create UI in place: add sliders to current sections only.

## UX Scope Guardrails

1. Reuse existing `SinglePageForm` layout and existing section containers.
2. Add controls as inline slider rows in current tuning/limits areas.
3. Do not introduce new tabs, accordion/collapsible cards, or wizard-like UX.
4. Do not create new standalone UI components unless a tiny shared slider helper is strictly required.
5. Keep labels and helper copy concise and plain language.

## Anti-Drift Controls

1. Scope lock: any implementation PR for this spec must declare "in-place slider enhancement only" in its summary.
2. UI topology lock: no new top-level create-flow containers, tabs, cards, accordions, or route-level components.
3. File-scope lock: mobile UI edits should be concentrated in existing create-flow files (primarily `SinglePageForm` and existing input utilities).
4. Contract lock: no unrelated contract/schema expansion beyond projection-control and diagnostics fields defined in this spec.
5. Review gate: PR must include a completed anti-drift checklist from `rollout-checklist.md`.

## User Control Model

Add a projection control layer with continuous values:

- `ambition`: `0..1` (preparedness pressure)
- `risk_tolerance`: `0..1` (penalty tolerance)
- `curvature`: `-1..1` (front-loaded to back-loaded progression preference)
- `curvature_strength`: `0..1` (how strongly curvature preference is enforced)
- `mode`: `simple | advanced`

UI placement requirement:

- These controls must be implemented as sliders in the existing create screen control areas.
- `mode` can be represented as an existing lightweight toggle/select row, not a new tab.

### Defaults

- `ambition = 0.5`
- `risk_tolerance = 0.4`
- `curvature = 0`
- `curvature_strength = 0.35`
- `mode = simple`

These defaults are applied after existing context/profile initialization so standard flow remains sensible without manual tuning.

## Effective Optimizer Mapping

Map semantic controls to existing optimizer and cap parameters.

Definitions:

- `A = ambition`
- `R = risk_tolerance`
- `C = curvature`
- `S = curvature_strength`

Baseline inputs come from current normalized profile + calibration defaults.

### Weight mapping

- `preparedness_weight_eff = base.preparedness_weight * lerp(0.75, 1.65, A)`
- `risk_penalty_weight_eff = base.risk_penalty_weight * lerp(1.8, 0.35, R)`
- `volatility_penalty_weight_eff = base.volatility_penalty_weight * lerp(1.45, 0.5, R)`
- `churn_penalty_weight_eff = base.churn_penalty_weight * lerp(1.3, 0.55, R)`

### Search mapping

- `lookahead_weeks_eff = round(lerp(base.lookahead_weeks, max_lookahead, A))`
- `candidate_steps_eff = round(lerp(base.candidate_steps, max_candidate_steps, A))`

Where `max_lookahead` and `max_candidate_steps` are bounded by profile and schema limits.

### Ramp envelope mapping

- `max_weekly_tss_ramp_pct_eff = clamp(base.max_weekly_tss_ramp_pct + 10*A + 6*R, 0, 20)`
- `max_ctl_ramp_per_week_eff = clamp(base.max_ctl_ramp_per_week + 4.0*A + 2.0*R, 0, 8)`

## Curvature Objective Extension

Add a curvature term to objective scoring to let users shape trajectories without hard peak targets.

For weekly load action sequence `u_t`:

- `delta_t = u_t - u_(t-1)`
- `delta2_t = delta_t - delta_(t-1)`
- `kappa_t = C * build_envelope(t)`

Add penalty:

- `curve_penalty = mean_t((delta2_t - kappa_t)^2)`
- `w_curve = lerp(0, w_curve_max, S)`
- objective subtracts `w_curve * curve_penalty`

`build_envelope(t)` emphasizes build weeks and decays in taper/recovery so taper logic remains dominant.

## User Autonomy and Ownership Rules

1. Any modified field becomes `user_owned`.
2. User-owned fields are never replaced by suggestion/default refresh.
3. Profile changes re-seed only non-user-owned fields.
4. Advanced mode direct edits set ownership on corresponding underlying parameters.
5. Effective runtime values and clamp events are surfaced in diagnostics.

## Reset Policy

Provide explicit reset actions:

1. `Reset Basic Controls`
   - resets simple controls to profile/context defaults
   - clears user ownership for simple controls only
2. `Reset Advanced Tuning`
   - resets direct technical overrides to normalized defaults
   - clears user ownership for advanced fields only
3. `Reset All Projection Settings`
   - restores defaults for both simple and advanced layers
   - clears all projection ownership flags

All resets are deterministic and idempotent.

## Preview Update Semantics

- Any projection control change triggers preview recompute.
- Use short debounce window (100-200ms) and last-write-wins cancellation.
- Preserve deterministic behavior for equal input snapshots.
- Surface `updating` and `fresh/stale` status in UI.

## Contract and Diagnostics Additions

Add `projection_control_v2` to creation config/state:

- `mode`, `ambition`, `risk_tolerance`, `curvature`, `curvature_strength`
- `user_owned` ownership map

Add `effective_optimizer_config` to preview diagnostics:

- resolved weights/caps/search bounds used by solver
- active constraints and clamp counts
- objective contribution terms, including curvature term

## Testing Strategy

1. Core tests: continuous control mapping monotonicity and bound adherence.
2. Core tests: curvature term behavior under negative/zero/positive curvature.
3. Core tests: deterministic output for identical inputs.
4. Mobile tests: simple control interactions, ownership persistence, reset behavior.
5. Integration tests: preview payload carries effective config + diagnostics.

## Acceptance Criteria

1. Continuous controls produce expected directional behavior changes in projections.
2. Curvature control materially influences build-shape tendency without hard peak target input.
3. User-owned values persist across suggestion refresh and profile toggles.
4. Reset actions perform exactly scoped behavior.
5. Existing hard safety bounds remain enforced.
6. Determinism and contract tests pass across core/mobile/trpc.
7. Mobile implementation adds sliders to the current UI only, with no new cards/components/tabs/collapsible sections.
8. Anti-drift checklist is completed and attached to implementation PR.
