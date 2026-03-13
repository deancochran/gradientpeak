# Tasks: System Plan Heuristic Verification

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused tests pass, and the success check in the task text is satisfied.
- [ ] Each subagent must leave the task unchecked if blocked and add a short blocker note inline.

## Phase 1: Source Audit

- [x] Task A - System template source audit. Success: system training plan and system activity-plan sources of truth are documented, including any drift between code samples and seeded DB templates.
- [x] Task B - Template linkage audit. Success: every candidate system training plan under test has an auditable mapping to linked activity plans, and missing link risks are documented.

## Phase 2: Core Verification Harness

- [x] Task C - Materialized load adapter. Success: a pure core helper can materialize a system training plan into dated sessions and resolve their linked activity-plan load estimates deterministically.
- [x] Task D - Weekly aggregation helper. Success: a pure core helper aggregates estimated session load into normalized weekly totals suitable for comparison.
- [x] Task E - Heuristic comparison helper. Success: a pure core helper compares plan weekly load against heuristic weekly targets and returns normalized comparison metrics.
- [x] Task F - Coaching invariant helper. Success: reusable assertions exist for taper, recovery, ramp, and basic session-cadence behavior.

## Phase 3: Fixture Matrix

- [x] Task G - Athlete scenario fixtures. Success: the baseline scenario matrix is encoded as deterministic reusable fixtures.
- [x] Task H - System plan mapping fixtures. Success: representative system plans are mapped to compatible athlete scenarios with declared tolerance classes.

## Phase 4: Contract Tests

- [x] Task I - Structural verification tests. Success: tests prove linked template resolution, deterministic materialization, and weekly aggregation correctness.
- [x] Task J - Heuristic alignment tests. Success: scenario-driven tests verify weekly and block-level load alignment stays within documented tolerances.
- [x] Task K - Coaching best-practice tests. Success: scenario-driven tests verify taper, recovery, and ramp invariants for representative plans.
- [x] Task L - Feasibility and variance tests. Success: infeasible and constrained scenarios prove the harness distinguishes acceptable variance from regressions.

## Phase 5: Validation and Follow-through

- [x] Follow-up - Fixture-backed contract derivation. Success: focused system-plan contract tests derive mapped plan/scenario truth from verification fixtures instead of duplicating athlete goals and plan selection in test-only helpers.
- [x] Task M - Optional adapter parity tests. Success: if needed, thin `@repo/trpc` tests prove the same system plans survive adapter/wiring layers without semantic drift.
- [x] Task N - Exact-lane normalized goldens. Success: exact-lane tests assert small stable weekly-load artifacts and reduced comparison summaries instead of raw object snapshots.
- [x] Validation 1 - Core type validation. Success: `pnpm --filter @repo/core check-types` passes.
- [x] Validation 2 - Core verification suite. Success: focused `system-training-plan` tests pass and cover the fixture matrix.
- [x] Validation 3 - Router parity validation. Success: `pnpm --filter @repo/trpc check-types` passes, plus any added adapter tests.
