# Design: Theoretical Capacity Frontier for Training Plan Projection

Date: 2026-02-16
Owner: Core + Mobile + tRPC
Status: Proposed

## Problem

The current projection system is intentionally safety-first. That is good for defaults, but it can still create an effective ceiling that is too conservative for users who want to explore elite and theoretical boundaries.

The product requirement is:

1. Keep safe and reasonable defaults for most users.
2. Do not assume elite capability by default, especially for no-history users.
3. Allow explicit user overrides to reach elite and theoretical ranges.
4. Avoid hard-coding a static "human maximum" that becomes outdated.

## Goals

1. Preserve safe default behavior for normal onboarding and no-history users.
2. Introduce an explicit capacity frontier model that supports elite and theoretical planning when user-configured.
3. Make slider/config overrides powerful enough to remove practical ceiling lock-in.
4. Keep the planner deterministic and numerically stable under extreme inputs.
5. Surface clear diagnostics when plans are outside realistic sustainability, without blocking generation.

## Non-Goals

1. No claim that theoretical plans are medically safe or achievable.
2. No forced elite mode for all users.
3. No new create-flow tabs/cards/accordion/wizard surfaces.
4. No removal of all hard rails; numerical safety rails remain required.

## Product Principles

1. Safe by default, frontier by explicit user intent.
2. Data-informed realism is soft (penalties/confidence), not hard doctrine.
3. Hard stops protect engine stability, not fixed human limits.
4. Extreme projections are allowed, but explicitly explained.

## Capability Model

### Layer 1: Default Safe Envelope

- Used by default users and no-history users with no capability overrides.
- Keeps current conservative guidance profile.

### Layer 2: User Override Frontier

- Activated naturally by high slider settings and explicit configuration.
- Expands projection search and ramp freedom substantially.
- Still bounded by engine stability rails.

### Layer 3: Theoretical Stress Domain

- Supports projections beyond typical elite norms for scenario testing.
- Never blocked by realism model alone.
- Always accompanied by strong risk and confidence diagnostics.

## Input and UX Requirements

1. Keep one reset button in tuning.
2. No simple/advanced dropdown requirement; controls remain inline.
3. Sliders and config fields must support ranges sufficient for elite/theoretical scenarios.
4. Existing safe defaults remain unchanged unless user edits.

## Core Technical Design

### A) Safety Cap Architecture

Split limits into two concepts:

1. **Default caps**: conservative initial values for normal users.
2. **Absolute engine rails**: high finite limits for numeric stability and bounded optimization.

The engine rails are not "human max" assumptions; they are computational safety boundaries.

### B) Soft Realism Model

- Capacity envelope stays penalty-based.
- High-load and high-ramp states reduce realism scores and confidence.
- Extreme plans remain generatable when user chooses aggressive settings.

### C) No-History Handling

- No-history defaults remain conservative.
- Elite-level projections are still possible through user-provided capability inputs:
  - starting CTL,
  - availability volume,
  - aggressive tuning controls,
  - high-demand goals.

### D) Determinism and Stability

- Identical inputs must produce identical projections.
- Extreme-value projections must not crash, overflow, or produce NaN values.

## Benchmark Anchors (Informative, Not Hard Limits)

Use benchmark references for test scenarios, not hard-coded ceilings:

1. Professional steady-state range (roughly 800-1200 TSS/week).
2. Ultra-endurance extreme weeks (roughly 1500-2200+ TSS/week).
3. Theoretical stress tests above these ranges to validate numerical robustness.

## Diagnostics Requirements

When user settings drive extreme plans, diagnostics must include:

1. Effective caps/weights/search settings used.
2. Clamp counts and binding constraints.
3. Capacity envelope state and limiting factors.
4. Objective term composition.
5. Plain-language sustainability warning labels.

## Testing Strategy

1. Safe-default regression tests: no-history + defaults remain conservative.
2. Elite override tests: high capability inputs can exceed 1200 weekly TSS where feasible.
3. Ultra benchmark tests: scenarios can reach 1500-2200+ when configured.
4. Theoretical stress tests: very high values remain deterministic and stable.
5. No-hidden-cap tests: detect accidental fixed ceilings in solver path.
6. Monotonic frontier tests: increasing override controls never reduces reachable upper band under same context.

## Acceptance Criteria

1. Default users still receive safety-first plans.
2. User override controls can push projection to elite and theoretical domains.
3. Extreme projections are allowed but clearly flagged by diagnostics.
4. No hard-coded "human maximum" logic is used as a blocker.
5. Determinism and numeric stability hold for stress scenarios.
6. Create flow remains structurally unchanged (no new tabs/cards/collapsibles/wizard).
