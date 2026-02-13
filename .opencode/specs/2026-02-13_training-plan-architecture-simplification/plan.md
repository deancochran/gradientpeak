# Technical Plan: Training Plan Architecture Simplification

Last Updated: 2026-02-13
Status: Ready for execution
Depends On: `.opencode/specs/2026-02-13_training-plan-architecture-simplification/design.md`

## Implementation Window

- Sprint 1: Phase 1 + Phase 2
- Sprint 2: Phase 3 + Phase 4
- Sprint 3: Phase 5 + hardening follow-ups from verification

## Team Ownership

- Core team: contracts and projection decomposition
- tRPC team: router split, use-case extraction, repositories
- Mobile team: form adapters and UI-layer cleanup
- Shared QA: parity fixtures, endpoint regression, boundary checks

## Execution Order and Gates

1. Phase 1 must complete before Phase 2 and Phase 4.
2. Phase 2 must complete before any router cleanup in Phase 5.
3. Phase 3 can start after Phase 1, but must merge before final coverage gate.
4. Phase 4 can run in parallel with late Phase 2 after contracts stabilize.
5. Phase 5 is final, after all refactors are merged and parity is green.

## Objective

Reduce accidental complexity in training plan creation and calculation flows by introducing clear contracts, layered orchestration, and modularized projection/domain logic, while preserving deterministic behavior and API compatibility.

## Non-Negotiables

1. No behavior regressions in preview/create outcomes for identical inputs.
2. No breaking API contract changes to existing clients.
3. Keep current safety constraints and conflict semantics authoritative.
4. Keep `@repo/core` database-independent and deterministic.
5. Land changes in incremental phases with parity tests.

## Core Approach

1. Consolidate creation contracts into core as the single source of truth.
2. Extract route-level orchestration into application use-case services.
3. Split monolithic router responsibilities into focused router modules.
4. Decompose projection logic by concern while preserving existing math behavior.
5. Move mobile form-to-contract mapping into shared adapters.
6. Introduce repository interfaces to decouple business rules from Supabase query details.

## Phase 1 - Contract Consolidation and Drift Elimination

### Scope

Unify training plan creation schemas and payload contracts so mobile and tRPC consume the same source.

### Files

- `packages/core/contracts/training-plan-creation/*` (new)
- `packages/core/schemas/training_plan_structure.ts`
- `packages/trpc/src/routers/training_plans.ts`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

### Deliverables

1. Add canonical creation contract exports in core.
2. Remove router-local duplicate schema definitions in favor of core imports.
3. Align mobile create payload shaping with core contract types.
4. Add/expand contract-level tests for schema parity and validation behavior.

### Exit Criteria

1. One source of truth for creation contract types and zod schemas.
2. Router and mobile compile against shared contracts.
3. No contract drift between preview/create input parsing paths.

### PR Slice

- PR1: introduce core contracts and exports.
- PR2: migrate router imports to core contracts.
- PR3: migrate mobile imports and payload typing.

## Phase 2 - Application Service Extraction and Router Decomposition

### Scope

Split the large training-plans router by responsibility and move heavy orchestration into use-case services.

### Files

- `packages/trpc/src/routers/training_plans.ts`
- `packages/trpc/src/routers/training-plans.creation.ts` (new)
- `packages/trpc/src/routers/training-plans.crud.ts` (new)
- `packages/trpc/src/routers/training-plans.analytics.ts` (new)
- `packages/trpc/src/application/training-plan/*` (new)

### Deliverables

1. Create `previewCreationConfigUseCase`, `createFromCreationConfigUseCase`, `getCreationSuggestionsUseCase`.
2. Move endpoint-specific orchestration to application services.
3. Keep routers thin: auth, validation, delegation, response mapping.
4. Preserve endpoint names and payload shapes.

### Exit Criteria

1. Router files are responsibility-scoped and materially smaller.
2. Preview/create logic executes via use-case services.
3. Integration tests for existing endpoints pass unchanged.

### PR Slice

- PR4: add application use-case services and wire preview/create.
- PR5: split creation/crud/analytics router modules.
- PR6: remove legacy dead code from monolithic router.

## Phase 3 - Projection and Domain Decomposition

### Scope

Break projection logic into focused submodules without changing projection semantics.

### Files

- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/projection/engine.ts` (new)
- `packages/core/plan/projection/no-history.ts` (new)
- `packages/core/plan/projection/safety-caps.ts` (new)
- `packages/core/plan/projection/readiness.ts` (new)
- `packages/core/plan/conflicts/*`

### Deliverables

1. Extract projection subconcerns into explicit modules and interfaces.
2. Ensure status/curve endpoints use shared core primitives consistently.
3. Add focused unit tests for each extracted projection concern.
4. Preserve deterministic outputs for fixture inputs.

### Exit Criteria

1. Projection responsibilities are isolated by concern.
2. Existing behavior validated by parity fixtures and domain tests.
3. No duplicate CTL/ATL/TSB update logic in router endpoints.

### PR Slice

- PR7: extract no-history + safety caps modules.
- PR8: extract readiness + engine orchestration modules.
- PR9: align analytics endpoints with shared core primitives.

## Phase 4 - Mobile Adapter Consolidation

### Scope

Reduce UI-domain leakage by consolidating payload mapping/parsing into shared mobile adapters.

### Files

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- `apps/mobile/lib/training-plan-form/adapters/*` (new)

### Deliverables

1. Extract mapping from form state to creation contract payloads.
2. Keep UI components focused on interaction and presentation state.
3. Add adapter tests for deterministic mapping and lock precedence encoding.

### Exit Criteria

1. Create screen no longer contains duplicated domain parsing rules.
2. Adapter output matches preview/create contract expectations.

### PR Slice

- PR10: create adapter package and migrate mapping logic.
- PR11: remove inline parsing from create screen and add tests.

## Phase 5 - Boundary Hardening and Verification

### Scope

Enforce architecture boundaries and validate end-to-end parity and coverage improvements.

### Files

- `packages/core/index.ts`
- `packages/trpc/src/infrastructure/*` (new)
- `packages/trpc/src/repositories/*` (new)
- lint/import-boundary configuration files (as needed)

### Deliverables

1. Remove infrastructure-layer re-exports from core public API.
2. Introduce repository interfaces and Supabase-backed implementations.
3. Add boundary checks to prevent cross-layer leakage.
4. Run full verification suite for impacted packages.

### Verification Commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/trpc test
pnpm --filter @repo/mobile check-types
pnpm --filter @repo/mobile test
pnpm check-types && pnpm lint && pnpm test
```

### Exit Criteria

1. Layering boundaries are enforced by tooling/tests.
2. Core remains DB-independent by imports and exports.
3. Creation/calculation parity and endpoint compatibility are preserved.

### PR Slice

- PR12: remove infra re-exports from core and add repository interfaces.
- PR13: add infra adapters + import-boundary enforcement.
- PR14: full verification and follow-up fixes.

## Definition of Done

1. All phases complete with green parity fixtures and regression suites.
2. New files and modules have clear ownership and tests.
3. No remaining TODO markers in migrated hotspots.
4. Spec acceptance criteria in `design.md` are checked and linked to test evidence.

## Risks and Mitigations

1. Regression from wide module extraction -> use fixed parity fixtures and phase gates.
2. API behavior drift during router split -> keep endpoint contracts unchanged and cover with integration tests.
3. Partial migration dead zones -> complete each phase with explicit cleanup before next phase.
4. Team throughput dip during structural work -> sequence low-risk quick wins first and ship incrementally.

## Completion Criteria

This plan is complete when:

1. Shared contracts eliminate duplicated schema definitions.
2. Router orchestration is delegated to application services.
3. Projection code is modularized by concern with parity preserved.
4. Mobile create flow uses shared adapters for contract mapping.
5. Core/trpc/mobile boundaries are explicit, enforced, and test-backed.
