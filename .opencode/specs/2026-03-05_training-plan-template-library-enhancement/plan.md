# Implementation Plan: Profile Goals + Training Plans Minimal Model

## Phase 1: Database & Core Package Refactor

**Objective**: Update the foundational schema and `@repo/core` typings to extract goals from the plan structure into a relational table.

1. **Supabase Migrations**:
   - Create migration script `create_profile_goals_table.sql` with columns: `id`, `profile_id`, `training_plan_id`, `milestone_event_id`, `title`, `goal_type`, `target_metric`, `target_value`, `importance`.
   - Create migration script `update_training_plans_table.sql`:
     - Add `sessions_per_week_target`, `duration_hours`, `is_public`.
     - Remove `status` and `primary_goal_id` columns if they exist.
     - Ensure `profile_id` represents the author of the template (if `NULL`, it is a system template).
   - Run local migrations and generate updated Supabase types.
2. **`@repo/core` Schemas**:
   - Create `packages/core/schemas/profile_goals.ts` defining the Zod schema for the new table.
   - Refactor `packages/core/schemas/training-plan-structure/*` to remove the embedded `goals` array (e.g., `goalV2Schema`) from the core plan schema (`periodizedPlanBaseShape`).
   - Update `packages/core/schemas/form-schemas.ts` to reflect the separation of goals and plans.
3. **`@repo/core` Utilities**:
   - Build pure function `materializePlanToEvents(planStructure: any, startDate: string): ScheduledEvent[]` to generate schedule records based on `day_offset`.
   - Update any core calculation functions (e.g., `expandMinimalGoalToPlan`) that previously relied on embedded goals to accept goals as separate arguments.
4. **Validation**: Run `pnpm check-types` and `pnpm test` in `@repo/core`.

## Phase 2: tRPC API Layer Implementation

**Objective**: Connect the database changes to the frontend via type-safe tRPC procedures, introducing a new goals router and updating the training plans router.

1. **Goals Router (`packages/trpc/src/routers/goals.ts`)**:
   - Create a new router with procedures: `create`, `getForProfile`, `update`, `delete`.
2. **Training Plans Router (`packages/trpc/src/routers/training_plans.ts` and modular files)**:
   - Update template fetching logic to query where `is_public = true` or `profile_id IS NULL`.
   - Update user plan fetching logic to query where `profile_id = input.profile_id` (their authored templates).
   - Refactor the plan application/creation flow (`applyPlan` or equivalent):
     - Validate active plan constraints (query future `events` to ensure no other active plan).
     - Create associated `profile_goals` records if provided in the request.
     - Call `materializePlanToEvents` from core using the template's structure.
     - Execute a batch insert into the `events` table (linking them to the template's `training_plan_id`).
   - Implement `cancelPlan` / `abandonPlan`:
     - Delete all future `events` linked to this plan (`training_plan_id = input.id` AND `date >= TODAY`). Do NOT delete historical events.
3. **Validation**: Run `pnpm test` in `@repo/trpc`. Ensure tests cover the new `goals` router and the updated `applyPlan` flow.

## Phase 3: Mobile App (React Native) Refactor

**Objective**: Update the mobile app to consume the new tRPC endpoints, separating goal management from plan management in the UI and state, and completely refactoring the tab navigation structure.

1. **Hooks & State (`apps/mobile/lib`)**:
   - Create hooks (e.g., `useGoals.ts`) to fetch and manage `profile_goals` via `trpc.goals.getForProfile`.
   - Update `useTrainingPlanSnapshot.ts` and `useHomeData.ts` to fetch goals independently from the active plan structure.
   - Refactor `training-plan-form/validation.ts` and `localPreview.ts` to handle goals as separate entities.
2. **Tab Navigation Refactor (`apps/mobile/app/(internal)/(tabs)`)**:
   - **Remove Library Tab**: Delete `library.tsx` and `plan-library.tsx` from the main tabs.
   - **Create Calendar Tab**: Create a new `calendar.tsx` tab dedicated to the schedule view (moving the calendar timeline logic previously in `plan.tsx` here).
   - **Refactor Plan Tab**: Overhaul `plan.tsx` to serve as the command center for goals, training strategy, and active plan management.
3. **Goal & Plan UI Refactor (`apps/mobile/components` & `apps/mobile/app`)**:
   - Refactor `TrainingPlanComposerScreen.tsx`: Separate the goal creation step. Goals should be created/selected first, then linked to the plan being composed.
   - Update `active-plan.tsx`: Fetch and display goal metrics using the new goals hooks rather than extracting them from the plan JSON.
   - Update `training-plan-detail.tsx` and `training-plan-edit.tsx` to reflect the decoupled data model.
4. **User Profile & Content Discovery UI**:
   - Update the User Profile detail screen to include navigational links to user-owned database records (completed activities, uploaded routes, activity plans, and authored training plans).
   - Update the "Apply Plan" flow to use the refactored tRPC mutation, passing selected goals and start date (accessible when viewing a specific template).
5. **Validation**: Run `pnpm check-types` in `apps/mobile`. Verify the plan creation, goal creation, and template application flows manually in the Expo simulator.

## Phase 4: Web App Verification

**Objective**: Ensure the web app remains unaffected, as it currently does not implement these features.

1. **Verification**:
   - Run `pnpm check-types` and `pnpm build` in `apps/web` to ensure no shared type changes from `@repo/core` or `@repo/trpc` broke the web build.
   - No UI changes are required for `apps/web` in this phase.
