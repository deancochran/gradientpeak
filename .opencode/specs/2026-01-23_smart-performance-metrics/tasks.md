# Smart Performance Metrics: Implementation Tasks

## Phase 1: Database Schema Setup

**Strict Workflow:**

1. Modify `packages/supabase/schemas/init.sql` (Declarative Source of Truth).
2. Generate migration: `supabase db diff --use-migra -f <name>`.
3. Sync types: `pnpm update-types`.

- [ ] **Task 1.1:** Modify `packages/supabase/schemas/init.sql` to include:
  - New columns for `activities` table: `normalized_speed_mps`, `normalized_graded_speed_mps`, `avg_temperature`, `efficiency_factor`, `aerobic_decoupling`, `training_effect` (enum).
  - New Enums: `effort_type`, `profile_metric_type`, `training_effect_label`.
  - New Tables: `activity_efforts`, `profile_metrics`, `notifications`.
  - Add necessary indexes and foreign key constraints.
- [ ] **Task 1.2:** Generate the migration file by running:
  ```bash
  cd packages/supabase && supabase db diff -f smart-performance-metrics
  ```
- [ ] **Task 1.3:** Update Supabase types and Supazod schemas by running:
  ```bash
  cd packages/supabase && pnpm run update-types
  ```

## Phase 2: Core Calculation Functions (`@repo/core`)

Implement pure calculation logic in `packages/core/calculations/`.

- [ ] **Task 2.1:** Implement Normalized Graded Pace (NGP) for running.
  - File: `packages/core/calculations/normalized-graded-pace.ts`
  - Implement `getCostFactor`, `calculateGradedSpeed`, and `calculateNGP`.
- [ ] **Task 2.2:** Implement Normalized Power for cycling.
  - File: `packages/core/calculations/normalized-power.ts`
  - Implement `calculateNormalizedPower` (30s rolling avg, 4th power algorithm).
- [ ] **Task 2.3:** Implement Normalized Speed for all activities.
  - File: `packages/core/calculations/normalized-speed.ts`
  - Implement `calculateNormalizedSpeed` (Total Distance / Moving Time).
- [ ] **Task 2.4:** Implement Efficiency Factor & Aerobic Decoupling.
  - File: `packages/core/calculations/efficiency.ts`
  - Implement `calculateEfficiencyFactor` (Normalized Metric / Avg HR).
  - Implement `calculateAerobicDecoupling` (EF1 vs EF2 split).
- [ ] **Task 2.5:** Implement Training Effect categorization.
  - File: `packages/core/calculations/training-effect.ts`
  - Implement `calculateTrainingEffect` based on HR zones and LTHR.
- [ ] **Task 2.6:** Implement VO2 Max estimation.
  - File: `packages/core/calculations/vo2max.ts`
  - Implement `estimateVO2Max` (15.3 \* MaxHR / RestingHR).
- [ ] **Task 2.7:** Implement Best Effort calculation (Sliding Window).
  - File: `packages/core/calculations/best-efforts.ts`
  - Implement `calculateBestEfforts` for standard durations (5s to 3h).
  - Ensure sliding window logic to find true bests.
- [ ] **Task 2.8:** Implement LTHR Detection.
  - File: `packages/core/calculations/threshold-detection.ts`
  - Implement `detectLTHR` using sustained effort analysis.

## Phase 3: Validation & Schema Updates (`@repo/core`)

- [ ] **Task 3.1:** Update `packages/core/schemas/activity_payload.ts`.
  - Update `ActivityUploadSchema` to include all new fields (`normalized_speed_mps`, `efficiency_factor`, etc.).
  - Add `BestEffortSchema`, `ProfileMetricSchema`, `NotificationSchema`.

## Phase 4: Weather Integration (`@repo/trpc`)

- [ ] **Task 4.1:** Implement Weather API integration.
  - File: `packages/trpc/src/utils/weather.ts`
  - Implement `fetchActivityTemperature` using Google Weather API (or equivalent) based on start/end coordinates.

## Phase 5: Orchestration & Processing (`@repo/trpc`)

Update `processFitFile` in `packages/trpc/src/routers/fit-files.ts` to coordinate the pipeline.

- [ ] **Task 5.1:** Integrate Normalized Metrics calculation.
  - Calculate NGP (Run), NP (Bike), and Normalized Speed.
- [ ] **Task 5.2:** Integrate Advanced Metrics calculation.
  - Calculate Efficiency Factor, Aerobic Decoupling, and Training Effect.
- [ ] **Task 5.3:** Integrate Weather Data fetching.
  - Fetch and store `avg_temperature` if missing.
- [ ] **Task 5.4:** Integrate Profile Metrics Auto-Detection.
  - Detect and update Max HR, Resting HR, VO2 Max, and LTHR in `profile_metrics`.
- [ ] **Task 5.5:** Integrate Best Efforts calculation.
  - Calculate and bulk insert ALL efforts into `activity_efforts`.
- [ ] **Task 5.6:** Integrate Notification generation.
  - Compare new efforts/metrics with history and create `notifications` for improvements.
- [ ] **Task 5.7:** Finalize `activities` table update.
  - Ensure all new columns are populated in the final update/insert.

## Phase 6: Testing & Verification

- [ ] **Task 6.1:** Unit Tests for Core Calculations.
  - Create tests in `packages/core/calculations/__tests__/`.
  - Verify correctness of NGP, NP, EF, Decoupling, TE, VO2Max, BestEfforts.
- [ ] **Task 6.2:** Integration Tests for `processFitFile`.
  - Create tests in `packages/trpc/src/routers/__tests__/fit-files.test.ts`.
  - Verify end-to-end flow with sample FIT files.
