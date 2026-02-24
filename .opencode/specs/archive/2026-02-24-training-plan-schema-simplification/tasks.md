# Tasks - Training Plan Structure Schema Simplification

Last Updated: 2026-02-24
Status: Completed
Owner: Core + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Characterization and Preparation

- [x] Document simplification goals, non-goals, and preserved functionality requirements.
- [x] Define phased technical plan with no-functional-loss constraints.
- [x] Add guardrail tests for multi-goal timeline, block integrity, and strict contract behavior.
- [x] Run targeted tests for new guardrails.

## Phase 1 - Boundary Split (No Behavior Change)

- [x] Extract schema concerns into focused modules while preserving public exports.
- [x] Keep import compatibility through stable barrel exports.
- [x] Verify no behavior change with targeted and package tests.

## Phase 2 - Deduplicate Schema Composition

- [x] Build shared base objects for create/full variants.
- [x] Centralize periodized block refinement logic (overlap/range/goal refs).
- [x] Replace repeated range refinements with shared helpers.

## Phase 3 - Contract Layer Consolidation

- [x] Deduplicate calibration schema definitions between core schema and contracts.
- [x] Simplify creation input schema composition while keeping strict parsing.
- [x] Preserve hard rejection of removed legacy fields and aliases.

## Phase 4 - Test Cleanup

- [x] Convert repeated strictness cases to table-driven test matrix.
- [x] Keep compatibility parser coverage for additive diagnostics.
- [x] Confirm coverage and maintainability improvements.

## Quality Gates

- [x] `pnpm --filter @repo/core test -- training-plan-creation-contracts.test.ts`
- [x] `pnpm --filter @repo/core test -- training-plan-schema-simplification-guardrails.test.ts`
- [x] `pnpm --filter @repo/core check-types`
- [x] `pnpm --filter @repo/core lint`

## Definition of Done

- [x] Schema architecture is simpler with reduced duplication.
- [x] Multi-goal periodized planning flexibility is preserved.
- [x] Strict hard-cutover contract behavior is preserved.
- [x] Refactor is validated by guardrail and targeted suites.
