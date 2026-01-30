# Smart Performance Metrics: Phase 2 Implementation Plan

## Overview

Phase 2 focuses on the backend logic for processing activity data to extract advanced performance metrics (Best Efforts, VO2 Max, Thresholds) and generate notifications.
**Note:** FIT file parsing (`packages/core/lib/fit-sdk-parser.ts`) and basic activity creation (`packages/trpc/src/routers/fit-files.ts`) are already implemented. This plan builds upon that foundation.

## Architecture

- **Logic Location:** Pure calculation logic (VO2 Max, Best Efforts, Efficiency, Training Effect) will reside in `@repo/core`.
- **Orchestration:** The `processFitFile` procedure in `@repo/trpc` will coordinate the data flow: Parse -> Calculate -> Update DB -> Notify.
- **Data Flow:**
  1.  `processFitFile` receives file path.
  2.  Downloads and parses FIT file (Existing).
  3.  **New:** Calculates Advanced Metrics (EF, Decoupling, Training Effect).
  4.  **New:** Updates Profile Metrics id discovered (Max HR, VO2 Max, LTHR), and analyze and find all activity efforts in activity
  5.  **New:** Determine if activity efforts are "best efforts". Note: Some metrics like LTHR might need to be calculated id so.
  6.  **New:** Checks for improvements and creates Notifications.

## Implementation Steps

### Phase 1.5: Schema Refinement

**Goal:** Add missing columns and enums to support new metrics.

- **Action:** Modify `packages/supabase/schemas/init.sql`.
- **Changes:**
  1.  **Update Enum:** Add `lthr` to `profile_metric_type`.
  2.  **Update Table:** Add columns to `activities`:
      - `efficiency_factor`
      - `aerobic_decoupling`
      - `training_effect`
      - `temperature`
      - `normalized_speed_mps`
      - `normalized_graded_speed_mps`

### Phase 2: Backend Logic

#### 1. Efficiency & Decoupling (`@repo/core`)

**Goal:** Calculate Efficiency Factor (EF) and Aerobic Decoupling.

- **File:** `packages/core/calculations/efficiency.ts` (New)
- **Functions:**
  - `calculateEfficiencyFactor(normalizedPower: number, avgHeartRate: number): number`
    - Formula: `NP / AvgHR` (or `NGP / AvgHR` for running).
  - `calculateAerobicDecoupling(powerStream: number[], hrStream: number[], timestamps: number[]): number`
    - Split activity into two halves.
    - Calculate EF for first half (EF1) and second half (EF2).
    - Formula: `(EF1 - EF2) / EF1 * 100`.

#### 2. Training Effect (`@repo/core`)

**Goal:** Categorize the session based on HR zone distribution.

- **File:** `packages/core/calculations/training-effect.ts` (New)
- **Function:** `calculateTrainingEffect(timeInZones: number[])`
#### 3. VO2 Max Calculation (`@repo/core`)

**Goal:** Implement the VO2 Max estimation formula.

- **File:** `packages/core/calculations/vo2max.ts` (New)
- **Function:** `estimateVO2Max(maxHr: number, restingHr: number): number`
  - Formula: `15.3 * (maxHr / restingHr)`

#### 4. Best Effort Calculation (`@repo/core`)

**Goal:** Calculate peak performances for specific durations.

- **File:** `packages/core/calculations/best-efforts.ts` (New)
- **Dependencies:** Import `findMaxAveragePower` (and similar helpers) from `./curves`.
- **Durations:** 5s, 10s, 30s, 1m, 2m, 5m, 8m, 10m, 20m, 30m, 60m, 90m, 3h.
- **Function:** `calculateBestEfforts(records: ActivityRecord[]): BestEffort[]`
  - Iterate through standard durations.
  - Calculate best Power (Watts) and Speed (m/s).
  - Return array of `{ duration, type, value, startTime }`.

#### 5. Update `processFitFile` Procedure (`@repo/trpc`)

**Goal:** Integrate new calculations into the processing pipeline.

- **File:** `packages/trpc/src/routers/fit-files.ts`

- **Step 5.1: Advanced Metrics (EF, Decoupling, TE)**
  - Call `calculateEfficiencyFactor` and `calculateAerobicDecoupling`.
  - Call `calculateTrainingEffect`.
  - **Update Activity:** Save `efficiency_factor`, `aerobic_decoupling`, `training_effect_aerobic`, `training_effect_anaerobic` to `activities` table.

- **Step 5.2: Profile Metrics Updates (Auto-Detection)**
  - **Max HR:** If `fit.maxHeartRate > current.maxHeartRate`, update `profile_metrics`.
  - **VO2 Max:** Recalculate and update if Max HR or Resting HR changes.
  - **LTHR:** Use `analyzeHRCurve` from `curves.ts`. If detected LTHR > current, update `profile_metrics` (using `lthr` enum) AND insert into `profile_performance_metric_logs`.
  - **FTP:** Use `analyzePowerCurve` from `curves.ts`. If detected CP > current FTP, update `profile_metrics` (using `ftp` enum) AND insert into `profile_performance_metric_logs`.

- **Step 5.3: Best Efforts**
  - Call `calculateBestEfforts`.
  - Bulk insert into `activity_efforts`.

- **Step 5.4: Notifications**
  - Check for improvements in Best Efforts, FTP, LTHR, VO2 Max.
  - Create notifications for each new record.

### 6. Validation

- Ensure `ActivityUploadSchema` in `packages/core/schemas/activity_payload.ts` aligns with the data being processed.

## Verification Plan

1.  **Unit Tests (`@repo/core`):**
    - Test `calculateEfficiencyFactor` and `calculateAerobicDecoupling`.
    - Test `calculateTrainingEffect`.
    - Test `estimateVO2Max`.
    - Test `calculateBestEfforts`.
2.  **Integration Tests (`@repo/trpc`):**
    - Run `processFitFile` with sample FIT files.
    - **Assert:**
      - `activities` table has EF, Decoupling, TE.
      - `profile_metrics` updates correctly for new Max HR/FTP/LTHR.
      - `activity_efforts` are populated.
      - `notifications` are generated.

## Edge Cases

- **Missing Data:** If HR is missing, skip EF, Decoupling, LTHR, VO2 Max.
- **Short Activity:** Decoupling requires sufficient duration (>20 mins).
- **Data Gaps:** `curves.ts` handles gaps, ensure new functions do too.
