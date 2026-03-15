# Implementation Plan: Profile Goals + Training Plans Minimal Model

This plan follows a **development hard cutover strategy**. Since the database will be reset, there is no need for data migration scripts or parallel implementations. We will directly replace the old architecture with the new one.

## Reference Integrity Requirement (Applies to All Phases)

Every structural change in this cutover has dependent references across core, tRPC, mobile, tests, and seed scripts. Do not defer these updates.

- If a schema/type/function is removed, update all imports/callers in the same phase.
- Use `pnpm check-types` after each removal to surface unresolved references immediately.
- Treat compiler failures as a migration checklist, not as post-phase cleanup.

## Phase 1: Database & Core Package Refactor

**Objective**: Establish the new database tables, update existing tables, and refactor core schemas in a single pass.

1. **Supabase Migrations**:
   - Create migration script `create_profile_goals_table.sql` with columns: `id`, `profile_id`, `training_plan_id`, `milestone_event_id`, `title`, `goal_type`, `target_metric`, `target_value`, `importance`.
   - Create migration script `create_profile_training_settings_table.sql` with columns: `profile_id` (PK), `settings` (JSONB), `updated_at`.
   - Create migration script `update_training_plans_table.sql` to drop `status`, `primary_goal_id`, and `is_active` from `training_plans`, and add `sessions_per_week_target`, `duration_hours`, `is_public`.
2. **`@repo/core` Schemas (New Domains & Cleanup)**:
   - Create `packages/core/schemas/goals/profile_goals.ts` by reusing logic from `goalV2Schema`.
   - Create `packages/core/schemas/settings/profile_settings.ts` by repurposing `TrainingPlanCreationConfig` into `AthleteTrainingSettingsSchema`.
   - Refactor `packages/core/schemas/training-plan-structure/*` to remove embedded goals from `periodizedPlanBaseShape`.
   - Delete legacy `goalV2Schema` and `goalTargetV2Schema`.
   - Update all core export surfaces and form schemas that currently reference legacy goal/config types (`packages/core/schemas/index.ts`, `packages/core/schemas/form-schemas.ts`).
3. **Core Utilities**:
   - Build pure function `materializePlanToEvents(planStructure: any, startDate: string): ScheduledEvent[]` to generate schedule records based on `day_offset` (repurposing logic from `expandMinimalGoalToPlan.ts`).
   - Remove outdated calculation functions that relied on embedded goals.
   - Replace all `expandMinimalGoalToPlan` call sites in tRPC and mobile local preview logic.

## Phase 2: tRPC API Layer

**Objective**: Build the new routers and update existing ones to match the new core schemas.

1. **New Routers**:
   - Create `packages/trpc/src/routers/goals.ts` with CRUD operations.
   - Create `packages/trpc/src/routers/profile_settings.ts` with `getForProfile` and `upsert` operations (ensure authorization logic allows both profile owner and authorized coaches).
2. **Training Plans Router**:
   - Refactor `packages/trpc/src/routers/training_plans.ts` to remove old procedures that relied on embedded goals.
   - Update the `applyPlan` procedure to utilize `materializePlanToEvents` and batch inserts to `events` without relying on embedded goals.
   - Remove/replace training plan lifecycle logic that depends on deprecated `training_plans` columns (`is_active`, `status`, `primary_goal_id`) across router, application, and repository layers.

## Phase 3: Mobile App Refactor

**Objective**: Overhaul the mobile app UI and state management to use the new decoupled architecture.

1. **State Management**:
   - Create hooks/stores for fetching `profile_goals` and `profile_settings` independently.
2. **Component Reorganization**:
   - Move `GoalSelectionStep.tsx` to `components/goals/` and repurpose as a standalone Add/Edit Goal modal.
   - Move timeline views to `components/calendar/`.
   - Move availability and training parameter forms to `components/settings/`.
3. **Navigation & Screens**:
   - Remove the `Library` tab (`library.tsx` and `plan-library.tsx`).
   - Implement the new `calendar.tsx` tab fetching purely from `events`.
   - Refactor the `Plan` tab (`plan.tsx`) into the unified dashboard with Forecasted Projection, Goal Management, Training Plan Management, and Training Preferences.
   - Update the User Profile screen to handle private routing for authored plans and historical activities.
   - Update mobile hooks/utilities that currently depend on embedded goals or legacy plan expansion (`useHomeData`, `useTrainingPlanSnapshot`, `training-plan-form/validation.ts`, `training-plan-form/localPreview.ts`).

## Phase 4: Web App Verification

**Objective**: Ensure the web app remains unaffected by the core package changes.

1. **Web App Verification**:
   - Ensure `apps/web` builds successfully with the new core types.
   - Run full monorepo CI checks.
