# Tasks: Profile Goals + Training Plans Minimal Model

## Pre-requisites

- [ ] Review `design.md` and `plan.md` to ensure full context understanding.
- [ ] Ensure local database is running (`pnpm supabase start`).

## Phase 1: Database & Core Package

- [ ] **DB**: Create migration for `profile_goals` table.
- [ ] **DB**: Create migration for `training_plans` (add `is_public`, remove `status`, ensure `profile_id` is author).
- [ ] **DB**: Generate updated Supabase types (`pnpm run generate-types`).
- [ ] **Core**: Create `packages/core/schemas/profile_goals.ts`.
- [ ] **Core**: Refactor `packages/core/schemas/training-plan-structure/*` to remove embedded goals from `periodizedPlanBaseShape`.
- [ ] **Core**: Update `packages/core/schemas/form-schemas.ts` to reflect separated goals.
- [ ] **Core**: Implement `materializePlanToEvents(planStructure, startDate)` pure function.
- [ ] **Core**: Update calculation functions (e.g., `expandMinimalGoalToPlan`) to accept separated goals.
- [ ] **Testing**: Write unit tests for `materializePlanToEvents`.
- [ ] **Validation**: Run `pnpm --filter @repo/core check-types && pnpm --filter @repo/core test`.

## Phase 2: tRPC API Layer

- [ ] **tRPC**: Create `packages/trpc/src/routers/goals.ts` router with CRUD operations.
- [ ] **tRPC**: Update `training_plans.ts` (and modular files) to fetch templates (`is_public = true` or `profile_id IS NULL`) and authored plans.
- [ ] **tRPC**: Refactor plan application flow in `training_plans.ts` to create goals and batch insert `events` using `materializePlanToEvents` (without duplicating the template).
- [ ] **tRPC**: Implement `cancelPlan` / `abandonPlan` procedure in `training_plans.ts` to soft delete future events only.
- [ ] **Testing**: Write integration tests for the new `goals` router and the updated plan application flow.
- [ ] **Validation**: Run `pnpm --filter @repo/trpc check-types && pnpm --filter @repo/trpc test`.

## Phase 3: Mobile App Refactor (React Native)

- [ ] **State**: Create hooks/stores for fetching `profile_goals` independently (e.g., `useGoals.ts`).
- [ ] **State**: Update `useTrainingPlanSnapshot.ts` and `useHomeData.ts` to use independent goals.
- [ ] **State**: Refactor `training-plan-form/validation.ts` and `localPreview.ts`.
- [ ] **UI/Composer**: Refactor `TrainingPlanComposerScreen.tsx` to decouple goal creation from plan structure definition.
- [ ] **UI/Active Plan**: Update `active-plan.tsx` to display goals from the new hooks.
- [ ] **UI/Details**: Update `training-plan-detail.tsx` and `training-plan-edit.tsx`.
- [ ] **UI/Library**: Ensure `library.tsx` and `plan-library.tsx` fetch templates correctly and use the new apply mutation.
- [ ] **Validation**: Run `pnpm --filter mobile check-types` and test application flows manually in simulator.

## Phase 4: Web App Verification

- [ ] **Validation**: Run `pnpm --filter web check-types && pnpm --filter web build` to ensure no shared type changes broke the web app. (No UI changes required).

## Final Review

- [ ] Verify no regressions in Activity Recording (ensure `events` linkage holds).
- [ ] Run full monorepo CI checks: `pnpm check-types && pnpm lint && pnpm test`.
