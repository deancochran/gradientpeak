# Design: Readiness Score and Dynamic Context Propagation

Date: 2026-02-13
Owner: Core planning
Status: Proposed

## Consolidation

This document is the single source of truth for readiness-score and dynamic-context projection design. It consolidates the prior draft from `docs/plans/2026-02-12-readiness-score-design/design.md`.

## Problem

Current projection behavior still over-relies on static baseline load shaping, which can weaken dynamic adaptation from prior projected state. CTL/ATL/TSB remains valuable, but CTL alone is not enough to represent race-readiness quality.

## Goal

Improve plan creation and projection quality by transforming the existing model in place:

1. Use `starting_ctl` as the first-class seed for early load.
2. Compute each new microcycle from prior projected context.
3. Add an explainable readiness score to existing feasibility metadata.

## Non-Goals

- No new V2 architecture.
- No replacement of CTL/ATL/TSB.
- No hardcoded goal-target ladders.
- No breaking API contract changes.

## Design Decisions

### 1) CTL-first seeding

- If `starting_ctl` is present, derive initial seed weekly TSS from it.
- If unavailable, use baseline weekly TSS as fallback.
- Treat baseline as a seed/fallback, not a persistent weekly anchor.

### 2) Dynamic context propagation

Weekly load requests should be derived from carry-forward state:

- prior projected weekly TSS,
- current block structure and phase intent,
- active demand pressure,
- recovery/taper/event state.

The calculation remains deterministic and uses existing cap ordering and safety limits.

### 2.1 Rolling weekly base (in-place refinement)

Use a rolling composition instead of static baseline anchoring:

```text
rolling_base_weekly_tss =
  0.60 * previousWeekTss +
  0.25 * block_midpoint_tss +
  0.15 * demand_floor_tss_if_present
```

Then apply existing pattern multiplier, recovery reduction, demand floor, and safety caps in the current order.

### 2.2 Cycle-level context

- **Microcycle:** each week reads prior week outputs (`previousWeekTss`, `CTL`, `ATL`, `TSB`, clamp pressure).
- **Mesocycle:** block-boundary diagnostics (demand gap, freshness drift, clamp frequency, readiness trend) can nudge rolling weights in small bounded ranges.
- **Macrocycle:** sustained clamp pressure or readiness stagnation reduces aggressiveness while preserving safety-first caps.

### 3) Readiness score as layered metadata

Add optional readiness fields to existing `ProjectionFeasibilityMetadata`:

- `readiness_score` (0-100)
- `readiness_components` (`load_state`, `intensity_balance`, `specificity`, `execution_confidence`)
- `projection_uncertainty` (`tss_low`, `tss_likely`, `tss_high`, `confidence`)

This supplements existing feasibility outputs and does not create a second projection system.

## Readiness Scoring Model

Weighted composite (bounded and deterministic):

```text
score =
  0.35 * load_state +
  0.25 * intensity_balance +
  0.25 * specificity +
  0.15 * execution_confidence

readiness_score = round(score * 100)
```

Band mapping:

- `high`: >= 75
- `medium`: 55-74
- `low`: < 55

Uncertainty envelope (lightweight):

```text
uncertainty_pct = clamp(
  0.06 + (1 - evidence_confidence) * 0.18 + clamp_pressure * 0.05,
  0.08,
  0.28,
)
```

`projection_uncertainty` values are produced from this bounded margin around likely projected peak weekly TSS.

## Compatibility Strategy

- Extend only existing types with optional fields.
- Keep router pass-through and preview/create parity unchanged.
- Preserve snapshot logic and existing conflict semantics.

## Safety and Determinism

- Keep current hard constraints authoritative:
  - TSS ramp cap,
  - CTL ramp cap,
  - recovery/taper/event adjustments.
- Keep outputs deterministic for identical inputs.

## Success Criteria

1. Weekly projection reflects prior microcycle state instead of static anchoring.
2. CTL-derived seeding works when CTL is provided.
3. Readiness score is explainable and stable.
4. Existing consumers remain compatible without payload changes.
5. Only one active readiness-score spec remains in the repository.
