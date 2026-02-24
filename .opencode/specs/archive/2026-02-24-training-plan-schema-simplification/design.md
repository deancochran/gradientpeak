# Design: Training Plan Structure Schema Simplification (No Functional Loss)

Date: 2026-02-24
Owner: Core + tRPC + Mobile/Web Consumers
Status: Proposed
Type: Internal Architecture and Maintainability Refactor

## Executive Summary

Current training plan JSON schemas support complex use cases, including multi-goal periodized planning. They also carry avoidable structural complexity: duplicated schema branches, overlapping creation-contract layers, and broad files that combine unrelated concerns.

This initiative simplifies schema architecture without removing capabilities. We will preserve all behavior required for multi-goal periodized plan creation, preview, and commit. The first step is characterization and guardrails, then phased extraction and consolidation.

## Problem

Key issues in current shape:

- `packages/core/schemas/training_plan_structure.ts` combines domain schemas, creation config schemas, calibration schemas, summary/diagnostics schemas, and helper conversion/preset logic.
- Duplicate periodized and maintenance create/full schema branches repeat validations and increase drift risk.
- Creation contract layers duplicate near-identical calibration and config structures across `packages/core/contracts/training-plan-creation/schemas.ts` and `packages/core/schemas/training_plan_structure.ts`.
- Test coverage includes repeated strictness cases that can be expressed as a smaller invariant matrix.

## Goals

1. Reduce schema duplication and file coupling without changing runtime behavior.
2. Preserve multi-goal periodization flexibility and strict input validation.
3. Keep deterministic normalization outcomes for preview/commit parity.
4. Make schema ownership boundaries explicit (domain vs contract vs form adapters).

## Non-Goals

- No removal of multi-goal support.
- No removal of periodized block constraints.
- No change to hard-cutover strictness for removed legacy keys.
- No API behavior changes in this preparation phase.

## Essential Functionality To Preserve

- Multi-goal minimal plan input with valid timeline rules.
- Periodized block integrity (non-overlap, plan-range bounded blocks, valid goal references).
- Behavior-controls-based tuning and calibration override support.
- Strict unknown-key rejection for active input contracts.
- Preview/create compatibility parsers for additive diagnostics handling.

## Architecture Direction

### 1) Boundary Clarification

- Keep canonical domain schemas in `packages/core/schemas/training_plan_structure.ts` (or split modules preserving exports).
- Keep wire-level request/response contracts in `packages/core/contracts/training-plan-creation/schemas.ts`.
- Avoid duplicating calibration shapes across both files by deriving input/deep-partial forms from one source.

### 2) Shared Validation Helpers

- Extract repeated range/date/refinement logic into local shared helpers.
- Reuse one periodized refinement bundle for create/full schema variants.

### 3) Test Invariant Matrix

Replace repeated ad hoc strictness tests with characterization tests that lock critical invariants:

- timeline bounds for minimal plan,
- multi-goal block reference integrity,
- strict unknown-key rejection across main schema surfaces,
- calibration partial override acceptance + invalid merge rejection.

## Risks and Mitigations

- Risk: hidden behavior drift while refactoring schema composition.
  - Mitigation: characterization tests added before structural edits.
- Risk: accidental relaxation of strict contracts.
  - Mitigation: table-driven unknown-key rejection tests across contract entrypoints.
- Risk: multi-goal periodization regression.
  - Mitigation: explicit multi-goal periodized fixtures in guardrail tests.

## Acceptance Criteria

1. A documented phased simplification plan exists with explicit no-functional-loss constraints.
2. Characterization tests protect essential multi-goal and strictness invariants prior to structural refactor.
3. Preparation changes pass targeted core test suites.
