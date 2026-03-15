# Implementation Plan: Training Plan Architecture Separation

## Phase 1: Database Migration

1. Create a new migration file to:
   - Create the `user_training_plans` table.
   - Add `user_training_plan_id` to the `events` table.
   - Migrate existing active training plans to `user_training_plans`.
   - Update `events` to link to the new `user_training_plans` records.
   - Drop `is_active` from `training_plans`.
2. Update database types in `@repo/database`.

## Phase 2: Backend API Updates

1. Update `trainingPlans` tRPC router:
   - Update `applyTemplate` mutation to:
     - Check for an existing `active` plan for the user.
     - If one exists, throw an error or handle the transition (pause/abandon old plan).
     - Create a `user_training_plans` record (copying the template's structure to `snapshot_structure`).
     - Calculate absolute dates based on the user's provided `start_date` or `target_date`.
     - Link generated events to the new `user_training_plans` record.
   - Create new procedures for fetching and managing `user_training_plans` (e.g., `getActivePlan`, `updateActivePlanStatus`, `updatePlanSnapshot`).
   - Update `getTemplate` and other template-related procedures to remove `is_active` logic.
2. Update `events` router to handle `user_training_plan_id`.

## Phase 3: Frontend UI Split

1. **Template View (`training-plan-detail.tsx`)**:
   - Refactor `apps/mobile/app/(internal)/(standard)/training-plan.tsx` to remove all user-specific execution data (charts, insights, upcoming activities).
   - Ensure it only displays template structure, description, and actions (Save, Apply).
   - Enhance the "Apply to Calendar" action to open a configuration modal (prompting for start/target date).
   - Add a concurrency check: if the user already has an active plan, show a warning modal requiring them to pause/end it first.
2. **Execution View (`active-plan-dashboard.tsx`)**:
   - Create a new screen `apps/mobile/app/(internal)/(standard)/active-plan.tsx` for the active plan dashboard.
   - Move the execution components (`PlanVsActualChart`, `WeeklyProgressCard`, insights) to this screen.
   - Fetch data based on the `user_training_plans` record.
   - Add actions to modify the execution (e.g., "Pause Plan", "End Plan").
3. **List Items & Shared Components**:
   - Update `apps/mobile/components/training-plan/TrainingPlanListItem.tsx` to remove the `is_active` badge logic, as templates are no longer active/inactive.
4. **Navigation & Routing**:
   - Update `apps/mobile/app/(internal)/(tabs)/plan.tsx` (Plan Tab): The top summary card must fetch the active `user_training_plans` record and route to `/active-plan` instead of `/training-plan`.
   - Update routing constants (`ROUTES`) and links across the app to point to the correct screens.

## Phase 4: Testing & Cleanup

1. Test applying a template, including the start/target date configuration.
2. Test the concurrency limit (attempting to apply a plan while another is active).
3. Test modifying an active plan's schedule (ensuring it updates the snapshot, not the template).
4. Test viewing a template as a non-owner.
5. Test the active plan dashboard with real data.
6. Clean up any unused code or types.
