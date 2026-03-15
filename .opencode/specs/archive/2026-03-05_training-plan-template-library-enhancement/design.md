# Design: Profile Goals + Training Plans Minimal Model (MVP)

## 1. Architectural Vision

The goal of this refactor is to dramatically simplify the planning domain model while retaining full functionality for users. We are moving from a complex architecture where goals are deeply embedded within training plan JSON structures, to a highly localized, minimal model based on three core pillars:

1. **`profile_goals`**: The single source of truth for user outcomes, milestones, and targets. Extracted from the `training_plans` structure into its own relational table.
2. **`profile_training_settings`**: The global athlete operating parameters (availability, aggressiveness, recovery needs). Repurposed from the old plan creation config to live at the profile level.
3. **`training_plans`**: A unified table for both system-wide templates and user-applied plans.
4. **`events`**: The singular, immutable source of truth for scheduling.

By strictly defining these boundaries, we decouple goals from rigid plan structures, allowing users to have goals without an active plan, and simplifying the schema. This change spans the database schema, `@repo/core` schemas, `@repo/trpc` routers, and the React Native mobile app.

## 2. Affected Screens and Components

Based on codebase analysis, the following areas of the system will be directly affected by this refactor:

### `@repo/core`

- **Schemas**:
  - `packages/core/schemas/training-plan-structure/*`: Currently houses `goalV2Schema` and `goalTargetV2Schema` embedded within the plan structure. These need to be extracted. _(Note: Removing these will break exports in `packages/core/schemas/index.ts` and `packages/core/schemas/form-schemas.ts`)_.
  - `packages/core/schemas/training-plan-structure/creation-config-schemas.ts`: Contains `TrainingPlanCreationConfig` which will be repurposed into a global `AthleteTrainingSettingsSchema` under a new profile domain. _(Note: This will break multiple use cases in `packages/trpc/src/application/training-plan/` and core utilities like `normalizeCreationConfig.ts`, `classifyCreationFeasibility.ts`, and `buildProjectionEngineInput.ts`)_.
  - `packages/core/schemas/form-schemas.ts`: Contains `trainingPlanMinimalGoalFormSchema` and `trainingPlanAdvancedGoalFormSchema` which will need updating.
- **Calculations**:
  - Functions in `packages/core/schemas/training-plan-structure/*` (e.g., `expandMinimalGoalToPlan`) that calculate training blocks based on target goal dates will need to be adapted to work with the new relational `profile_goals` model. _(Note: Removing/changing `expandMinimalGoalToPlan` will break `packages/trpc/src/routers/training-plans.base.ts` and `apps/mobile/lib/training-plan-form/localPreview.ts`)_.

### `@repo/trpc`

- **Routers**:
  - `packages/trpc/src/routers/training_plans.ts` (and its modular files: `crud`, `base`, `creation`, `analytics`): Currently handles complex logic for assessing goal feasibility and resolving scheduling conflicts based on embedded goals. This logic must be updated to query the new `profile_goals` table.
  - `packages/trpc/src/routers/events.ts`: Will remain the primary interface for the calendar, but the way events are generated from a training plan will change.
  - **New Router Needed**: `packages/trpc/src/routers/goals.ts` for CRUD operations on the new `profile_goals` table.
  - **New Router Needed**: `packages/trpc/src/routers/profile_training_settings.ts` for managing the user's global training parameters.

### `apps/mobile` (React Native App)

- **Screens**:
  - `app/(internal)/(tabs)/calendar.tsx` (New): Replaces the old Library tab. A dedicated calendar timeline view fetching from `events`.
    - **UI/UX Vision**: Inspired by Google Calendar, featuring a dual-view system:
      - **Month View**: A vertically infinite scrolling list of months (using `react-native-calendars`). Tapping a month navigates to the Schedule View for that month.
      - **Schedule View**: A vertically infinite scrolling list of days containing events (using `@shopify/flash-list` for performance).
    - **Interactions**:
      - Tapping an event opens its details/edit screen.
      - **Drag-and-Drop**: Users can long-press (with haptic feedback) to drag and reorder events across days. This requires a custom UI-thread implementation using `react-native-gesture-handler` and `react-native-reanimated` to work smoothly over an infinite list.
    - **Permissions & Visual Indicators**: Users can only drag events they own.
      - _Draggable Events_: Solid background colors.
      - _Read-Only Events_ (e.g., group run club events): Striped/hatched background or muted colors, with a "lock" or contextual icon. Long-pressing these triggers a subtle shake animation and a toast notification ("You can only edit events you own") instead of initiating a drag.
  - `app/(internal)/(tabs)/plan.tsx`: Completely refactored. No longer the calendar view. It is now the central hub for configuring goals, training strategy, and managing the active training plan in one united view.
    - **UI/UX Vision**: A comprehensive dashboard that unifies the user's training trajectory.
      - **Forecasted Projection**: A visual chart displaying the user's planned training load (TSS or duration) over time versus their desired/target load. This helps users visualize if their current plan aligns with their goals.
      - **Goal Management**: A dedicated section to view active `profile_goals`, track progress, and add/edit goals.
      - **Training Plan Management**: A section displaying the currently active training plan (derived from future `events`), its overall progress, and quick actions to modify or abandon the plan.
      - **Training Preferences**: A section to configure global athlete operating parameters (availability, aggressiveness, recovery needs, etc.) that dictate how training is structured.
  - `app/(internal)/(tabs)/library.tsx` & `app/(internal)/(tabs)/plan-library.tsx`: Removed entirely as top-level tabs.
  - `app/(internal)/(standard)/profile.tsx` (or equivalent User Profile screen): Updated to include individual navigational buttons linking to unique, private screens for viewing user-owned database records (past activities, authored training plans, activity plans, and routes). These screens are accessible only to the profile owner and are distinct from any public/shared library screens.
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

### 2.1 Cross-Reference Dependency Map (Must Update Together)

These are the known reference breakpoints where changing one source-of-truth object will require synchronized updates in downstream consumers.

- **Goal schema extraction (`goalV2Schema` removal)**:
  - Source being replaced: `packages/core/schemas/training-plan-structure/domain-schemas.ts`
  - Required downstream updates: `packages/core/schemas/index.ts`, `packages/core/schemas/form-schemas.ts`, and any `trainingPlanGoalInputSchema` consumers.
- **Creation config extraction (`TrainingPlanCreationConfig` -> profile settings)**:
  - Source being replaced: `packages/core/schemas/training-plan-structure/creation-config-schemas.ts`
  - Required downstream updates: `packages/core/plan/normalizeCreationConfig.ts`, `packages/core/plan/classifyCreationFeasibility.ts`, `packages/core/plan/buildProjectionEngineInput.ts`, `packages/trpc/src/application/training-plan/createFromCreationConfigUseCase.ts`, `packages/trpc/src/application/training-plan/previewCreationConfigUseCase.ts`, `packages/trpc/src/application/training-plan/updateFromCreationConfigUseCase.ts`, and `packages/trpc/src/routers/training-plans.base.ts`.
- **Plan expansion replacement (`expandMinimalGoalToPlan` -> `materializePlanToEvents`)**:
  - Source being replaced: `packages/core/plan/expandMinimalGoalToPlan.ts`
  - Required downstream updates: `packages/core/plan/index.ts`, `packages/core/plan/__tests__/expandMinimalGoalToPlan.test.ts`, `packages/core/plan/__tests__/build-projection-engine-input.test.ts`, `packages/trpc/src/routers/training-plans.base.ts`, `apps/mobile/lib/training-plan-form/localPreview.ts`, and `apps/mobile/lib/training-plan-form/localPreview.test.ts`.
- **Training plan persistence shape changes (`is_active`, `status`, `primary_goal_id` removal)**:
  - Source being replaced: `training_plans` DB schema and related core shape declarations.
  - Required downstream updates: `packages/core/schemas/training-plan-structure/domain-schemas.ts`, `packages/core/schemas/index.ts`, `packages/trpc/src/application/training-plan/*`, `packages/trpc/src/infrastructure/repositories/supabase-training-plan-repository.ts`, `packages/trpc/src/routers/training-plans.base.ts`, `apps/mobile/components/training-plan/create/TrainingPlanComposerScreen.tsx`, `apps/mobile/app/(internal)/(tabs)/library.tsx` (tab removed), and related tests/seeds/migrations.
- **Plan structure shape changes (`structure` now template-only with session intents/activity plan references)**:
  - Source being replaced: `packages/core/schemas/training-plan-structure/*`.
  - Required downstream updates: all structure readers/writers in `packages/trpc/src/routers/training-plans.*`, core helper utilities in `packages/core/schemas/training-plan-structure/helpers.ts`, and any mobile form preview/validation logic that assumes embedded goals.

Use `pnpm check-types` as the enforcement step after each major removal so unresolved references become a deterministic migration checklist.

## 3. Database Schema (Supabase / PostgreSQL)

### A. `profile_goals` (New Table)

Extracts goals from the `training_plans` JSON structure into a discrete, relational table.

- **`id`**: UUID, Primary Key.
- **`profile_id`**: UUID, Foreign Key to `profiles`. (Goals NEVER cross profiles).
- **`training_plan_id`**: UUID, Foreign Key to `training_plans` (Nullable - goals can exist without a plan).
- **`milestone_event_id`**: UUID, Foreign Key to `events` (Nullable - anchors the goal to a specific date/event in the schedule. The goal's target date is derived entirely from this event's date to prevent synchronization edge cases).
- **`title`**: Text.
- **`goal_type`**: Text.
- **`target_metric`**: Text (Nullable).
- **`target_value`**: Numeric (Nullable).
- **`importance`**: Integer (0-10).

### B. `profile_training_settings` (New Table)

Stores the user's global training strategy configurations, decoupled from any specific plan. **Crucially, authorization must be handled at the tRPC layer to allow both the profile owner AND their authorized coaches to read and update these settings (consistent with the app's service-role architecture).**

- **`profile_id`**: UUID, Primary Key, Foreign Key to `profiles`.
- **`settings`**: JSONB (Contains availability, behavior controls, constraints, and calibration settings repurposed from `TrainingPlanCreationConfig`).
- **`updated_at`**: TIMESTAMPTZ.

### C. `training_plans` (Updated)

Acts strictly as a library of templates (content). There are no "user-applied plan" records.

- **`id`**: UUID, Primary Key.
- **`profile_id`**: UUID, Foreign Key to `profiles`. (The author of the template. If `NULL`, it is a system template).
- **`sessions_per_week_target`**: Integer (Nullable).
- **`duration_hours`**: Numeric (Nullable).
- **`is_public`**: Boolean (Default false. Whether the user has shared this template to the community library).
- **`structure`**: JSONB (Contains plan metadata, blocks, and session intents with `day_offset`, `session_type`, and `activity_plan_id`). **Embedded goals are removed.**

_(Note: `status` and `primary_goal_id` are removed because templates do not have an execution lifecycle or specific user goals)._

### D. `events` (No Structural Changes)

Remains the operational truth for user scheduling and acts as the only record of a user's "active plan".

- **Behavioral Change**: When a user applies a `training_plan`, the system reads the `structure` JSONB, calculates exact dates using the plan's start date and the session's `day_offset`, and materializes `events` rows. Rest days are inferred dynamically from days without planned activity events.
- **Active Plan Tracking**: A user's "active plan" is simply determined by querying if they have future `events` with a `training_plan_id`.
- **Abandoning a Plan**: To cancel a plan, the system simply deletes all future `events` linked to that `training_plan_id`.

## 4. Integration Strategy

### `@repo/core` Integration

- Extract `goalV2Schema` from `training-plan-structure` and create a new `profileGoalsSchema`.
- Update `periodizedPlanBaseShape` to remove the embedded `goals` array.
- Introduce a pure function `materializePlanToEvents(planStructure, startDate)` to handle the generation of event records from a plan structure without database side-effects.

### `@repo/trpc` Integration

- Create a new `goals.ts` router for managing `profile_goals`.
- Refactor `training_plans.ts` procedures (especially `applyPlan` or equivalent creation logic) to:
  1. Fetch the `training_plans` template.
  2. Create associated `profile_goals` records (if any).
  3. Call `materializePlanToEvents` and batch insert into `events`.
- Update analytics and projection procedures to query `events` and `profile_goals` relationally rather than parsing plan JSON.

### `apps/mobile` Integration

- **State**: Introduce a new Zustand store or React Query hooks specifically for fetching and caching `profile_goals`.
- **Navigation Refactor**:
  - Remove the `Library` tab.
  - Create a new `Calendar` tab dedicated to the schedule view (moving the calendar logic previously in the Plan tab here).
  - Refactor the `Plan` tab to act as the command center for goals, training strategy, and active plan management.
  - Update the User Profile screen to serve as the hub for user-owned content (activities, routes, plans).
- **UI**: Refactor `TrainingPlanComposerScreen.tsx` to separate the goal definition step from the plan structure definition. Goals should be created via the new `goals` router, and then optionally linked to a new training plan.
- **Calendar**: The new `calendar.tsx` screen will take over the timeline rendering. It remains largely unchanged in its data fetching (it already reads from `events`), but the source of those events will now be the new materialization logic.

## 5. Non-Requirements

For this MVP, the following features are explicitly out of scope:

- **Automated Recommendations**: The system will not provide automated recommendations to users based on their forecasted vs. desired load.
- **Dynamic Adjustments**: There will be no automated processes or algorithms to adjust schedules, training strategies, or active plans dynamically. The user is solely responsible for manually adjusting their plan or schedule based on the provided visualizations.
