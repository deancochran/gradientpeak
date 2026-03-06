# Tasks: Profile Goals + Training Plans Minimal Model

## Pre-requisites

- [ ] Review `design.md` and `plan.md` to ensure full context understanding.
- [ ] Ensure local database is running (`pnpm supabase start`).

## Cross-Reference Safety Gate (Run During Every Phase)

- [ ] After removing/replacing any core schema export, run `pnpm check-types` and fix all downstream compiler errors before continuing.
- [ ] After DB column removals (`is_active`, `status`, `primary_goal_id`), update all repository/router/application usages in the same phase (no deferred references).
- [ ] After replacing `expandMinimalGoalToPlan`, update all imports/callers in core, tRPC, and mobile before proceeding.
- [ ] Update tests and seed/scripts that reference removed fields or legacy plan shape in the same commit as production code changes.

## Phase 1: Database & Core Package Refactor

- [ ] **DB**: Create migration for `profile_goals` table.
- [ ] **DB**: Create migration for `profile_training_settings` table (single JSONB column).
- [ ] **DB**: Create migration for `training_plans` (add `is_public`, remove `status`, `primary_goal_id`, `is_active`).
- [ ] **DB**: Generate updated Supabase types (`pnpm run generate-types`).
- [ ] **Core**: Create `packages/core/schemas/goals/profile_goals.ts` (reuse `goalV2Schema` logic).
- [ ] **Core**: Create `packages/core/schemas/settings/profile_settings.ts` (repurpose `TrainingPlanCreationConfig`).
- [ ] **Core**: Refactor `packages/core/schemas/training-plan-structure/*` to remove embedded goals from `periodizedPlanBaseShape`.
- [ ] **Core**: Delete legacy `goalV2Schema` and `goalTargetV2Schema`.
- [ ] **Core**: Implement `materializePlanToEvents(planStructure, startDate)` pure function.
- [ ] **Core**: Remove outdated calculation functions that relied on embedded goals.
- [ ] **Core/Refs**: Update `packages/core/schemas/index.ts` and `packages/core/schemas/form-schemas.ts` exports/usages after goal schema extraction.
- [ ] **Validation**: Run `pnpm check-types` and `pnpm test` in `@repo/core`.

## Phase 2: tRPC API Layer

- [ ] **tRPC**: Create `packages/trpc/src/routers/goals.ts` router with CRUD operations.
- [ ] **tRPC**: Create `packages/trpc/src/routers/profile_settings.ts` router with `getForProfile` and `upsert` operations (ensure coach authorization).
- [ ] **tRPC**: Refactor `training_plans.ts` to remove old procedures relying on embedded goals.
- [ ] **tRPC**: Update `applyPlan` procedure in `training_plans.ts` using `materializePlanToEvents`.
- [ ] **tRPC/Refs**: Update creation-config and feasibility call sites in `packages/trpc/src/application/training-plan/*` and `packages/trpc/src/routers/training-plans.base.ts`.
- [ ] **tRPC/Refs**: Remove active-lifecycle assumptions tied to removed `training_plans` columns.
- [ ] **Validation**: Run `pnpm check-types` and `pnpm test` in `@repo/trpc`.

## Phase 3: Mobile App Refactor

- [ ] **Mobile/State**: Create hooks/stores for fetching `profile_goals` and `profile_settings` independently.
- [ ] **Mobile/UI**: Reorganize components into `components/goals/`, `components/calendar/`, and `components/settings/`.
- [ ] **Mobile/Navigation**: Remove the Library tab (`library.tsx` and `plan-library.tsx`).
- [ ] **Mobile/Calendar**: Implement the new `calendar.tsx` tab (Month View and Schedule View with drag-and-drop).
- [ ] **Mobile/Plan**: Refactor `plan.tsx` into the unified dashboard with Forecasted Projection, Goal Management, Training Plan Management, and Training Preferences.
- [ ] **Mobile/Composer**: Repurpose `GoalSelectionStep.tsx` as a standalone Add/Edit Goal modal.
- [ ] **Mobile/Profile**: Update User Profile screen with individual buttons linking to unique, private screens for user-owned records.
- [ ] **Mobile/Refs**: Update `lib/training-plan-form/localPreview.ts`, `lib/training-plan-form/validation.ts`, `lib/hooks/useHomeData.ts`, and `lib/hooks/useTrainingPlanSnapshot.ts` to the new goal/settings sources.

## Phase 4: Web App Verification & Final Review

- [ ] **Web**: Run `pnpm --filter web check-types && pnpm --filter web build` to ensure no shared type changes broke the web app.
- [ ] **Final Review**: Run full monorepo CI checks: `pnpm check-types && pnpm lint && pnpm test`.
