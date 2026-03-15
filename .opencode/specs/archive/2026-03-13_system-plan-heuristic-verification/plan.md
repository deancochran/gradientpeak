# Implementation Plan: System Plan Heuristic Verification

## 1. Strategy

Build a pure, deterministic verification harness in `@repo/core` that compares heuristic recommendations against the weekly load implied by curated system training plans and their linked system activity plans.

Implementation should prefer reusable comparison utilities and fixture-driven scenario contracts over brittle snapshots.

## 2. Implementation Phases

### Phase 1: Source normalization audit

- confirm `packages/core/samples/training-plans.ts` is the authoring source for system training plans,
- confirm `packages/core/samples/index.ts` plus sample activity modules are the authoring source for linked system activity templates,
- audit missing or inconsistent `activity_plan_id` links after `normalizeLinkedActivityPlanId` normalization,
- identify duration/shape mismatches between code fixtures and the seed-script mirror in `packages/supabase/scripts/seed-training-plan-templates.ts`.

### Phase 2: Core verification utilities

- create a utility to materialize system training plans into scheduled sessions,
- create a utility to resolve linked activity plans,
- create a utility to estimate session TSS deterministically,
- create a utility to aggregate weekly load from materialized sessions,
- create comparison helpers for weekly and block-level alignment.

### Phase 3: Fixture matrix

- add fake-athlete scenario fixtures,
- add goal and availability fixtures,
- map representative system plans to scenarios,
- document expected heuristic mode/taper/recovery behavior.

### Phase 4: Contract tests

- verify hard invariants,
- verify heuristic alignment tolerances,
- verify coaching best-practice assertions,
- verify feasibility-mode behavior,
- verify linked activity-plan resolution and estimation stability.

### Phase 5: Targeted parity tests

- add a small number of normalized artifact snapshots or goldens,
- add thin adapter tests if router/application layers depend on the same logic,
- document acceptable variance thresholds for future changes.

## 3. Proposed File Layout

### Core fixtures

- `packages/core/plan/verification/fixtures/athlete-scenarios.ts`
- `packages/core/plan/verification/fixtures/system-plan-mappings.ts`

### Core verification helpers

- `packages/core/plan/verification/materializeSystemPlanLoad.ts`
- `packages/core/plan/verification/aggregateWeeklyPlannedLoad.ts`
- `packages/core/plan/verification/comparePlanLoadToHeuristic.ts`
- `packages/core/plan/verification/assertCoachingInvariants.ts`

### Tests

- `packages/core/plan/__tests__/system-training-plan-load-alignment.test.ts`
- `packages/core/plan/__tests__/system-training-plan-coaching-invariants.test.ts`
- `packages/core/plan/__tests__/system-training-plan-template-resolution.test.ts`

### Optional adapter tests

- `packages/trpc/src/routers/__tests__/training-plans.system-plan-parity.test.ts`

## 4. Fixture Matrix Design

Use the current catalog, not an idealized future catalog.

| Scenario intent                  | Preferred heuristic seed                | Chosen current plan                    | Why this choice now                                                                        | Tolerance |
| -------------------------------- | --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `beginner_no_history_5k`         | new scenario fixture                    | `5K Speed Block (8 weeks)`             | only exact 5k system plan, but still treated as novice approximation                       | moderate  |
| `recreational_sparse_10k`        | adapt `feasibleSingleAGoal`             | `Half Marathon Build (10 weeks)`       | closest current 10k proxy because it has threshold + long-run structure                    | moderate  |
| `intermediate_rich_half`         | new or adapted half fixture             | `Half Marathon Build (10 weeks)`       | exact distance-family match                                                                | tight     |
| `advanced_marathon_build`        | new marathon fixture                    | `Marathon Foundation (12 weeks)`       | exact long-distance run match                                                              | tight     |
| `boundary_feasible_bike`         | reuse `boundaryFeasible`                | `Cycling Endurance Builder (12 weeks)` | exact sport match and only bike-focused template                                           | tight     |
| `low_availability_high_ambition` | new constrained fixture                 | `5K Speed Block (8 weeks)`             | shortest current race plan, best compromise for constrained cadence                        | moderate  |
| `infeasible_stretch_goal`        | reuse/adapt `infeasibleBeginnerStretch` | `Half Marathon Build (10 weeks)`       | exact goal family with explicit capacity-bounded expectations                              | flexible  |
| `masters_conservative_profile`   | new conservative fixture                | `Half Marathon Build (10 weeks)`       | no masters template exists; verify stricter ramp and recovery against nearest run template | moderate  |
| `b_race_before_a_race`           | reuse `bBeforeA`                        | `5K Speed Block (8 weeks)`             | closest current short-race block for micro-taper assertions                                | moderate  |
| `two_close_a_goals`              | reuse `twoCloseAGoals`                  | `Half Marathon Build (10 weeks)`       | more durable threshold/long-run mix for close-peak handling                                | moderate  |
| `same_day_a_b_priority`          | reuse `sameDayAB`                       | `5K Speed Block (8 weeks)`             | simplest current short-race proxy for priority tie-break behavior                          | moderate  |

Structural-only candidates that should be documented but deferred from alignment gating:

| Plan                                    | Initial scope                            | Reason                                                           |
| --------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `Sprint Triathlon Base (10 weeks)`      | linkage + deterministic estimation smoke | mixed-sport crosswalk not formalized yet                         |
| `General Fitness Maintenance (6 weeks)` | linkage + deterministic estimation smoke | no exact heuristic contract for maintenance/other + strength mix |

## 5. Assertion Matrix Design

### A. Structural assertions

- all sessions materialize with stable dates,
- every linked `activity_plan_id` resolves,
- every estimated session load is finite and non-negative,
- weekly aggregation matches the sum of session estimates.

### B. Alignment assertions

- `weekly_abs_error <= toleranceBand`,
- `block_cumulative_error <= blockTolerance`,
- `mean_weekly_load_error <= scenarioTolerance`,
- `recommended_sessions_per_week` and materialized session cadence stay reasonably aligned.

### C. Coaching assertions

- taper week load is below preceding build week load when expected,
- recovery week load is below goal week load when expected,
- no unsafe spike beyond allowed ramp heuristic,
- long-event fixtures include sufficient long-session contribution.

### D. Mode and feasibility assertions

- feasible fixtures remain within target-seeking alignment bands,
- infeasible fixtures may deviate more but still satisfy safety constraints,
- conflicting-goal fixtures preserve priority semantics.

## 6. Initial Contract-Test Scope

Start with three assertion depths and keep them explicit in test names.

### A. Full alignment contracts

- `5K Speed Block (8 weeks)`
- `Half Marathon Build (10 weeks)`
- `Marathon Foundation (12 weeks)`
- `Cycling Endurance Builder (12 weeks)`

These get structural assertions, weekly/block alignment assertions, and coaching invariants.

### B. Crosswalk coaching contracts

- nearest-template run scenarios such as 10k, masters, low-availability, and multi-goal fixtures,
- same structural checks as full alignment,
- alignment tolerance uses the documented moderate or flexible band,
- failures should first be triaged as crosswalk mismatch vs true heuristic regression.

### C. Structural smoke contracts

- `Sprint Triathlon Base (10 weeks)`
- `General Fitness Maintenance (6 weeks)`

These only prove template resolution, deterministic materialization, finite estimation, and stable weekly aggregation in the first wave.

## 7. Comparison Method

For each scenario:

1. derive heuristic weekly target series,
2. derive scalar weekly recommendation,
3. materialize system-plan sessions,
4. estimate linked activity-plan TSS per session,
5. aggregate weekly load,
6. compare week-by-week and block-by-block,
7. enforce coaching invariant checks.

Prefer comparing normalized weekly load vectors and semantic milestone markers over comparing raw plan objects.

## 8. Validation

Required checks after implementation:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test -- system-training-plan
pnpm --filter @repo/trpc check-types
```

## 9. Risks

- legacy sample training plans may not fully match labeled duration,
- system-plan code fixtures and DB-seeded templates may drift,
- nearest-template crosswalks can create false failures if the spec forgets which scenarios are exact vs approximate,
- mixed-sport templates may look "wrong" to single-sport heuristics until cross-sport comparison rules are formalized,
- activity-plan estimation variance may mask true structural issues if fixtures are too loose,
- overly brittle snapshots could make heuristic evolution painful.

## 10. Recommended Defaults

- keep logic in `@repo/core`,
- use scenario contracts as the main gate,
- treat exact-match vs nearest-template scope as first-class fixture metadata,
- use small normalized goldens only for stable load artifacts,
- treat cumulative load shape as more important than exact single-week identity.
