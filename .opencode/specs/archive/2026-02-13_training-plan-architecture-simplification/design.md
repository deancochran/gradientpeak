# Design: Training Plan Creation and Calculation Simplification

Date: 2026-02-13
Owner: Core + tRPC + Mobile
Status: Proposed

## Problem

Training plan creation and calculation quality is strong, but implementation complexity has accumulated in a few high-pressure modules. The current structure increases change risk, slows onboarding, and makes correctness harder to verify as projection logic evolves.

Primary complexity centers:

- `packages/trpc/src/routers/training_plans.ts` combines transport, orchestration, policy, persistence, and analytics in one router.
- `packages/core/plan/projectionCalculations.ts` concentrates multiple projection concerns in one algorithm-dense module.
- `packages/core/schemas/training_plan_structure.ts` mixes schema contracts with generation/template behavior.
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` performs orchestration and mapping logic that should be shared.

## Goals

1. Reduce accidental complexity without changing training outcomes.
2. Establish clear boundaries between contracts, domain logic, application orchestration, and infrastructure.
3. Eliminate duplicated schema and mapping logic across mobile/core/trpc.
4. Improve testability and confidence for refactors in creation and calculation flows.
5. Preserve deterministic preview/create behavior and existing safety constraints.

## Non-Goals

- No redesign of the projection model itself in this effort.
- No feature-level UX redesign of training plan creation.
- No database schema rewrite for `training_plans.structure` JSON in this phase.
- No breaking API contract changes for existing clients.

## Complexity Taxonomy

### Necessary Domain Complexity

- Periodized plan expansion and block-level intent.
- CTL/ATL/TSB dynamics, ramp controls, and safety caps.
- Sparse-history fallback and confidence behavior.
- Conflict resolution across user constraints, locks, and feasibility.

### Accidental Complexity (Target to Remove)

- Oversized mixed-responsibility modules.
- Duplicate schemas and parsing logic.
- UI-layer ownership of domain shaping logic.
- Transport layer directly coupled to persistence details.
- Inconsistent use of shared calculation utilities across endpoints.

## Design Principles

1. **Single source of truth for contracts:** all plan creation schemas and payload contracts live in core contracts.
2. **Thin transport layer:** routers validate/authenticate and delegate to use-case services.
3. **Pure domain core:** business rules remain deterministic and DB-independent.
4. **Infrastructure behind interfaces:** repositories abstract data access in application layer.
5. **Shared client adapters:** screens map form state via shared adapters, not custom per-screen transforms.
6. **Refactor behind parity tests:** every extraction preserves preview/create outputs for identical inputs.

## Target Architecture

### 1) Contracts Layer

Create explicit contract modules under core:

- `packages/core/contracts/training-plan-creation/*`
- Expose canonical schemas/types now duplicated in router and UI parsing paths.

Outcome: router and mobile import contract definitions from one place.

### 2) Domain Layer

Keep pure logic in focused submodules:

- `packages/core/plan/projection/engine.ts`
- `packages/core/plan/projection/no-history.ts`
- `packages/core/plan/projection/safety-caps.ts`
- `packages/core/plan/projection/readiness.ts`
- `packages/core/plan/conflicts/*`

Outcome: projection behavior remains deterministic while concerns become isolated and testable.

### 3) Application Layer (tRPC package)

Introduce use-case services:

- `previewCreationConfigUseCase`
- `createFromCreationConfigUseCase`
- `getCreationSuggestionsUseCase`

Routers become orchestration endpoints that call these services.

### 4) Infrastructure Layer (tRPC package)

Introduce repositories:

- `TrainingPlanRepository`
- `ActivityRepository`
- `ProfileMetricsRepository`

Use cases depend on repository interfaces; Supabase implementations remain in infrastructure.

### 5) Client Adapter Layer (mobile)

Add shared form adapters:

- `apps/mobile/lib/training-plan-form/adapters/*`

Adapters own mapping between form state and core contracts. Screen components only handle UX state and interaction.

## Refactoring Plan

### Phase 1: Contract and Mapper Consolidation (Quick Wins)

- Move router-local schemas into core contracts and re-export stable types.
- Replace duplicated goal/config parsing with shared adapters.
- Add preview/create fixture tests that verify payload parity before/after extraction.

Expected impact: immediate drift reduction and safer future refactors.

### Phase 2: Router Decomposition and Application Services

- Split `training_plans` router by responsibility:
  - `training-plans.creation`
  - `training-plans.crud`
  - `training-plans.analytics`
- Extract creation and preview orchestration into use-case services.

Expected impact: reduced blast radius and clearer ownership.

### Phase 3: Projection Engine Decomposition

- Decompose projection logic into submodules with explicit interfaces.
- Keep existing cap ordering and deterministic constraints.
- Ensure all curve/status endpoints use shared calculation primitives from core.

Expected impact: better reasoning, faster targeted changes, and improved test isolation.

### Phase 4: Boundary Hardening

- Remove infra re-exports from core package public surface.
- Enforce import boundaries (contracts/domain/application/infrastructure) via lint or package-level constraints.
- Add architecture checks to prevent cross-layer leakage.

Expected impact: durable layering and long-term maintainability.

## Testing Strategy

1. **Parity tests (highest priority):** fixed fixtures for preview/create to ensure identical outputs across refactor.
2. **Domain unit tests:** projection submodule tests for caps, no-history behavior, readiness components, and conflict rules.
3. **Router integration tests:** focus on endpoint contract stability and error semantics.
4. **Mobile adapter tests:** ensure form-to-contract mapping is deterministic and complete.
5. **Constraint validation tests:** add dedicated coverage for planned activity constraint checks and schema-driven plan reads.

## Risk and Effort Matrix

- **R1: Contract consolidation** - Effort: Low, Risk: Low, Impact: High.
- **R2: Use-case extraction from router** - Effort: Medium, Risk: Low-Medium, Impact: High.
- **R3: Mobile adapter consolidation** - Effort: Medium, Risk: Medium, Impact: Medium-High.
- **R4: Router decomposition** - Effort: Medium, Risk: Medium, Impact: High.
- **R5: Projection module split** - Effort: High, Risk: Medium-High, Impact: Very High.
- **R6: Boundary hardening and enforcement** - Effort: Medium, Risk: Medium, Impact: High.

## Acceptance Criteria

1. All creation/config schemas used by mobile and tRPC are sourced from core contracts.
2. `training_plans` responsibilities are split into focused router modules.
3. Preview/create orchestration lives in application use-case services, not route handlers.
4. Projection logic is split by concern with equivalent deterministic outputs under parity tests.
5. Mobile creation screen uses shared adapters for payload mapping (no duplicate domain parsers).
6. Core package no longer exposes infrastructure-layer dependencies.
7. Test coverage increases for status/curve/constraint paths currently under-covered.

## Success Metrics

- Reduced average file size and reduced cyclomatic complexity in hotspot modules.
- Fewer cross-package changes required for single-feature updates in creation flow.
- Lower defect rate in preview/create parity and downstream curve endpoints.
- Faster onboarding for contributors modifying training plan logic.

## Rollout Notes

- Maintain backward-compatible endpoint payloads during all phases.
- Land each phase behind tests and incremental PRs; avoid one-shot migration.
- Defer behavior changes until structure work is complete and parity is proven.
