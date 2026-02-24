# Tasks - Training Load Controls Reframe

Last Updated: 2026-02-24
Status: Active - Hard Cutover
Owner: Core + Mobile + Product + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Baseline and Contracts

- [ ] Define representative projection fixtures (low/sparse/rich/no-history).
- [ ] Measure current slider sensitivity (trajectory deltas).
- [ ] Write control-impact acceptance thresholds (epsilon by metric).
- [ ] Document exact deprecated fields/adapters/components to delete.

## Phase 1 - Schema and Normalization

- [x] Add `behavior_controls_v1` schema to core creation config.
- [x] Add defaults and ownership semantics for behavior controls.
- [x] Integrate behavior controls into normalization precedence.
- [x] Remove `projection_control_v2` from schemas, normalization, and types.
- [x] Remove deprecated cap/bound tuning fields from create/edit contracts.
- [x] Add schema/normalization unit tests.

## Phase 2 - Optimizer and Projection Mapping

- [x] Map aggressiveness to preparedness/risk/search parameters.
- [x] Map variability to volatility/churn/monotony/strain penalties.
- [x] Implement spike-frequency budget and spacing penalties.
- [x] Map shape target/strength to curvature behavior.
- [x] Add recovery-priority weighting for taper/recovery phases.
- [x] Add starting-fitness-confidence anchoring pressure in initial-state handling.
- [ ] Add deterministic objective contribution tests for each control.

## Phase 3 - Safety and Explainability

- [x] Confirm hard caps remain internal guardrails (not default UI controls).
- [ ] Add binding constraint diagnostics and suppression reason codes.
- [ ] Add sensitivity summary payload for control updates.
- [ ] Add tests for suppression diagnostics under constrained scenarios.

## Phase 4 - Composer UI Simplification

- [x] Replace default tuning sliders with behavior-oriented controls.
- [x] Remove cap/bound sliders and all related UI state/locks.
- [x] Update helper text and labels to athlete-intent language.
- [ ] Display suppression/explainability messages in review panel.
- [x] Update mobile component tests for new slider IDs and behavior.

## Phase 5 - Validation and Hardening

- [ ] Add sensitivity contract tests (low->high control changes).
- [ ] Add constrained-case tests where changes are suppressed by safety rails.
- [ ] Verify deterministic outputs for identical inputs.
- [ ] Verify create/edit parity paths with new control model.
- [ ] Verify readiness-delta diagnostics remain coherent.

## Phase 6 - Rollout

- [ ] Ship as hard cutover with synchronized mobile + server release.
- [ ] Add telemetry for slider usage and visible impact rates.
- [ ] Monitor suppression frequency post-release.
- [ ] Validate removed payload keys no longer appear in production traffic.

## Phase 7 - Deprecated Code Removal

- [x] Remove legacy tuning adapters and mapping helpers in mobile form adapters.
- [x] Remove deprecated tuning branches in core projection/effective-controls.
- [x] Remove deprecated create/edit payload fields in trpc routers/use cases.
- [ ] Remove obsolete tests that assert deprecated projection-control behavior.
- [x] Add guard test ensuring removed keys are rejected by schemas/contracts.

Cutover rule for all phases: no deprecated aliases, removed-key parsing,
or deprecated projection-control adapters.

Completion rule: deprecated projection-control removals are required deliverables for this
spec and cannot be deferred.

## Quality Gates

- [x] `pnpm check-types`
- [x] `pnpm lint`
- [x] Targeted tests for `packages/core`, `packages/trpc`, and `apps/mobile` tuning flow.
- [ ] Full `pnpm test` before production enablement.

## Definition of Done

- [ ] Default user controls are behavior-centric and understandable.
- [ ] Control-to-trajectory impact is validated by automated tests.
- [ ] Suppression reasons are visible when controls cannot move the trajectory.
- [ ] Deprecated tuning code and payload fields are removed end to end.
- [ ] Feature is rollout-ready with telemetry and guardrails.
