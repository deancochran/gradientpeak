# Implementation Plan: Continuous Projection Controls and User Autonomy

Date: 2026-02-16
Owner: Core optimization + mobile create UX + tRPC contracts
Status: Ready for execution
Depends on: `design.md` in this spec folder

## Execution Order

1. Phase 0: Baseline and invariants
2. Phase 1: Contract and state model
3. Phase 2: Core mapping and objective extension
4. Phase 3: Mobile controls and reset UX
5. Phase 4: Diagnostics and explainability
6. Phase 5: Validation and rollout readiness

## UX Implementation Constraint

All UI work in this plan must be additive within the existing creation screen structure.

- Add sliders to existing sections in `SinglePageForm`.
- Do not add new cards, tabs, collapsible panels, or new standalone screen-level components.
- Reuse existing input components/patterns wherever possible.

## Drift Prevention Gates

1. Pre-implementation gate: confirm plan scope still matches `design.md` UX guardrails.
2. Mid-implementation gate: after Phase 3, verify no new create-flow UI containers/components were introduced.
3. Pre-merge gate: complete anti-drift checklist in `rollout-checklist.md`.
4. Post-merge audit: compare touched files against expected file list in checklist and record variance.

## Phase Overview

| Phase | Objective                                  | Deliverable                                               |
| ----- | ------------------------------------------ | --------------------------------------------------------- |
| 0     | Protect current behavior and bounds        | Baseline fixtures + monotonicity expectations             |
| 1     | Introduce projection control contract      | `projection_control_v2` + ownership model                 |
| 2     | Implement optimizer mapping + curvature    | Effective config resolver + curvature objective term      |
| 3     | Deliver continuous controls and reset UX   | Simple/advanced UI with deterministic reset policy        |
| 4     | Improve transparency of projection choices | Effective values + clamp/objective diagnostics in preview |
| 5     | Prove safety, determinism, and autonomy    | Test gates + rollout checklist + fallback notes           |

## Phase 0 - Baseline and Invariants

### Objectives

1. Snapshot trajectory behavior before introducing new controls.
2. Freeze hard cap and schema bounds as non-regression constraints.
3. Define directional expectations for control monotonicity.

### Technical Work

1. Create fixture matrix for low/medium/high demand and sparse/rich history.
2. Capture baseline outputs for current profile variants.
3. Define monotonicity assertions for ambition/risk/curvature controls.

### Exit Criteria

1. Baseline fixtures committed.
2. Hard-cap regression tests in place.
3. Monotonicity expectations documented and testable.

## Phase 1 - Contract and State Model

### Objectives

1. Add `projection_control_v2` to creation config flow.
2. Add ownership flags for autonomy semantics.
3. Keep compatibility path for existing payloads.

### Technical Work

1. Extend core schemas and contract validators with control fields.
2. Add migration/defaulting adapter for missing `projection_control_v2`.
3. Thread control state through mobile form state and preview request builder.

### Exit Criteria

1. Backward-compatible schema parsing passes.
2. New fields are persisted in draft state and sent in preview requests.
3. Ownership map is represented and test-backed.

## Phase 2 - Core Mapping and Objective Extension

### Objectives

1. Resolve effective optimizer/cap values from semantic controls.
2. Add curvature scoring term into objective.
3. Preserve deterministic behavior and safety bounds.

### Technical Work

1. Implement `resolveEffectiveProjectionControls` utility in core.
2. Map controls to effective weights, ramp caps, and solver search bounds.
3. Add curvature term (`delta2` vs `kappa`) to objective evaluation path.
4. Keep taper/recovery emphasis via phase envelope function.
5. Add unit tests for monotonicity, bounds, and curvature polarity.

### Exit Criteria

1. Effective config values are bounded and deterministic.
2. Curvature term is active and covered by tests.
3. Existing hard cap bounds remain unchanged.

## Phase 3 - Mobile Controls and Reset UX

### Objectives

1. Expose simple continuous controls in standard flow.
2. Keep advanced direct technical controls for power users.
3. Implement scoped reset actions and ownership semantics.

### Technical Work

1. Add four simple controls to create flow (`ambition`, `risk_tolerance`, `curvature`, `curvature_strength`).
2. Add mode switch to reveal/hide advanced controls inside existing section layout (no new tabs/cards).
3. Mark fields as user-owned on interaction.
4. Implement three reset actions with clear scopes.
5. Ensure profile/default refresh only updates non-user-owned fields.
6. Keep implementation in current `SinglePageForm` structure using existing slider input patterns.

### Exit Criteria

1. Controls update preview continuously.
2. Ownership behavior is stable and test-backed.
3. Reset behaviors are deterministic and idempotent.
4. UI remains structurally unchanged except added slider rows and lightweight toggle/select wiring.

## Phase 4 - Diagnostics and Explainability

### Objectives

1. Show effective solver values used for each preview.
2. Show top active constraints and clamp pressure.
3. Explain objective composition including curvature contribution.

### Technical Work

1. Add `effective_optimizer_config` and objective contribution diagnostics.
2. Surface diagnostics in review/projection panels.
3. Add concise plain-language descriptors for binding constraints.

### Exit Criteria

1. Users can see effective values and why trajectory was selected.
2. Constraint clamps and objective term balance are inspectable.

## Phase 5 - Validation and Rollout Readiness

### Objectives

1. Validate cross-package correctness, safety, and determinism.
2. Validate autonomy semantics under rapid edits and profile changes.
3. Prepare rollout checklist and fallback strategy.

### Technical Work

1. Run package and integration test suites.
2. Add regression tests for user-owned non-overwrite behavior.
3. Verify debounce/cancellation race safety for rapid slider updates.
4. Document rollout checklist and feature-flag fallback option.
5. Run anti-drift scope audit and attach results to merge notes.

### Verification Commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/trpc test
pnpm --filter mobile check-types
pnpm --filter mobile test
pnpm check-types && pnpm lint && pnpm test
```

### Exit Criteria

1. All verification gates pass.
2. No regressions in hard safety bounds.
3. Autonomy and reset criteria pass.
4. Anti-drift scope gates pass with no structural UI changes.

## Definition of Done

1. Continuous controls are live and update projections deterministically.
2. Curvature control meaningfully shapes trajectory tendencies.
3. Defaults remain sensible for first-run users.
4. Users have full autonomy through ownership semantics and reset actions.
5. Effective optimizer diagnostics are visible and test-backed.
