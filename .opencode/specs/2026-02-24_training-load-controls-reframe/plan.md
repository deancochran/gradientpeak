# Plan: Training Load Controls Reframe

Date: 2026-02-24
Status: Proposed
Owner: Core + Mobile + Product

Implements `./design.md`.

## Phase 0 - Baseline and Contracts

Objective: establish current behavior baseline and define hard-cutover contracts.

Steps:

1. Capture baseline sensitivity for current controls on representative fixtures.
2. Document removal scope for deprecated tuning fields and code paths.
3. Define acceptance thresholds for "control has visible effect" metrics.

Deliverables:

- Baseline sensitivity report in spec folder.
- Finalized cutover contract (removed fields, removed routes, removed adapters).
- Test matrix for low/sparse/rich/no-history contexts.

## Phase 1 - Schema Replacement and Contract Updates

Objective: replace legacy tuning schema with behavior controls.

Steps:

1. Add `behavior_controls_v1` schema and defaults in core.
2. Add normalization precedence integration for new controls.
3. Remove `projection_control_v2` schema wiring from creation config contracts.
4. Remove deprecated cap/bound tuning fields from creation config contracts.

Deliverables:

- Core schema updates and type exports.
- Normalization + contract unit tests.

## Phase 2 - Optimizer Integration

Objective: connect behavior controls to objective terms and temporal patterns.

Steps:

1. Map aggressiveness to preparedness/risk/search behavior.
2. Map variability to volatility/churn/monotony/strain terms.
3. Add spike-frequency penalty model (budget + spacing).
4. Map shape target/strength to curvature trajectory behavior.
5. Map recovery priority to taper/recovery protection terms.
6. Map starting fitness confidence to initial-state anchoring pressure.

Deliverables:

- Effective control resolver updates.
- Objective function integration changes.
- Deterministic projection tests for each mapping.

## Phase 3 - Safety and Suppression Explainability

Objective: maintain hard safety rails while making suppression visible.

Steps:

1. Ensure hard bounds remain internal guardrails.
2. Add diagnostics fields for binding constraints and suppression reasons.
3. Add response sensitivity summary for control updates.

Deliverables:

- Projection diagnostics extensions.
- Tests for suppression and explainability.

## Phase 4 - Composer UI Reframe

Objective: simplify tuning UI around athlete intent.

Steps:

1. Replace default tuning panel with simple-mode behavior sliders.
2. Remove cap/bound controls from UI, state, and request payload builders.
3. Add contextual helper text tied to behavior outcomes.
4. Surface suppression diagnostics in review panel.

Deliverables:

- Updated `SinglePageForm` tuning tab.
- Updated composer preview diagnostics display.
- UI tests for control visibility and interactions.

## Phase 5 - Sensitivity and Regression Hardening

Objective: guarantee meaningful control behavior and prevent regressions.

Steps:

1. Add sensitivity contract tests (low->high slider impact).
2. Add constrained-scenario tests where movement is intentionally suppressed.
3. Validate determinism and readiness guard behavior.
4. Validate create/edit parity with new control model.

Deliverables:

- Core test suite additions.
- trpc/mobile integration test updates.

## Phase 6 - Rollout and Follow-up

Objective: execute a single-release hard cutover and verify production behavior.

Steps:

1. Ship client and server contract changes together (no dual-path support).
2. Capture telemetry on slider usage and impact confidence.
3. Verify zero usage of removed payload keys after release.

Deliverables:

- Rollout checklist.
- Post-release tuning recommendations.

## Exit Criteria

1. Primary controls are behavior-oriented and user-intuitive.
2. Every primary control has validated downstream impact or explicit suppression reasons.
3. Safety protections remain enforced.
4. Deprecated tuning fields and adapters are removed.
5. UI complexity is reduced in default mode.
