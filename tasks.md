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

### 1.3 Update Supabase Types & Generate SupaZod Schemas
- [ ] Run migration: `cd packages/supabase && pnpm run supabase migration up`
- [ ] **Generate types and SupaZod schemas:** `pnpm run update:types`
  - [ ] This automatically generates:
    - [ ] TypeScript types in `packages/supabase/types/database.ts`
    - [ ] Zod schemas in `packages/supabase/supazod/` (auto-generated from database)
- [ ] Verify new types in `packages/supabase/types/database.ts`
- [ ] Verify new SupaZod schemas in `packages/supabase/supazod/`
- [ ] Export types from `packages/supabase/index.ts`
- [ ] **NOTE:** Core package schemas (Phase 2.1, 2.2) will extend/reference these auto-generated schemas

---

## Phase 2: Core Package Implementation

**IMPORTANT:** This phase builds on auto-generated SupaZod schemas from Phase 1.3. The `pnpm run update:types` command in the supabase package automatically generates Zod schemas from your database tables. Core package schemas should **extend** or **reference** these auto-generated schemas rather than redefining them.

**Pattern:**
```typescript
// Import auto-generated SupaZod schemas
import { performanceMetricLogSchema } from '@repo/supabase/supazod';

// Extend with custom validation or input schemas
export const createPerformanceMetricInputSchema = performanceMetricLogSchema
  .omit({ id: true, created_at: true, updated_at: true })
  .extend({
    // Add custom validation
    value: z.number().positive('Value must be positive'),
  });
```

### 2.1 Performance Metric Schemas
- [ ] Create `packages/core/schemas/performance-metrics.ts`
- [ ] **NOTE**: `pnpm run update:types` in supabase package automatically generates SupaZod schemas from database
- [ ] Import base schemas from `@repo/supabase/supazod` (auto-generated)
- [ ] Extend or reference SupaZod schemas:
  - [ ] Use generated `performanceMetricCategorySchema`, `performanceMetricTypeSchema`, `performanceMetricSourceSchema`
  - [ ] Extend with `createPerformanceMetricInputSchema` for API input validation
  - [ ] Add custom validation rules (e.g., value > 0, duration > 0)
- [ ] Infer TypeScript types from schemas
- [ ] Export schemas and types

### 2.2 Profile Metric Schemas
- [ ] Create `packages/core/schemas/profile-metrics.ts`
- [ ] **NOTE**: Import base schemas from auto-generated SupaZod (`@repo/supabase/supazod`)
- [ ] Extend SupaZod schemas:
  - [ ] Use generated `profileMetricTypeSchema`, `metricSourceSchema`
  - [ ] Extend with `createProfileMetricInputSchema` for API input
  - [ ] Add custom validation rules (e.g., weight > 0, age >= 0)
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

### 4.1 Seed Initial Metrics from Profiles (DEPRECATED - Skip this phase)
- [x] **DEPRECATED:** This phase is no longer applicable
- [x] **Reason:** Columns `ftp`, `threshold_hr`, and `weight_kg` have been removed from `profiles` table
- [x] **Migration Strategy Changed:**
  - Use Phase 4.2 (Backfill from Activity Snapshots) instead to extract historical metrics
  - New users will enter metrics during onboarding (Phase 5.3)
  - Existing users can update metrics in settings (Phase 5.7)
  - System will generate intelligent defaults if no metrics exist
- [x] **Note:** Skip directly to Phase 4.2 for data migration

### 4.2 Remove backward capabilitiesvfor  Activity Profile Snapshots (PRIMARY MIGRATION STRATEGY)
- [ ]  `profile_snapshot` `ftp` `weight_kg` and `threshold_hr` have been removed from teh activiteis and profile table. Tese values should be cehcked application wide to be colected from the profile metrics/profileperofrmance metrics tables
 

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


### 5.3 Comprehensive Onboarding Flow
- [ ] Create onboarding screen: `apps/mobile/app/(auth)/onboarding.tsx`
- [ ] **Step 1: Basic Profile Information (Required)**
  - [ ] Date of Birth (DOB) - date picker
  - [ ] Weight (kg or lbs) - number input with unit toggle
  - [ ] Gender - select (male/female/other) - for HR/power estimation
  - [ ] Primary sport - select (cycling/running/swimming/triathlon/other)
- [ ] **Step 2: Heart Rate Metrics (Optional but Recommended)**
  - [ ] Max Heart Rate (bpm) - number input
    - [ ] Show "Estimate" button → calculates 220 - age
    - [ ] Show explanation: "Your max HR during hardest effort"
  - [ ] Resting Heart Rate (bpm) - number input
    - [ ] Show tip: "Measure first thing in the morning"
  - [ ] Lactate Threshold HR (LTHR) - number input
    - [ ] Show "Estimate" button → calculates 85% of max HR
    - [ ] Show explanation: "HR you can sustain for ~1 hour"
- [ ] **Step 3: Sport-Specific Performance Metrics (Optional)**
  - [ ] **If cyclist/triathlete:**
    - [ ] FTP (Functional Threshold Power) - number input (watts)
      - [ ] Show "Estimate" button → 2.5 W/kg × weight
      - [ ] Show explanation: "Power you can sustain for ~1 hour"
    - [ ] VO2max - number input (ml/kg/min) - optional
  - [ ] **If runner:**
    - [ ] Threshold Pace - time input (min/km or min/mi)
      - [ ] Show "Estimate" button based on fitness level
      - [ ] Show explanation: "Pace you can sustain for ~1 hour"
    - [ ] VO2max - number input (ml/kg/min) - optional
  - [ ] **If swimmer:**
    - [ ] Threshold Pace - time input (min/100m)
      - [ ] Show explanation: "Pace you can sustain for ~1 hour"
- [ ] **Step 4: Activity & Equipment (Optional)**
  - [ ] Training frequency - select (1-2, 3-4, 5-6, 7+ days/week)
  - [ ] Equipment - multi-select (power meter, heart rate monitor, GPS watch, etc.)
  - [ ] Goals - multi-select (improve fitness, lose weight, race performance, etc.)
- [ ] **UI/UX:**
  - [ ] Multi-step wizard with progress indicator
  - [ ] "Skip" button on all optional steps
  - [ ] "Back" button for navigation
  - [ ] Real-time validation with helpful error messages
  - [ ] Info tooltips explaining each metric
  - [ ] "Estimate" buttons with clear formulas shown
- [ ] **On Completion:**
  - [ ] Create initial profile metrics in database (all entered values)
  - [ ] Mark onboarding as complete
  - [ ] Navigate to main app (activity feed or dashboard)
  - [ ] Show welcome message with next steps
- [ ] **Skip Handling:**
  - [ ] If user skips all optional steps, use intelligent defaults
  - [ ] Show in-app prompts to complete profile later
  - [ ] Highlight incomplete metrics in settings




## Critical Path

The critical path for this implementation is:
1. Database migrations → 2. Core package schemas → 3. tRPC API → 4. Mobile integration

Each phase depends on the previous one. Do not skip ahead without completing dependencies.
