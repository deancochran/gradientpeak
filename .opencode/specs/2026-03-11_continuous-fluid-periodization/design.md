# Design: Continuous Fluid Periodization (MVP Architecture)

## Vision

Evolve the GradientPeak projection engine from rigid phase buckets into a continuous, dynamic periodization model that remains deterministic, fast, and safe inside the current TypeScript monorepo.

The chosen approach remains a Heuristic-Guided Model Predictive Control (MPC) architecture. The heuristic layer defines the ideal training trajectory. The MPC layer tracks that trajectory while respecting fatigue, safety, and athlete-specific constraints.

## Scope

- In scope for MVP:
  - canonical periodization contracts in `@repo/core`
  - goal-aware `ReferenceTrajectory` generation
  - feasibility assessment and best-effort mode
  - MPC trajectory tracking against a reference curve
  - sport-aware constraint foundations required by the trajectory tracker
  - projection payload changes needed to expose diagnostics to tRPC and UI consumers
- Out of scope for MVP unless a current product flow requires it:
  - full workout database allocation engine
  - persistent perfect-execution calendar generation
  - advanced sport-specific physiology beyond the minimum constants and state required for safe trajectory tracking
  - machine learning, RL, or Bayesian optimization

## Non-Goals

- Do not replace the deterministic MPC solver lattice itself.
- Do not move planning logic into `@repo/trpc`, mobile, or web.
- Do not introduce database dependencies into `@repo/core`.
- Do not add inheritance-heavy domain models when pure data contracts plus pure functions are sufficient.

## Current Repo Fit

This design must fit the current repo layout instead of creating a parallel planning system.

- `packages/core/plan/projectionCalculations.ts` is the current compatibility-heavy projection engine and should become a facade over extracted modules, not the long-term home for new fluid-periodization logic.
- `packages/core/plan/projection/engine.ts` remains the canonical projection orchestration entrypoint during migration.
- `packages/core/plan/projection/mpc/solver.ts` remains a generic bounded MPC solver primitive.
- `packages/core/schemas/settings/profile_settings.ts` owns persisted athlete preference contracts.
- `packages/core/schemas/goals/profile_goals.ts` remains the canonical source for goal target modeling.

Ownership boundaries:

- `@repo/core`: schemas, heuristics, feasibility, state updates, MPC objective shaping, diagnostics
- `@repo/trpc`: orchestration, persistence reads, payload transport
- `apps/mobile` and `apps/web`: presentation only

## Architecture Overview

### 1. Heuristic Layer

The heuristic layer generates an event-independent baseline trajectory.

- It converts `GoalTargetV2` data into normalized event demand.
- It derives target CTL and target load envelopes from that demand.
- It applies bounded user modifiers using biologically safe clamps.
- It emits a daily `ReferenceTrajectory` that is independent of planned or completed calendar events.

### 2. MPC Layer

The deterministic MPC solver becomes a trajectory tracker rather than a free-form load maximizer.

- The control action remains weekly TSS.
- The predicted state remains deterministic and fully explainable.
- The objective minimizes tracking error against the reference trajectory while preserving strong overload, fatigue, and readiness penalties.

### 3. Compatibility Layer

Existing callers should continue using the current projection entrypoint while internals are extracted.

- `buildDeterministicProjectionPayload(...)` remains the public orchestration surface during migration.
- New fluid periodization contracts are introduced in stable schema modules and then consumed by the existing projection payload.
- Legacy types inside `projectionCalculations.ts` should be migrated into canonical schema modules and re-imported back into the facade.

## Core Design Decisions

### Schema-First Domain Modeling

New planning behavior should be built around stable Zod contracts rather than ad hoc interfaces inside `projectionCalculations.ts`.

Required canonical contracts:

- `ReferenceTrajectory`
- `ReferenceTrajectoryPoint`
- `FeasibilityAssessment`
- `CalculatedParameter`
- `SportModelConfig`
- `SportLoadState`
- `DailyAllocationTarget` and `WeeklyAllocationBudget` for later allocation work

### Functional Sport Model Registry

Use a functional registry rather than an inheritance-based abstract class.

Rationale:

- the repo is already predominantly functional and schema-driven
- pure config plus pure functions is easier to test than subclass hierarchies
- adding new sports becomes additive instead of structural
- shared helpers can operate on `SportModelConfig` without duplicating logic

Required pattern:

- canonical sport union in schemas: `run | bike | swim | strength | other`
- one config module per sport
- one registry module returning the config for a sport
- shared pure helpers for decay constants, taper bounds, mechanical load, and safety caps

## Domain Contracts

The following contracts are normative for the MVP.

```ts
type TrajectoryMode = "target_seeking" | "capacity_bounded";

type TrajectoryPhase =
  | "build"
  | "deload"
  | "taper"
  | "event"
  | "recovery"
  | "maintenance";

type CalculatedParameter = {
  key: string;
  unit: string;
  baseline: number;
  modifiers: Array<{
    source: string;
    operation: "scale" | "clamp" | "add" | "replace";
    value: number;
  }>;
  effective: number;
  min_bound?: number;
  max_bound?: number;
  clamped: boolean;
  rationale_codes: string[];
};

type ReferenceTrajectoryPoint = {
  date: string;
  target_ctl: number;
  target_tss: number;
  target_atl_ceiling?: number;
  phase: TrajectoryPhase;
  goal_ids_in_effect: string[];
  rationale_codes: string[];
};

type ReferenceTrajectory = {
  mode: TrajectoryMode;
  sport: "run" | "bike" | "swim" | "strength" | "other" | "mixed";
  points: ReferenceTrajectoryPoint[];
  feasibility: FeasibilityAssessment;
  calculated_parameters: Record<string, CalculatedParameter>;
};

type FeasibilityAssessment = {
  status:
    | "feasible"
    | "infeasible_ramp"
    | "infeasible_availability"
    | "infeasible_multigoal"
    | "infeasible_recovery"
    | "unsupported_goal_mapping";
  limiting_constraints: string[];
  required_peak_ctl?: number;
  achievable_peak_ctl?: number;
  readiness_gap_ctl?: number;
  rationale_codes: string[];
};
```

Invariants:

- `ReferenceTrajectory` points are daily and date-ordered.
- `target_ctl` and `target_tss` are non-negative finite numbers.
- the baseline trajectory is independent of scheduled workouts and completed events.
- `CalculatedParameter` is required for any preference-derived value exposed to the UI.

## Planner State Model

The state model must be defined explicitly before implementation.

Daily planner state:

- `ctl`
- `atl`
- `tsb`
- `systemic_load_7d`
- `systemic_load_28d`
- `sport_load_states[sport]`
- `mechanical_fatigue_score` for strength-aware interference
- `readiness_score`

Layer ownership:

- heuristic layer owns target state and target envelopes
- MPC owns predicted control selection and predicted state rollout
- sport model registry owns sport constants and transformation helpers
- projection payload assembly owns only formatting and transport

Rules:

- daily state is the canonical simulation resolution
- weekly TSS remains the MPC control resolution
- weekly control must be disaggregated deterministically into daily simulation targets for state rollout
- readiness is a derived input to optimization, not the sole source of truth for fatigue

## Goal Normalization And Demand Mapping

The heuristic layer must normalize all goals before trajectory generation.

Required steps:

1. convert `GoalTargetV2[]` into a normalized `EventDemand`
2. determine primary sport from `activity_category`
3. map target type to demand family
4. compute target CTL demand using sport-aware formulas
5. aggregate multi-target goals using weighted max-biased aggregation

Required mapping semantics:

- `race_performance`: use distance, target time, and sport to derive endurance demand
- `pace_threshold`: derive threshold demand curve for the specified activity category
- `power_threshold`: derive threshold demand curve for the specified activity category
- `hr_threshold`: derive generic threshold demand with lower specificity confidence
- if a target is unsupported or underspecified, emit `unsupported_goal_mapping`

If a goal contains multiple targets, use a max-biased weighted aggregate so the plan respects the hardest requirement while still incorporating secondary targets.

## Biologically-Bounded Modifier Pattern

User preferences modify baseline physiology-driven recommendations. They do not replace them.

Rules:

- preferences are modeled as normalized inputs between `0` and `1`
- each preference maps to a documented transform or multiplier
- each result is clamped to sport-aware and goal-aware biological bounds
- all clamps and transforms are preserved in `CalculatedParameter`

This pattern applies to:

- `taper_style_preference`
- `systemic_fatigue_tolerance`
- `strength_integration_priority`
- `sport_overrides`

### Modifier Tables

These mappings are normative starting points for implementation and should live in code as shared constants rather than inline magic numbers.

Risk profile mapping, aligned with current optimization-profile defaults in `packages/core/plan/projection/safety-caps.ts`:

| Optimization profile | Weekly TSS ramp cap | CTL ramp cap | Default post-goal recovery |
| -------------------- | ------------------: | -----------: | -------------------------: |
| `outcome_first`      |                 10% |   5.0 / week |                     3 days |
| `balanced`           |                  7% |   3.0 / week |                     5 days |
| `sustainable`        |                  5% |   2.0 / week |                     7 days |

Bounded preference transforms:

| Preference                      | Input range | Effective transform                                        | Notes                                   |
| ------------------------------- | ----------: | ---------------------------------------------------------- | --------------------------------------- |
| `taper_style_preference`        |  0.0 to 1.0 | linear from `0.8x` to `1.2x` baseline taper                | round to nearest day, then clamp        |
| `systemic_fatigue_tolerance`    |  0.0 to 1.0 | linear from `0.9x` to `1.15x` systemic load tolerance      | cannot exceed sport safety ceiling      |
| `strength_integration_priority` |  0.0 to 1.0 | linear from `0.7x` to `1.3x` baseline strength dose target | must still respect recovery constraints |
| `progression_pace`              |  0.0 to 1.0 | linear from `0.85x` to `1.15x` baseline ramp intent        | bounded by hard ramp caps               |

Taper baseline lookup by event duration demand:

| Event duration demand  | Baseline taper |
| ---------------------- | -------------: |
| `<= 90 min`            |         7 days |
| `> 90 min and <= 4 hr` |        10 days |
| `> 4 hr and <= 8 hr`   |        14 days |
| `> 8 hr and <= 16 hr`  |        21 days |
| `> 16 hr`              |        28 days |

Clamp semantics:

- apply baseline from event demand first
- apply user multiplier second
- round to the nearest integer day third
- clamp to biological minimum and maximum fourth
- preserve all intermediate values in `CalculatedParameter`

## Feasibility And Mode Switching

Feasibility cannot be reduced to ramp rate alone.

The engine must evaluate:

- required CTL ramp vs allowed CTL ramp
- availability-constrained max weekly duration and sessions
- minimum taper and recovery windows
- goal overlap and priority conflicts
- sport-specific safety ceilings

Mode semantics:

- `target_seeking`: the plan can target the required peak safely
- `capacity_bounded`: the plan cannot target the required peak safely and instead produces the safest best-effort curve

`readiness_gap_ctl = max(0, required_peak_ctl - achievable_peak_ctl)`.

Deterministic feasibility rules:

- `required_ctl_ramp = (required_peak_ctl - current_ctl) / weeks_to_peak`
- if `required_ctl_ramp > effective_max_ctl_ramp_per_week`, mark ramp infeasible
- if `required_ctl_ramp === effective_max_ctl_ramp_per_week`, remain feasible
- if the minimum taper plus minimum recovery windows cannot fit before or after a higher-priority goal, mark recovery infeasible
- if availability-constrained max weekly duration cannot support the required weekly load floor for two consecutive horizon segments, mark availability infeasible
- if a goal target cannot be mapped to supported demand semantics, mark unsupported mapping

## Multi-Goal Merging

The reference trajectory must support multi-goal seasons without full resets unless physiologically required.

Rules:

- use canonical goal priority ordering derived from the existing numeric priority field
- lower-priority goals may receive micro-tapers rather than full tapers when they occur inside the build for a higher-priority goal
- residual effects should preserve aerobic base when goals are closely spaced
- same-day goals resolve in priority order, then by demand severity

The merge layer is responsible for producing one continuous target curve across all goals.

Priority normalization:

| Numeric priority | Planning class |
| ---------------: | -------------- |
|           `8-10` | A              |
|            `4-7` | B              |
|            `0-3` | C              |

Merge rules:

- a B or C goal within 35 days of an A goal receives a micro-taper instead of a full peak-reset cycle
- micro-taper default = 4 days with a 5% local CTL flattening from the pre-taper trajectory
- two A goals within 21 days create a sustained peak window rather than two independent full tapers
- sustained-peak valleys must not fall below 90% of the pre-first-goal CTL anchor unless safety constraints force a deeper drop
- same-day A and B goals are shaped as one event window using the A-goal demand

Residual-effect assumptions for MVP:

- aerobic carry-over window for close-goal merging = 28 days
- when two goals are inside that window, the second build should reuse the surviving CTL base rather than reset to a generic baseline
- residual-effect support is applied to endurance demand only; strength interference remains governed by local fatigue constraints

## Daily-To-Weekly Resolution Bridge

The heuristic layer emits daily points. The MPC consumes weekly control actions. The bridge between those resolutions must be deterministic.

Rules:

- `ReferenceTrajectory` is generated daily
- the MPC objective compares predicted daily state to the daily reference points inside the optimization horizon
- weekly actions are expanded into daily simulation targets using a deterministic distribution strategy
- mid-week tapers and events must be reflected in the daily reference, not approximated away into weekly averages only

## Sport-Aware Modeling

Sport-aware modeling is an MVP prerequisite for safe trajectory tracking.

Required capabilities:

- sport-specific ATL decay constants
- sport-specific ACWR ceilings
- sport-specific taper bounds
- sport-specific mechanical stress contribution
- strength-specific `Mechanical Fatigue Score` that influences run and other impact constraints without falsely inflating aerobic CTL

Required abstraction:

- `SportModelConfig` per sport
- `SportModelRegistry` resolver
- shared helpers for load-to-fatigue and safety-cap transforms

Initial normative sport config table for MVP:

| Sport    | ATL tau days | ACWR ceiling | Impact factor | Mechanical multiplier |
| -------- | -----------: | -----------: | ------------: | --------------------: |
| Run      |           10 |         1.20 |          1.00 |                  1.00 |
| Bike     |            7 |         1.40 |          0.35 |                  0.35 |
| Swim     |            6 |         1.50 |          0.20 |                  0.20 |
| Strength |            8 |         1.15 |          0.80 |                  1.25 |

Interpretation rules:

- `ATL tau days` governs sport-local fatigue decay speed
- `ACWR ceiling` is a hard safety ceiling used before preference modifiers
- `Impact factor` contributes to systemic and impact-aware scheduling limits
- `Mechanical multiplier` contributes to local tissue-fatigue and strength interference calculations

## Replanning Semantics

The system must specify how it responds to real-world deviations even if full perfect-execution allocation is deferred.

Triggers:

- completed workout
- skipped workout
- edited workout
- preference change
- goal change

Rules:

- past sessions are immutable
- future trajectory is regenerated from current state
- the projection engine may regenerate the reference and tracked trajectory, but churn tolerance should influence how aggressively near-term recommendations move
- UI diagnostics must surface why meaningful changes occurred

Near-term churn rules for MVP:

- day `0` through `2` from the regeneration point are sticky unless the new state is safety-incompatible
- days `3` through `7` may move load by up to 10% without explicit override diagnostics
- days `8+` are fully regenerable
- any forced change inside the sticky window must emit a rationale code describing the safety or feasibility cause

## Acceptance Scenarios

The following scenarios are implementation-defining and should become fixtures and tests.

| Scenario                    | Inputs                                                          | Expected result                                                     |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Feasible single A goal      | moderate profile, current CTL 45, target peak CTL 57 in 4 weeks | `target_seeking`, `readiness_gap_ctl = 0`                           |
| Boundary feasible           | required ramp exactly equals allowed ramp                       | still `target_seeking`                                              |
| Infeasible beginner stretch | current CTL 20, target peak CTL 50 in 2 weeks                   | `capacity_bounded`, positive readiness gap                          |
| B before A                  | B goal 28 days before A goal                                    | 4-day micro-taper, no full reset                                    |
| Two close A goals           | A goals 14 days apart                                           | sustained peak window, no drop below 90% unless safety constrained  |
| Preference clamp            | ultra goal with shortest taper preference                       | taper result clamped and provenance explains why                    |
| No goals                    | no active goals                                                 | maintenance-style capacity-bounded baseline with explicit rationale |

## Implementation Notes

- Prefer constants files for all numeric tables so design values are not duplicated across modules.
- Prefer discriminated unions plus pure helper functions over class hierarchies.
- Use adapters when bridging legacy projection payloads into canonical planning contracts.

## Module Boundaries

Recommended target structure:

```text
packages/core/
  schemas/
    sport.ts
    planning/
      projection-domain.ts
      allocation-targets.ts
      index.ts
  plan/
    periodization/
      index.ts
      facade.ts
      adapters/
      heuristics/
      sports/
      state/
      mpc/
      allocation/
```

Guidance:

- keep `packages/core/plan/projection/mpc/*` as generic solver infrastructure where possible
- place new fluid-periodization domain logic in extracted modules, not directly into `projectionCalculations.ts`
- use adapters to bridge old payloads to new contracts during migration

## DX And Code Organization Rules

- Prefer pure deterministic functions in `@repo/core`.
- Avoid creating a second monolithic file like `projectionCalculations.ts`.
- Keep contract files under roughly 150 lines when possible.
- Keep helper/resolver files under roughly 120 lines when possible.
- Split orchestrators before they exceed roughly 250 to 350 lines.
- Re-export public modules through the nearest `index.ts`; keep `index.ts` files export-only.
- Do not bury canonical types in implementation files.

## Why this remains the best MVP

1. It preserves the fast deterministic MPC solver already present in the repo.
2. It fits the existing schema-first, pure-function style of `@repo/core`.
3. It future-proofs sport-aware extensions without forcing inheritance-heavy abstractions.
4. It reduces long-term maintenance by moving contracts and heuristics into focused modules.
