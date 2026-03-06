# Implementation Plan: Profile Goals + Training Plans Minimal Model

## Phase 1: Database & Core Package Refactor

**Objective**: Update the foundational schema and `@repo/core` typings without breaking the application build.

1. **Supabase Migrations**:
   - Create migration script `create_profile_goals_table.sql`.
   - Create migration script `update_training_plans_table.sql` (Add `profile_id`, drop legacy tracking columns, migrate existing templates to `profile_id = NULL`).
   - Run local migrations and generate updated Supabase types.
2. **`@repo/core` Schemas**:
   - Create `packages/core/schemas/profile_goals.ts`.
   - Refactor `packages/core/schemas/training-plan-structure/domain-schemas.ts` to remove the embedded `goals` array from the core plan schema.
   - Update `MinimalTrainingPlanCreate` to reflect the removal of nested goals.
3. **`@repo/core` Utilities**:
   - Build pure function `materializePlanToEvents(plan: TrainingPlan, startDate: string): ScheduledEvent[]`.
   - Update compliance and metric calculators to strictly accept `events` instead of checking plan schemas.
4. **Validation**: Run `pnpm check-types` and `pnpm test` in `@repo/core`. Achieve 100% test coverage for the new materialization pure function.

## Phase 2: tRPC API Layer Implementation

**Objective**: Connect the database changes to the frontend via type-safe tRPC procedures.

1. **Goals Router (`packages/trpc/src/routers/goals.ts`)**:
   - Implement `create`, `getForProfile`, `update`, `delete` (soft delete or date-based expiration).
2. **Training Plans Router (`packages/trpc/src/routers/trainingPlans.ts`)**:
   - Update `createTemplate` (forces `profile_id: null`).
   - Implement `getTemplates` (queries where `profile_id IS NULL`).
   - Implement `getUserActivePlan` (queries where `profile_id = ctx.user.id AND is_active = true`).
   - Implement `applyPlan`:
     - Validate active plan constraints.
     - Deep copy plan record.
     - Call `materializePlanToEvents` from core.
     - Execute Supabase RPC or batch insert for new `events`.
   - Implement `cancelPlan`:
     - Update plan `is_active = false`.
     - Delete all `events` where `training_plan_id = input.id` AND `date >= TODAY`. Do NOT delete historical events.
3. **Validation**: Run `pnpm test` in `@repo/trpc`. Ensure 80%+ coverage, specifically on `applyPlan` failure states.

## Phase 3: Mobile App (React Native) Refactor

**Objective**: Consume new tRPC endpoints and update local UI state.

1. **Hooks & Stores**:
   - Update `usePlanStore.ts` to reflect the new decoupled schema.
   - Create `useGoalsStore.ts` to handle isolated goal fetching and caching.
2. **Plan Discovery UI**:
   - Update the Template Library screen to query `trpc.trainingPlans.getTemplates`.
   - Remove any legacy "clone" local logic; replace with direct calls to `applyPlan` mutation.
3. **Goal Setting UI**:
   - Refactor goal creation forms to post directly to the `goals` router, allowing users to create goals without a plan.
4. **Calendar/Event UI**:
   - Ensure the Calendar view only relies on the `events` table (via `trpc.events.getRange`).
   - Remove any visual parsing of `training_plans.structure` from the calendar rendering loop.
5. **Validation**: Run `pnpm check-types` in `apps/mobile`. Verify the "Apply Plan" flow via Expo Go / Simulator.

## Phase 4: Web Dashboard (Next.js) Refactor

**Objective**: Update admin tooling and web dashboard to match the new schema.

1. **Admin Template Builder**:
   - Update the plan builder UI to save to `training_plans` with `profile_id = null`.
   - Remove the "Goals" step from the Template Builder (since goals belong to profiles, not templates).
2. **User Dashboard**:
   - Refactor the "My Goals" widget to fetch directly from `trpc.goals.getForProfile`.
   - Refactor the "Active Plan" widget to use `getUserActivePlan`.
3. **Validation**: Run `pnpm check-types` and `pnpm build` in `apps/web`.
