# Execution Plan: Profile Goals + Training Plans (MVP)

## Phase 1: Schema Refactor & Migration

### Task 1.1: Create `profile_goals` table and extend `training_plans`

- **Description:** Create the new `profile_goals` table with all required columns, constraints (importance 0-10), and indexes. Add new columns (`primary_goal_id`, `sessions_per_week_target`, `duration_hours`, `status`) to `training_plans` with appropriate constraints and indexes (including the partial unique constraint for active/paused plans).
- **Files to Edit:** `supabase/migrations/[timestamp]_profile_goals_and_training_plans.sql` (Create new migration file)
- **Verification:** Run `supabase db reset` or apply migration locally and verify schema using `psql` or Supabase Studio.

### Task 1.2: Backfill Data

- **Description:** Backfill existing template rows in `training_plans` to ensure `profile_id` is null and `status='draft'` where null.
- **Files to Edit:** `supabase/migrations/[timestamp]_backfill_training_plans.sql` (Create new migration file)
- **Verification:** Run `supabase db reset` and query `training_plans` to ensure no null statuses and templates have null `profile_id`.

## Phase 2: Core Package Updates

### Task 2.1: Update Zod Schemas

- **Description:** Update `@repo/core` schemas to reflect the new database schema. Add `profileGoalsSchema` and update `trainingPlansSchema`.
- **Files to Edit:** `packages/core/schemas/training.ts` (or equivalent schema file)
- **Verification:** Run `cd packages/core && pnpm check-types && pnpm test`.

## Phase 3: API Layer Updates (tRPC)

### Task 3.1: Implement Profile Goals CRUD

- **Description:** Create tRPC endpoints for managing `profile_goals`, ensuring they are scoped to the user's profile.
- **Files to Edit:** `packages/trpc/src/routers/goals.ts` (Create or update)
- **Verification:** Run `cd packages/trpc && pnpm check-types && pnpm test`.

### Task 3.2: Rewrite Plan Apply Flow

- **Description:** Update the apply flow endpoint to duplicate the source plan, assign `profile_id`, calculate `duration_hours`, seed `profile_goals`, and materialize future `events`. Enforce the active-plan guard.
- **Files to Edit:** `packages/trpc/src/routers/training-plans.ts`
- **Verification:** Run `cd packages/trpc && pnpm check-types && pnpm test`. Write a specific integration test for the apply flow.

### Task 3.3: Implement Plan Lifecycle Management

- **Description:** Update endpoints to handle plan status changes (`completed`, `abandoned`). Ensure future scheduled events are cancelled upon completion/abandonment, while historical events remain unchanged.
- **Files to Edit:** `packages/trpc/src/routers/training-plans.ts`
- **Verification:** Run `cd packages/trpc && pnpm check-types && pnpm test`. Write a test verifying future events are cancelled on abandonment.

## Phase 4: Analytics Alignment

### Task 4.1: Update Analytics Queries

- **Description:** Ensure planned-load and prediction inputs are computed from `events` only, excluding cancelled events. Ensure rest days are inferred dynamically.
- **Files to Edit:** `packages/core/calculations/` (relevant calculation files) and `packages/trpc/src/routers/analytics.ts`
- **Verification:** Run `cd packages/core && pnpm test` and `cd packages/trpc && pnpm test`.
