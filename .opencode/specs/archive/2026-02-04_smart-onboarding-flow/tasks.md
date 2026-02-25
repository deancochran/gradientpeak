# Smart Onboarding Flow: Task Breakdown

## Quick Reference

**Files in this spec:**

- **[design.md](./design.md)** - Complete technical design, algorithms, data flow, experience paths
- **[plan.md](./plan.md)** - Phase-by-phase implementation guide with code examples
- **[tasks.md](./tasks.md)** (this file) - Granular task checklist for implementation
- **[abstractions.md](./ABSTRACTIONS.md)** - High-level abstractions and design patterns

---

## Overview

Granular task checklist for implementing the smart onboarding flow with intelligent metric derivation.

**How to use this file:**

1. Check off tasks as you complete them: `- [ ]` → `- [x]`
2. Update this file after every significant milestone
3. Reference task numbers when committing code (e.g., "Complete Task 1.1: Power Curve Derivation")

**Completion Status:** 0 / 60+ tasks completed

---

## Phase 1: Core Calculation Functions (`@repo/core`)

### Task 1.1: Power Curve Derivation

**File:** `packages/core/calculations/power-curve.ts`

- [ ] Create file with TypeScript boilerplate
- [ ] Define `DerivedEffort` interface
- [ ] Define `STANDARD_POWER_DURATIONS` constant
- [ ] Implement `derivePowerCurveFromFTP(ftp, wPrime)` function
  - [ ] Validate input parameters
  - [ ] Loop through standard durations
  - [ ] Apply Critical Power formula: `Power = CP + (W' / t)`
  - [ ] Return array of `DerivedEffort` objects
- [ ] Implement `estimateWPrime(weightKg, gender, trainingLevel)` function
  - [ ] Define baseline W' values by gender/training level
  - [ ] Scale by weight
  - [ ] Return estimated W' in joules
- [ ] Add JSDoc comments for all functions
- [ ] Export all functions and types

**Acceptance Criteria:**

- Function returns 10 power efforts for standard durations
- 60-minute effort equals input FTP
- 5-second effort is significantly higher (sprint power)
- All values are positive numbers

---

### Task 1.2: Speed Curve Derivation

**File:** `packages/core/calculations/speed-curve.ts`

- [ ] Create file with TypeScript boilerplate
- [ ] Define `STANDARD_SPEED_DURATIONS` constant
- [ ] Define `SPEED_MULTIPLIERS` constant (sprint, vo2max, threshold, tempo)
- [ ] Implement `paceToSpeed(secondsPerKm)` utility function
- [ ] Implement `speedToPace(metersPerSecond)` utility function
- [ ] Implement `deriveSpeedCurveFromThresholdPace(thresholdPaceSecondsPerKm)` function
  - [ ] Convert pace to speed (m/s)
  - [ ] Loop through standard durations
  - [ ] Apply multiplier based on duration category
  - [ ] Return array of `DerivedEffort` objects
- [ ] Add JSDoc comments for all functions
- [ ] Export all functions and types

**Acceptance Criteria:**

- Function returns 10 speed efforts for standard durations
- Shorter durations have higher speeds (sprint > threshold)
- Longer durations have lower speeds (tempo < threshold)
- All values are positive numbers

---

### Task 1.3: Swim Pace Curve Derivation

**File:** `packages/core/calculations/swim-pace-curve.ts`

- [ ] Create file with TypeScript boilerplate
- [ ] Define `STANDARD_SWIM_DURATIONS` constant (10, 20, 30, 60, 120, 180, 300, 600, 900, 1800 seconds)
- [ ] Define `SWIM_PACE_MULTIPLIERS` constant (sprint, middle, css, distance)
- [ ] Implement `pacePerHundredMetersToSpeed(secondsPerHundredMeters)` utility function
- [ ] Implement `speedToPacePerHundredMeters(metersPerSecond)` utility function
- [ ] Implement `deriveSwimPaceCurveFromCSS(cssSecondsPerHundredMeters)` function
  - [ ] Convert CSS (seconds/100m) to speed (m/s)
  - [ ] Loop through standard swim durations
  - [ ] Apply multiplier based on duration category (sprint/middle/css/distance)
  - [ ] Return array of `DerivedEffort` objects with activity_category='swim'
- [ ] Add JSDoc comments for all functions
- [ ] Export all functions and types

**Acceptance Criteria:**

- Function returns 10 swim pace efforts for standard durations
- Sprint efforts (< 60s) are 10% faster than CSS
- Middle distance (60-180s) are 6% faster than CSS
- CSS baseline (180-600s) matches input CSS
- Distance efforts (> 600s) are 7% slower than CSS
- All values are positive numbers

---

### Task 1.4: Heart Rate Calculations

**File:** `packages/core/calculations/heart-rate.ts`

- [ ] Create file with TypeScript boilerplate
- [ ] Implement `calculateVO2MaxFromHR(maxHR, restingHR)` function
  - [ ] Validate HR ranges (max > resting)
  - [ ] Apply Uth-Sørensen formula: `VO2max = 15.3 × (Max HR / Resting HR)`
  - [ ] Return VO2max in ml/kg/min
- [ ] Implement `estimateLTHR(maxHR)` function
  - [ ] Calculate 85% of max HR
  - [ ] Round to nearest integer
  - [ ] Return LTHR in bpm
- [ ] Implement `estimateMaxHRFromAge(age)` function
  - [ ] Apply 220 - age formula
  - [ ] Return estimated max HR
- [ ] Implement `calculateHRReserve(maxHR, restingHR)` function
  - [ ] Calculate HRR = Max HR - Resting HR
  - [ ] Return HRR value
- [ ] Add JSDoc comments for all functions
- [ ] Export all functions

**Acceptance Criteria:**

- VO2max calculation matches expected values (e.g., 190/55 = 52.8)
- LTHR is 85% of max HR
- Max HR estimate is 220 - age
- All functions handle edge cases (invalid inputs)

---

### Task 1.5: Performance Estimations

**File:** `packages/core/calculations/performance-estimates.ts`

- [ ] Create file with TypeScript boilerplate
- [ ] Define baseline W/kg values by gender
- [ ] Define baseline pace values by gender
- [ ] Implement `estimateFTPFromWeight(weightKg, gender)` function
  - [ ] Apply W/kg multiplier (2.75 male, 2.25 female)
  - [ ] Multiply by weight
  - [ ] Round to nearest integer
  - [ ] Return estimated FTP
- [ ] Implement `estimateThresholdPaceFromGender(gender)` function
  - [ ] Return baseline pace (315s male, 345s female)
- [ ] Implement `validatePerformanceMetric(metric, value, context)` function
  - [ ] Define realistic ranges for each metric
  - [ ] Check if value is within range
  - [ ] Generate warnings for outliers
  - [ ] Return validation result with confidence level
- [ ] Add JSDoc comments for all functions
- [ ] Export all functions

**Acceptance Criteria:**

- FTP estimate is reasonable (e.g., 70kg male = 193W)
- Threshold pace estimate is reasonable (5:15/km male, 5:45/km female)
- Validation catches unrealistic values (e.g., FTP > 500W for 70kg)
- Warnings are helpful and actionable

---

### Task 1.6: Onboarding Schemas

**File:** `packages/core/schemas/onboarding.ts`

- [ ] Create file with Zod imports
- [ ] Define `onboardingStep1Schema` (basic profile)
  - [ ] `dob`: datetime string
  - [ ] `weight_kg`: positive number, max 500
  - [ ] `gender`: enum ['male', 'female', 'other']
  - [ ] `sports`: activity_categoru multiple selection enum ['cycling', 'running', 'swimming', 'triathlon', 'other']
- [ ] Define `onboardingStep2Schema` (heart rate metrics)
  - [ ] `max_hr`: optional int, 100-250
  - [ ] `resting_hr`: optional int, 30-120
  - [ ] `lthr`: optional int, 80-220
- [ ] Define `onboardingStep3Schema` (performance metrics based on primary sport selection, skips if no primary sport selected)
  - [ ] `ftp`: optional positive number, max 1000
  - [ ] `threshold_pace_seconds_per_km`: optional positive number, max 600
  - [ ] `vo2max`: optional positive number, max 100
- [ ] Define `completeOnboardingSchema` (merge all steps)
- [ ] Export all schemas and inferred types

**Acceptance Criteria:**

- All schemas validate correct inputs
- All schemas reject invalid inputs with helpful errors
- Types are correctly inferred from schemas
- Schemas match database constraints

---

### Task 1.7: Unit Tests for Core Functions

- [ ] Create `power-curve.test.ts`
  - [ ] Test `derivePowerCurveFromFTP()` with default W'
  - [ ] Test `derivePowerCurveFromFTP()` with custom W'
  - [ ] Test edge cases (FTP = 0, negative W')
  - [ ] Test output format and structure
- [ ] Create `speed-curve.test.ts`
  - [ ] Test `deriveSpeedCurveFromThresholdPace()` with typical pace
  - [ ] Test `paceToSpeed()` and `speedToPace()` conversions
  - [ ] Test edge cases (very fast/slow paces)
- [ ] Create `swim-pace-curve.test.ts`
  - [ ] Test `deriveSwimPaceCurveFromCSS()` with typical CSS (1:30/100m = 90s)
  - [ ] Test `pacePerHundredMetersToSpeed()` and `speedToPacePerHundredMeters()` conversions
  - [ ] Test beginner CSS (2:00/100m = 120s)
  - [ ] Test intermediate CSS (1:40/100m = 100s)
  - [ ] Test edge cases (very fast/slow CSS)
  - [ ] Verify sprint efforts are 10% faster than CSS
  - [ ] Verify distance efforts are 7% slower than CSS
- [ ] Create `heart-rate.test.ts`
  - [ ] Test `calculateVO2MaxFromHR()` with known values
  - [ ] Test `estimateLTHR()` calculation
  - [ ] Test `estimateMaxHRFromAge()` formula
  - [ ] Test edge cases (max < resting, age = 0)
- [ ] Create `performance-estimates.test.ts`
  - [ ] Test `estimateFTPFromWeight()` for different genders
  - [ ] Test `estimateThresholdPaceFromGender()`
  - [ ] Test `validatePerformanceMetric()` with valid/invalid values
- [ ] Run tests: `pnpm test`
- [ ] Verify 100% coverage for core functions

**Acceptance Criteria:**

- All tests pass
- 100% line and branch coverage
- Edge cases are handled gracefully
- No TypeScript errors

---

## Phase 2: tRPC API Layer (`@repo/trpc`)

### Task 2.1: Create Helper Functions (Abstraction Layer) ⚡

**File:** `packages/trpc/src/utils/onboarding-helpers.ts`

- [ ] Create file with utility functions
- [ ] Implement `batchInsertProfileMetrics()` helper
  - [ ] Accept supabase client, profile_id, and metrics array
  - [ ] Format metrics with timestamp and profile_id
  - [ ] Batch insert all metrics
  - [ ] Return result
- [ ] Implement `batchInsertActivityEfforts()` helper
  - [ ] Accept supabase client, profile_id, efforts array, and source
  - [ ] Format efforts with timestamp, profile_id, and activity_id=null
  - [ ] Batch insert all efforts
  - [ ] Return result
- [ ] Implement `deriveEffortsForSport()` helper
  - [ ] Accept sport type and metric value
  - [ ] Switch on sport type (cycling/running/swimming)
  - [ ] Call appropriate derivation function
  - [ ] Return derived efforts
- [ ] Implement `prepareProfileMetrics()` helper
  - [ ] Accept input and baseline profile
  - [ ] Merge input with baseline (input takes priority)
  - [ ] Calculate derived metrics (VO2max, LTHR)
  - [ ] Return array of formatted metrics
- [ ] Add JSDoc comments
- [ ] Export all helpers

**Acceptance Criteria:**

- Helpers reduce duplication in main router
- Consistent error handling across all batch operations
- Type-safe interfaces
- Easy to test in isolation

**Code reduction:** ~40% less code in main router

---

### Task 2.2: Create Onboarding Router

**File:** `packages/trpc/src/routers/onboarding.ts`

- [ ] Create file with tRPC boilerplate
- [ ] Import schemas from `@repo/core/schemas/onboarding`
- [ ] Import calculation functions from `@repo/core/calculations`
- [ ] Import helper functions from `../utils/onboarding-helpers`
- [ ] Define `onboardingRouter` with `createTRPCRouter()`
- [ ] Implement `completeOnboarding` procedure (simplified with helpers)
  - [ ] Input: `completeOnboardingSchema`
  - [ ] Mutation type
  - [ ] Protected (requires auth)
  - [ ] Implementation steps (using helpers):
    - [ ] Extract user ID from session
    - [ ] Calculate baseline profile if needed (call `getBaselineProfile()`)
    - [ ] Update `profiles` table with basic info
    - [ ] Prepare metrics using `prepareProfileMetrics()` helper
    - [ ] Batch insert metrics using `batchInsertProfileMetrics()` helper
    - [ ] Derive all efforts:
      - [ ] For cycling: call `deriveEffortsForSport('cycling', ftp)`
      - [ ] For running: call `deriveEffortsForSport('running', threshold_pace)`
      - [ ] For swimming: call `deriveEffortsForSport('swimming', css)`
      - [ ] Merge all derived efforts into single array
    - [ ] Batch insert efforts using `batchInsertActivityEfforts()` helper
    - [ ] Return summary with counts, baseline_used flag, and confidence level
- [ ] Implement `estimateMetrics` procedure
  - [ ] Input: weight, gender, age, optional HR metrics
  - [ ] Query type
  - [ ] Protected
  - [ ] Call estimation functions
  - [ ] Return estimated FTP, pace, max HR, VO2max
- [ ] Add error handling for all database operations
- [ ] Export `onboardingRouter`

**Acceptance Criteria:**

- `completeOnboarding` creates all expected records
- Batch inserts are used (not individual inserts)
- Errors are caught and returned with helpful messages
- `estimateMetrics` returns reasonable estimates
- All procedures are type-safe

---

### Task 2.3: (OPTIONAL) Create Activity Efforts Router ⚡

**File:** `packages/trpc/src/routers/activity-efforts.ts`

**RECOMMENDATION:** Skip this task for MVP. Activity efforts are created in batch during onboarding. Add this router later only if you need:

- Complex queries (e.g., "show my power curve chart")
- Manual effort entry from UI
- Comparison to baseline functionality

**If needed later, implement:**

- [ ] `getBestForDuration` - Aggregation query (max value for duration)
- [ ] `list` - Standard query (reuse existing CRUD patterns)
- [ ] `create` - Standard mutation (reuse existing CRUD patterns) -- only available for onboarding/estimation
- [ ] `delete` - Standard mutation 
- [ ] `deleteAllForActivity` - Standard mutation 

**For MVP:** Direct Supabase queries in onboarding router are sufficient.

**Time saved:** ~4 hours of development + tests

---

### Task 2.4: Update Root Router

**File:** `packages/trpc/src/root.ts`

- [ ] Import `onboardingRouter`
- [ ] Import `activityEffortsRouter`
- [ ] Add to `appRouter`:
  ```typescript
  export const appRouter = createTRPCRouter({
    // ... existing routers
    onboarding: onboardingRouter,
    activityEfforts: activityEffortsRouter,
  });
  ```
- [ ] Export updated `AppRouter` type
- [ ] Verify type generation works

**Acceptance Criteria:**

- New routers are accessible from client
- TypeScript types are correct
- No build errors



---

## Phase 3: Mobile UI (`apps/mobile`)

### Task 3.1: Update Onboarding Screen - Step 2

**File:** `apps/mobile/app/(external)/onboarding.tsx`

- [ ] Add estimation helper functions
  - [ ] `estimateMaxHR()` - calls `220 - age`
  - [ ] `estimateLTHR()` - calls `max_hr * 0.85`
- [ ] Update Max HR field
  - [ ] Add "Estimate" button next to input
  - [ ] Show formula hint below input
  - [ ] Update state when estimate button pressed
- [ ] Update Resting HR field
  - [ ] Add helper text about when to measure
- [ ] Update LTHR field
  - [ ] Add "Estimate" button (requires max_hr)
  - [ ] Show formula hint if max_hr available
  - [ ] Disable estimate button if max_hr not set
- [ ] Add real-time VO2max calculation display
  - [ ] Show calculated VO2max if both HR metrics entered
  - [ ] Format: "Estimated VO2max: 52.8 ml/kg/min"

**Acceptance Criteria:**

- Estimate buttons work correctly
- Formula hints are helpful
- UI is responsive and intuitive
- No crashes or errors

---

### Task 3.2: Update Onboarding Screen - Step 3

**File:** `apps/mobile/app/(external)/onboarding.tsx`

- [ ] Add FTP estimation helper
  - [ ] `estimateFTP()` - calls `weight * 2.75` (male) or `weight * 2.25` (female)
  - [ ] Show as button or placeholder
- [ ] Update FTP field (cycling/triathlon only)
  - [ ] Add "Estimate" button
  - [ ] Show formula hint with calculated value
  - [ ] Conditional rendering based on primary_sport
- [ ] Add power curve preview card
  - [ ] Show if FTP is entered
  - [ ] Display sample efforts (5s, 1m, 5m, 20m)
  - [ ] Calculate using `derivePowerCurveFromFTP()`
  - [ ] Format: "5 seconds: 4250W"
- [ ] Update Threshold Pace field (running/triathlon only)
  - [ ] Parse "M:SS" format input
  - [ ] Convert to seconds per km
  - [ ] Show estimate based on gender
  - [ ] Conditional rendering based on primary_sport
- [ ] Add speed curve preview card
  - [ ] Show if threshold pace is entered
  - [ ] Display sample efforts
  - [ ] Calculate using `deriveSpeedCurveFromThresholdPace()`
- [ ] Update VO2max field
  - [ ] Auto-fill if calculated in Step 2
  - [ ] Allow manual override
  - [ ] Show "(calculated)" label if auto-filled

**Acceptance Criteria:**

- Estimation buttons work
- Preview cards show correct calculations
- Conditional rendering works for different sports
- Input parsing handles edge cases

---

### Task 3.3: Update Onboarding Completion Handler

**File:** `apps/mobile/app/(external)/onboarding.tsx`

- [ ] Import `trpc.onboarding.completeOnboarding` mutation
- [ ] Update `handleComplete()` function
  - [ ] Map form data to mutation input
  - [ ] Call mutation with all collected data
  - [ ] Handle loading state
  - [ ] Handle success
    - [ ] Show success alert with record counts
    - [ ] Navigate to home screen
  - [ ] Handle errors
    - [ ] Show error alert with helpful message
    - [ ] Allow retry
- [ ] Add loading spinner during submission
- [ ] Disable submit button while loading
- [ ] Add optimistic UI updates (optional)

**Acceptance Criteria:**

- Mutation is called with correct data
- Loading states are shown
- Success message includes record counts
- Errors are handled gracefully
- Navigation works correctly

---

### Task 3.4: Create Metric Estimation Hook

**File:** `apps/mobile/lib/hooks/useMetricEstimation.ts`

- [ ] Create file with React imports
- [ ] Import tRPC client
- [ ] Define hook signature
  - [ ] Input: weight, gender, age, optional HR metrics
  - [ ] Output: estimated FTP, pace, max HR, VO2max, loading state
- [ ] Implement hook
  - [ ] Use `trpc.onboarding.estimateMetrics.useQuery()`
  - [ ] Enable query only when required fields present
  - [ ] Return estimated values and loading state
- [ ] Add JSDoc comments
- [ ] Export hook

**Acceptance Criteria:**

- Hook returns correct estimates
- Query is only enabled when inputs are valid
- Loading state is accurate
- No unnecessary re-renders

---

### Task 3.5: Integrate Estimation Hook in Onboarding

**File:** `apps/mobile/app/(external)/onboarding.tsx`

- [ ] Import `useMetricEstimation` hook
- [ ] Call hook with current form data
  - [ ] Pass weight, gender, age (from DOB)
  - [ ] Pass max_hr, resting_hr if available
- [ ] Use estimates as placeholders
  - [ ] FTP input: `placeholder={estimatedFTP ? ${estimatedFTP}W (estimated) : "250"}`
  - [ ] Threshold pace input: similar pattern
- [ ] Show loading state while estimates are calculating
- [ ] Update estimates when dependencies change

**Acceptance Criteria:**

- Estimates appear as placeholders
- Estimates update when form data changes
- Loading states are shown
- No performance issues

---

### Task 3.6: Add Visual Feedback for Derivations

**File:** `apps/mobile/app/(external)/onboarding.tsx`

- [ ] Create derivation summary component
  - [ ] Shows "📊 We'll create your performance profile"
  - [ ] Lists what will be created:
    - [ ] X profile metrics
    - [ ] Y activity efforts
  - [ ] Conditional rendering based on entered data
- [ ] Add to Step 4 (final step)
- [ ] Style with `bg-muted` card
- [ ] Include icon and friendly copy

**Acceptance Criteria:**

- Summary is accurate
- Counts match actual records that will be created
- UI is visually appealing
- Copy is friendly and encouraging

---

## Summary

**Total Tasks:** 60+
**Estimated Time:** 3-4 weeks
**Team Size:** 1-2 developers

**Critical Path:**

1. Core functions (Week 1)
2. tRPC API (Week 2)
3. Mobile UI (Week 3)
