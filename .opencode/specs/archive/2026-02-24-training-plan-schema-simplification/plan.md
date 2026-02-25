# Technical Plan: Training Plan Structure Schema Simplification

Last Updated: 2026-02-24
Status: In Progress
Depends On: `./design.md`
Owner: Core + QA

## Objective

Simplify training plan schema architecture and tests while preserving full multi-goal periodization functionality and strict contract behavior.

## Scope

### In Scope

- Schema-boundary cleanup and composition improvements.
- Shared helper extraction for repeated refinements.
- Contract-layer deduplication for calibration/input shapes.
- Characterization-first tests that lock behavior before refactor.

### Out of Scope

- Functional behavior changes in planning/projection.
- Contract expansion or deprecation policy changes.
- UI-level workflow changes.

## Phase 0 - Characterize and Lock Behavior (Preparation)

1. Add guardrail tests for multi-goal timeline and block integrity invariants.
2. Add table-driven strictness tests for unknown/removed keys across schema entrypoints.
3. Add calibration override invariants (partial override accepted, invalid merged values rejected).

Deliverables:

- Guardrail test suite in `packages/core/plan/__tests__/`.
- Targeted test run results documented in task response.

## Phase 1 - Module Boundary Split (No Behavior Change)

1. Split monolithic schema file responsibilities into focused modules while preserving current exports.
2. Keep import surface stable via barrel exports (`index.ts`) to avoid consumer churn.
3. Add no-op refactor tests if path-based imports are sensitive.

Deliverables:

- Extracted module files with re-export compatibility.
- Zero behavior change verified by existing tests.

## Phase 2 - Remove Duplicate Schema Definitions

1. Compose create/full schema variants from shared base objects.
2. Centralize repeated periodized refinement logic (block overlap/date bounds/goal refs).
3. Consolidate duplicated range/refine snippets into reusable utilities.

Deliverables:

- Shared base + refinement helper usage.
- Reduced duplication in periodized and maintenance schema branches.

## Phase 3 - Contract Deduplication

1. Derive contract calibration input schema from a single canonical calibration shape.
2. Replace overlapping creation config schema layers with explicit, minimal compositional wrappers.
3. Keep strict unknown-key behavior unchanged.

Deliverables:

- Reduced duplicate calibration definitions.
- Passing contract strictness tests.

## Phase 4 - Test Suite Simplification

1. Replace repetitive strictness tests with table-driven matrix tests.
2. Keep only high-value invariants and compatibility checks.
3. Maintain or improve coverage for core schema behavior.

Deliverables:

- Smaller, clearer creation-contract test suite.
- Coverage parity in modified areas.

## Exit Criteria

1. Schema composition is simpler and less duplicated.
2. Multi-goal periodization behavior remains unchanged.
3. Strict contract behavior for removed/unknown keys remains unchanged.
4. Guardrail and targeted suites pass after each phase.
