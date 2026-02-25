# Design: Context-First Training Plan Initialization Simplification

Date: 2026-02-16
Owner: Core + tRPC + Mobile
Status: Proposed

## Problem

Training plan creation has strong safety logic and rich context inputs, but initialization is more complex than necessary and still leaves important context quality on the table.

Current pain points:

- Initialization precedence is spread across layered config objects and lock semantics, increasing cognitive load for maintenance.
- User-facing optimizer/calibration tuning appears during creation even when sensible defaults can be inferred server-side.
- Context collection is broad, but initialization quality is uneven: CTL is estimated while ATL/TSB are effectively synthetic at projection start.
- Baseline ranges derived from activity history are not fully leveraged to seed initial plan load behavior.

The result is a higher-friction creation experience and a code path that is harder to reason about than the underlying domain requires.

## Goals

1. Improve initialization realism using activity efforts, profile metrics, and recent load history.
2. Simplify creation defaults so most users do not need optimizer slider tuning.
3. Preserve safety caps, deterministic projection behavior, and existing API compatibility.
4. Reduce accidental complexity in initialization orchestration and recompute triggers.

## Non-Goals

- No removal of hard safety bounds (`max_weekly_tss_ramp_pct`, `max_ctl_ramp_per_week`) in this effort.
- No broad redesign of projection math beyond initialization bootstrap improvements.
- No breaking change to preview/create endpoint contract names or auth behavior.
- No database schema migration requirement in phase 1.

## Design Principles

1. Context-first, defaults-first: infer smart defaults from data before exposing advanced tuning.
2. One canonical initialization pipeline: derive and apply CTL/ATL/TSB consistently.
3. Thin creation UX: keep advanced optimizer tuning behind explicit advanced mode.
4. Preserve deterministic behavior: any simplification must remain test-backed and replayable.
5. Keep core DB-independent: all derivation math remains in `@repo/core`.

## Target Architecture

### 1) Unified Load State Bootstrap

Introduce a single bootstrap primitive for initial load state used by preview and create.

- Input: last N days of activity load (date + TSS), effort recency, optional profile markers.
- Output: `starting_ctl`, `starting_atl`, `starting_tsb`, confidence metadata.
- Behavior: construct a daily series with zero-fill for missing days, then compute EWMA state consistently.

Expected effect: replace synthetic `ATL=CTL` and `TSB=0` initialization with data-grounded values.

### 2) Context-Derived Baseline Initialization

Promote `deriveCreationContext` outputs from advisory to initialization-driving values.

- Use observed weekly load distribution to seed baseline load target/range.
- Use session frequency distribution to seed constraints (`min/max_sessions_per_week`) and availability suggestions.
- Keep lock semantics intact, but reduce the number of fields requiring user edits.

Expected effect: fewer manual adjustments before first valid preview.

### 3) Default Optimizer Presets Over Raw Slider Tuning

Shift standard creation flow from direct optimizer multipliers to context-derived preset bundles.

- Standard mode: profile-based preset (`conservative`, `balanced`, `assertive`) selected from context + timeline pressure.
- Advanced mode: explicit multipliers remain available for coaches/power users.

Expected effect: reduce user-facing complexity while preserving expert override capability.

### 4) Initialization Orchestration Simplification

Reduce recompute and suggestion churn by scoping triggers to fields that materially affect initialization.

- Suggestions recompute when context or constraint-relevant fields change.
- Calibration-only edits should not force suggestion recomputation.
- Keep preview recompute behavior for projection-impacting fields.

Expected effect: less network chatter, cleaner control flow, easier reasoning.

## Proposed Heuristics

1. `Load state bootstrap`
   - Window: 90 days of activities, aggregated into daily TSS.
   - EWMA: reuse existing CTL/ATL constants.
   - Staleness decay: if no recent activity, decay CTL/ATL confidence and values via bounded fallback.

2. `Baseline weekly load seed`
   - Use recency-weighted weekly TSS median as midpoint.
   - Use percentile band (for example P25/P75) widened when signal quality is low.

3. `Ramp cap defaulting`
   - Use context confidence + historical ramp tolerance + timeline demand.
   - Clamp to existing hard limits; do not change schema bounds.

4. `Constraint inference`
   - Infer preferred training days from recent activity day-of-week distribution.
   - Infer sessions range from recent weekly session counts.
   - Infer max session duration from recent duration percentiles and availability clipping.

## Data Flow (Target)

1. tRPC gathers activities, efforts, profile metrics.
2. Core derives context summary and load bootstrap state.
3. Core derives initialization suggestions from context + bootstrap.
4. Mobile seeds form state with suggested values unless locked.
5. Preview/create consume the same normalized initialization snapshot.

## Risks and Mitigations

1. Risk: changing initialization alters plan feel for existing users.
   - Mitigation: add parity fixtures and explicit acceptance bands for initialization deltas.
2. Risk: fewer sliders may reduce coach control.
   - Mitigation: keep advanced mode overrides and preserve raw multiplier support.
3. Risk: sparse-history athletes get unstable defaults.
   - Mitigation: confidence-aware widening and conservative fallback presets.

## Testing Strategy

1. Core unit tests for load bootstrap (daily zero-fill, EWMA, staleness handling).
2. Core tests for context-derived baseline/constraint inference under none/sparse/rich history.
3. tRPC integration tests for suggestions + preview/create initialization parity.
4. Mobile tests for standard vs advanced initialization UX and lock merge behavior.

## Acceptance Criteria

1. Preview/create initialization uses a shared CTL/ATL/TSB bootstrap path.
2. Standard creation can produce context-appropriate defaults without optimizer slider edits.
3. Advanced optimizer tuning remains available but not required for first-pass quality.
4. Suggestion recompute excludes calibration-only edits.
5. All existing hard safety bounds remain unchanged and enforced.
6. Core/trpc/mobile test suites covering initialization pass.
