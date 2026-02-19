# Schema Release Gate: Single-Mode Capacity-Envelope Planning

Date: 2026-02-15
Scope: Phase 7 schema governance checks for core -> trpc -> mobile

## Gate Checklist

- [x] Canonical contract schemas reject removed mode/risk fields.
- [x] Canonical contract schemas reject inferred duplicate aliases (example: `recent_influence_score`).
- [x] Core creation/projection contracts keep canonical nested object paths for recent influence (`recent_influence.influence_score`).
- [x] tRPC input boundary rejects inferred alias fields (`getCreationSuggestions` / creation inputs).
- [x] tRPC write-boundary tests assert persisted plan structure excludes deprecated and inferred alias fields.
- [x] Mobile adapter tests assert serialized creation input excludes deprecated and inferred alias fields.
- [x] Cross-layer typecheck/test matrix green (core, trpc, mobile).

## Evidence

- Core strict schema checks in `packages/core/contracts/training-plan-creation/schemas.ts`.
- Core contract tests in `packages/core/plan/__tests__/training-plan-creation-contracts.test.ts`.
- tRPC router and use-case coverage in:
  - `packages/trpc/src/routers/__tests__/training-plans.test.ts`
  - `packages/trpc/src/application/training-plan/__tests__/createFromCreationConfigUseCase.test.ts`
- Mobile adapter contract coverage in `apps/mobile/lib/training-plan-form/adapters/adapters.test.ts`.
