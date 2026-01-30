# Smart Performance Metrics: Implementation Plan

## Overview

focuses on the backend logic for processing activity data to extract advanced performance metrics (Best Efforts, VO2 Max, Thresholds, Efficiency Factor, Aerobic Decoupling, Training Effect) and generate notifications.

**Note:** FIT file parsing (`packages/core/lib/fit-sdk-parser.ts`) and basic activity creation (`packages/trpc/src/routers/fit-files.ts`) are already implemented. This plan builds upon that foundation.

-----

## Architecture

- **Logic Location:** Pure calculation logic (VO2 Max, Best Efforts, Efficiency, Training Effect, NGP, Normalized Power) will reside in `@repo/core`.
- **Orchestration:** The `processFitFile` procedure in `@repo/trpc` will coordinate the data flow: Parse → Calculate → Update DB → Notify.
- **Data Flow:**

1. `processFitFile` receives file path
1. Downloads and parses FIT file (Existing)
1. **New:** Calculates Advanced Metrics
1. **New:** Analyzes available data and finds all activity efforts in the activity, updates all Profile Metrics if discovered (Max HR), and calculates available metrics (EF, Decoupling, Training Effect, LTHR, etc.) for the `activities` table
1. Updates `activity_efforts` table and `activities` table
1. **New:** Generates notifications for detected improvements

-----

## Implementation Steps

### Phase 2.1: Schema Refinement

**Goal:** Add missing columns and enums to support new metrics.

- **Action:** Modify `packages/supabase/schemas/init.sql` to include:
  - `normalized_speed_mps` column in `activities`
  - `normalized_graded_speed_mps` column in `activities`
  - `avg_temperature` column in `activities`
  - `efficiency_factor` column in `activities`
  - `aerobic_decoupling` column in `activities`
  - `training_effect` column with `training_effect_label` enum in `activities`
  - `activity_efforts` table with proper indexes
  - `profile_metrics` table with `profile_metric_type` enum
  - `notifications` table
- **Migration:** Run `supabase db diff -f updated-smart-performance-metrics` to generate migration file

-----

### Phase 2.2: Core Calculation Functions

#### 1. Normalized Graded Pace (NGP) for Running (`@repo/core`)

**Goal:** Calculate Grade Adjusted Pace using the Minetti formula for running activities.

- **File:** `packages/core/calculations/normalized-graded-pace.ts` (New)
- **Reference:** [Grade Adjusted Pace Formula](https://aaron-schroeder.github.io/reverse-engineering/grade-adjusted-pace.html)
- **Functions:**
  - `getCostFactor(grade: number): number`
    - Implements Minetti-based polynomial for metabolic cost
    - Formula: `(155.4 * G^5) - (30.4 * G^4) - (43.3 * G^3) + (46.3 * G^2) + (19.5 * G) + 3.6`
    - Returns: `cost / 3.6` (normalized to flat running cost)
  - `calculateGradedSpeed(actualSpeed: number, grade: number): number`
    - Formula: `actualSpeed * getCostFactor(grade)`
  - `calculateNGP(speedStream: number[], elevationStream: number[], distanceStream: number[]): number`
    - Calculate instantaneous grade for each data point
    - Apply cost factor to get graded pace for each point
    - Calculate 30-second rolling average of graded paces
    - Raise each 30-second average to the 4th power
    - Average those values over the entire workout
    - Take the 4th root of the result
    - Returns: Normalized Graded Pace in m/s

#### 2. Normalized Power (`@repo/core`)

**Goal:** Calculate Normalized Power for cycling/power-based activities.

- **File:** `packages/core/calculations/normalized-power.ts` (New)
- **Function:** `calculateNormalizedPower(powerStream: number[]): number`
  - Calculate 30-second rolling average of power values
  - Raise each 30-second average to the 4th power
  - Average all the 4th power values
  - Take the 4th root of the average
  - Returns: Normalized Power in watts

#### 3. Normalized Speed (`@repo/core`)

**Goal:** Calculate normalized speed for activities without power data.

- **File:** `packages/core/calculations/normalized-speed.ts` (New)
- **Function:** `calculateNormalizedSpeed(distanceStream: number[], timeStream: number[]): number`
  - Calculate total distance traveled (excluding stops)
  - Calculate moving time (time when speed > threshold)
  - Formula: `totalDistance / movingTime`
  - Returns: Normalized Speed in m/s

#### 4. Efficiency Factor & Aerobic Decoupling (`@repo/core`)

**Goal:** Calculate Efficiency Factor (EF) and Aerobic Decoupling.

- **File:** `packages/core/calculations/efficiency.ts` (New)
- **Functions:**
  - `calculateEfficiencyFactor(normalizedMetric: number, avgHeartRate: number): number`
    - Formula: `normalizedMetric / avgHeartRate`
    - `normalizedMetric` can be Normalized Power, Normalized Speed, or NGP depending on activity type
    - Returns: Efficiency Factor
  - `calculateAerobicDecoupling(metricStream: number[], hrStream: number[], timestamps: number[]): number | null`
    - Requires activity duration > 20 minutes for meaningful results
    - Split activity into two equal halves
    - Calculate EF for first half (EF1) and second half (EF2)
    - Formula: `((EF1 - EF2) / EF1) * 100`
    - Returns: Aerobic Decoupling percentage (positive = decoupling occurred)

#### 5. Training Effect (`@repo/core`)

**Goal:** Categorize training sessions based on HR zones.

- **File:** `packages/core/calculations/training-effect.ts` (New)
- **Function:** `calculateTrainingEffect(hrStream: number[], lthr: number, maxHr: number): string`
  - Calculate time spent in each HR zone:
    - Zone 1 (Recovery): < 60% of LTHR
    - Zone 2 (Base): 60-80% of LTHR
    - Zone 3 (Tempo): 80-95% of LTHR
    - Zone 4 (Threshold): 95-105% of LTHR
    - Zone 5 (VO2 Max): > 105% of LTHR
  - **Logic:**
    - Majority time in Zone 1 → “recovery”
    - Majority time in Zone 2 → “base”
    - Majority time in Zone 3 → “tempo”
    - Majority time in Zone 4 or sustained efforts near LTHR → “threshold”
    - Significant time in Zone 5 or repeated high-intensity intervals → “vo2max”
  - Returns: Training effect label enum value

#### 6. VO2 Max Calculation (`@repo/core`)

**Goal:** Implement the VO2 Max estimation formula.

- **File:** `packages/core/calculations/vo2max.ts` (New)
- **Function:** `estimateVO2Max(maxHr: number, restingHr: number): number`
  - Formula: `15.3 * (maxHr / restingHr)`
  - Returns: Estimated VO2 Max in ml/kg/min

#### 7. Best Effort Calculation (`@repo/core`)

**Goal:** Calculate peak performances for specific durations across all activities.

- **File:** `packages/core/calculations/best-efforts.ts` (New)
- **Dependencies:** Import `findMaxAveragePower` and similar helpers from `./curves`
- **Standard Durations:** 5s, 10s, 30s, 1m, 2m, 5m, 8m, 10m, 20m, 30m, 60m, 90m, 3h
- **Function:** `calculateBestEfforts(records: ActivityRecord[], activityCategory: string): BestEffort[]`
  - Iterate through standard durations
  - For each duration:
    - Calculate best Power (watts) if power data available
    - Calculate best Speed (m/s) from distance/time data
  - Return array of `{ duration_seconds, effort_type, value, unit, start_offset }`
  - **Note:** Calculate and return ALL efforts for the activity, not just personal bests

#### 8. LTHR Detection (`@repo/core`)

**Goal:** Auto-detect Lactate Threshold Heart Rate from sustained efforts.

- **File:** `packages/core/calculations/threshold-detection.ts` (New)
- **Function:** `detectLTHR(hrStream: number[], powerStream: number[], timeStream: number[]): number | null`
  - Analyze sustained high-intensity efforts (20+ minutes at steady state)
  - Look for HR deflection point where HR rises disproportionately to power/pace
  - Use 20-minute average HR as a proxy if deflection point unclear
  - Returns: Detected LTHR or null if insufficient data

-----

### Phase 2.3: Weather Data Integration (`@repo/trpc`)

**Goal:** Fetch temperature data if not present in the FIT file.

- **File:** `packages/trpc/src/utils/weather.ts` (New)
- **Service:** Google Weather API or equivalent
- **Function:** `fetchActivityTemperature(startLat: number, startLng: number, endLat: number, endLng: number, startTime: Date, endTime: Date): number | null`
  - Check if GPS data exists
  - Fetch temperature for start location at start time
  - Fetch temperature for end location at end time
  - Calculate average: `(startTemp + endTemp) / 2`
  - Returns: Average temperature in Celsius or null if unavailable

-----

### Phase 2.4: Update `processFitFile` Procedure (`@repo/trpc`)

**Goal:** Integrate all new calculations into the processing pipeline.

- **File:** `packages/trpc/src/routers/fit-files.ts`

#### Processing Steps (in order):

**Step 1: Parse FIT File (Existing)**

- Download and parse FIT file
- Extract basic metadata (distance, duration, avg HR, avg power, etc.)

**Step 2: Calculate Normalized Metrics**

- **For Running:**
  - Calculate `normalized_graded_speed_mps` using `calculateNGP()` if elevation data available
  - Calculate `normalized_speed_mps` using `calculateNormalizedSpeed()` as fallback
- **For Cycling with Power:**
  - Calculate `normalized_power` using `calculateNormalizedPower()`
  - Calculate `normalized_speed_mps` using `calculateNormalizedSpeed()`
- **For Swimming:**
  - Calculate `normalized_speed_mps` using `calculateNormalizedSpeed()` (excludes wall rest)
- **For Other Activities:**
  - Calculate `normalized_speed_mps` using `calculateNormalizedSpeed()`

**Step 3: Calculate Advanced Metrics**

- **Efficiency Factor:**
  - Use appropriate normalized metric (power or speed) divided by average HR
  - Call `calculateEfficiencyFactor()`
- **Aerobic Decoupling:**
  - Only for activities > 20 minutes
  - Call `calculateAerobicDecoupling()`
- **Training Effect:**
  - Requires HR data and known LTHR
  - Fetch current LTHR from `profile_metrics`
  - Call `calculateTrainingEffect()`

**Step 4: Fetch Weather Data (if needed)**

- Check if `avg_temperature` is missing from FIT file
- If GPS data exists, call `fetchActivityTemperature()`
- Store result in `avg_temperature` column

**Step 5: Update Profile Metrics (Auto-Detection)**

- **Max HR Detection:**
  - Extract max HR from activity
  - Query current `max_hr` from `profile_metrics`
  - If new max HR > current, insert new record in `profile_metrics`
  - If updated, trigger VO2 Max recalculation
- **Resting HR:**
  - If updated externally, trigger VO2 Max recalculation
- **VO2 Max Calculation:**
  - Call `estimateVO2Max()` with latest max HR and resting HR
  - Insert new record in `profile_metrics`
- **LTHR Detection:**
  - Call `detectLTHR()` with HR and power/pace streams
  - If detected LTHR > current, insert new record in `profile_metrics` with type `'lthr'`

**Step 6: Calculate and Store Best Efforts**

- Call `calculateBestEfforts()` for the activity
- **Action:** Bulk insert ALL calculated efforts into `activity_efforts` table
  - Include: `activity_id`, `profile_id`, `activity_category`, `duration_seconds`, `effort_type`, `value`, `unit`, `start_offset`, `recorded_at`
- **Rationale:** Storing all efforts (not just PRs) ensures fault tolerance and allows rebuilding of personal bests if activities are deleted

**Step 7: Update Activities Table**

- Save all calculated metrics to `activities` table:
  - `normalized_speed_mps`
  - `normalized_graded_speed_mps` (running only)
  - `normalized_power` (cycling with power)
  - `avg_temperature`
  - `efficiency_factor`
  - `aerobic_decoupling`
  - `training_effect` (enum label)

**Step 8: Generate Notifications**

- Query recent best efforts from `activity_efforts` for this profile
- Compare current activity efforts to historical bests
- Detect improvements in:
  - Best efforts (any duration)
  - LTHR (from profile_metrics updates)
  - VO2 Max (from profile_metrics updates)
- For each improvement, insert record into `notifications` table with:
  - Descriptive title (e.g., “New 5-minute Power Record!”)
  - Detailed message with old vs. new values
  - `is_read: false`

**Step 9: Validation**

- Validate final activity payload against `ActivityUploadSchema` in `packages/core/schemas/activity_payload.ts`
- Ensure all required fields are present and properly typed
- Handle validation errors gracefully

-----

### Phase 2.5: Validation & Schema Updates

**Goal:** Ensure data consistency and type safety.

- **File:** `packages/core/schemas/activity_payload.ts`
- **Action:** Update `ActivityUploadSchema` to include all new fields:
  - `normalized_speed_mps`
  - `normalized_graded_speed_mps`
  - `avg_temperature`
  - `efficiency_factor`
  - `aerobic_decoupling`
  - `training_effect` (with enum validation)
- Add Zod schemas for:
  - `BestEffortSchema`
  - `ProfileMetricSchema`
  - `NotificationSchema`

-----

## Verification Plan

### 1. Unit Tests (`@repo/core`)

**File Structure:** `packages/core/calculations/__tests__/`

- **Test `normalized-graded-pace.ts`:**
  - Test `getCostFactor()` with known grade values
  - Test `calculateGradedSpeed()` with sample data
  - Test `calculateNGP()` with simulated GPS/elevation streams
- **Test `normalized-power.ts`:**
  - Test `calculateNormalizedPower()` with constant power
  - Test with variable power output
  - Test with realistic cycling power profile
- **Test `normalized-speed.ts`:**
  - Test `calculateNormalizedSpeed()` with continuous movement
  - Test with stops/rests (should exclude them)
- **Test `efficiency.ts`:**
  - Test `calculateEfficiencyFactor()` with typical values
  - Test `calculateAerobicDecoupling()` with stable and decoupling scenarios
  - Test minimum duration requirements
- **Test `training-effect.ts`:**
  - Test `calculateTrainingEffect()` for each zone category
  - Test edge cases (all recovery, all VO2 max)
- **Test `vo2max.ts`:**
  - Test `estimateVO2Max()` with known reference values
  - Validate formula accuracy
- **Test `best-efforts.ts`:**
  - Test `calculateBestEfforts()` with power data
  - Test with speed data
  - Test with varied duration activities
- **Test `threshold-detection.ts`:**
  - Test `detectLTHR()` with sustained tempo efforts
  - Test with insufficient data

### 2. Integration Tests (`@repo/trpc`)

**File:** `packages/trpc/src/routers/__tests__/fit-files.test.ts`

- **Test `processFitFile` with sample FIT files:**
  - Use real FIT files from different activity types (run, bike, swim)
  - **Assert:**
    - `activities` table populated with all metrics (EF, Decoupling, TE, normalized metrics, temperature)
    - `profile_metrics` updates correctly for new Max HR/LTHR/VO2 Max
    - `activity_efforts` contains all calculated efforts
    - `notifications` generated for improvements
    - No errors or missing data in edge cases

### 3. End-to-End Tests

- Upload actual FIT files through the UI
- Verify database records match expected calculations
- Check notification delivery
- Validate UI displays correct metrics

-----

## Edge Cases & Error Handling

### Missing Data Scenarios:

- **No Heart Rate Data:**
  - Skip: Efficiency Factor, Aerobic Decoupling, LTHR detection, VO2 Max calculation, Training Effect
  - Still calculate: Best Efforts (power/speed), Normalized Power/Speed
- **No Power Data (Cycling):**
  - Use speed-based metrics instead
  - Calculate Best Speed Efforts
- **No Elevation Data (Running):**
  - Skip NGP calculation
  - Fall back to standard `normalized_speed_mps`
- **No GPS Data:**
  - Skip weather fetching
  - Skip location-based calculations
- **Short Activity (< 20 minutes):**
  - Skip Aerobic Decoupling calculation (requires longer duration for meaningful results)
- **Activity Without Threshold Data:**
  - Skip Training Effect calculation (requires known LTHR)

### Data Quality Issues:

- **GPS Signal Loss:**
  - Use gap-filling logic from `curves.ts`
  - Flag activity if gaps are excessive
- **HR Strap Dropouts:**
  - Interpolate small gaps
  - Skip calculations if data quality is poor
- **Power Meter Zeros:**
  - Exclude zero values from normalized power calculation
  - Use moving time only

### API Failures:

- **Weather API Unavailable:**
  - Store `null` for `avg_temperature`
  - Log warning, continue processing
- **Database Write Failures:**
  - Implement transaction rollback
  - Retry logic for transient errors
  - Alert monitoring system

-----

## Performance Considerations

- **Batch Processing:** Process activity efforts in bulk (single transaction)
- **Indexing:** Ensure proper indexes on `activity_efforts` and `profile_metrics` for fast queries
- **Caching:** Cache frequently accessed profile metrics (LTHR, Max HR) during processing
- **Async Operations:** Weather API calls should not block main processing pipeline

-----

## Success Criteria

Phase 2 is complete when:

1. All calculation functions are implemented and tested
1. `processFitFile` successfully processes real FIT files with all metrics
1. Database tables are properly populated with no data loss
1. Notifications are generated for detected improvements
1. All unit and integration tests pass
1. Edge cases are handled gracefully
1. Documentation is updated with calculation methodologies​​​​​​​​​​​​​​​​