# Tasks: Continuous Fluid Periodization (MVP Architecture)

## Coordination Rules

- A task is complete only when the code lands in the target module and the focused validation for that task passes.
- New domain contracts should live in schema modules, not only inside implementation files.
- New fluid-periodization logic should be extracted into focused modules rather than added directly to `packages/core/plan/projectionCalculations.ts` unless the task explicitly says to update the compatibility facade.
- If a file starts to become a second monolith, split it before continuing.

## Phase 1: Canonical Contracts And Sport Taxonomy

- [x] Create canonical sport schema in `packages/core/schemas/sport.ts`. Success: one shared sport union exists for run, bike, swim, strength, and other, and planning code no longer needs planner-only sport enums.
- [x] Create `packages/core/schemas/planning/projection-domain.ts`. Success: it defines `ReferenceTrajectory`, `ReferenceTrajectoryPoint`, `FeasibilityAssessment`, `CalculatedParameter`, and supporting enums/schemas.
- [x] Create `packages/core/schemas/planning/allocation-targets.ts`. Success: it defines reusable weekly/daily allocation target contracts without depending on persistence or UI code.
- [x] Create `packages/core/schemas/planning/index.ts` and wire exports. Success: new planning-domain schemas can be imported without deep paths.
- [x] Update `packages/core/plan/index.ts` exports. Success: only externally needed planning contracts are re-exported through package indexes.
- [x] Add `packages/core/plan/periodization/` folder scaffolding with `index.ts` files. Success: adapters, heuristics, sports, state, and mpc folders exist with export-only indexes ready for incremental implementation.

## Phase 2: Preference Modeling And Constraint Resolution

- [x] Add `sport_overrides` to `athletePreferenceDoseLimitsSchema` in `packages/core/schemas/settings/profile_settings.ts`. Success: per-sport overrides reuse the canonical sport union and support validation-compatible partial dose limits.
- [x] Add `systemic_fatigue_tolerance` to `athletePreferenceRecoverySchema`. Success: it is a bounded preference with documented default and no parallel magic numbers hidden in planner code.
- [x] Add `taper_style_preference` to `athletePreferenceGoalStrategySchema`. Success: the field is bounded, documented, defaulted, and ready for `CalculatedParameter` provenance.
- [x] Add `strength_integration_priority` to `athletePreferenceTrainingStyleSchema`. Success: it is bounded and can influence strength dose distribution without changing persisted schema semantics elsewhere.
- [x] Update `defaultAthletePreferenceProfile`. Success: all new fields have explicit defaults aligned with the design.
- [x] Add preference-modifier resolution helpers under `packages/core/plan/periodization/heuristics/`. Success: transforms, clamps, and rationale codes are centralized and deterministic.
- [x] Implement `ConstraintResolver` in `packages/core/plan/periodization/heuristics/resolveConstraintProfile.ts`. Success: it maps optimization profile plus bounded preferences to effective ramp, ACWR, TSB, taper, and recovery constraints.
- [x] Extract shared numeric constants for preferences and taper rules. Success: modifier bounds and taper baselines live in one constants module rather than being repeated across helpers and tests.

## Phase 3: Goal Normalization, Event Demand, And Feasibility

- [x] Create goal adapter in `packages/core/plan/periodization/adapters/fromProfileGoals.ts`. Success: existing `GoalTargetV2` inputs are normalized into one planning-friendly goal contract without losing source semantics.
- [x] Implement `resolveEventDemand` in `packages/core/plan/periodization/heuristics/resolveEventDemand.ts`. Success: every supported `GoalTargetV2["target_type"]` maps deterministically to demand data or to an explicit unsupported-state result.
- [x] Implement target-demand aggregation. Success: multi-target goals use a documented max-biased weighted aggregate and expose rationale codes.
- [x] Implement taper window resolution in `packages/core/plan/periodization/heuristics/computeTaperWindow.ts`. Success: baseline taper, preference multiplier, sport-aware bounds, and clamp provenance are all modeled through `CalculatedParameter`.
- [x] Implement `FeasibilityAssessment` in `packages/core/plan/periodization/heuristics/assessFeasibility.ts`. Success: ramp, availability, multi-goal, recovery, and unsupported-mapping failures all produce structured outputs.
- [x] Implement mode switching. Success: the engine selects `target_seeking` or `capacity_bounded` deterministically and returns `readiness_gap_ctl` when bounded.
- [x] Add scenario fixtures for feasible, infeasible, no-goal, and close-goal cases. Success: future tests and examples reuse one canonical set of deterministic planning fixtures.

## Phase 4: Sport Registry And State Foundations

- [x] Create `SportModelConfig` contract in `packages/core/plan/periodization/sports/contracts.ts`. Success: shared sport constants and rule hooks are modeled without inheritance.
- [x] Create `SportModelRegistry` in `packages/core/plan/periodization/sports/registry.ts`. Success: all sport lookups resolve through one registry API.
- [x] Add per-sport configs in `packages/core/plan/periodization/sports/run.ts`, `bike.ts`, `swim.ts`, and `strength.ts`. Success: each sport defines decay constants, safety caps, taper hints, and mechanical load factors.
- [x] Implement daily systemic and local load state helpers under `packages/core/plan/periodization/state/`. Success: systemic load, sport-local load, and strength mechanical fatigue are modeled in separate focused files.
- [x] Replace planner-local sport aliases where needed. Success: new periodization code imports canonical sport types instead of redefining them.

## Phase 5: Reference Trajectory Generation

- [x] Implement `generateReferenceTrajectory` in `packages/core/plan/periodization/heuristics/generateReferenceTrajectory.ts`. Success: it emits ordered daily CTL/TSS targets plus phase and rationale metadata.
- [x] Keep the reference generator independent of planned/completed events. Success: no event-calendar data is required to generate the baseline curve.
- [x] Implement feasible-mode reverse generation. Success: `target_seeking` plans can build backward from peak demand and taper anchors.
- [x] Implement best-effort forward generation. Success: `capacity_bounded` plans safely approach the goal without violating effective constraints.
- [x] Implement multi-goal merge logic in `packages/core/plan/periodization/heuristics/mergeGoalTrajectories.ts`. Success: multiple peaks are merged into one continuous curve with documented priority and tie-break semantics.
- [x] Implement B/C micro-taper support. Success: lower-priority interruptions create localized taper behavior without a full reset when rules say to train through.
- [x] Implement residual-effect carry-forward logic. Success: closely spaced goals preserve aerobic base instead of resetting to zero-base assumptions.

## Phase 6: MPC Trajectory Tracking Integration

- [x] Extend `WeeklyTssOptimizerInput` in `packages/core/plan/projectionCalculations.ts`. Success: the optimizer receives the reference trajectory and any required bridge metadata without breaking current callers.
- [x] Implement daily-to-weekly bridge logic. Success: weekly control actions are expanded into deterministic daily simulation targets for scoring against the daily reference trajectory.
- [x] Implement reference-tracking objective helpers in `packages/core/plan/periodization/mpc/buildObjectiveComponents.ts`. Success: predicted-vs-reference tracking error becomes a first-class objective term.
- [x] Update `packages/core/plan/projection/mpc/objective.ts` only as needed for generic weighting support. Success: generic MPC primitives remain reusable and domain-specific logic stays outside the solver core.
- [x] Refactor `evaluateWeeklyTssCandidateObjectiveDetails` in `packages/core/plan/projectionCalculations.ts`. Success: it evaluates tracking error, safety penalties, churn, and volatility with explicit tie-break ordering.
- [x] Verify receding-horizon taper anticipation. Success: upcoming taper and event windows inside the horizon influence chosen weekly TSS before the event week arrives.

## Phase 7: Projection Payload Integration And Migration Facade

- [x] Add new reference-trajectory and feasibility fields to the projection payload. Success: callers can access baseline targets, bounded-mode diagnostics, and clamp provenance through the existing projection result.
- [x] Keep `packages/core/plan/projection/engine.ts` as the compatibility entrypoint. Success: external call sites do not need a disruptive API rewrite during the extraction.
- [x] Move canonical contracts out of `packages/core/plan/projectionCalculations.ts` where applicable. Success: implementation logic consumes shared schemas instead of owning hidden planner-only interfaces.
- [x] Re-export only stable public APIs through `packages/core/plan/index.ts`. Success: internal helper modules do not leak unnecessarily.

## Phase 8: Validation And Performance

- [x] Add unit tests for sport taxonomy and planning-domain schemas. Success: invalid contract shapes fail deterministically.
- [x] Add unit tests for preference modifier transforms and clamp provenance. Success: bounded modifiers produce expected `CalculatedParameter` outputs.
- [x] Add unit tests for goal-demand mapping. Success: each supported target family resolves deterministic event demand with expected rationale codes.
- [x] Add unit tests for taper window resolution. Success: taper duration reflects event demand, preference multiplier, and biological clamps.
- [x] Add unit tests for feasibility assessment. Success: ramp, availability, multi-goal, and unsupported-target failures are covered.
- [x] Add unit tests for multi-goal trajectory generation. Success: close B-before-A, close A+A, same-day conflicts, and no-goal cases all have expected outputs.
- [x] Add integration tests for MPC trajectory tracking. Success: healthy scenarios track the reference within tolerance and fatigued scenarios reduce load despite increased tracking error.
- [x] Add sport-aware state tests. Success: running, cycling, swimming, and strength use their own decay and interference behavior.
- [x] Benchmark trajectory generation and full projection. Success: reference generation stays under 10ms and full projection stays under 50ms for a 365-day / 3-goal scenario.
- [x] Run focused validation. Success: `pnpm --dir packages/core check-types`, `pnpm --dir packages/core test`, and any required `packages/trpc` checks pass when payload contracts change.

- [x] PR 1 - contracts and scaffolding. Success: Phases 1 and early Phase 2 scaffolding land without touching MPC behavior.
- [x] PR 2 - heuristic helpers. Success: event demand, taper windows, and feasibility helpers land with fixtures and unit tests.

Session note: focused Phase 1-4 validation passes with `pnpm --dir packages/core check-types` and `pnpm --dir packages/core exec vitest run schemas/__tests__/planning-domain.test.ts schemas/__tests__/profile-settings.test.ts plan/periodization/__tests__/periodization-heuristics.test.ts plan/periodization/__tests__/sport-state-foundations.test.ts`.

## Implementation Kickoff Slice

- [x] PR 3 - reference trajectory generation. Success: daily baseline generation lands before MPC tracking refactor.

- [x] PR 4 - MPC integration. Success: reference-tracking logic lands with regression coverage.

Session note: full validation passes with `pnpm --dir packages/core check-types`, `pnpm --dir packages/core test`, `RUN_FULL_PROJECTION_BENCHMARK=1 pnpm --dir packages/core exec vitest run plan/periodization/__tests__/periodization-benchmarks.test.ts`, and `pnpm --dir packages/trpc check-types`. The full projection benchmark remains opt-in during the default suite to avoid noise from concurrent test load, but it now passes in isolated validation.

## Deferred Follow-Up

- [ ] Design workout selection contracts for a future allocator. Success: the future DB-backed workout-matching problem is separated cleanly from MVP trajectory tracking.
- [ ] Design perfect-execution calendar materialization. Success: future scheduling logic has a defined contract without blocking the MVP periodization engine.
- [ ] Design projection-to-calendar churn policies. Success: future replanning behavior can be added without rewriting the core heuristic and tracking layers.
