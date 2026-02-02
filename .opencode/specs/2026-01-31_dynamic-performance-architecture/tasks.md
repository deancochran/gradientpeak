# Implementation Plan: Dynamic Performance Architecture

## Phase 1: Database Cleanup

- [x] **Task 1.1:** Update `init.sql` to remove `profile_performance_metric_logs`.
  - Removed table definition.
  - Removed `performance_metric_type` enum.
  - Verified `activity_efforts` and `profile_metrics` exist.

## Phase 2: Core Logic (`@repo/core`)

- [x] **Task 2.1:** Implement Critical Power Calculation.
  - File: `packages/core/calculations/critical-power.ts`
  - **Function:** `calculateSeasonBestCurve(efforts: BestEffort[])`
    - Filter inputs: `activity_category = 'bike'`, `effort_type = 'power'`, `recorded_at > (NOW - 90 DAYS)`.
    - Logic: Aggregate max value for each distinct duration across all activities.
  - **Function:** `calculateCriticalPower(seasonBestCurve: BestEffort[])`
    - Algorithm: Monod & Scherrer (2-parameter model).
    - Input Range: Filter efforts between **3 minutes and 30 minutes** to avoid anaerobic skew and aerobic drift.
    - Output: `{ cp: number, wPrime: number }`.
- [x] **Task 2.2:** Update Threshold Detection.
  - File: `packages/core/calculations/threshold-detection.ts`
  - **Function:** `detectLTHR(stream: ActivityStream)`
    - Logic: Find best 20-minute steady-state HR.
    - Calculation: `Estimated LTHR = 20min Avg HR * 0.95`.
  - **Cleanup:** Remove `detectFTP` (FTP is now derived via CP curve).

## Phase 3: API Layer (`@repo/trpc`)

- [x] **Task 3.1:** Create `analytics` router.
  - File: `packages/trpc/src/routers/analytics.ts`
  - **Endpoint:** `getSeasonBestCurve`
    - Input: `activity_category`, `effort_type`, `days` (default 90).
    - Logic: Query `activity_efforts` -> Return Season Best curve.
  - **Endpoint:** `predictPerformance`
    - Input: `activity_category`, `effort_type`, `duration`.
    - Logic: Fetch Season Best curve -> Run `calculateCriticalPower` -> Predict value for duration.
    - Returns: `{ predicted_value, unit, model }`.
- [x] **Task 3.2:** Update `fit-files` router.
  - File: `packages/trpc/src/routers/fit-files.ts`
  - **Cleanup:** Removed insertions into `profile_performance_metric_logs`.
  - **LTHR Logic:**
    - Calculate `newEstimatedLTHR` using `detectLTHR`.
    - Fetch current LTHR from `profile_metrics`.
    - **Condition:** IF (`newEstimatedLTHR` > `currentLTHR` OR `currentLTHR` is null) THEN Insert new `lthr` record into `profile_metrics`.
- [x] **Task 3.3:** Fix `planned_activities` router.
  - File: `packages/trpc/src/routers/planned_activities.ts`
  - Removed references to `profile_performance_metric_logs`.
  - Updated to fetch FTP from `activity_efforts` (best 20m power \* 0.95) and LTHR from `profile_metrics`.
- [x] **Task 3.4:** Fix `profiles` router.
  - File: `packages/trpc/src/routers/profiles.ts`
  - Removed references to `profile_performance_metric_logs`.
  - Updated to fetch FTP from `activity_efforts` and LTHR from `profile_metrics`.
- [x] **Task 3.5:** Cleanup Obsolete Files.
  - Removed `packages/core/schemas/performance-metrics.ts`.
  - Removed `packages/trpc/src/routers/profile-performance-metrics.ts`.

## Phase 4: Frontend Integration (Mobile/Web)

- [x] **Task 4.1:** Update Mobile Profile Screen.
  - File: `apps/mobile/app/(internal)/(standard)/profile-edit.tsx`
  - **Data Source:** Replaced static FTP fetch with `trpc.analytics.predictPerformance` (Duration: 3600s).
  - **Biometrics:** Replaced static LTHR fetch with `trpc.profileMetrics.getAtDate`.
  - **UI:** Updated to display "Estimated FTP" and "Threshold HR" as read-only calculated values.
  - **Cleanup:** Removed deprecated fields from form submission.
