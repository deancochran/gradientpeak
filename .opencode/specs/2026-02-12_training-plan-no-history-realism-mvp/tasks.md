# Tasks - Training Plan Creation Realism MVP

## Phase 1: Core Logic (Foundation)

- [x] Add `resolveNoHistoryAnchor(context)` orchestration in `packages/core/plan/projectionCalculations.ts`.
- [x] Add/compose helper functions in `packages/core/plan/projectionCalculations.ts`:
  - [x] `collectNoHistoryEvidence(context)`
  - [x] `determineNoHistoryFitnessLevel(evidence)`
  - [x] `deriveNoHistoryProjectionFloor(goalTier, fitnessLevel)`
  - [x] `clampNoHistoryFloorByAvailability(floor, availabilityContext, intensityModel)`
  - [x] `classifyBuildTimeFeasibility(goalTier, weeksToEvent)`
  - [x] `mapFeasibilityToConfidence(feasibility)`
- [x] Implement deterministic fallback ladder (weak default, missing availability handling, missing intensity model baseline).
- [x] Apply explicit no-history prior initialization in shared projection path (`starting_ctl`, `starting_atl`, neutral `starting_tsb`).
- [x] Ensure no-history logic activates only when `history_availability_state === "none"`.

## Phase 2: Contracts + Type Consolidation

- [x] Add canonical projection contract types in `packages/core/plan/projectionTypes.ts`.
- [x] Export new projection types from `packages/core/plan/index.ts` and `packages/core/index.ts` (via existing barrel).
- [x] Replace mobile-local projection types in `apps/mobile/components/training-plan/create/projection-chart-types.ts` with `@repo/core` imports (or remove file if fully replaced).
- [x] Replace router-local equivalent projection payload typing in `packages/trpc/src/routers/training_plans.ts` with `@repo/core` types where applicable.

## Phase 3: Preview/Create Parity (API)

- [x] Verify `getCreationSuggestions` remains the pre-form evaluation source in `packages/trpc/src/routers/training_plans.ts`.
- [x] Ensure `previewCreationConfig` and `createFromCreationConfig` both use the same core projection builder path.
- [x] Thread minimal no-history metadata fields through preview/create response payloads.
- [x] Ensure snapshot token logic includes no-history metadata only when present.

## Phase 4: Mobile Integration + UX Cues

- [x] In `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`, enforce evaluated default seeding from suggestions before meaningful preview.
- [x] Keep conservative local fallback defaults active when suggestions query is unavailable/fails.
- [x] In `apps/mobile/components/training-plan/create/SinglePageForm.tsx`, add concise no-history fallback/clamp explanation message(s).
- [x] In `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`, render non-blocking confidence/clamp cues from payload metadata.

## Phase 5: Utility Consolidation (Duplication Reduction)

- [x] Add shared availability utility `packages/core/plan/availabilityUtils.ts`:
  - [x] `countAvailableTrainingDays(...)`
- [x] Replace duplicate availability-day counting logic in core/trpc/mobile where semantics match.
- [x] Add shared date-only UTC helper module `packages/core/plan/dateOnlyUtc.ts`.
- [x] Replace duplicate parse/format/add/diff date-only logic in core/trpc where semantics match.

## Phase 6: Tests and Verification

- [x] Update/add tests in `packages/core/plan/__tests__/projection-calculations.test.ts`:
  - [x] no-history gate behavior
  - [x] CTL/TSS invariant (`weekly = round(7 * ctl)`)
  - [x] availability clamp behavior + flag
  - [x] fallback determinism and reason tokens
  - [x] cap/recovery/taper non-regression
- [x] Update/add tests in `packages/core/plan/__tests__/training-plan-preview.test.ts`:
  - [x] preview/create parity on projection and metadata
  - [x] explicit no-history prior initialization
- [x] Add/update trpc tests (if present) for endpoint parity and metadata threading.
- [x] Run verification commands:
  - [x] `pnpm --filter @repo/core check-types`
  - [x] `pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts`
  - [x] `pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts`
  - [x] `pnpm --filter mobile check-types`

## Phase 7: Final Cleanup + Acceptance

- [x] Remove obsolete local interfaces/helpers after migration.
- [x] Confirm no duplicate no-history decision math remains outside `@repo/core`.
- [x] Confirm no duplicate projection payload contracts remain where core export exists.
- [x] Validate acceptance criteria in `.opencode/specs/2026-02-12_training-plan-no-history-realism-mvp/design.md`.
- [x] Update plan/spec docs if implementation details changed.
