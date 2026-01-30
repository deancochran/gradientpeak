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
  3.  **New:** Calculates Advanced Metrics
  4.  **New:** Analyze available data and find all activity efforts in activity, update all Profile Metricsid discovered (Max HR), and calculate available metrics (EF, Decoupling, Training Effect, LTHR, etc for activies table) if able
  5.  Update activty efforts tables and update activities table

## Implementation Steps

### Phase 1.5: Schema Refinement

**Goal:** Add missing columns and enums to support new metrics.

- **Action:** Modify `packages/supabase/schemas/init.sql`.
- **Migration:** supabase db diff -f updated-smart-performance-metrics

### Phase 2: Backend Logic
How to cacluate NGP can be found here: https://aaron-schroeder.github.io/reverse-engineering/grade-adjusted-pace.html
1. The Core Calculation Steps Calculate Instantaneous Grade: For every GPS data point, calculate the slope:\(\text{Grade}=\frac{\text{Change\ in\ Elevation}}{\text{Change\ in\ Distance}}\)Apply an Adjustment Factor (\(C\)): Use a cost-of-running function (like Minetti’s).Uphill: Pace must be increased (made faster) because the effort is higher.Downhill: Pace is decreased (made slower) because gravity assists you—until the slope exceeds ~15%, where braking forces make it hard again.Calculate Graded Pace:\(\text{Graded\ Pace}=\text{Actual\ Pace}\div \text{Cost\ Factor}\) 2. A Simplified Linear Approximation While platforms like TrainingPeaks use complex non-linear curves, you can approximate it for your database using this logic for moderate grades (-10% to +10%): For every 1% of positive grade: Add ~3.5% to the speed.For every 1% of negative grade: Subtract ~1.8% from the speed (up to -10%). 3. Scaling to NGP (The "Normalization" Part) Simply calculating "Graded Pace" isn't enough for TSS; you must normalize it to account for intensity fluctuations: Take the Graded Pace for every second.Calculate a 30-second rolling average of those graded paces.Raise each 30-second average to the 4th power.Average those values over the entire workout.Take the 4th root of the result. 4. Implementation Example (Python Logic) If you are coding this into a database, your function for the cost factor (\(C\)) based on grade (\(G\)) would look roughly like this (simplified from Minetti’s Research): pythondef get_cost_factor(grade):
    # Minetti-based polynomial for metabolic cost
    # G is grade (e.g., 0.05 for 5%)
    cost = (155.4 * G**5) - (30.4 * G**4) - (43.3 * G**3) + (46.3 * G**2) + (19.5 * G) + 3.6
    # 3.6 is the cost of flat running
    return cost / 3.6

ngp_speed = actual_speed * get_cost_factor(grade)

How to calculate normalized power:
30-Second Rolling Average: Calculate the average power over 30-second intervals throughout the activity. Raise to the Fourth Power: Take each of these 30-second average power values and raise it to the power of 4 (\(Power^{4}\)). Average the Values: Calculate the average of all the \(Power^{4}\) values from Step 2.  Take the Fourth Root: Find the fourth root (or raise to the power of 1/4) of the average from Step 3 (\(\sqrt{Average}\)).

How to calculate normalized_speed
get teh avgerage speed divided by the moving time



#### 1. Efficiency & Decoupling (`@repo/core`)

**Goal:** Calculate Efficiency Factor (EF) and Aerobic Decoupling.

- **File:** `packages/core/calculations/efficiency.ts` (New)
- **Functions:**
  - `calculateEfficiencyFactor(normalizedPower: number, avgHeartRate: number): number`
    - Formula: `NP / AvgHR` (or `normalized_speed_mps / AvgHR` for running).
  - `calculateAerobicDecoupling(powerStream: number[], hrStream: number[], timestamps: number[]): number`
    - Split activity into two halves.
    - Calculate EF for first half (EF1) and second half (EF2).
    - Formula: `(EF1 - EF2) / EF1 * 100`.

#### 2. Training Effect (`@repo/core`)

**Goal:** Calculate Training Effect based on HR zones.

- **File:** `packages/core/calculations/training-effect.ts` (New)
- **Function:** `calculateTrainingEffect(timeInZones: number[]): { aerobic: number, anaerobic: number, label: string }`
  - **Logic:**
    - **Aerobic:** Based on accumulated TRIMP (Training Impulse) or time in Zones 2, 3, 4.
    - **Anaerobic:** Based on time in Zone 5 and repeated high-intensity efforts.
    - **Label:** "Recovery", "Base", "Tempo", "Threshold", "VO2 Max", "Anaerobic".

#### 3. VO2 Max Calculation (`@repo/core`)

**Goal:** Implement the VO2 Max estimation formula.

- **File:** `packages/core/calculations/vo2max.ts` (New)
- **Function:** `estimateVO2Max(maxHr: number, restingHr: number): number`
  - Formula: `15.3 * (maxHr / restingHr)`

#### 4. Best Effort Calculation (`@repo/core`)

**Goal:** Calculate peak performances for specific durations for ALL activities.

- **File:** `packages/core/calculations/best-efforts.ts` (New)
- **Dependencies:** Import `findMaxAveragePower` (and similar helpers) from `./curves`.
- **Durations:** 5s, 10s, 30s, 1m, 2m, 5m, 8m, 10m, 20m, 30m, 60m, 90m, 3h.
- **Function:** `calculateBestEfforts(records: ActivityRecord[]): BestEffort[]`
  - Iterate through standard durations.
  - Calculate best Power (Watts) and Speed (m/s) for the current activity.
  - Return array of `{ duration, type, value, startTime }`.

#### 5. Weather Data Integration (`@repo/trpc`)

**Goal:** Fetch temperature data if not present in the device file.

- **Logic:**
  - Check if `activity.avg_temperature` is missing.
  - If GPS data exists (Lat/Lng):
    - Fetch temperature for the **Start Location** at **Start Time**.
    - Fetch temperature for the **End Location** at **End Time**.
    - Calculate Average: `(StartTemp + EndTemp) / 2`.
  - Service: Use Google Weather API (or similar reliable source).

#### 6. Update `processFitFile` Procedure (`@repo/trpc`)

**Goal:** Integrate new calculations into the processing pipeline.

- **File:** `packages/trpc/src/routers/fit-files.ts`

- **Step 6.1: Advanced Metrics (EF, Decoupling, TE, NGP)**
  - Call `calculateEfficiencyFactor` and `calculateAerobicDecoupling`.
  - Call `calculateTrainingEffect`.
  - Calculate `normalized_speed_mps` (NGP for Run, Moving Avg Speed for Swim).
  - **Update Activity:** Save `efficiency_factor`, `aerobic_decoupling`, `training_effect` (enum label), `normalized_speed_mps`, `avg_temperature` to `activities` table.

- **Step 6.2: Profile Metrics Updates (Auto-Detection)**
  - **Max HR:** If `fit.maxHeartRate > current.maxHeartRate`, update `profile_metrics`.
  - **VO2 Max:** Recalculate and update if Max HR or Resting HR changes.
  - **LTHR:** Use `analyzeHRCurve` from `curves.ts`. If detected LTHR > current, update `profile_metrics` (using `lthr` enum).
  - **FTP:** Use `analyzePowerCurve` from `curves.ts`. If detected CP > current FTP, log as a Best Effort in `activity_efforts` (e.g. 60m Power).

- **Step 6.3: Activity Efforts (Fault Tolerance)**
  - Call `calculateBestEfforts`.
  - **Action:** Bulk insert ALL calculated efforts into `activity_efforts` table for this activity. This ensures redundancy and allows rebuilding bests if an activity is deleted.

- **Step 6.4: Notifications**
  - Check for improvements in Best Efforts, FTP, LTHR, VO2 Max.
  - Create notifications for each new record.

### 7. Validation

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
