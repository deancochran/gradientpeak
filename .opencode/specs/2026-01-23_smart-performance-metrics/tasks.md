# Smart Performance Metrics: Implementation Tasks

## Phase 1: Database Schema Setup

**Strict Workflow:**

1. Modify `packages/supabase/schemas/init.sql` (Declarative Source of Truth).
2. Generate migration: `supabase db diff --use-migra -f <name>`.
3. Sync types: `pnpm update-types`.

- [x] **Task 1.1:** Modify `packages/supabase/schemas/init.sql` to include:
  - New columns for `activities` table: `normalized_speed_mps`, `temperature`.
  - New Enums: `effort_type`, `profile_metric_type`.
  - New Tables: `activity_efforts`, `profile_metrics`, `notifications`.
  - Add necessary indexes and foreign key constraints.
- [x] **Task 1.2:** Generate the migration file by running:
  ```bash
  cd packages/supabase && supabase db diff -f smart-performance-metrics
  ```
- [x] **Task 1.4:** Update database with migration by running:
  ```bash
  cd packages/supabase && supabase migration up
  ```
- [x] **Task 1.3:** Update Supabase types and Supazod schemas by running:
  ```bash
  cd packages/supabase && pnpm run update-types
  ```

## Phase 1.5: Schema Refinement (Advanced Metrics)

- [ ] **Task 1.5.1:** Modify `packages/supabase/schemas/init.sql` to include:
  - Add `ftp`, `lthr` to `profile_metric_type` enum.
  - Add columns to `activities` table:
    - `efficiency_factor` (numeric)
    - `aerobic_decoupling` (numeric)
    - `training_effect_aerobic` (numeric)
    - `training_effect_anaerobic` (numeric)
- [ ] **Task 1.5.2:** Generate migration file:
  ```bash
  cd packages/supabase && supabase db diff -f advanced-metrics
  ```
- [ ] **Task 1.5.3:** Apply migration:
  ```bash
  cd packages/supabase && supabase migration up
  ```
- [ ] **Task 1.5.4:** Update types:
  ```bash
  cd packages/supabase && pnpm run update-types
  ```

## Phase 2: Backend Logic Implementation

- [ ] **Task 2.1:** Implement VO2 Max Calculation Logic.
  - Create `packages/core/calculations/vo2max.ts`.
  - Implement `estimateVO2Max(maxHr, restingHr)`.
- [ ] **Task 2.2:** Implement Best Efforts Calculation Logic.
  - Create `packages/core/calculations/best-efforts.ts`.
  - Implement `calculateBestEfforts(records)` for standard durations.
- [ ] **Task 2.3:** Implement Efficiency & Decoupling Logic.
  - Create `packages/core/calculations/efficiency.ts`.
  - Implement `calculateEfficiencyFactor` and `calculateAerobicDecoupling`.
- [ ] **Task 2.4:** Implement Training Effect Logic.
  - Create `packages/core/calculations/training-effect.ts`.
  - Implement `calculateTrainingEffect`.
- [ ] **Task 2.5:** Update `processFitFile` for Metrics & VO2 Max.
  - Modify `packages/trpc/src/routers/fit-files.ts`.
  - Fix table name reference (`profile_metric_logs` -> `profile_metrics`).
  - Implement Max HR check and update.
  - Implement VO2 Max calculation and insert.
  - Implement LTHR & FTP auto-detection (using `curves.ts`) and update `profile_metrics` + `profile_performance_metric_logs`.
- [ ] **Task 2.6:** Update `processFitFile` for Advanced Metrics.
  - Calculate EF, Decoupling, TE.
  - Save to new `activities` columns.
- [ ] **Task 2.7:** Update `processFitFile` for Best Efforts.
  - Call `calculateBestEfforts`.
  - Bulk insert into `activity_efforts`.
- [ ] **Task 2.8:** Update `processFitFile` for Notifications.
  - Compare new efforts with previous bests.
  - Insert into `notifications` table.
- [ ] **Task 2.9:** Validation & Cleanup.
  - Ensure all types are correct.
  - Verify `ActivityUploadSchema` usage if applicable.

## Phase 3: Verification (Manual & Automated)

- [ ] **Task 3.1:** Run Unit Tests for Core Calculations.
- [ ] **Task 3.2:** Run Integration Tests (or manual verification) for `processFitFile`.
- [ ] **Task 3.3:** Verify Database Records (check `profile_metrics`, `activity_efforts`, `notifications`, `activities` columns).

Note: Unit Testing, E2E Testing, and validation of changes will happen later. Use `tsc --noEmit` on the packages and apps that were changed (`core`, `trpc`, `mobile`, `web`). Ensure that the type check / linting pass. Manual testing will be run to ensure the results of the changes are as expected
