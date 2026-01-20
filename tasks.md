# Performance Metrics Platform - Implementation Tasks

**Goal:** Separate athlete capabilities from activity data, enabling temporal metric lookups, retroactive recalculation, and intelligent defaults.

**Architecture:** Database → Core Package (calculations) → tRPC API → Mobile/Web Apps

---

## Phase 1: Database Schema & Migrations

### 1.1 Profile Performance Metric Logs Table
- [ ] Create migration file: `packages/supabase/migrations/YYYYMMDDHHMMSS_create_profile_performance_metric_logs.sql`
- [ ] Define enums: `performance_metric_type`, `performance_metric_source`, `activity_category`
- [ ] Create table with columns:
  - [ ] Identity: `id`, `profile_id` (FK to profiles)
  - [ ] Metrics: `category`, `type`, `value`, `unit`, `duration_seconds`
  - [ ] Provenance: `source`, `reference_activity_id` (FK to activities)
  - [ ] Timestamps: `recorded_at`, `created_at`, `updated_at`
- [ ] Add CHECK constraints (value > 0, duration > 0)
- [ ] Create indexes:
  - [ ] `idx_profile_performance_metric_logs_profile_category_type_duration`
  - [ ] `idx_profile_performance_metric_logs_recorded_at`
  - [ ] `idx_profile_performance_metric_logs_reference_activity`
- [ ] Enable Row Level Security (RLS)
- [ ] Create RLS policies (SELECT, INSERT, UPDATE, DELETE for own profile)
- [ ] **CRITICAL**: Ensure schema supports power curves (multiple duration_seconds for power)
- [ ] **CRITICAL**: Ensure schema supports pace curves (400m, 1mi, 5k, 10k, etc.)
- [ ] **CRITICAL**: Ensure schema supports HR thresholds (LTHR for different durations)

### 1.2 Profile Metric Logs Table
- [ ] Create migration file: `packages/supabase/migrations/YYYYMMDDHHMMSS_create_profile_metric_logs.sql`
- [ ] Define enums: `profile_metric_type`, `metric_source`
- [ ] Create table with columns (see spec.md lines 119-151)
- [ ] Add CHECK constraints (value >= 0)
- [ ] Create indexes:
  - [ ] `idx_profile_metric_logs_profile_type_date`
  - [ ] `idx_profile_metric_logs_recorded_at`
  - [ ] `idx_profile_metric_logs_reference_activity`
- [ ] Enable RLS
- [ ] Create RLS policies (SELECT, INSERT, UPDATE, DELETE for own profile)

### 1.3 Update Supabase Types
- [ ] Run migration: `cd packages/supabase && pnpm run supabase migration up`
- [ ] Generate types: `pnpm run generate-types`
- [ ] Verify new types in `packages/supabase/types/database.ts`
- [ ] Export types from `packages/supabase/index.ts`

---

## Phase 2: Core Package Implementation

### 2.1 Performance Metric Schemas
- [ ] Create `packages/core/schemas/performance-metrics.ts`
- [ ] Define Zod schemas:
  - [ ] `performanceMetricCategorySchema` (bike, run, swim, row, other)
  - [ ] `performanceMetricTypeSchema` (power, pace, heart_rate)
  - [ ] `performanceMetricSourceSchema` (manual, calculated, estimated)
  - [ ] `performanceMetricLogSchema` (full object)
  - [ ] `createPerformanceMetricInputSchema` (for API input)
- [ ] Infer TypeScript types from schemas
- [ ] Export schemas and types

### 2.2 Profile Metric Schemas
- [ ] Create `packages/core/schemas/profile-metrics.ts`
- [ ] Define Zod schemas:
  - [ ] `profileMetricTypeSchema` (weight_kg, resting_hr_bpm, sleep_hours, hrv_ms, etc.)
  - [ ] `metricSourceSchema` (manual, device, calculated, estimated)
  - [ ] `profileMetricLogSchema` (full object)
  - [ ] `createProfileMetricInputSchema` (for API input)
- [ ] Infer TypeScript types from schemas
- [ ] Export schemas and types

### 2.3 Intelligent Defaults
- [ ] Create `packages/core/estimation/defaults.ts`
- [ ] **Power Estimation:**
  - [ ] Implement `estimateFTPFromWeight(weightKg: number)`
    - [ ] Use 2.5 W/kg for recreational cyclists
    - [ ] Return `{ value: number; source: 'estimated' }`
  - [ ] Implement `estimateFTPFromRecentActivities(activities: Activity[])`
    - [ ] Find best 20-min power from last 90 days
    - [ ] Apply 0.95 multiplier
    - [ ] Return `{ value: number; source: 'estimated'; confidence: number }`
- [ ] **Heart Rate Estimation:**
  - [ ] Implement `estimateMaxHR(age: number)`
    - [ ] Use 220 - age formula
    - [ ] Return `{ value: number; source: 'estimated' }`
  - [ ] Implement `estimateLTHR(maxHR: number)`
    - [ ] Use 85% of max HR for lactate threshold
    - [ ] Return `{ value: number; source: 'estimated' }`
  - [ ] Implement `estimateLTHRFromRecentActivities(activities: Activity[])`
    - [ ] Find average HR during sustained efforts (20-60 min)
    - [ ] Return `{ value: number; source: 'estimated'; confidence: number }`
- [ ] **Pace Estimation:**
  - [ ] Implement `estimateThresholdPaceFromFitnessLevel(fitnessLevel: 'beginner' | 'intermediate' | 'advanced')`
    - [ ] Map: beginner=360s/km, intermediate=300s/km, advanced=240s/km
    - [ ] Return `{ value: number; source: 'estimated' }`
  - [ ] Implement `estimateThresholdPaceFromRecentRuns(activities: Activity[])`
    - [ ] Use Riegel formula or recent race results
    - [ ] Return `{ value: number; source: 'estimated'; confidence: number }`
  - [ ] Implement `estimateCriticalVelocity(activities: Activity[])`
    - [ ] Find best pace for various distances (5k, 10k)
    - [ ] Calculate critical velocity (pace sustainable for ~1 hour)
    - [ ] Return `{ value: number; source: 'estimated'; confidence: number }`
- [ ] Add unit tests for all estimation functions

### 2.4 Temporal Metric Lookup
- [ ] Create `packages/core/utils/temporal-metrics.ts`
- [ ] Implement `getPerformanceMetricAtDate(metrics, date)`
  - [ ] Find most recent metric at or before date
  - [ ] Handle empty metrics array
  - [ ] Return null if no metric found
- [ ] Implement `getProfileMetricAtDate(metrics, date)`
  - [ ] Same logic as performance metrics
- [ ] Add unit tests for temporal lookups

### 2.5 Multi-Modal TSS Calculation
- [ ] Update `packages/core/calculations/tss.ts`
- [ ] **Power-Based TSS (existing):**
  - [ ] Modify `calculateTSSFromPower()` to accept:
    - [ ] `powerStream: number[]`
    - [ ] `timestamps: number[]`
    - [ ] `ftp: number`
    - [ ] `weight?: number` (for weight-adjusted calculations)
  - [ ] Return object with:
    - [ ] `tss: number`
    - [ ] `normalizedPower: number`
    - [ ] `intensityFactor: number`
    - [ ] `variabilityIndex: number`
- [ ] **Heart Rate-Based TSS (HRSS):**
  - [ ] Create `calculateHRSS()` function:
    - [ ] Accept: `hrStream: number[]`, `timestamps: number[]`, `lthr: number`, `maxHR: number`
    - [ ] Calculate time in HR zones (Coggan 5-zone model)
    - [ ] Weight zones: Z1=20, Z2=30, Z3=40, Z4=50, Z5=100 points/hour
    - [ ] Return: `{ hrss: number; avgHR: number; timeInZones: ZoneTime[] }`
  - [ ] Handle missing LTHR (estimate from maxHR)
  - [ ] Handle missing maxHR (estimate from age)
- [ ] **Pace-Based TSS (Running):**
  - [ ] Create `calculateRunningTSS()` function:
    - [ ] Accept: `paceStream: number[]` (seconds/km), `timestamps: number[]`, `thresholdPace: number`, `distance: number`
    - [ ] Calculate normalized graded pace (NGP) accounting for elevation
    - [ ] Calculate intensity factor: NGP / threshold pace
    - [ ] Formula: `TSS = (duration_hours * IF^2) * 100`
    - [ ] Return: `{ tss: number; normalizedPace: number; intensityFactor: number }`
  - [ ] Handle missing threshold pace (estimate from recent runs)
- [ ] **Pace-Based TSS (Swimming):**
  - [ ] Create `calculateSwimmingTSS()` function:
    - [ ] Accept: `paceStream: number[]` (seconds/100m), `timestamps: number[]`, `thresholdPace: number`
    - [ ] Calculate normalized pace
    - [ ] Calculate intensity factor
    - [ ] Return: `{ tss: number; normalizedPace: number; intensityFactor: number }`
- [ ] **Universal TSS Wrapper:**
  - [ ] Create `calculateTSSFromAvailableData()` function:
    - [ ] Priority order: Power → Heart Rate → Pace
    - [ ] Accept all streams and thresholds (optional)
    - [ ] Return best TSS calculation with data source indicator
    - [ ] Return: `{ tss: number; source: 'power' | 'hr' | 'pace'; confidence: 'high' | 'medium' | 'low' }`
- [ ] Add unit tests for all TSS calculation methods

### 2.6 Performance Curves (Power, Pace, HR)
- [ ] Create `packages/core/calculations/curves.ts`
- [ ] **Power Curve:**
  - [ ] Implement `calculatePowerCurve(powerStream: number[], timestamps: number[])`
    - [ ] Calculate max average power for: 5s, 30s, 1min, 5min, 10min, 20min, 30min, 60min
    - [ ] Return: `{ duration: number; power: number }[]`
  - [ ] Implement `analyzePowerCurve(curve: PowerCurve)`
    - [ ] Identify athlete phenotype: sprinter, time-trialist, all-rounder
    - [ ] Calculate power-duration model coefficients
    - [ ] Return: `{ phenotype: string; w_prime: number; cp: number }`
- [ ] **Pace Curve:**
  - [ ] Implement `calculatePaceCurve(paceStream: number[], timestamps: number[])`
    - [ ] Calculate best pace for: 400m, 800m, 1mi, 5k, 10k, half-marathon
    - [ ] Return: `{ distance: number; pace: number }[]`
  - [ ] Implement `analyzePaceCurve(curve: PaceCurve)`
    - [ ] Identify runner type: sprinter, middle-distance, endurance
    - [ ] Calculate Riegel exponent (performance decay)
    - [ ] Return: `{ runnerType: string; riegelExponent: number; predictedTimes: Record<string, number> }`
- [ ] **Heart Rate Curve:**
  - [ ] Implement `calculateHRCurve(hrStream: number[], timestamps: number[])`
    - [ ] Calculate max sustained HR for: 1min, 5min, 20min, 60min
    - [ ] Return: `{ duration: number; hr: number }[]`
  - [ ] Implement `analyzeHRCurve(curve: HRCurve, maxHR: number)`
    - [ ] Calculate HR zones from curve
    - [ ] Identify HR response characteristics
    - [ ] Return: `{ zones: HRZone[]; hrResponse: 'fast' | 'normal' | 'slow' }`
- [ ] Add unit tests for curve calculations and analysis

### 2.7 Test Effort Detection (Multi-Modal)
- [ ] Create `packages/core/detection/power-tests.ts`
- [ ] **Power Test Detection:**
  - [ ] Implement `detectPowerTestEfforts(powerStream, timestamps)`
    - [ ] Detect 20-minute max effort → FTP (multiply by 0.95)
    - [ ] Detect 5-minute max effort → VO2max power
    - [ ] Detect 1-minute max effort → Anaerobic power
    - [ ] Detect 5-second max → Neuromuscular power
    - [ ] Return array of `TestEffortSuggestion[]`
  - [ ] Implement `findMaxAveragePower(powerStream, timestamps, durationSeconds)`
    - [ ] Sliding window to find max average for duration
    - [ ] Return `{ avgPower, startIndex, endIndex }` or null
- [ ] Create `packages/core/detection/pace-tests.ts`
- [ ] **Running Test Detection:**
  - [ ] Implement `detectRunningTestEfforts(paceStream, timestamps, distance)`
    - [ ] Detect 5k time trial → threshold pace
    - [ ] Detect 10k time trial → lactate threshold
    - [ ] Detect tempo runs (sustained effort)
    - [ ] Detect interval sessions (repeated hard efforts)
    - [ ] Return array of `TestEffortSuggestion[]`
  - [ ] Implement `findBestPaceForDistance(paceStream, timestamps, targetDistance)`
    - [ ] Find best sustained pace for specific distance
    - [ ] Return `{ pace, duration, distance }`
- [ ] Create `packages/core/detection/hr-tests.ts`
- [ ] **Heart Rate Test Detection:**
  - [ ] Implement `detectHRTestEfforts(hrStream, timestamps)`
    - [ ] Detect lactate threshold tests (20-30 min sustained)
    - [ ] Detect max HR tests (short hard efforts)
    - [ ] Detect ramp tests (progressive increase)
    - [ ] Return array of `TestEffortSuggestion[]`
  - [ ] Implement `findLTHRFromActivity(hrStream, timestamps)`
    - [ ] Analyze HR data to estimate LTHR
    - [ ] Return `{ lthr: number; confidence: number }`
- [ ] Add unit tests for all test detection functions

### 2.8 Core Package Tests (Comprehensive)
- [ ] **Estimation Tests:**
  - [ ] Test `estimateFTPFromWeight()` with various weights
  - [ ] Test `estimateFTPFromRecentActivities()` with activity data
  - [ ] Test `estimateMaxHR()` and `estimateLTHR()` with various ages
  - [ ] Test `estimateThresholdPace()` with all fitness levels
  - [ ] Test `estimateCriticalVelocity()` with race results
- [ ] **Temporal Lookup Tests:**
  - [ ] Test `getPerformanceMetricAtDate()` with various scenarios
  - [ ] Test edge cases (no metrics, future dates, etc.)
- [ ] **TSS Calculation Tests:**
  - [ ] Test `calculateTSSFromPower()` with power streams
  - [ ] Test `calculateHRSS()` with HR streams
  - [ ] Test `calculateRunningTSS()` with pace streams
  - [ ] Test `calculateSwimmingTSS()` with swim pace
  - [ ] Test `calculateTSSFromAvailableData()` with various data combinations
  - [ ] Verify fallback logic (power → HR → pace)
- [ ] **Curve Analysis Tests:**
  - [ ] Test `calculatePowerCurve()` with various power profiles
  - [ ] Test `calculatePaceCurve()` with running data
  - [ ] Test `calculateHRCurve()` with HR data
  - [ ] Test phenotype identification accuracy
- [ ] **Test Detection Tests:**
  - [ ] Test `detectPowerTestEfforts()` with real power data
  - [ ] Test `detectRunningTestEfforts()` with run data
  - [ ] Test `detectHRTestEfforts()` with HR data
  - [ ] Verify suggestion confidence levels
- [ ] Ensure 100% coverage for all calculations

---

## Phase 3: tRPC API Layer

### 3.1 Profile Performance Metrics Router
- [ ] Create `packages/trpc/src/routers/profile-performance-metrics.ts`
- [ ] Implement procedures:
  - [ ] `list` - Get all performance logs with filtering
    - [ ] Input: category, type, limit, offset
    - [ ] Query Supabase with filters
    - [ ] Return paginated results
  - [ ] `getById` - Retrieve specific log
    - [ ] Input: id (UUID)
    - [ ] Query single record
    - [ ] Return log or throw error
  - [ ] `getAtDate` - **CRITICAL** Get metric at specific date
    - [ ] Input: category, type, durationSeconds (optional), date
    - [ ] Query most recent metric at or before date
    - [ ] Return metric or null
  - [ ] `getForDateRange` - Get all metrics in date range
    - [ ] Input: category (optional), type (optional), startDate, endDate
    - [ ] Query with date range filter
    - [ ] Return array of metrics
  - [ ] `create` - Add new performance log
    - [ ] Input: createPerformanceMetricInputSchema
    - [ ] Validate profileId matches session.user.id
    - [ ] Insert into database
    - [ ] Return created log
  - [ ] `update` - Modify existing log
    - [ ] Input: id, updates
    - [ ] Verify ownership
    - [ ] Update record
    - [ ] Return updated log
  - [ ] `delete` - Hard delete (or soft delete with is_active)
    - [ ] Input: id
    - [ ] Verify ownership
    - [ ] Delete record
    - [ ] Return success

### 3.2 Profile Metrics Router
- [ ] Create `packages/trpc/src/routers/profile-metrics.ts`
- [ ] Implement procedures:
  - [ ] `list` - Get all profile logs with filtering
    - [ ] Input: metricType, startDate, endDate, limit, offset
    - [ ] Query Supabase with filters
    - [ ] Return paginated results
  - [ ] `getById` - Retrieve specific log
  - [ ] `getAtDate` - **CRITICAL** Get metric at specific date
    - [ ] Input: metricType, date
    - [ ] Query most recent metric at or before date
    - [ ] Return metric or null
  - [ ] `getForDateRange` - Get all biometrics in date range
  - [ ] `create` - Add new profile metric log
    - [ ] Input: createProfileMetricInputSchema
    - [ ] Validate profileId matches session.user.id
    - [ ] Insert into database
    - [ ] Return created log
  - [ ] `update` - Modify existing log
  - [ ] `delete` - Hard delete

### 3.3 Update Activities Router (Multi-Modal TSS)
- [ ] Update `packages/trpc/src/routers/activities.ts`
- [ ] Add `calculateMetrics` mutation with intelligent fallback:
  - [ ] **Data Fetching:**
    - [ ] Input: activityId
    - [ ] Fetch activity from database
    - [ ] Fetch JSON from Supabase Storage (contains all streams)
    - [ ] Parse activity JSON to extract: powerStream, hrStream, paceStream, timestamps
  - [ ] **Metric Lookup (Temporal):**
    - [ ] Get FTP at activity date (if bike/power activity)
    - [ ] Get LTHR at activity date (for all activities)
    - [ ] Get maxHR at activity date (for HR-based calculations)
    - [ ] Get threshold pace at activity date (if run activity)
    - [ ] Get weight at activity date (for weight-adjusted calculations)
  - [ ] **Intelligent Defaults (if metrics missing):**
    - [ ] If no FTP: estimate from weight or recent activities
    - [ ] If no LTHR: estimate from age and maxHR
    - [ ] If no threshold pace: estimate from recent runs or fitness level
    - [ ] Store estimated metrics with source='estimated'
  - [ ] **Multi-Modal TSS Calculation:**
    - [ ] Try power-based TSS (if powerStream exists and FTP available)
    - [ ] Fallback to HRSS (if hrStream exists and LTHR available)
    - [ ] Fallback to pace-based TSS (if paceStream exists and threshold pace available)
    - [ ] Log which method was used
  - [ ] **Performance Curves:**
    - [ ] Calculate power curve (if powerStream exists)
    - [ ] Calculate pace curve (if run activity with paceStream)
    - [ ] Calculate HR curve (if hrStream exists)
    - [ ] Store curves in activity metrics JSONB
  - [ ] **Test Effort Detection:**
    - [ ] Detect power tests (if powerStream)
    - [ ] Detect running tests (if run activity)
    - [ ] Detect HR tests (if hrStream)
    - [ ] Create suggestions for all detected improvements
  - [ ] **Update Activity:**
    - [ ] Store calculated metrics in activity.metrics JSONB:
      - [ ] tss, source ('power' | 'hr' | 'pace')
      - [ ] normalized power/pace/HR (depending on source)
      - [ ] intensity factor
      - [ ] power_curve / pace_curve / hr_curve
    - [ ] Update activity record
  - [ ] Return: `{ metrics, curves, suggestions, calculationSource }`

### 3.4 Metric Suggestions Router (Optional for Phase 3)
- [ ] Create `packages/trpc/src/routers/metric-suggestions.ts`
- [ ] Implement procedures:
  - [ ] `getForActivity` - Get suggestions for activity
  - [ ] `create` - Create new suggestion
  - [ ] `approve` - Approve suggestion and create metric log
  - [ ] `reject` - Reject suggestion

### 3.5 Register Routers
- [ ] Update `packages/trpc/src/root.ts`
- [ ] Add `profilePerformanceMetrics: profilePerformanceMetricsRouter`
- [ ] Add `profileMetrics: profileMetricsRouter`
- [ ] Add `metricSuggestions: metricSuggestionsRouter` (if implemented)
- [ ] Export updated `AppRouter` type

### 3.6 tRPC Integration Tests
- [ ] Test `profilePerformanceMetrics.create()` creates log
- [ ] Test `profilePerformanceMetrics.getAtDate()` returns correct metric
- [ ] Test `profileMetrics.create()` creates log
- [ ] Test `profileMetrics.getAtDate()` returns correct metric
- [ ] Test `activities.calculateMetrics()` end-to-end
- [ ] Test authentication (unauthorized access should fail)
- [ ] Test RLS policies (users can only access own data)

---

## Phase 4: Data Migration

### 4.1 Seed Initial Metrics from Profiles (Multi-Modal)
- [ ] Create `scripts/seed-initial-metrics.ts`
- [ ] Use Supabase service role key for admin access
- [ ] Query all profiles with `ftp`, `threshold_hr`, `lthr`, `max_hr`, `threshold_pace`, `weight_kg`, `age`
- [ ] For each profile:
  - [ ] **Power Metrics:**
    - [ ] Create FTP metric (if exists) - duration: 3600s
    - [ ] Set category based on primary sport
  - [ ] **Heart Rate Metrics:**
    - [ ] Create threshold HR / LTHR metric (if exists) - duration: 3600s
    - [ ] Create max HR metric (if exists) - duration: 0s (max)
    - [ ] If missing, estimate from age
  - [ ] **Pace Metrics:**
    - [ ] Create threshold pace metric (if exists) - duration: 3600s
    - [ ] Set category to 'run'
  - [ ] **Profile Metrics:**
    - [ ] Create weight metric (if exists)
    - [ ] Create age metric (if exists)
  - [ ] Set `recorded_at` to profile.created_at
  - [ ] Set `source` to 'manual'
  - [ ] Add note: "Migrated from profile.{field}"
- [ ] **Generate Curves from Historical Data:**
  - [ ] For users with >10 activities, calculate initial curves
  - [ ] Store best efforts for each duration/distance
- [ ] Log progress and errors
- [ ] Run script: `tsx scripts/seed-initial-metrics.ts`
- [ ] Verify data in database

### 4.2 Backfill from Activity Profile Snapshots (Optional)
- [ ] Create `scripts/backfill-from-snapshots.ts`
- [ ] Query all activities with `profile_snapshot` field
- [ ] Extract unique metric values per profile over time
- [ ] Deduplicate metrics (same value = same metric)
- [ ] Insert deduplicated metrics into metric logs tables
- [ ] Set `recorded_at` to activity.start_time
- [ ] Add note: "Backfilled from activity snapshot"
- [ ] Run script: `tsx scripts/backfill-from-snapshots.ts`
- [ ] Verify data in database

---

## Phase 5: Mobile App Integration

### 5.1 Update Activity Submission
- [ ] Update `apps/mobile/lib/services/ActivityRecorder/index.ts`
- [ ] **Remove** profile_snapshot from activity data object
- [ ] Store only `profile_id` reference
- [ ] After activity upload, trigger TSS calculation:
  - [ ] Call `trpc.activities.calculateMetrics.mutate({ activityId })`
  - [ ] Handle async calculation (activity appears immediately, metrics appear within seconds)
- [ ] Add loading state for metrics calculation
- [ ] Show error if calculation fails

### 5.2 Manual Metric Entry UI
- [ ] Create `apps/mobile/components/metrics/PerformanceMetricForm.tsx`
- [ ] Form inputs:
  - [ ] FTP (watts) - number input
  - [ ] Threshold HR (bpm) - number input
  - [ ] Sport category selector (bike, run, etc.)
- [ ] Use `trpc.profilePerformanceMetrics.create.useMutation()`
- [ ] Show success toast on save
- [ ] Invalidate metrics queries after save
- [ ] Handle validation errors

- [ ] Create `apps/mobile/components/metrics/ProfileMetricForm.tsx`
- [ ] Form inputs:
  - [ ] Weight (kg) - number input
  - [ ] Resting HR (bpm) - number input
  - [ ] Sleep hours - number input
  - [ ] HRV (ms) - number input
- [ ] Use `trpc.profileMetrics.create.useMutation()`
- [ ] Show success toast on save

### 5.3 Onboarding Flow
- [ ] Create onboarding screen: `apps/mobile/app/(auth)/onboarding.tsx`
- [ ] Step 1: Collect required info (weight, age)
- [ ] Step 2: Optional metrics entry
  - [ ] Show PerformanceMetricForm
  - [ ] Show ProfileMetricForm
  - [ ] Allow skip
- [ ] On completion, navigate to main app
- [ ] Store onboarding completion flag

### 5.4 Metric Suggestions UI
- [ ] Create `apps/mobile/components/metrics/MetricSuggestions.tsx`
- [ ] Query suggestions: `trpc.metricSuggestions.getForActivity.useQuery({ activityId })`
- [ ] Display suggestions as cards:
  - [ ] Show metric type (e.g., "New FTP: 250W")
  - [ ] Show improvement percentage
  - [ ] Show detection method (e.g., "20min test * 0.95")
  - [ ] Show confidence level
- [ ] Approve button:
  - [ ] Call `trpc.metricSuggestions.approve.mutate({ id })`
  - [ ] Show success toast
  - [ ] Invalidate metrics queries
  - [ ] Remove suggestion from list
- [ ] Reject/dismiss button

### 5.5 Capability Overview Screen (Enhanced)
- [ ] Create `apps/mobile/app/(internal)/(tabs)/profile/capabilities.tsx`
- [ ] **Current Metrics Display:**
  - [ ] FTP (bike) - show watts and W/kg
  - [ ] Threshold HR (bike/run) - show bpm and % of max
  - [ ] Threshold pace (run) - show min/km or min/mi
  - [ ] Weight - show kg or lbs
  - [ ] Recent HRV/sleep trends
  - [ ] Show metric source badge (manual, test, estimated)
  - [ ] Show last updated date
- [ ] **Performance Curves:**
  - [ ] Power curve chart (5s to 60min) if cyclist
  - [ ] Pace curve chart (400m to half-marathon) if runner
  - [ ] HR curve chart (1min to 60min)
  - [ ] Athlete phenotype badge (e.g., "Time Trialist", "Endurance Runner")
  - [ ] Critical power / critical velocity display
- [ ] **Actions:**
  - [ ] Button to manually update metrics
  - [ ] Button to view full metric history
  - [ ] Button to recalculate curves from recent activities
- [ ] **Metric History:**
  - [ ] Timeline chart showing metric progression
  - [ ] Filter by metric type
  - [ ] Show confidence level for estimated metrics

### 5.6 Performance Curve Components
- [ ] Create `apps/mobile/components/metrics/PowerCurveChart.tsx`
  - [ ] Display power curve as line chart (duration vs power)
  - [ ] Highlight key durations (5min, 20min, 60min)
  - [ ] Show athlete phenotype based on curve shape
  - [ ] Compare to historical curves (show improvement)
- [ ] Create `apps/mobile/components/metrics/PaceCurveChart.tsx`
  - [ ] Display pace curve as line chart (distance vs pace)
  - [ ] Highlight key distances (5k, 10k, half-marathon)
  - [ ] Show predicted race times based on curve
  - [ ] Compare to historical curves
- [ ] Create `apps/mobile/components/metrics/HRCurveChart.tsx`
  - [ ] Display HR curve as line chart (duration vs HR)
  - [ ] Show HR zones derived from curve
  - [ ] Indicate HR response type (fast/normal/slow)
  - [ ] Compare to historical curves
- [ ] Create `apps/mobile/components/metrics/MetricComparisonView.tsx`
  - [ ] Compare current vs previous metrics
  - [ ] Show percentage improvements
  - [ ] Highlight significant changes
  - [ ] Filter by sport category

### 5.7 Mobile Testing
- [ ] Test activity submission without profile_snapshot
- [ ] Test TSS calculation triggered after upload
- [ ] Test manual metric entry (performance and profile)
- [ ] Test onboarding flow
- [ ] Test metric suggestions approval/rejection
- [ ] Test capability overview screen
- [ ] Test offline scenario (metrics cached)

---

## Phase 6: Testing & Quality Assurance

### 6.1 Core Package Tests
- [ ] Run all core package tests: `cd packages/core && pnpm test`
- [ ] Verify 100% coverage for calculations
- [ ] Add edge case tests (zero values, nulls, extreme values)

### 6.2 tRPC Integration Tests
- [ ] Test CRUD operations for performance metrics
- [ ] Test CRUD operations for profile metrics
- [ ] Test temporal queries (getAtDate)
- [ ] Test activity metrics calculation end-to-end
- [ ] Test authentication and authorization
- [ ] Test RLS policies

### 6.3 Mobile E2E Tests (Manual)
- [ ] Record activity → verify no profile_snapshot in data
- [ ] Upload activity → verify TSS calculated
- [ ] View activity → verify metrics displayed
- [ ] Enter manual FTP → verify stored and used
- [ ] Complete test effort → verify suggestion appears
- [ ] Approve suggestion → verify metric updated
- [ ] View capability screen → verify all metrics shown

### 6.4 Performance Testing
- [ ] Benchmark metric log query (should be <10ms)
- [ ] Benchmark TSS calculation with metric lookup (should be <50ms)
- [ ] Benchmark CTL/ATL/TSB query for 100 activities (should be <50ms)
- [ ] Test with 1000+ activities per user
- [ ] Verify indexes are used (check query plans)

---

## Phase 7: Documentation & Cleanup

### 7.1 Update CLAUDE.md
- [ ] Add section on Performance Metrics Platform
- [ ] Document temporal metrics architecture
- [ ] Document metric lookup patterns
- [ ] Add code examples for using metrics in code

### 7.2 API Documentation
- [ ] Document tRPC routers in README or docs
- [ ] Add JSDoc comments to all public procedures
- [ ] Document input/output schemas
- [ ] Add usage examples

### 7.3 Migration Documentation
- [ ] Document migration process
- [ ] Document rollback strategy (if needed)
- [ ] Document data integrity checks
- [ ] Document fallback strategies

### 7.4 Deprecation (Future Phase)
- [ ] Mark `profile_snapshot` field as deprecated in schema
- [ ] Add deprecation warnings to API documentation
- [ ] Update client applications to stop using deprecated fields
- [ ] Plan for profile_snapshot removal (Phase 7 in spec.md)

---

## Success Criteria Checklist

### Functionality
- [ ] Activities submitted without profile_snapshot
- [ ] TSS calculated using temporal metric lookups
- [ ] Intelligent defaults generated when metrics missing
- [ ] Metric suggestions created from test effort detection
- [ ] All existing functionality preserved

### Performance
- [ ] Metric log query: <10ms
- [ ] Activity TSS calculation: <50ms
- [ ] CTL/ATL/TSB query (100 activities): <50ms

### Quality
- [ ] All tests passing
- [ ] 100% coverage for core calculations
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Documentation complete

### Data Integrity
- [ ] All historical data migrated successfully
- [ ] No data loss during migration
- [ ] Metrics properly attributed (source, timestamps)
- [ ] RLS policies enforced

---

## Priority Order (Recommended)

**Week 1:**
1. Phase 1: Database Schema & Migrations
2. Phase 2.1-2.3: Core Package (schemas, defaults)
3. Phase 4.1: Seed initial metrics

**Week 2:**
4. Phase 2.4-2.6: Core Package (temporal lookups, TSS, detection)
5. Phase 3.1-3.3: tRPC API Layer (routers)
6. Phase 3.6: tRPC Integration Tests

**Week 3:**
7. Phase 5.1-5.2: Mobile App (activity submission, manual entry)
8. Phase 5.4: Metric Suggestions UI
9. Phase 6.1-6.2: Core & tRPC Testing

**Week 4:**
10. Phase 5.3: Onboarding Flow
11. Phase 5.5: Capability Overview Screen
12. Phase 6.3-6.4: Mobile E2E & Performance Testing
13. Phase 7: Documentation

---

## Notes

- **Database-first approach**: Complete Phase 1 and 4.1 before moving to core/tRPC
- **Core package independence**: Ensure no database imports in core package
- **Testing as you go**: Write tests alongside implementation, not after
- **Mobile UI last**: UI components depend on API being complete
- **Incremental deployment**: Can deploy phases 1-3 without breaking existing functionality

## Critical Path

The critical path for this implementation is:
1. Database migrations → 2. Core package schemas → 3. tRPC API → 4. Mobile integration

Each phase depends on the previous one. Do not skip ahead without completing dependencies.
