# Tasks - Training Load Controls Reframe

Last Updated: 2026-02-24
Status: Proposed
Owner: Core + Mobile + Product + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Baseline and Contracts

- [ ] Define representative projection fixtures (low/sparse/rich/no-history).
- [ ] Measure current slider sensitivity (trajectory deltas).
- [ ] Write control-impact acceptance thresholds (epsilon by metric).
- [ ] Document exact deprecated fields/adapters/components to delete.

## Phase 1 - Schema and Normalization

- [ ] Add `behavior_controls_v1` schema to core creation config.
- [ ] Add defaults and ownership semantics for behavior controls.
- [ ] Integrate behavior controls into normalization precedence.
- [ ] Remove `projection_control_v2` from schemas, normalization, and types.
- [ ] Remove deprecated cap/bound tuning fields from create/edit contracts.
- [ ] Add schema/normalization unit tests.

## Phase 2 - Optimizer and Projection Mapping

- [ ] Map aggressiveness to preparedness/risk/search parameters.
- [ ] Map variability to volatility/churn/monotony/strain penalties.
- [ ] Implement spike-frequency budget and spacing penalties.
- [ ] Map shape target/strength to curvature behavior.
- [ ] Add recovery-priority weighting for taper/recovery phases.
- [ ] Add starting-fitness-confidence anchoring pressure in initial-state handling.
- [ ] Add deterministic objective contribution tests for each control.

## Phase 3 - Safety and Explainability

- [ ] Confirm hard caps remain internal guardrails (not default UI controls).
- [ ] Add binding constraint diagnostics and suppression reason codes.
- [ ] Add sensitivity summary payload for control updates.
- [ ] Add tests for suppression diagnostics under constrained scenarios.

## Phase 4 - Composer UI Simplification

- [ ] Replace default tuning sliders with behavior-oriented controls.
- [ ] Remove cap/bound sliders and all related UI state/locks.
- [ ] Update helper text and labels to athlete-intent language.
- [ ] Display suppression/explainability messages in review panel.
- [ ] Update mobile component tests for new slider IDs and behavior.

## Phase 5 - Validation and Hardening

- [ ] Add sensitivity contract tests (low->high control changes).
- [ ] Add constrained-case tests where changes are suppressed by safety rails.
- [ ] Verify deterministic outputs for identical inputs.
- [ ] Verify create/edit parity paths with new control model.
- [ ] Verify readiness-delta diagnostics remain coherent.

## Phase 6 - Rollout

- [ ] Ship as hard cutover with synchronized mobile + server release.
- [ ] Add telemetry for slider usage and visible impact rates.
- [ ] Monitor fallback/suppression frequency post-release.
- [ ] Validate removed payload keys no longer appear in production traffic.

## Phase 7 - Deprecated Code Removal

- [ ] Remove legacy tuning adapters and mapping helpers in mobile form adapters.
- [ ] Remove deprecated tuning branches in core projection/effective-controls.
- [ ] Remove deprecated create/edit payload fields in trpc routers/use cases.
- [ ] Remove obsolete tests that assert legacy-control compatibility behavior.
- [ ] Add guard test ensuring removed keys are rejected by schemas/contracts.

## Quality Gates

- [ ] `pnpm check-types`
- [ ] `pnpm lint`
- [ ] Targeted tests for `packages/core`, `packages/trpc`, and `apps/mobile` tuning flow.
- [ ] Full `pnpm test` before production enablement.

## Definition of Done

- [ ] Default user controls are behavior-centric and understandable.
- [ ] Control-to-trajectory impact is validated by automated tests.
- [ ] Suppression reasons are visible when controls cannot move the trajectory.
- [ ] Deprecated tuning code and payload fields are removed end to end.
- [ ] Feature is rollout-ready with telemetry and guardrails.
