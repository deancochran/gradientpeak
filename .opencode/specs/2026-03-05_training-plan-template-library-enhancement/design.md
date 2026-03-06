# Design: Profile Goals + Training Plans Minimal Model (MVP)

## 1. Architectural Vision

The goal of this refactor is to dramatically simplify the planning domain model while retaining full functionality for both users and administrators. We are moving from a complex, multi-layered architecture to a highly localized, minimal model based on three core pillars:

1. **`profile_goals`**: The single source of truth for user outcomes, milestones, and targets.
2. **`training_plans`**: A unified table for both system-wide templates and user-applied plans.
3. **`events`**: The singular, immutable source of truth for scheduling.

By strictly defining these boundaries, we eliminate redundant tables (e.g., `user_plans`, `plan_instances`), reduce schema synchronization issues, and decouple goals from rigid plan structures. This change spans the entire stack, from the database schema up to the React Native and Next.js user interfaces.

## 2. Database Schema (Supabase / PostgreSQL)

### A. `profile_goals` (New/Refactored)

Extracts goals from the `training_plans` JSON structure into a discrete, relational table.

- **`id`**: UUID, Primary Key.
- **`profile_id`**: UUID, Foreign Key to `profiles`. (Goals NEVER cross profiles).
- **`training_plan_id`**: UUID, Foreign Key to `training_plans` (Nullable - goals can exist without a plan).
- **`milestone_event_id`**: UUID, Foreign Key to `events` (Nullable - anchors the goal to a schedule, but `events` remains the schedule source of truth).
- **`target_date`**: Date.
- **`name`**: Text.
- **`targets`**: JSONB (Stores `GoalTargetV2` array: race performance, pace/power thresholds).
- **`priority`**: Integer (0-10).

### B. `training_plans` (Updated)

Consolidates system templates and user plans into one table.

- **`id`**: UUID, Primary Key.
- **`profile_id`**: UUID, Foreign Key to `profiles`. **CRITICAL:** If `NULL`, this record is a System Template. If populated, it is a User-Applied Plan.
- **`name`, `description`**: Text.
- **`plan_type`**: Text (`periodized`, `maintenance`).
- **`structure`**: JSONB (Contains plan metadata, blocks, and session intents with `day_offset`, `session_type`, and `activity_plan_id`).
- **`is_active`**: Boolean (For user plans, enforces the "one active plan per profile" rule. For templates, determines discoverability).
- **`start_date`, `end_date`**: Date (Null for templates, populated for user plans).

### C. `events` (No Structural Changes)

Remains the operational truth for user scheduling.

- **Behavioral Change**: When a user applies a `training_plan`, the system reads the `structure` JSONB, calculates exact dates using the plan's `start_date` and the session's `day_offset`, and materializes `events` rows. Rest days are inferred dynamically from days without planned activity events.

## 3. `@repo/core` Implications

### Zod Schemas

- **`schemas/profile_goals.ts`**: Extract `goalV2Schema` from `training-plan-structure`. Add `profile_id` and nullable `training_plan_id`.
- **`schemas/training_plan_structure.ts`**: Remove embedded `goals` array from `periodizedPlanBaseShape`. Update `is_template` helper logic to explicitly check for `profile_id === undefined | null`.

### Pure Functions

- **Calculations**: Update prediction and load functions to strictly pull from `events` rather than iterating through training plan JSON structures.
- **Plan Instantiation**: Add a pure function `materializePlanToEvents(planStructure, startDate) -> Event[]` to generate schedule records without DB side-effects.

## 4. `@repo/trpc` Implications

### Routers

- **`goals.ts`**: New router for CRUD operations on `profile_goals`.
- **`trainingPlans.ts`**:
  - `getTemplates`: Queries `training_plans` where `profile_id IS NULL`.
  - `getUserPlan`: Queries `training_plans` where `profile_id = input.profile_id`.
  - `applyPlan`: The most complex procedure.
    1. Fetches template.
    2. Validates user has no other active plan.
    3. Duplicates plan row, setting `profile_id` and `start_date`.
    4. Calls core pure function to generate `events` array.
    5. Performs a batch insert into `events`.
  - `abandonPlan`: Marks plan `is_active = false` and deletes future materialized `events` linked to this plan.

## 5. Frontend Implications

### `apps/mobile` (React Native / Zustand)

- **State Management**: Update Zustand stores to separate `useGoalsStore` and `usePlanStore`.
- **Plan Discovery**: UI updates to fetch from `trpc.trainingPlans.getTemplates`.
- **Plan Application UX**: The user flow for selecting a template now immediately asks for a `start_date`, calls the `applyPlan` mutation, and invalidates the `events` React Query cache to re-render the calendar.
- **Calendar**: Unchanged visually, but completely decoupled from the plan structure. It only reads from `events`.

### `apps/web` (Next.js Admin UI)

- **Template Builder**: Admins create `training_plans` with `profile_id = null`.
- **Goal Management**: Users' dashboards fetch `profile_goals` independently of their active plan status.
