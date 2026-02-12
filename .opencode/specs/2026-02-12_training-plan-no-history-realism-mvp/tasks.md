# Tasks - Training Plan Creation Realism MVP

## Phase 1: Core Logic (Foundation)

- [ ] Add `resolveNoHistoryAnchor(context)` orchestration in `packages/core/plan/projectionCalculations.ts`.
- [ ] Add/compose helper functions in `packages/core/plan/projectionCalculations.ts`:
  - [ ] `collectNoHistoryEvidence(context)`
  - [ ] `determineNoHistoryFitnessLevel(evidence)`
  - [ ] `deriveNoHistoryProjectionFloor(goalTier, fitnessLevel)`
  - [ ] `clampNoHistoryFloorByAvailability(floor, availabilityContext, intensityModel)`
  - [ ] `classifyBuildTimeFeasibility(goalTier, weeksToEvent)`
  - [ ] `mapFeasibilityToConfidence(feasibility)`
- [ ] Implement deterministic fallback ladder (weak default, missing availability handling, missing intensity model baseline).
- [ ] Apply explicit no-history prior initialization in shared projection path (`starting_ctl`, `starting_atl`, neutral `starting_tsb`).
- [ ] Ensure no-history logic activates only when `history_availability_state === "none"`.

## Phase 2: Contracts + Type Consolidation

- [ ] Add canonical projection contract types in `packages/core/plan/projectionTypes.ts`.
- [ ] Export new projection types from `packages/core/plan/index.ts` and `packages/core/index.ts` (via existing barrel).
- [ ] Replace mobile-local projection types in `apps/mobile/components/training-plan/create/projection-chart-types.ts` with `@repo/core` imports (or remove file if fully replaced).
- [ ] Replace router-local equivalent projection payload typing in `packages/trpc/src/routers/training_plans.ts` with `@repo/core` types where applicable.

## Phase 3: Preview/Create Parity (API)

- [ ] Verify `getCreationSuggestions` remains the pre-form evaluation source in `packages/trpc/src/routers/training_plans.ts`.
- [ ] Ensure `previewCreationConfig` and `createFromCreationConfig` both use the same core projection builder path.
- [ ] Thread minimal no-history metadata fields through preview/create response payloads.
- [ ] Ensure snapshot token logic includes no-history metadata only when present.

## Phase 4: Mobile Integration + UX Cues

- [ ] In `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`, enforce evaluated default seeding from suggestions before meaningful preview.
- [ ] Keep conservative local fallback defaults active when suggestions query is unavailable/fails.
- [ ] In `apps/mobile/components/training-plan/create/SinglePageForm.tsx`, add concise no-history fallback/clamp explanation message(s).
- [ ] In `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`, render non-blocking confidence/clamp cues from payload metadata.

## Phase 5: Utility Consolidation (Duplication Reduction)

- [ ] Add shared availability utility `packages/core/plan/availabilityUtils.ts`:
  - [ ] `countAvailableTrainingDays(...)`
- [ ] Replace duplicate availability-day counting logic in core/trpc/mobile where semantics match.
- [ ] Add shared date-only UTC helper module `packages/core/plan/dateOnlyUtc.ts`.
- [ ] Replace duplicate parse/format/add/diff date-only logic in core/trpc where semantics match.

## Phase 6: Tests and Verification

- [ ] Update/add tests in `packages/core/plan/__tests__/projection-calculations.test.ts`:
  - [ ] no-history gate behavior
  - [ ] CTL/TSS invariant (`weekly = round(7 * ctl)`)
  - [ ] availability clamp behavior + flag
  - [ ] fallback determinism and reason tokens
  - [ ] cap/recovery/taper non-regression
- [ ] Update/add tests in `packages/core/plan/__tests__/training-plan-preview.test.ts`:
  - [ ] preview/create parity on projection and metadata
  - [ ] explicit no-history prior initialization
- [ ] Add/update trpc tests (if present) for endpoint parity and metadata threading.
- [ ] Run verification commands:
  - [ ] `pnpm --filter @repo/core check-types`
  - [ ] `pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts`
  - [ ] `pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts`
  - [ ] `pnpm --filter mobile check-types`

## Phase 7: Final Cleanup + Acceptance

- [ ] Remove obsolete local interfaces/helpers after migration.
- [ ] Confirm no duplicate no-history decision math remains outside `@repo/core`.
- [ ] Confirm no duplicate projection payload contracts remain where core export exists.
- [ ] Validate acceptance criteria in `.opencode/specs/2026-02-12_training-plan-no-history-realism-mvp/design.md`.
- [ ] Update plan/spec docs if implementation details changed.
