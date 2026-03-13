# Implementation Plan: Continuous Fluid Periodization (MVP Architecture)

## Strategy

Implement this work as a schema-first extraction from the current projection engine, not as a rewrite from scratch.

Sequencing:

1. define canonical contracts and sport taxonomy
2. extract heuristic reference-trajectory generation into focused modules
3. integrate reference tracking into the existing MPC flow
4. expose diagnostics and payloads through existing projection outputs
5. validate determinism, runtime, and migration safety

The current `packages/core/plan/projectionCalculations.ts` is already oversized and mixes contracts, heuristics, state derivation, optimization, and payload assembly. New logic should be extracted into dedicated modules and imported back into the facade.

## Current Issues To Address

- planner contracts are scattered across implementation files instead of canonical schema modules
- sport taxonomy drifts between goal schemas, capability snapshots, and projection types
- the MPC objective is still goal/readiness-oriented rather than reference-trajectory-oriented
- the spec previously mixed MVP work with larger future systems like full workout allocation
- `@repo/trpc` and UI layers need stable payload contracts, not planner-specific heuristics

## Phase 1: Canonical Contracts And Sport Taxonomy

- Objective: define the stable domain contracts required by all later phases.
- Deliverables:
  - canonical sport union including `strength`
  - canonical projection-domain contracts
  - bounded preference modifier contract definitions
  - migration-safe type ownership outside `projectionCalculations.ts`
- Targets:
  - `packages/core/schemas/sport.ts`
  - `packages/core/schemas/planning/projection-domain.ts`
  - `packages/core/schemas/planning/allocation-targets.ts`
  - `packages/core/schemas/planning/index.ts`
  - `packages/core/schemas/settings/profile_settings.ts`
- Notes / Constraints:
  - use Zod-first contracts and infer TypeScript types from schemas
  - preserve compatibility with `GoalTargetV2` and `AthletePreferenceProfile`
  - do not create planner-only duplicate enums when a canonical schema can be shared

## Phase 2: Preference Modeling And Constraint Resolution

- Objective: formalize how user preferences bend, but do not override, physiological baselines.
- Deliverables:
  - `sport_overrides` contract for dose limits
  - new bounded preference fields for recovery, taper, and strength integration
  - `CalculatedParameter`-based provenance rules
  - a deterministic `ConstraintResolver` mapping preferences and optimization profile to effective safety bounds
- Targets:
  - `packages/core/schemas/settings/profile_settings.ts`
  - `packages/core/plan/periodization/heuristics/resolveConstraintProfile.ts`
  - `packages/core/plan/periodization/heuristics/applyPreferenceModifiers.ts`
  - `packages/core/plan/periodization/index.ts`
- Notes / Constraints:
  - preference transforms must be documented numerically in code and spec
  - every clamp must produce rationale codes for UI explainability
  - persisted profile data remains user-authored source of truth; modifiers and diagnostics remain derived

Implementation constants to extract during this phase:

- `RISK_PROFILE_DEFAULTS`
- `PREFERENCE_MODIFIER_BOUNDS`
- `TAPER_BASELINE_LOOKUP`
- `STICKY_REPLAN_WINDOWS`

## Phase 3: Goal Normalization, Event Demand, And Feasibility

- Objective: define how goals become sport-aware event demand and whether they are safely attainable.
- Deliverables:
  - normalized goal-to-demand mapping layer
  - target CTL demand derivation per goal target family
  - feasibility assessment covering ramp, availability, multi-goal, and recovery constraints
  - explicit `target_seeking` vs `capacity_bounded` mode selection
- Targets:
  - `packages/core/plan/periodization/adapters/fromProfileGoals.ts`
  - `packages/core/plan/periodization/heuristics/resolveEventDemand.ts`
  - `packages/core/plan/periodization/heuristics/assessFeasibility.ts`
  - `packages/core/plan/periodization/heuristics/computeTaperWindow.ts`
- Notes / Constraints:
  - use max-biased weighted aggregation for multi-target goals
  - unsupported or underspecified targets must fail explicitly with structured diagnostics
  - feasibility is not ramp-only

Acceptance criteria:

- exact-boundary ramp cases remain feasible
- unsupported target mapping returns structured infeasibility rather than fallback silence
- event demand resolution returns sport, demand duration, demand family, and rationale codes
- no-history and sparse-history inputs still produce deterministic feasibility outputs

## Phase 4: Sport Registry And State Foundations

- Objective: create the reusable sport-aware abstractions required by both the heuristic layer and MPC tracking.
- Deliverables:
  - `SportModelConfig` contract
  - functional `SportModelRegistry`
  - per-sport config modules for run, bike, swim, strength
  - daily state helpers for systemic and sport-local load tracking
  - strength-aware mechanical fatigue contribution model
- Targets:
  - `packages/core/plan/periodization/sports/contracts.ts`
  - `packages/core/plan/periodization/sports/registry.ts`
  - `packages/core/plan/periodization/sports/run.ts`
  - `packages/core/plan/periodization/sports/bike.ts`
  - `packages/core/plan/periodization/sports/swim.ts`
  - `packages/core/plan/periodization/sports/strength.ts`
  - `packages/core/plan/periodization/state/loadState.ts`
  - `packages/core/plan/periodization/state/systemicLoad.ts`
  - `packages/core/plan/periodization/state/peripheralLoad.ts`
- Notes / Constraints:
  - prefer pure config and shared functions over abstract classes and subclassing
  - keep current `projection/mpc/*` generic and sport-agnostic where possible
  - this phase must land before full MPC trajectory tracking because it changes constraints and state rollout

Implementation shape rules:

- put only config and tiny resolvers in each sport file
- put shared equations in shared state helpers, not repeated per sport
- use one registry entry per sport and one fallback entry for `other`

## Phase 5: Reference Trajectory Generator

- Objective: generate the ideal event-independent baseline trajectory.
- Deliverables:
  - daily `ReferenceTrajectory` output
  - dual-mode generation for feasible and infeasible scenarios
  - multi-goal trajectory merging
  - micro-taper and residual-effect support
- Targets:
  - `packages/core/plan/periodization/heuristics/generateReferenceTrajectory.ts`
  - `packages/core/plan/periodization/heuristics/mergeGoalTrajectories.ts`
  - `packages/core/plan/periodization/heuristics/buildBaselineSegment.ts`
  - `packages/core/plan/periodization/heuristics/index.ts`
- Notes / Constraints:
  - `ReferenceTrajectory` must remain independent of planned/completed workouts
  - the generator emits daily CTL and TSS targets plus rationale metadata
  - same inputs must produce identical output byte-for-byte

Acceptance criteria:

- no-goal input returns a defined maintenance-style baseline
- close B-before-A scenarios produce a micro-taper rather than a full taper
- close A-plus-A scenarios produce a sustained peak window
- preference-clamped taper windows expose `CalculatedParameter` provenance

## Phase 6: MPC Trajectory Tracking Integration

- Objective: convert the current weekly optimizer into a reference tracker without replacing the underlying solver.
- Deliverables:
  - `WeeklyTssOptimizerInput` extension for trajectory tracking
  - deterministic daily-to-weekly bridge rules
  - objective components that score predicted vs reference state error
  - tie-break rules that prioritize safety before closeness to target
- Targets:
  - `packages/core/plan/projectionCalculations.ts`
  - `packages/core/plan/projection/mpc/objective.ts`
  - `packages/core/plan/periodization/mpc/buildObjectiveComponents.ts`
  - `packages/core/plan/periodization/mpc/projectCandidateState.ts`
  - `packages/core/plan/periodization/mpc/trackReferenceTrajectory.ts`
- Notes / Constraints:
  - keep `solveDeterministicBoundedMpc(...)` generic
  - compute tracking error against daily reference points inside the horizon
  - safety penalties remain hard-dominant in candidate selection

Tie-break order for equal or near-equal candidates:

1. lower safety penalty
2. lower tracking error
3. lower week-to-week volatility
4. lower churn from previous action
5. lower absolute TSS

## Phase 7: Projection Payload Integration And Compatibility Facade

- Objective: surface the new domain outputs through existing projection payloads and keep current callers stable.
- Deliverables:
  - projection payload support for reference trajectory, feasibility, and provenance diagnostics
  - migration adapters from new canonical contracts back into current payload consumers
  - compatibility facade in `projectionCalculations.ts` and `projection/engine.ts`
- Targets:
  - `packages/core/plan/projectionCalculations.ts`
  - `packages/core/plan/projection/engine.ts`
  - `packages/core/plan/index.ts`
  - `packages/trpc` only if payload transport changes are required
- Notes / Constraints:
  - do not move domain logic into routers
  - only export new contracts through `packages/core/plan/index.ts` and higher-level package indexes when externally needed

## Phase 8: Validation Plan

- Objective: prove that the new architecture is deterministic, safe, and maintainable.
- Deliverables:
  - unit tests for contracts, demand mapping, taper windows, feasibility, and trajectory generation
  - integration tests for MPC tracking behavior under normal and fatigued conditions
  - performance benchmarks for reference generation and full projection
  - regression tests confirming current entrypoints remain valid during migration
- Targets:
  - `packages/core/plan/projection/__tests__/...`
  - `packages/core/plan/periodization/**/__tests__/...`
- Notes / Constraints:
  - use injectable date inputs and deterministic fixtures
  - benchmark on 365-day, 3-goal plans

## Validation Targets

- `generateReferenceTrajectory(...)` under 10ms for a 365-day / 3-goal plan on standard dev hardware
- full projection including MPC under 50ms for the same scenario
- no `NaN`, `Infinity`, or unstable ordering in outputs
- identical inputs produce identical outputs regardless of DB return order or runtime environment
- normal readiness state should track within an explicit CTL error tolerance
- fatigued states should reduce load even when that increases reference-tracking error

Tracking tolerances for MVP:

- normal-state 28-day mean absolute CTL tracking error target: `<= 2.0`
- fatigued-state load reduction must be observable relative to the healthy-state chosen candidate for the same horizon
- benchmark fixtures should include 1-goal, 2-close-goal, and no-goal plans

## Ready-First Implementation Slice

The first implementation slice should stop after contracts and heuristic scaffolding are in place.

Recommended first PR scope:

1. add canonical sport schema and planning-domain schemas
2. add new preference fields and defaults in `packages/core/schemas/settings/profile_settings.ts`
3. add `packages/core/plan/periodization/` folder scaffolding with `index.ts` files
4. implement `resolveEventDemand.ts`, `computeTaperWindow.ts`, and `assessFeasibility.ts`
5. add focused unit tests for the new contracts and heuristic helpers

This creates the stable foundation for later MPC integration without mixing schema work, state-model work, and optimizer refactoring into one PR.

## Export And Folder Rules

- new fluid-periodization modules live under `packages/core/plan/periodization/`
- canonical domain schemas live under `packages/core/schemas/planning/`
- use one concern per file and split before a file becomes another `projectionCalculations.ts`
- `index.ts` files should be export-only
- avoid deep imports from app or router code into non-exported core internals

## Deferred Follow-Up Work

The following are not required to complete the MVP architecture unless a current user-facing flow depends on them:

- workout database query and ranking engine
- full perfect-execution calendar materialization
- long-horizon autoreplanning and churn-diff policies beyond projection-level diagnostics
- advanced sport-specific physiology beyond the constants and local interference needed by the tracker
