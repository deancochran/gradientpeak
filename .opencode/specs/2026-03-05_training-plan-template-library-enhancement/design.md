# Design: Profile Goals + Training Plans Minimal Model (MVP)

## 1. Architectural Vision

The goal of this refactor is to dramatically simplify the planning domain model while retaining full functionality for users. We are moving from a complex architecture where goals are deeply embedded within training plan JSON structures, to a highly localized, minimal model based on three core pillars:

1. **`profile_goals`**: The single source of truth for user outcomes, milestones, and targets. Extracted from the `training_plans` structure into its own relational table.
2. **`training_plans`**: A unified table for both system-wide templates and user-applied plans.
3. **`events`**: The singular, immutable source of truth for scheduling.

By strictly defining these boundaries, we decouple goals from rigid plan structures, allowing users to have goals without an active plan, and simplifying the schema. This change spans the database schema, `@repo/core` schemas, `@repo/trpc` routers, and the React Native mobile app.

## 2. Affected Screens and Components

Based on codebase analysis, the following areas of the system will be directly affected by this refactor:

### `@repo/core`

- **Schemas**:
  - `packages/core/schemas/training-plan-structure/*`: Currently houses `goalV2Schema` and `goalTargetV2Schema` embedded within the plan structure. These need to be extracted.
  - `packages/core/schemas/form-schemas.ts`: Contains `trainingPlanMinimalGoalFormSchema` and `trainingPlanAdvancedGoalFormSchema` which will need updating.
- **Calculations**:
  - Functions in `packages/core/schemas/training-plan-structure/*` (e.g., `expandMinimalGoalToPlan`) that calculate training blocks based on target goal dates will need to be adapted to work with the new relational `profile_goals` model.

### `@repo/trpc`

- **Routers**:
  - `packages/trpc/src/routers/training_plans.ts` (and its modular files: `crud`, `base`, `creation`, `analytics`): Currently handles complex logic for assessing goal feasibility and resolving scheduling conflicts based on embedded goals. This logic must be updated to query the new `profile_goals` table.
  - `packages/trpc/src/routers/events.ts`: Will remain the primary interface for the calendar, but the way events are generated from a training plan will change.
  - **New Router Needed**: `packages/trpc/src/routers/goals.ts` for CRUD operations on the new `profile_goals` table.

### `apps/mobile` (React Native App)

- **Screens**:
  - `app/(internal)/(tabs)/plan.tsx`: The primary calendar timeline. Will continue to fetch from `events`, but event generation logic changes.
  - `app/(internal)/(tabs)/library.tsx` & `app/(internal)/(tabs)/plan-library.tsx`: Template browsing.
  - `app/(internal)/(standard)/active-plan.tsx`: Dashboard for the active plan. Needs to query the new `goals` router for goal metrics instead of extracting them from the plan structure.
  - `app/(internal)/(standard)/training-plan-detail.tsx` & `training-plan-edit.tsx`: Interfaces for viewing/modifying plans and their associated goals.
  - `app/(internal)/(standard)/training-plan-create.tsx`: Entry point for building a new plan.
- **Components**:
  - `components/training-plan/create/TrainingPlanComposerScreen.tsx`: Complex multi-step UI form. Needs significant refactoring to handle goals as separate entities from the plan structure.
- **State & Hooks**:
  - `lib/hooks/useHomeData.ts` & `useTrainingPlanSnapshot.ts`: Need to fetch goals independently.
  - `lib/training-plan-form/validation.ts` & `localPreview.ts`: Local business logic for goal gaps and previews needs updating.

### `apps/web` (Next.js App)

- **Impact**: Minimal to none. The web application currently does not have dashboards or screens for viewing training plans, goals, or the event calendar. No web UI changes are required for this MVP.

## 3. Database Schema (Supabase / PostgreSQL)

### A. `profile_goals` (New Table)

Extracts goals from the `training_plans` JSON structure into a discrete, relational table.

- **`id`**: UUID, Primary Key.
- **`profile_id`**: UUID, Foreign Key to `profiles`. (Goals NEVER cross profiles).
- **`training_plan_id`**: UUID, Foreign Key to `training_plans` (Nullable - goals can exist without a plan).
- **`milestone_event_id`**: UUID, Foreign Key to `events` (Nullable - anchors the goal to a schedule, but `events` remains the schedule source of truth).
- **`target_date`**: Date.
- **`title`**: Text.
- **`goal_type`**: Text.
- **`target_metric`**: Text (Nullable).
- **`target_value`**: Numeric (Nullable).
- **`importance`**: Integer (0-10).

### B. `training_plans` (Updated)

Consolidates system templates and user plans into one table.

- **`id`**: UUID, Primary Key.
- **`profile_id`**: UUID, Foreign Key to `profiles`. **CRITICAL:** If `NULL`, this record is a System Template. If populated, it is a User-Applied Plan.
- **`primary_goal_id`**: UUID, Foreign Key to `profile_goals` (Nullable).
- **`sessions_per_week_target`**: Integer (Nullable).
- **`duration_hours`**: Numeric (Nullable).
- **`status`**: Text (`draft`, `active`, `paused`, `completed`, `abandoned`).
- **`structure`**: JSONB (Contains plan metadata, blocks, and session intents with `day_offset`, `session_type`, and `activity_plan_id`). **Embedded goals are removed.**

### C. `events` (No Structural Changes)

Remains the operational truth for user scheduling.

- **Behavioral Change**: When a user applies a `training_plan`, the system reads the `structure` JSONB, calculates exact dates using the plan's start date and the session's `day_offset`, and materializes `events` rows. Rest days are inferred dynamically from days without planned activity events.

## 4. Integration Strategy

### `@repo/core` Integration

- Extract `goalV2Schema` from `training-plan-structure` and create a new `profileGoalsSchema`.
- Update `periodizedPlanBaseShape` to remove the embedded `goals` array.
- Introduce a pure function `materializePlanToEvents(planStructure, startDate)` to handle the generation of event records from a plan structure without database side-effects.

### `@repo/trpc` Integration

- Create a new `goals.ts` router for managing `profile_goals`.
- Refactor `training_plans.ts` procedures (especially `applyPlan` or equivalent creation logic) to:
  1. Create the `training_plans` record.
  2. Create associated `profile_goals` records.
  3. Call `materializePlanToEvents` and batch insert into `events`.
- Update analytics and projection procedures to query `events` and `profile_goals` relationally rather than parsing plan JSON.

### `apps/mobile` Integration

- **State**: Introduce a new Zustand store or React Query hooks specifically for fetching and caching `profile_goals`.
- **UI**: Refactor `TrainingPlanComposerScreen.tsx` to separate the goal definition step from the plan structure definition. Goals should be created via the new `goals` router, and then optionally linked to a new training plan.
- **Calendar**: The `plan.tsx` calendar screen remains largely unchanged as it already reads from `events`, but the source of those events will now be the new materialization logic.
