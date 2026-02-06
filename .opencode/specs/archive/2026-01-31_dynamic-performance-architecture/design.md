# Dynamic Performance Architecture: Transition to Activity Efforts

## 1. Overview

This specification outlines the architectural transition from storing static performance snapshots (in `profile_performance_metric_logs`) to deriving performance capabilities dynamically from `activity_efforts`.

### Core Philosophy

- **Single Source of Truth:** The `activity_efforts` table contains the raw "best efforts" (Power, Pace) for every duration from every activity.
- **Dynamic Derivation:** "Who the athlete is" (FTP, Critical Power, W') is mathematically derived from "What the athlete did" (Activity Efforts) over a specific time window (e.g., last 90 days).
- **Biometric Separation:** Physiological states that cannot be purely derived from power/speed curves (like LTHR, Weight, Resting HR) remain in `profile_metrics`.

## 2. Database Schema Changes

### 2.1. Deprecation

- **Drop Table:** `profile_performance_metric_logs`
  - _Reason:_ FTP and Threshold Pace should not be stored as static logs. They are dynamic properties of the athlete's recent history.

### 2.2. Retention & Usage

- **Table:** `activity_efforts`
  - _Usage:_ Stores the best power/speed for standard durations (5s, 1m, 5m, 20m, etc.) for _each_ activity.
  - _Role:_ The foundational dataset for generating Critical Power curves.
- **Table:** `profile_metrics`
  - _Usage:_ Stores LTHR, Max HR, Weight, Resting HR.
  - _Role:_ Stores state values that are updated only when a specific detection event occurs (e.g., a new "best" sustained HR).

## 3. Logic & Algorithms

### 3.1. Dynamic FTP / Critical Power Calculation

Instead of reading a "current FTP" from a table, the system will calculate it on-the-fly (or cache the calculation).

**Algorithm:**

1.  **Query:** Fetch all `activity_efforts` for the user:
    - Filter: `activity_category = 'bike'`
    - Filter: `effort_type = 'power'`
    - Filter: `recorded_at > (NOW - 90 DAYS)` (Rolling season window)
2.  **Aggregate:** Find the _Maximum_ value for each distinct duration across all activities.
    - _Result:_ A "Season Best" Mean Maximal Power (MMP) curve (e.g., Best 5s = 800W, Best 20m = 250W).
3.  **Curve Fit:** Apply the Monod & Scherrer Critical Power model (2-parameter) to the MMP data.
    - _Input:_ Best efforts for durations between 3 minutes and 30 minutes (to avoid anaerobic skew and aerobic drift).
    - _Output:_
      - **CP (Critical Power):** The asymptote of the hyperbolic curve (proxy for FTP).
      - **W' (W Prime):** The curvature constant representing anaerobic work capacity (Joules).

### 3.2. LTHR (Lactate Threshold Heart Rate) Detection

LTHR is treated as a biometric state, not a performance curve output.

**Algorithm:**

1.  **Trigger:** After `processFitFile` calculates `best_efforts` for a new activity.
2.  **Detection:** Check if the activity contains a valid 20-minute steady-state effort.
    - Calculate average HR for that 20-minute window.
    - _Estimated LTHR_ = 20min Avg HR \* 0.95.
3.  **Comparison:**
    - Fetch the latest `lthr` record from `profile_metrics`.
    - **Condition:** IF (New Estimated LTHR > Current LTHR) OR (Current LTHR is null).
4.  **Action:** Insert new record into `profile_metrics` with `metric_type = 'lthr'`.

## 4. Implementation Plan

### Phase 1: Database Cleanup

1.  Create migration to drop `profile_performance_metric_logs`.
2.  Ensure `activity_efforts` has appropriate indexes for aggregation queries (filtering by date + type + duration).

### Phase 2: Core Logic (`@repo/core`)

1.  **New Module:** `packages/core/calculations/critical-power.ts`
    - Implement `calculateSeasonBestCurve(efforts: BestEffort[])`.
    - Implement `calculateCriticalPower(seasonBestCurve: BestEffort[])` returning `{ cp: number, wPrime: number }`.
2.  **Update Module:** `packages/core/calculations/threshold-detection.ts`
    - Ensure LTHR detection logic is robust and separated from FTP logic.

### Phase 3: API Layer (`@repo/trpc`)

1.  **New Router:** `analytics.ts` (or update `profile.ts`)
    - Endpoint: `getPowerCurve`: Returns the aggregated max efforts for the requested time window.
    - Endpoint: `getEstimatedFTP`: Returns the calculated CP based on the power curve.
2.  **Update Router:** `fit-files.ts`
    - Remove any code inserting into `profile_performance_metric_logs`.
    - Ensure `activity_efforts` are bulk inserted correctly.
    - Implement the "Check & Update" logic for LTHR into `profile_metrics`.

### Phase 4: Frontend Updates

1.  Update charts to fetch data from the new `getPowerCurve` endpoint.
2.  Update profile settings to display calculated FTP (read-only or overrideable) vs stored LTHR.

## 5. Example Data Flow

**Scenario: User wants to see their FTP.**

1.  Frontend calls `trpc.analytics.getEstimatedFTP`.
2.  Backend queries `activity_efforts` (last 90 days, bike, power).
3.  Backend computes:
    - Best 3min: 350W
    - Best 5min: 320W
    - Best 12min: 280W
    - Best 20min: 260W
4.  Backend runs CP regression.
5.  Result: `CP = 245W`, `W' = 18,000J`.
6.  Returns `245` as the estimated FTP.

**Scenario: User uploads a hard run.**

1.  `processFitFile` runs.
2.  Calculates best 20min HR = 180bpm.
3.  Estimates LTHR = 171bpm.
4.  Checks `profile_metrics`: Current LTHR = 168bpm.
5.  Since 171 > 168, inserts `{ type: 'lthr', value: 171 }` into `profile_metrics`.
