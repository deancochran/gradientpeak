# Tasks - Training Plan Architecture Simplification

## Execution Metadata

- Sprint 1: Phase 1 + Phase 2
- Sprint 2: Phase 3 + Phase 4
- Sprint 3: Phase 5 + Phase 6 + Phase 7
- Owners: Core, tRPC, Mobile, QA
- Gate: Do not start Phase 5 until Phases 1-4 are merged.

## Phase 1: Contract Consolidation

- [x] [Core][S1] Create canonical creation contract modules under `packages/core/contracts/training-plan-creation/`.
- [x] [Core][S1] Export shared creation schemas/types from core public entrypoints.
- [x] [tRPC][S1] Remove router-local duplicated creation schemas in `packages/trpc/src/routers/training_plans.ts`.
- [x] [Mobile][S1] Update mobile create flow types to consume core contract types.
- [x] [Core+QA][S1] Add/extend contract validation tests for shared schemas.
- [x] [QA][S1] Verify no schema drift between preview and create payload validation.

## Phase 2: Application Services and Router Split

- [x] [tRPC][S1] Create `packages/trpc/src/application/training-plan/previewCreationConfigUseCase.ts`.
- [x] [tRPC][S1] Create `packages/trpc/src/application/training-plan/createFromCreationConfigUseCase.ts`.
- [x] [tRPC][S1] Create `packages/trpc/src/application/training-plan/getCreationSuggestionsUseCase.ts`.
- [x] [tRPC][S1] Split router responsibilities into:
  - [x] `packages/trpc/src/routers/training-plans.creation.ts`
  - [x] `packages/trpc/src/routers/training-plans.crud.ts`
  - [x] `packages/trpc/src/routers/training-plans.analytics.ts`
- [x] [tRPC+QA][S1] Keep endpoint contract compatibility with existing client calls.
- [x] [tRPC][S1] Remove dead code paths from `packages/trpc/src/routers/training_plans.ts` after migration.

## Phase 3: Projection and Domain Decomposition

- [x] [Core][S2] Extract projection engine orchestration to `packages/core/plan/projection/engine.ts`.
- [x] [Core][S2] Extract no-history logic to `packages/core/plan/projection/no-history.ts`.
- [x] [Core][S2] Extract safety cap logic to `packages/core/plan/projection/safety-caps.ts`.
- [x] [Core][S2] Extract readiness composition to `packages/core/plan/projection/readiness.ts`.
- [x] [Core+tRPC][S2] Ensure shared CTL/ATL/TSB primitives are reused by curve/status paths.
- [x] [tRPC][S2] Remove duplicate local formula usage from router analytics endpoints.
- [x] [Core+QA][S2] Add unit tests per extracted projection concern.
- [x] [QA][S2] Add parity fixtures to confirm unchanged projection outputs.

## Phase 4: Mobile Adapter Consolidation

- [x] [Mobile][S2] Create adapter folder `apps/mobile/lib/training-plan-form/adapters/`.
- [x] [Mobile][S2] Move form-to-contract mapping from `training-plan-create.tsx` into adapters.
- [x] [Mobile][S2] Move duplicated goal/config parsing helpers into adapters.
- [x] [Mobile][S2] Keep screen logic focused on UX state and mutation lifecycles.
- [x] [Mobile+QA][S2] Add adapter tests for deterministic payload mapping.
- [x] [Mobile+QA][S2] Validate lock precedence encoding through adapter tests.

## Phase 5: Boundary Hardening

- [x] [Core][S3] Remove infra-related re-exports from `packages/core/index.ts`.
- [x] [tRPC][S3] Introduce repository interfaces in tRPC application layer.
- [x] [tRPC][S3] Implement Supabase-backed repository adapters in tRPC infrastructure layer.
- [x] [Core+tRPC][S3] Add import-boundary constraints (lint/rules) for contracts/domain/application/infrastructure.
- [x] [QA][S3] Add checks that fail on forbidden cross-layer imports.

## Phase 6: Coverage and Regression Safety

- [x] [QA+tRPC][S3] Add/expand tests for under-covered training plan endpoints:
  - [x] `getCurrentStatus`
  - [x] `getIdealCurve`
  - [x] `getActualCurve`
  - [x] `getWeeklySummary`
- [x] [QA+tRPC][S3] Add tests for `planned_activities` constraint validation path.
- [x] [QA][S3] Add end-to-end preview/create parity regression tests.
- [x] [QA+tRPC][S3] Add tests for persistence invariants around active-plan uniqueness behavior.

## Phase 7: Verification and Completion

- [x] [Core][S3] Run `pnpm --filter @repo/core check-types`.
- [x] [Core][S3] Run `pnpm --filter @repo/core test`.
- [x] [tRPC][S3] Run `pnpm --filter @repo/trpc check-types`.
- [x] [tRPC][S3] Run `pnpm --filter @repo/trpc test`.
- [x] [Mobile][S3] Run `pnpm --filter mobile check-types`.
- [x] [Mobile][S3] Run `pnpm --filter mobile test`.
- [x] [QA][S3] Run `pnpm check-types && pnpm lint && pnpm test`.
- [x] [QA][S3] Confirm all acceptance criteria from `design.md` are satisfied.
