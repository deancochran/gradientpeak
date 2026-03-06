# Tasks: Profile Goals + Training Plans Minimal Model

## Pre-requisites

- [ ] Review `design.md` and `plan.md` to ensure full context understanding.
- [ ] Ensure local database is running (`pnpm supabase start`).

## Phase 1: Database & Core Package

- [ ] **DB**: Create migration for `profile_goals` table.
- [ ] **DB**: Create migration for `training_plans` (add `profile_id`, modify existing rows).
- [ ] **DB**: Generate updated Supabase types (`pnpm run generate-types`).
- [ ] **Core**: Create `packages/core/schemas/profile_goals.ts`.
- [ ] **Core**: Refactor `training-plan-structure/domain-schemas.ts` (Remove embedded goals, update `is_template` logic).
- [ ] **Core**: Implement `materializePlanToEvents(plan, startDate)` pure function.
- [ ] **Core**: Update metric calculations to rely solely on `events`.
- [ ] **Testing**: Write unit tests for `materializePlanToEvents` (100% coverage required).
- [ ] **Validation**: Run `pnpm --filter @repo/core check-types && pnpm --filter @repo/core test`.

## Phase 2: tRPC API Layer

- [ ] **tRPC**: Create `goals.ts` router with full CRUD operations.
- [ ] **tRPC**: Update `trainingPlans.ts` -> `getTemplates` procedure.
- [ ] **tRPC**: Update `trainingPlans.ts` -> `getUserActivePlan` procedure.
- [ ] **tRPC**: Implement `trainingPlans.ts` -> `applyPlan` procedure (Batch insert events, enforce single-active-plan guard).
- [ ] **tRPC**: Implement `trainingPlans.ts` -> `cancelPlan` procedure (Soft delete future events only).
- [ ] **Testing**: Write integration tests for `applyPlan` and `cancelPlan` edge cases.
- [ ] **Validation**: Run `pnpm --filter @repo/trpc check-types && pnpm --filter @repo/trpc test`.

## Phase 3: Mobile App Refactor (React Native)

- [ ] **State**: Create `useGoalsStore.ts` and update `usePlanStore.ts`.
- [ ] **UI/Plan**: Update Template Library screens to consume `getTemplates`.
- [ ] **UI/Plan**: Implement new `applyPlan` mutation flow with start date selection.
- [ ] **UI/Goals**: Refactor goal creation UI to work independently of plans.
- [ ] **UI/Calendar**: Clean up Calendar rendering logic to ensure zero dependency on `training_plans.structure`.
- [ ] **Validation**: Run `pnpm --filter mobile check-types` and test application flows manually in simulator.

## Phase 4: Web Dashboard Refactor (Next.js)

- [ ] **Admin UI**: Remove Goal definition steps from the Template Builder.
- [ ] **Admin UI**: Ensure Template builder saves with `profile_id: null`.
- [ ] **User UI**: Update Web Dashboard "My Goals" widget.
- [ ] **User UI**: Update Web Dashboard "Active Plan" widget.
- [ ] **Validation**: Run `pnpm --filter web check-types && pnpm --filter web build`.

## Final Review

- [ ] Verify no regressions in Activity Recording (ensure `events` linkage holds).
- [ ] Run full monorepo CI checks: `pnpm check-types && pnpm lint && pnpm test`.
