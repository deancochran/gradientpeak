# Design: System Plan Heuristic Verification

## 1. Vision

GradientPeak should be able to internally verify that its system training plans behave like coach-quality plans and reasonably match the heuristic-based training load recommendations produced for a given athlete, history profile, goals, and constraints.

This spec introduces a test-driven verification harness for comparing:

- heuristic recommended training load,
- system training plan structure,
- linked system activity plans,
- the actual scheduled load implied by those plans when materialized.

The goal is not perfect identity. The goal is controlled alignment with safe, explainable variance.

## 2. Product Problem

Today, system training plans and system activity plans exist, and the heuristic engine can recommend target training load behavior. But there is no first-class automated verification proving that the curated system plans:

- follow coaching best practices,
- respect heuristic safety and feasibility logic,
- approximate the weekly training load shape recommended by the heuristic engine,
- remain aligned as heuristics, estimation logic, or templates evolve.

This creates drift risk. A system plan may look valid in isolation while diverging from the product's own recommendation engine.

## 3. Core Outcome

We need a repeatable internal contract that answers:

`For a fixed athlete scenario, does this system training plan plus its linked activity plans produce a weekly scheduled load profile that stays close enough to the heuristic-recommended profile while still respecting coaching best practices?`

## 4. Scope

### In scope

- fixture-driven athlete scenario matrix,
- pure verification pipeline in `@repo/core`,
- system training plan materialization into scheduled sessions,
- estimation of linked activity-plan load/TSS,
- weekly load aggregation and comparison to heuristic outputs,
- coaching invariant assertions,
- regression tests for system-plan drift.

### Out of scope

- UI changes,
- replacing the system plan library itself,
- changing the production recommendation engine in this spec,
- adding database-dependent verification logic.

## 5. Source of Truth

### Repository reality first

- canonical system training plan source: `packages/core/samples/training-plans.ts`,
- canonical system activity template source: `packages/core/samples/index.ts` plus the underlying sample activity modules,
- seeded database system templates are downstream mirrors via `packages/supabase/scripts/seed-training-plan-templates.ts`, not the authoring source,
- linked `activity_plan_id` values in training-plan samples are normalized through `normalizeLinkedActivityPlanId`, so verification must compare against normalized IDs rather than raw legacy literals.

This means the audit starts in core sample files, then checks whether the seed script would publish the same plan/template set. The first implementation should not make the database the truth source for fixture selection.

### Heuristic truth

The verification harness should compare plans against the most meaningful heuristic outputs already available in core:

- scalar recommendation: `dose_recommendation.recommended_weekly_load`,
- weekly target shape: `microcycles[].planned_weekly_tss`,
- baseline context ranges such as `recommended_baseline_tss_range`.

### Plan truth

The system training plan and linked activity plans should be evaluated through the same core logic used by production scheduling and estimation:

- materialize sessions from plan structure,
- estimate activity-plan TSS/load deterministically,
- aggregate by scheduled week.

## 6. Verification Architecture

### A. Package ownership

The main verification harness belongs in `@repo/core` because this is business-logic validation and must remain database-independent.

`@repo/trpc` may add thin adapter tests later, but the semantic comparison should live in pure core logic.

### B. Verification pipeline

For each scenario fixture:

1. define athlete history, goals, availability, and constraints,
2. derive heuristic recommendation outputs,
3. select a system training plan fixture,
4. materialize that plan into dated sessions,
5. resolve and estimate linked activity-plan TSS/load,
6. aggregate weekly scheduled load,
7. compare the resulting weekly series against heuristic targets,
8. assert coaching-quality invariants.

### C. Assertion model

Use scenario contracts as the primary test style. Full object snapshots should be avoided except for normalized load artifacts that are intentionally stable.

## 7. Fixture Matrix

The initial matrix should be small but representative.

### Scenario group A: baseline athlete profiles

1. `beginner_no_history_5k`

- low recent load,
- conservative ramp expectation,
- one short-distance goal,
- verifies safe floor behavior.

2. `recreational_sparse_10k`

- sparse history,
- one achievable goal,
- moderate load progression,
- verifies realistic build behavior.

3. `intermediate_rich_half`

- richer history,
- one half-marathon style goal,
- verifies target-seeking weekly load shape.

4. `advanced_marathon_build`

- high load tolerance,
- ambitious but feasible goal,
- verifies upper-band realism and long-run emphasis.

### Scenario group B: constraint and feasibility stress

5. `low_availability_high_ambition`

- low available training days,
- aggressive goal,
- verifies constraint-respecting compromise.

6. `infeasible_stretch_goal`

- insufficient time horizon for goal,
- verifies capacity-bounded deviation from target recommendation.

7. `masters_conservative_profile`

- same goal as a standard adult fixture,
- more conservative load progression,
- verifies safety heuristics under demographic constraints.

### Scenario group C: multi-goal coaching behavior

8. `b_race_before_a_race`

- near-term B race before primary A goal,
- verifies micro-taper and recovery instead of full reset.

9. `two_close_a_goals`

- two high-priority goals in close proximity,
- verifies sustained peak management and non-chaotic load transitions.

10. `same_day_a_b_priority`

- conflicting same-day priorities,
- verifies priority semantics and stable taper logic.

## 8. Plan Matrix

Each scenario should map to one or more curated system plans from `packages/core/samples/training-plans.ts`.

The current repository has six curated system plans. The first wave should use the exact plans below instead of abstract placeholders.

| Plan                                    | Current repository role                                     | Linked template set                                                                                         | First-wave scope                               |
| --------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `5K Speed Block (8 weeks)`              | only exact short-distance run race template                 | `Easy Recovery Run`, `Speed Intervals`, `Threshold Intervals`, `5K Pace Intervals`                          | full alignment + coaching assertions           |
| `Half Marathon Build (10 weeks)`        | exact half-marathon run template and best current 10k proxy | `Easy Recovery Run`, `Tempo Run`, `Threshold Intervals`, `Long Easy Run`                                    | full alignment + multi-goal proxy coverage     |
| `Marathon Foundation (12 weeks)`        | exact long-run-focused marathon template                    | `Easy Recovery Run`, `Tempo Run`, `Long Easy Run`                                                           | full alignment + long-run emphasis assertions  |
| `Cycling Endurance Builder (12 weeks)`  | only exact bike-focused endurance template                  | `Easy Endurance Ride`, `Sweet Spot Intervals`, `Recovery Spin`, `Climbing Intervals`, `Long Endurance Ride` | full alignment for bike scenarios              |
| `Sprint Triathlon Base (10 weeks)`      | mixed-sport template with swim/bike/run links               | swim, bike, and run templates                                                                               | linkage + determinism smoke only in first wave |
| `General Fitness Maintenance (6 weeks)` | mixed "other" + strength maintenance template               | `Recovery Walk`, `Full Body Circuit`, `Long Easy Run`                                                       | linkage + deterministic estimation smoke only  |

### Plan-template crosswalk summary

- exact-match lane: `5K Speed Block`, `Half Marathon Build`, `Marathon Foundation`, and `Cycling Endurance Builder` get the first full heuristic-alignment contracts,
- nearest-template lane: 10k, low-availability, masters, and some multi-goal run scenarios crosswalk to `5K Speed Block` or `Half Marathon Build` because no exact 10k, masters, or constrained-availability system template exists today,
- deferred lane: `Sprint Triathlon Base` and `General Fitness Maintenance` stay out of weekly heuristic-alignment gates until mixed-sport and non-race-support crosswalk rules are explicit.

The harness should also verify that every session with an `activity_plan_id` resolves to a known activity template and produces deterministic estimated load.

## 9. Assertion Categories

### A. Hard invariants

- deterministic output for the same input fixture,
- no missing linked activity plans,
- no negative weekly load,
- no `NaN` or `Infinity`,
- week ordering remains stable,
- aggregated weekly load equals the sum of materialized session loads.

### B. Heuristic alignment assertions

- per-week plan load stays within allowed tolerance of heuristic weekly target,
- 4-week cumulative load remains within tighter tolerance than individual weeks,
- average planned weekly load stays close to `recommended_weekly_load`.

### C. Coaching best-practice assertions

- taper load drops before primary goal weeks when taper is expected,
- recovery load reduces after major goal weeks,
- ramp rates do not exceed safety expectations,
- long-event plans preserve enough long-session emphasis,
- close secondary goals do not produce unrealistic full re-ramps.

### D. Feasibility-mode assertions

- feasible fixtures remain target-seeking,
- infeasible fixtures are allowed controlled deviation but must remain safety-aligned,
- priority ordering of goals is preserved.

### E. Audit-first caveats

- do not document a 10k-specific, masters-specific, or low-availability-specific template unless one exists in `packages/core/samples/training-plans.ts`,
- when a scenario uses a nearest-template crosswalk, treat coaching-shape correctness and cumulative load as more important than exact weekly identity,
- mixed-sport and maintenance templates can fail the initial alignment matrix without blocking Phase 1 if linkage/determinism still pass and the gap is documented as unsupported scope,
- if a sample plan's linked template set changes, the fixture crosswalk must be updated before tolerance failures are interpreted as heuristic regressions.

## 10. Tolerance Design

### Tight tolerances

For feasible, exact-match single-sport scenarios:

- weekly difference within `max(20 TSS, 8%)`,
- 4-week cumulative difference within `6-8%`.

### Moderate tolerances

For sparse-history, nearest-template, or multi-goal scenarios:

- weekly difference within `max(25 TSS, 12%)`,
- 4-week cumulative difference within `8-10%`.

### Flexible tolerances

For infeasible or capacity-bounded scenarios:

- weekly difference within `max(30 TSS, 15%)`,
- cumulative difference within `10-12%`,
- but safety and coaching invariants remain strict.

### Structural-only class

For `Sprint Triathlon Base` and `General Fitness Maintenance` in the first wave:

- no weekly alignment gate yet,
- require deterministic materialization, linked-template resolution, finite estimated load, and stable per-week aggregation only.

## 11. Regression Policy

### Treat as regression

- a fixture flips from feasible to clearly misaligned without intentional change,
- taper or recovery behavior disappears,
- weekly load repeatedly exceeds tolerance,
- linked template resolution breaks,
- outputs stop being deterministic,
- block-level load shape meaningfully diverges from the heuristic trajectory.

### Treat as acceptable variance

- small adjacent-week redistribution while cumulative block load stays in bounds,
- minor single-week differences where taper timing, recovery timing, and cumulative load still match contract,
- small recommendation drift caused by intended heuristic improvements that stay within tolerance.

## 12. Deliverables

- a pure verification adapter in `@repo/core`,
- scenario fixtures for athlete/history/goal combinations,
- normalized load comparison utilities,
- contract tests for system plans vs heuristic outputs,
- a small set of stable goldens for normalized weekly load artifacts,
- thin router-level parity tests only if needed.
