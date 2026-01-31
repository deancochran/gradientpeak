# Implementation Plan: Dynamic Performance Architecture

## Phase 1: Database Cleanup

- [x] **Task 1.1:** Update `init.sql` to remove `profile_performance_metric_logs`.
  - Removed table definition.
  - Removed `performance_metric_type` enum.
  - Verified `activity_efforts` and `profile_metrics` exist.

## Phase 2: Core Logic (`@repo/core`)

- [ ] **Task 2.1:** Implement Critical Power Calculation.
  - File: `packages/core/calculations/critical-power.ts`
  - Implement `calculateSeasonBestCurve`: Aggregates a list of efforts to find max value per duration.
  - Implement `calculateCriticalPower`: Uses Monod & Scherrer model (Power vs 1/Time) to find CP and W'.
- [ ] **Task 2.2:** Update Threshold Detection.
  - File: `packages/core/calculations/threshold-detection.ts`
  - Refine `detectLTHR` to be pure calculation (input: stream, output: number).
  - Remove any FTP detection logic that relies on single-activity estimation (we will use the CP curve instead).

## Phase 3: API Layer (`@repo/trpc`)

- [ ] **Task 3.1:** Create `analytics` router.
  - File: `packages/trpc/src/routers/analytics.ts`
  - `getPowerCurve`: Query `activity_efforts` -> Aggregate Season Best.
  - `getCriticalPower`: Query `activity_efforts` -> Calculate CP/W'.
- [ ] **Task 3.2:** Update `fit-files` router.
  - File: `packages/trpc/src/routers/fit-files.ts`
  - Remove all references to `profile_performance_metric_logs`.
  - Ensure `activity_efforts` insertion is working (already done in previous phase, just verify).
  - Implement LTHR check-and-update logic using `profile_metrics`.

## Phase 4: Frontend Integration (Mobile/Web)

- [ ] **Task 4.1:** Update Profile/Trends screens.
  - Replace static FTP fetch with `trpc.analytics.getCriticalPower`.
  - Display LTHR from `profile_metrics`.
