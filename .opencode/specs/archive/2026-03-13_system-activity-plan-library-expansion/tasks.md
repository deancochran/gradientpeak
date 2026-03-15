# Tasks: System Activity Plan Library Expansion

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused tests pass, and the success check in the task text is satisfied.
- [ ] Each subagent must leave the task unchecked if blocked and add a short blocker note inline.

## Phase 1: Catalog Audit

- [x] Task A - System activity-template inventory. Success: all current system activity templates are inventoried with normalized template ids, source file, execution context, and currently available metadata.
- [x] Task B - Taxonomy strategy definition. Success: the spec chooses and documents whether coverage metadata is derived, sidecar-authored, or hybrid.
- [x] Task B1 - Taxonomy ownership placement. Success: taxonomy authoring lives alongside `packages/core/samples` rather than emerging implicitly from verification-only code.
- [x] Task C - Archetype classification audit. Success: templates are classified into a usable taxonomy of session archetypes, intensity families, and progression levels.
- [x] Task D - Duplicate-risk and name-collision audit. Success: duplicate names and near-duplicate templates are identified, and all audit joins are confirmed to use normalized ids rather than names.

## Phase 2: Training-Plan Dependency Audit

- [x] Task E - Training-plan template dependency map. Success: system training plans are mapped to their linked system activity templates with normalized string-id resolution, reuse counts, and dependency visibility.
- [x] Task F - Variety and overuse audit. Success: representative plans with weak variety, over-reused templates, or missing progression support are identified and documented.
- [x] Task G - Code vs seed-linkage audit. Success: the spec captures which linkage facts are code-first today and which are already enforced by seeded DB parity.
- [ ] Task G1 - Consumer-surface dependency audit. Success: affected mobile/trpc flows are identified, including linked-template hydration and apply-template failure behavior. Note: core-side taxonomy/coverage work landed, but mobile/trpc exact-id hydration changes were not implemented in this pass.

## Phase 3: Coverage Matrix

- [x] Task H - Activity-template coverage matrix. Success: a deterministic coverage matrix exists for first-wave sports and archetypes with reuse counts and coverage status.
- [x] Task H1 - Coverage thresholds and gating set. Success: explicit numeric rules exist for `missing`, `under-covered`, `covered`, `weak variety`, and `over-reuse`, plus the exact first-wave plans that must pass.
- [x] Task I - Gap analysis. Success: missing or under-covered session archetypes and progression ladders are documented with priority ranking.

## Phase 4: Library Expansion

- [x] Task J - First-wave run template expansion. Success: the highest-impact missing run archetypes or progression variants are added across the appropriate indoor/outdoor source files.
- [x] Task K - First-wave bike template expansion. Success: the highest-impact missing bike archetypes or progression variants are added across the appropriate indoor/outdoor source files.
- [x] Task L - Template metadata and estimation readiness. Success: new templates remain estimation-friendly, fit existing system-plan linkage patterns, and preserve normalized-id stability.
- [x] Task L1 - System plan relink pass where required. Success: any shipped system training plan meant to benefit from the new templates is updated in the same change and retains parity expectations.

## Phase 5: Validation

- [x] Task M - Catalog and coverage tests. Success: tests verify taxonomy, coverage expectations, gap detection, and duplicate-risk handling.
- [x] Task N - Training-plan variety tests. Success: tests verify representative plans are not over-dependent on overly narrow template sets.
- [x] Task O - Deterministic comparison safeguards. Success: tests or helpers confirm structure comparisons ignore generated nested ids and rely on normalized ids.
- [x] Task O1 - Unresolved-link failure tests. Success: partial and full missing-link cases fail explicitly for shipped system plans instead of silently dropping sessions.
- [ ] Task O2 - Linked-template hydration scaling tests or API support. Success: training-plan detail has an exact-id-safe path for linked activity retrieval or an explicitly tested equivalent. Note: consumer-surface exact-id hydration remains outside this core-only pass.
- [x] Validation 1 - Core type validation. Success: `pnpm --filter @repo/core check-types` passes.
- [x] Validation 2 - Existing system-plan audit coverage. Success: `pnpm --filter @repo/core test -- system-plan-source-audit`, `pnpm --filter @repo/core test -- system-plan-template-resolution`, and `pnpm --filter @repo/core test -- system-training-plan-verification-helpers` pass.
- [x] Validation 3 - System activity-plan verification suite. Success: `pnpm --filter @repo/core test -- system-activity-template-catalog`, `pnpm --filter @repo/core test -- system-activity-template-coverage`, and `pnpm --filter @repo/core test -- system-training-plan-template-variety` pass.
- [ ] Validation 4 - Consumer-surface safety checks. Success: `pnpm --filter @repo/trpc test -- training-plans.apply-template` passes, and seed/parity checks run when template linkage changes. Note: not run in this core-only implementation pass.
