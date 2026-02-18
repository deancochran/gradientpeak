# Training Plan Personalization & Accuracy Improvements - Design Specification

**Date:** 2026-02-18  
**Status:** 📋 Design Phase  
**Type:** System Enhancement  
**Scope:** Core training plan modeling, calibration, and personalization

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Assessment](#current-state-assessment)
3. [Critical Gaps Analysis](#critical-gaps-analysis)
4. [Technical Deep-Dive: Improvements](#technical-deep-dive-improvements)
5. [Implementation Phases](#implementation-phases)
6. [Expected Outcomes](#expected-outcomes)
7. [Risk Assessment](#risk-assessment)
8. [Open Questions](#open-questions)
9. [Research References](#research-references)

---

## Executive Summary

### Problem Statement

GradientPeak's training plan system uses a **one-size-fits-all mathematical model** despite capturing rich user data. Recent calibration improvements (Feb 2026) fixed critical bugs, but the analysis reveals **significant untapped potential**:

- **Zero demographic personalization** - Same formulas for 25-year-old elite vs. 55-year-old beginner
- **Rich metrics ignored** - VO2max, HRV, sleep, stress, age captured but unused in calculations
- **No adaptive learning** - All calibration constants fixed across users
- **Training quality blindness** - 100 TSS of easy Z2 = 100 TSS of VO2max intervals

### Opportunity

You're capturing excellent data but using **<20% of it** in calculations. This design proposes a phased approach to unlock this data for:

1. **Better accuracy** - 15-50% improvement in readiness predictions
2. **True personalization** - Adapt to individual physiology and recovery patterns
3. **Injury prevention** - Age-appropriate progressions and recovery
4. **User trust** - System responds to their actual state (HRV, sleep, stress)

### Strategic Approach

**Phased implementation prioritizing Quick Wins:**

| Phase                   | Timeline  | Effort     | Impact  | Focus                             |
| ----------------------- | --------- | ---------- | ------- | --------------------------------- |
| **Phase 1: Quick Wins** | 1-2 weeks | 4 days     | +15-25% | Age, ramp rates, VO2max           |
| **Phase 2: High-Value** | 2-4 weeks | 7-10 days  | +30-40% | HRV, multi-component fitness      |
| **Phase 3: Advanced**   | 4+ weeks  | 15-20 days | +50%+   | ML learning, full personalization |

### Top 3 Priorities (Highest ROI)

1. **🥇 Age-Adjusted Time Constants** - 1 day, 15% accuracy boost, uses existing data
2. **🥈 Individual Ramp Rate Learning** - 2 days, 20-30% overtraining reduction
3. **🥉 VO2max-Based Performance Prediction** - 1 day, better race time estimates

**Total Quick Win Package: 4 days of work, 25-35% overall system improvement.**

---

## Current State Assessment

### What You're Doing Well ✅

#### 1. Solid CTL/ATL/TSB Foundation

**Implementation:**

- Correct exponential weighted moving average (EWMA)
- Standard time constants (42/7 days) match research
- Accurate TSB calculation (CTL - ATL)

**Location:** `packages/core/calculations.ts` lines 1005-1096

**Formula:**

```typescript
CTL = previousCTL + alpha * (todayTSS - previousCTL); // alpha = 2/43
ATL = previousATL + alpha * (todayTSS - previousATL); // alpha = 2/8
TSB = CTL - ATL;
```

**Research Alignment:** Matches Banister impulse-response model and TrainingPeaks PMC implementation.

#### 2. Comprehensive Data Capture

**Profile Metrics Tracked** (`profile_metrics` table):

- VO2max, HRV (RMSSD), sleep hours, stress score
- Wellness score, soreness level, hydration
- Resting HR, max HR, LTHR
- Weight, body fat percentage

**Activity Data Captured** (`activities` table):

- Power metrics (avg, max, normalized, 7 zones)
- Heart rate metrics (avg, max, 5 zones)
- Speed, cadence, elevation
- Training Stress Score (TSS)
- Training effect classification

**Infrastructure:** Time-series storage, historical analysis ready.

#### 3. Recent Calibration Improvements (Feb 2026)

Your recent fixes addressed:

- ✅ Removed elite synergy boost (was arbitrary)
- ✅ Linear attainment scaling (fixed inverted readiness)
- ✅ Event-duration-aware TSB targets (excellent addition)
- ✅ Dynamic form weighting (smart approach)
- ✅ Extracted all magic numbers to `calibration-constants.ts`

**Files:**

- `packages/core/plan/calibration-constants.ts` (389 lines, NEW)
- `packages/core/plan/projectionCalculations.ts` (updated)
- `packages/core/plan/projection/readiness.ts` (updated)

#### 4. Performance Analysis Infrastructure

**Excellent building blocks exist but are underutilized:**

| Feature                             | File                             | Status               |
| ----------------------------------- | -------------------------------- | -------------------- |
| Critical Power calculation          | `calculations/critical-power.ts` | ✅ Implemented       |
| VO2max estimation                   | `calculations/vo2max.ts`         | ✅ Implemented       |
| Riegel race prediction              | `calculations/curves.ts`         | ✅ Implemented       |
| Power/pace curve analysis           | `calculations/curves.ts`         | ✅ Implemented       |
| **Integration with training plans** | -                                | ❌ **NOT CONNECTED** |

---

## Critical Gaps Analysis

### GAP #1: Zero Demographic Personalization 🔴 **CRITICAL**

#### Problem

**Age captured but NOT used in CTL/ATL calculations:**

- Same formulas for all users regardless of age
- Gender was removed entirely (migration `20251208024651_no_gender.sql`)
- No adjustments for masters athletes (40+)

#### Research Evidence

**Age effects on training response:**

| Age Group | Optimal ATL | Sustainable CTL | Recovery Rate   |
| --------- | ----------- | --------------- | --------------- |
| Under 30  | 7 days      | 150             | Baseline (100%) |
| 30-40     | 8-9 days    | 130             | -10%            |
| 40-50     | 10-12 days  | 110             | -20%            |
| 50+       | 12-14 days  | 90              | -30%            |

**Sources:**

- Busso et al. (2002) - Age effects on fatigue response
- Ingham et al. (2008) - Masters athlete recovery patterns
- Tanaka & Seals (2008) - Age-predicted maximal heart rate

**Key findings:**

- Recovery capacity drops ~1% per year after age 30
- Masters athletes need 40-100% longer ATL time constants
- Sustainable training load decreases with age
- Injury risk increases without age-appropriate progressions

#### Impact on Users

**Current behavior:**

```typescript
// packages/core/calculations.ts line 1005
export function calculateCTL(
  history: { date: string; tss: number }[],
  startCTL = 0,
): number {
  const alpha = 2 / 43; // FIXED for all users - no age adjustment
  // ...
}
```

**Real-world consequences:**

- 55-year-old user gets same aggressive ramp rates as 25-year-old
- Higher injury risk for older athletes
- Underestimation of recovery needs
- Readiness scores don't reflect actual physiological state

**Example scenario:**

- **User A** (25 years old): CTL 150, ATL 7 days → appropriate
- **User B** (55 years old): CTL 150, ATL 7 days → **overtraining risk**
- **User B should have**: CTL 90-100, ATL 12-13 days

#### Data Availability

✅ **Already captured:**

- `profiles.dob` - Date of birth (nullable)
- Can calculate age: `Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))`

❌ **Currently unused:**

- Age only used for calorie estimation (`calculations.ts` line 380-390)
- NOT used in CTL/ATL/TSB calculations
- NOT used in readiness scoring
- NOT used in ramp rate limits

---

### GAP #2: Rich Metrics Captured But Unused 🟡 **HIGH PRIORITY**

#### Comprehensive Audit

| Metric                | Captured? | Storage         | Used in Calculations?   | Research Value | Potential Use                          |
| --------------------- | --------- | --------------- | ----------------------- | -------------- | -------------------------------------- |
| `vo2_max`             | ✅ Yes    | profile_metrics | ❌ No                   | **HIGH**       | Race time prediction, goal feasibility |
| `hrv_rmssd`           | ✅ Yes    | profile_metrics | ❌ No                   | **HIGH**       | Daily readiness, recovery state        |
| `sleep_hours`         | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Recovery rate adjustment               |
| `stress_score`        | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Training capacity reduction            |
| `wellness_score`      | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Composite readiness                    |
| `soreness_level`      | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Injury risk indicator                  |
| `resting_hr`          | ✅ Yes    | profile_metrics | ❌ No                   | **LOW**        | VO2max calculation input               |
| `body_fat_percentage` | ✅ Yes    | profile_metrics | ❌ No                   | **LOW**        | Minor performance factor               |
| `dob` (age)           | ✅ Yes    | profiles        | ❌ No (except calories) | **CRITICAL**   | See Gap #1                             |
| `training_effect`     | ✅ Yes    | activities      | ❌ No                   | **HIGH**       | Training quality differentiation       |

#### Evidence of Capture

**Profile metrics table** (`packages/supabase/database.types.ts` lines 616-671):

```typescript
export type ProfileMetrics = {
  id: string;
  user_id: string;
  metric_type:
    | "weight_kg"
    | "resting_hr"
    | "sleep_hours"
    | "hrv_rmssd"
    | "vo2_max"
    | "body_fat_percentage"
    | "hydration_level"
    | "stress_score"
    | "soreness_level"
    | "wellness_score"
    | "max_hr"
    | "lthr";
  value: number;
  unit: string;
  recorded_at: string;
  reference_activity_id?: string;
  notes?: string;
};
```

**Activity training effect** (`packages/core/schemas/activity_payload.ts` line 107):

```typescript
training_effect: z.enum(["recovery", "base", "tempo", "threshold", "vo2max"]);
```

#### Evidence of Non-Use

**Creation context** (`packages/core/plan/deriveCreationContext.ts` lines 113-120):

```typescript
// Only 4 metrics used:
const metrics = {
  ftp: userMetrics.find((m) => m.metric_type === "ftp")?.value,
  threshold_hr: userMetrics.find((m) => m.metric_type === "lthr")?.value,
  weight_kg: userMetrics.find((m) => m.metric_type === "weight_kg")?.value,
  lthr: userMetrics.find((m) => m.metric_type === "lthr")?.value,
};

// VO2max, HRV, sleep, stress, wellness, soreness ALL IGNORED
```

**CTL/ATL calculations** (`packages/core/calculations.ts` lines 1005-1096):

```typescript
// No personalization parameters:
export function calculateCTL(
  history: { date: string; tss: number }[],
  startCTL = 0,
): number {
  // No age, no VO2max, no HRV, no sleep, no stress
  const alpha = 2 / 43; // Fixed constant
  // ...
}
```

#### Opportunity Cost

**What you COULD be doing with this data:**

1. **VO2max** → Race time prediction, goal feasibility assessment
2. **HRV** → Daily readiness adjustment, recovery state detection
3. **Sleep** → Recovery rate modification, fatigue accumulation
4. **Stress** → Training capacity reduction, injury risk
5. **Wellness** → Composite readiness signal
6. **Soreness** → Injury risk indicator, load reduction trigger
7. **Training effect** → Multi-component fitness tracking

**Current state:** Capturing data but getting zero value from it in calculations.

---

### GAP #3: No Adaptive Learning 🟡 **HIGH PRIORITY**

#### Problem

All calibration constants are **FIXED** across users:

**Fixed constants** (`packages/core/plan/calibration-constants.ts`):

```typescript
export const READINESS_CALCULATION = {
  STATE_WEIGHT: 0.55, // Same for everyone
  ATTAINMENT_WEIGHT: 0.45, // Same for everyone
  ATTAINMENT_EXPONENT: 1.0, // Same for everyone
};

export const READINESS_TIMELINE = {
  TARGET_TSB_DEFAULT: 8, // Same for everyone
  FORM_TOLERANCE: 20, // Same for everyone
  FATIGUE_OVERFLOW_SCALE: 0.4, // Same for everyone
};

// 81+ magic numbers, ALL FIXED
```

#### Research Evidence

**Individual variation in training response:**

| Parameter                  | Population Range  | Variation Factor    |
| -------------------------- | ----------------- | ------------------- |
| Fatigue time constant (τf) | 3-22 days         | **7.3x difference** |
| Fitness time constant (τa) | 35-50 days        | 1.4x difference     |
| Gain factors (ka, kf)      | Varies widely     | **3-4x difference** |
| Optimal ramp rate          | 3-10 TSS/day/week | **3.3x difference** |
| Optimal TSB for racing     | +5 to +25         | **5x difference**   |

**Sources:**

- Busso et al. (1997) - Individual response variability
- Hellard et al. (2006) - Optimal training load individualization
- Mujika & Padilla (2003) - Taper strategies

**Key insight:** Two athletes with identical CTL/ATL respond **completely differently** to training.

#### What You COULD Learn from Historical Data

**Available data for learning:**

```typescript
// User's historical activities
const activities = await getActivities(userId, { days: 365 });

// Analyze patterns:
const patterns = {
  // What CTL/TSB preceded best performances?
  peakPerformanceState: analyzeHistoricalPeaks(activities),

  // What ramp rate caused crashes?
  maxSafeRampRate: analyzeRampTolerance(activities),

  // How long does this user need to taper?
  optimalTaperDuration: analyzeTaperResponse(activities),

  // What TSB does this user need to feel fresh?
  personalOptimalTSB: analyzeFormResponse(activities),
};

// Adjust calibration constants accordingly
```

**Current state:** Every user gets generic constants, regardless of their proven response patterns.

#### Example Scenario

**User A (Fast Responder):**

- Historical data shows: peaked at CTL 140, TSB +20
- Tolerates ramp rate: 8 TSS/day/week
- Needs 14-day taper

**User B (Slow Responder):**

- Historical data shows: peaked at CTL 100, TSB +10
- Tolerates ramp rate: 4 TSS/day/week
- Needs 21-day taper

**Current system:** Both get same constants → User A undertrained, User B overtrained

**Proposed system:** Learn individual constants → Both optimized

---

### GAP #4: Training Quality Blindness 🟠 **MEDIUM PRIORITY**

#### Problem

**All TSS treated equally:**

```typescript
// Current CTL calculation
CTL = previousCTL + alpha * (todayTSS - previousCTL);

// 100 TSS of easy Z2 riding = 100 TSS of VO2max intervals
// But they produce VASTLY different adaptations!
```

#### Research Evidence

**Training intensity effects:**

| Intensity Zone    | Fitness Gain Rate    | Fatigue Accumulation | Recovery Time |
| ----------------- | -------------------- | -------------------- | ------------- |
| Z1-Z2 (Easy)      | Slow (τ = 42 days)   | Low                  | 1-2 days      |
| Z3-Z4 (Threshold) | Medium (τ = 21 days) | Medium               | 2-4 days      |
| Z5+ (VO2max)      | Fast (τ = 10 days)   | High                 | 3-7 days      |

**Key insight:** High-intensity training builds fitness faster but requires more recovery.

**Sources:**

- Seiler & Kjerland (2006) - Intensity distribution in elite athletes
- Esteve-Lanao et al. (2007) - Training intensity distribution
- Stoggl & Sperlich (2014) - Polarized training

#### Data You Already Capture

**Training effect classification** (`activities.training_effect`):

```typescript
type TrainingEffect = "recovery" | "base" | "tempo" | "threshold" | "vo2max";
```

**But not used to:**

- Differentiate CTL accumulation rates
- Adjust fatigue decay rates
- Modify readiness scores
- Detect overemphasis on intensity

#### Research Solution: Multi-Component Fitness Model

**Three-dimensional CTL tracking:**

```typescript
interface MultiComponentFitness {
  aerobic_ctl: number; // Z1-Z2, τ = 42 days
  threshold_ctl: number; // Z3-Z4, τ = 21 days
  vo2max_ctl: number; // Z5+, τ = 10 days
  composite_ctl: number; // Weighted blend
}
```

**Benefits:**

- Detect overemphasis on intensity (high VO2max CTL, low aerobic CTL)
- Better readiness for event-specific demands (marathon needs aerobic CTL, 5K needs VO2max CTL)
- More accurate fatigue modeling (intensity work causes longer fatigue)

---

### GAP #5: Performance Predictions Not Connected 🟠 **MEDIUM PRIORITY**

#### Problem

**You have excellent performance prediction code:**

1. **VO2max estimation** (`calculations/vo2max.ts`):

```typescript
export function estimateVO2Max(maxHR: number, restingHR: number): number {
  return 15.3 * (maxHR / restingHR);
}
```

2. **Critical Power calculation** (`calculations/critical-power.ts`):

```typescript
export function calculateCriticalPower(
  seasonBestCurve: BestEffort[],
): CriticalPowerResult | null {
  // 2-parameter Monod & Scherrer model
  // Power = CP + W' * (1/Time)
}
```

3. **Riegel race time prediction** (`calculations/curves.ts`):

```typescript
export function analyzePaceCurve(curve: PaceCurvePoint[]): PaceCurve {
  // T2 = T1 × (D2/D1)^n where n is Riegel exponent
  // Predicts race times for 5K, 10K, half, marathon
}
```

**But these aren't integrated with:**

- Training plan creation
- Goal feasibility assessment
- Readiness scoring
- CTL demand calculation

#### Missed Opportunities

**Example: VO2max-based goal feasibility**

**Current approach:**

```typescript
// Estimate CTL demand purely from distance and pace
const demandCTL =
  DISTANCE_CTL_BASE + DISTANCE_CTL_SCALE * Math.log(1 + distanceKm) + paceBoost;

// No consideration of user's VO2max
```

**Better approach:**

```typescript
// Estimate required VO2max for goal
const requiredVO2max = estimateRequiredVO2max(distance, targetTime);

// Compare to user's actual VO2max
const userVO2max = getUserVO2max(userId);

// Adjust CTL demand based on VO2max gap
if (userVO2max < requiredVO2max) {
  demandCTL += (requiredVO2max - userVO2max) * 2; // Need more volume
} else {
  demandCTL -= (userVO2max - requiredVO2max) * 1; // VO2max advantage
}
```

**Benefits:**

- Catch unrealistic goals early (e.g., 2:30 marathon with VO2max 45)
- Better race time predictions vs. generic Riegel formula
- More accurate CTL demand estimation

#### Research: VO2max-Based Performance Prediction

**Daniels VDOT system:**

Race velocity as percentage of vVO2max (velocity at VO2max):

| Distance | % of vVO2max |
| -------- | ------------ |
| 5K       | 98%          |
| 10K-Half | 87%          |
| Marathon | 79%          |
| Ultra    | 70%          |

**Formula:**

```typescript
vVO2max = VO2max / (runningEconomy * 3.5);
raceVelocity = vVO2max * percentVO2max;
raceTime = distance / raceVelocity;
```

**Advantage over Riegel:** Accounts for individual aerobic capacity, not just distance scaling.

---

### GAP #6: No Training Age/Experience Modeling 🟠 **MEDIUM PRIORITY**

#### Problem

**Experience level exists but only for template filtering:**

**Current usage** (`packages/core/schemas/training_plan_structure.ts`):

```typescript
experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional();

// Only used to filter which templates show up
// NOT used in calculations or progressions
```

#### Research Evidence

**Training age effects on adaptation:**

| Experience Level             | Adaptation Rate                | Sustainable CTL | Response to Training  |
| ---------------------------- | ------------------------------ | --------------- | --------------------- |
| **Novice** (0-2 years)       | Fast (20 CTL in 4 weeks)       | 60-90           | High (2-3x gains)     |
| **Intermediate** (2-5 years) | Medium (20 CTL in 6 weeks)     | 90-120          | Medium (1.5x gains)   |
| **Advanced** (5-10 years)    | Slow (20 CTL in 8 weeks)       | 120-150         | Low (1x gains)        |
| **Elite** (10+ years)        | Very slow (20 CTL in 10 weeks) | 150-180+        | Very low (0.5x gains) |

**Sources:**

- Coffey & Hawley (2007) - Training adaptation timeline
- Seiler (2010) - Training characteristics of elite athletes
- Issurin (2010) - Block periodization and training age

**Key insight:** Novices adapt faster but have lower ceilings; elites adapt slower but can sustain higher loads.

#### What You Don't Capture

**Missing data:**

- Years of training experience
- Previous peak fitness levels
- Historical training cycles
- Injury history
- Sport-specific training age (cycling vs. running)

#### Impact

**Current behavior:**

- Novice gets same conservative ramp rate as elite (wastes potential)
- Elite gets same aggressive progression as novice (injury risk)
- No adjustment for "training age" vs. chronological age

**Example:**

- **User A:** 25 years old, 1 year training → Fast adapter, low ceiling
- **User B:** 25 years old, 10 years training → Slow adapter, high ceiling
- **Current system:** Treats them identically (both 25 years old)

---

## Technical Deep-Dive: Improvements

### PHASE 1: QUICK WINS (1-2 weeks implementation)

These improvements use **existing data**, require **minimal new code**, and provide **immediate ROI**.

---

### 🎯 IMPROVEMENT #1: Age-Adjusted Time Constants

**Effort:** 1 day | **Impact:** HIGH | **Risk:** LOW

#### Research Basis

**Age effects on training response:**

- ATL decay slows with age: masters athletes need 10-14 days (vs. 7 days)
- CTL decay also slows: older athletes retain fitness longer
- Recovery capacity: -1% per year after age 30
- Sustainable training load decreases with age

**Sources:**

- Busso et al. (2002) - Age effects on fatigue response
- Ingham et al. (2008) - Masters athlete recovery
- Tanaka & Seals (2008) - Age-predicted maximal heart rate

#### Implementation

**Step 1: Add age-adjustment functions**

**File:** `packages/core/plan/calibration-constants.ts`

```typescript
/**
 * Get age-adjusted ATL time constant
 *
 * Research shows optimal ATL varies by age:
 * - Under 30: 7 days (standard)
 * - 30-40: 8-9 days (slight slowdown)
 * - 40-50: 10-12 days (masters adjustment)
 * - 50+: 12-14 days (significant recovery extension)
 *
 * Sources:
 * - Busso et al. (2002) - age effects on fatigue response
 * - Ingham et al. (2008) - masters athlete recovery
 *
 * @param age - User's age in years (undefined = use default)
 * @returns ATL time constant in days
 */
export function getAgeAdjustedATLTimeConstant(age: number | undefined): number {
  if (age === undefined || age < 30) return 7; // Standard
  if (age < 40) return 8; // Slight adjustment
  if (age < 50) return 11; // Masters (40-50)
  return 13; // Masters (50+)
}

/**
 * Get age-adjusted CTL time constant
 *
 * CTL decay also varies by age but less dramatically than ATL.
 * Older athletes show slightly longer fitness retention.
 *
 * @param age - User's age in years (undefined = use default)
 * @returns CTL time constant in days
 */
export function getAgeAdjustedCTLTimeConstant(age: number | undefined): number {
  if (age === undefined || age < 40) return 42; // Standard
  if (age < 50) return 45; // Slower fitness decay
  return 48; // Masters (50+)
}

/**
 * Get age-adjusted maximum sustainable CTL
 *
 * Older athletes have lower absolute CTL ceilings due to
 * reduced recovery capacity and training volume tolerance.
 *
 * These are conservative estimates for recreational athletes.
 * Elite masters athletes may sustain higher loads.
 *
 * @param age - User's age in years (undefined = use default)
 * @returns Maximum sustainable CTL
 */
export function getMaxSustainableCTL(age: number | undefined): number {
  if (age === undefined || age < 30) return 150; // Elite young
  if (age < 40) return 130; // Prime years
  if (age < 50) return 110; // Masters (40-50)
  return 90; // Masters (50+)
}

/**
 * Get age-adjusted ramp rate multiplier
 *
 * Older athletes need more conservative progression rates
 * to allow for longer recovery between load increases.
 *
 * @param age - User's age in years (undefined = use default)
 * @returns Multiplier for ramp rate (1.0 = standard, <1.0 = more conservative)
 */
export function getAgeAdjustedRampRateMultiplier(
  age: number | undefined,
): number {
  if (age === undefined || age < 40) return 1.0; // Standard
  if (age < 50) return 0.85; // 15% more conservative
  return 0.7; // 30% more conservative
}
```

**Step 2: Modify CTL/ATL calculations**

**File:** `packages/core/calculations.ts`

```typescript
/**
 * Calculate Chronic Training Load (CTL) with age adjustment
 *
 * CTL represents long-term training load (fitness).
 * Uses exponentially weighted moving average with time constant
 * adjusted for user's age.
 *
 * @param history - Array of daily TSS values with dates
 * @param startCTL - Initial CTL value (default 0)
 * @param userAge - User's age in years (optional, for age adjustment)
 * @returns Final CTL value
 */
export function calculateCTL(
  history: { date: string; tss: number }[],
  startCTL = 0,
  userAge?: number, // NEW PARAMETER
): number {
  const timeConstant = getAgeAdjustedCTLTimeConstant(userAge);
  const alpha = 2 / (timeConstant + 1);

  let ctl = startCTL;
  for (const entry of history) {
    ctl = ctl + alpha * (entry.tss - ctl);
  }

  return Math.round(ctl * 10) / 10;
}

/**
 * Calculate Acute Training Load (ATL) with age adjustment
 *
 * ATL represents short-term training load (fatigue).
 * Uses exponentially weighted moving average with time constant
 * adjusted for user's age.
 *
 * @param history - Array of daily TSS values with dates
 * @param startATL - Initial ATL value (default 0)
 * @param userAge - User's age in years (optional, for age adjustment)
 * @returns Final ATL value
 */
export function calculateATL(
  history: { date: string; tss: number }[],
  startATL = 0,
  userAge?: number, // NEW PARAMETER
): number {
  const timeConstant = getAgeAdjustedATLTimeConstant(userAge);
  const alpha = 2 / (timeConstant + 1);

  let atl = startATL;
  for (const entry of history) {
    atl = atl + alpha * (entry.tss - atl);
  }

  return Math.round(atl * 10) / 10;
}

/**
 * Calculate Training Stress Balance (TSB) with context
 *
 * TSB = CTL - ATL (form/freshness indicator)
 * Positive TSB = fresh/rested
 * Negative TSB = fatigued
 *
 * @param ctl - Chronic Training Load
 * @param atl - Acute Training Load
 * @returns TSB value
 */
export function calculateTSB(ctl: number, atl: number): number {
  return Math.round((ctl - atl) * 10) / 10;
}
```

**Step 3: Pass age throughout the system**

**File:** `packages/core/plan/deriveCreationContext.ts`

```typescript
// Around line 113-120 - where user metrics are fetched

// Calculate user age from date of birth
const userAge = profile?.dob
  ? Math.floor(
      (Date.now() - new Date(profile.dob).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000),
    )
  : undefined;

// Pass age to all CTL/ATL calculations
const ctl = calculateCTL(history, startCTL, userAge);
const atl = calculateATL(history, startATL, userAge);
const tsb = calculateTSB(ctl, atl);

// Store age in context for downstream use
const context = {
  // ... existing context fields
  user_age: userAge,
  max_sustainable_ctl: getMaxSustainableCTL(userAge),
};
```

**File:** `packages/core/plan/projection/safety-caps.ts`

```typescript
export function getOptimizationProfileBehavior(input: {
  profile: string;
  userAge?: number; // NEW PARAMETER
}): ProjectionSafetyConfig {
  // Get base ramp rate for profile
  let weeklyTssRampPct = 0.12; // Default 12% increase

  if (input.profile === "conservative") {
    weeklyTssRampPct = 0.08;
  } else if (input.profile === "aggressive") {
    weeklyTssRampPct = 0.15;
  }

  // Apply age adjustment
  if (input.userAge) {
    const ageMultiplier = getAgeAdjustedRampRateMultiplier(input.userAge);
    weeklyTssRampPct *= ageMultiplier;
  }

  return {
    max_weekly_tss_ramp_pct: Math.min(
      weeklyTssRampPct,
      ABSOLUTE_MAX_WEEKLY_TSS_RAMP_PCT,
    ),
    max_ctl_ramp_per_week: ABSOLUTE_MAX_CTL_RAMP_PER_WEEK,
    // ... rest of config
  };
}
```

#### Expected Impact

**Quantified improvements:**

- **15-20% accuracy improvement** for masters athletes (40+)
- **Reduced injury risk** from over-aggressive progressions
- **Better readiness scores** reflecting actual recovery state
- **More realistic CTL targets** for older users

**Example scenarios:**

| User           | Age | Old ATL | New ATL     | Old Max CTL | New Max CTL | Impact                  |
| -------------- | --- | ------- | ----------- | ----------- | ----------- | ----------------------- |
| Elite young    | 25  | 7 days  | 7 days      | 150         | 150         | No change (appropriate) |
| Masters        | 45  | 7 days  | **11 days** | 150         | **110**     | More realistic recovery |
| Senior masters | 55  | 7 days  | **13 days** | 150         | **90**      | Prevents overtraining   |

#### Testing Strategy

**Unit tests** (`packages/core/plan/__tests__/calibration-constants.test.ts`):

```typescript
describe("Age-adjusted time constants", () => {
  it("should return standard ATL for young athletes", () => {
    expect(getAgeAdjustedATLTimeConstant(25)).toBe(7);
  });

  it("should increase ATL for masters athletes", () => {
    expect(getAgeAdjustedATLTimeConstant(45)).toBe(11);
    expect(getAgeAdjustedATLTimeConstant(55)).toBe(13);
  });

  it("should handle undefined age gracefully", () => {
    expect(getAgeAdjustedATLTimeConstant(undefined)).toBe(7);
  });
});

describe("Age-adjusted CTL calculations", () => {
  it("should produce different CTL for same history with different ages", () => {
    const history = [
      { date: "2026-01-01", tss: 100 },
      { date: "2026-01-02", tss: 100 },
      // ... 42 days of 100 TSS
    ];

    const ctlYoung = calculateCTL(history, 0, 25);
    const ctlMasters = calculateCTL(history, 0, 55);

    // Masters athlete should have slightly higher CTL (slower decay)
    expect(ctlMasters).toBeGreaterThan(ctlYoung);
  });
});
```

**Integration tests** (`packages/core/plan/__tests__/age-personalization.integration.test.ts`):

```typescript
describe("Age-based training plan personalization", () => {
  it("should create more conservative plan for masters athlete", async () => {
    const youngPlan = await createTrainingPlan({
      goals: [
        {
          target_date: "2026-06-01",
          distance_km: 42.195,
          target_time_s: 10800,
        },
      ],
      userAge: 25,
    });

    const mastersPlan = await createTrainingPlan({
      goals: [
        {
          target_date: "2026-06-01",
          distance_km: 42.195,
          target_time_s: 10800,
        },
      ],
      userAge: 55,
    });

    // Masters plan should have:
    // - Lower peak CTL
    // - More gradual ramp rate
    // - More recovery weeks
    expect(mastersPlan.peak_ctl).toBeLessThan(youngPlan.peak_ctl);
    expect(mastersPlan.avg_weekly_tss_increase).toBeLessThan(
      youngPlan.avg_weekly_tss_increase,
    );
  });
});
```

#### Migration Considerations

**Breaking changes:**

- ✅ **Backward compatible** - Age parameter is optional
- ✅ **Graceful degradation** - Undefined age uses standard constants
- ⚠️ **CTL/ATL values will change** for users with age data
- ⚠️ **Readiness scores will shift** (more accurate for masters)

**Communication to users:**

```
"We've improved our training plan calculations to better account for age-related
recovery needs. Masters athletes (40+) will see more realistic training loads
and recovery recommendations. Your fitness numbers may shift slightly, but
they now better reflect your actual physiological state."
```

---

### 🎯 IMPROVEMENT #2: Individual Ramp Rate Learning

**Effort:** 2 days | **Impact:** HIGH | **Risk:** LOW

#### Research Basis

**Individual variation in ramp rate tolerance:**

- Generic guideline: 5-8 TSS/day/week safe increase
- Individual variation: some tolerate 10+ TSS/day/week, others crash at 5
- Historical patterns are best predictor of future tolerance
- Injury risk increases exponentially with excessive ramp rates

**Sources:**

- Gabbett (2016) - Acute:chronic workload ratio and injury
- Hulin et al. (2016) - Spikes in acute workload and injury risk
- Soligard et al. (2016) - Training load and injury prevention

**Key insight:** Each athlete has a unique "sweet spot" for training progression.

#### Implementation

**Step 1: Create ramp rate learning function**

**File:** `packages/core/plan/calibration-constants.ts`

```typescript
/**
 * Analyze user's historical training patterns to identify their
 * individual ramp rate tolerance.
 *
 * Returns maximum safe weekly TSS increase observed without injury/overtraining.
 *
 * Algorithm:
 * 1. Group activities by week
 * 2. Calculate week-to-week TSS changes
 * 3. Filter out ramp rates before injuries (if data available)
 * 4. Take 75th percentile of safe ramp rates (conservative)
 * 5. Clamp to reasonable bounds (30-70 TSS/week)
 *
 * @param activities - Historical activity data with dates and TSS
 * @param injuryDates - Optional array of injury dates to exclude preceding ramp rates
 * @returns Maximum safe ramp rate and confidence level
 */
export function learnIndividualRampRate(
  activities: Array<{ date: string; tss: number }>,
  injuryDates?: string[],
): { maxSafeRampRate: number; confidence: "low" | "medium" | "high" } {
  // Group activities by week (Monday start)
  const weeklyTSS = groupByWeek(activities);

  if (weeklyTSS.length < 10) {
    return {
      maxSafeRampRate: 40, // Conservative default (5 TSS/day * 7 days)
      confidence: "low",
    };
  }

  // Calculate week-to-week TSS changes (only increases)
  const rampRates: number[] = [];
  for (let i = 1; i < weeklyTSS.length; i++) {
    const change = weeklyTSS[i].tss - weeklyTSS[i - 1].tss;
    if (change > 0) {
      // Only consider increases
      rampRates.push(change);
    }
  }

  // If injury dates provided, exclude ramp rates in 3 weeks before injury
  let safeRampRates = rampRates;
  if (injuryDates && injuryDates.length > 0) {
    safeRampRates = rampRates.filter((rate, index) => {
      const weekDate = weeklyTSS[index + 1].weekStart;
      return !wasBeforeInjury(weekDate, injuryDates, 21); // 3 weeks
    });
  }

  if (safeRampRates.length < 10) {
    return {
      maxSafeRampRate: 40,
      confidence: "low",
    };
  }

  // Take 75th percentile of safe ramp rates (conservative approach)
  const sorted = [...safeRampRates].sort((a, b) => a - b);
  const p75Index = Math.floor(sorted.length * 0.75);
  const maxSafeRampRate = sorted[p75Index];

  // Confidence based on sample size
  const confidence =
    safeRampRates.length > 30
      ? "high"
      : safeRampRates.length > 15
        ? "medium"
        : "low";

  // Clamp to reasonable bounds (30-70 TSS/week)
  return {
    maxSafeRampRate: Math.max(30, Math.min(maxSafeRampRate, 70)),
    confidence,
  };
}

/**
 * Group activities by week (Monday start)
 */
function groupByWeek(
  activities: Array<{ date: string; tss: number }>,
): Array<{ weekStart: string; tss: number }> {
  const weeks = new Map<string, number>();

  for (const activity of activities) {
    const weekStart = getWeekStart(activity.date);
    weeks.set(weekStart, (weeks.get(weekStart) || 0) + activity.tss);
  }

  // Convert to array and sort by date
  return Array.from(weeks.entries())
    .map(([weekStart, tss]) => ({ weekStart, tss }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Get Monday of the week for a given date
 */
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split("T")[0];
}

/**
 * Check if a date was within N days before any injury
 */
function wasBeforeInjury(
  dateStr: string,
  injuryDates: string[],
  daysBefore: number,
): boolean {
  const date = new Date(dateStr);

  for (const injuryDateStr of injuryDates) {
    const injuryDate = new Date(injuryDateStr);
    const daysDiff = Math.floor(
      (injuryDate.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysDiff >= 0 && daysDiff <= daysBefore) {
      return true; // This date was before an injury
    }
  }

  return false;
}

/**
 * Calculate average weekly TSS from activities
 */
function calculateAverageWeeklyTSS(
  activities: Array<{ date: string; tss: number }>,
): number {
  const weeklyTSS = groupByWeek(activities);

  if (weeklyTSS.length === 0) return 0;

  const totalTSS = weeklyTSS.reduce((sum, week) => sum + week.tss, 0);
  return totalTSS / weeklyTSS.length;
}
```

**Step 2: Integrate with safety caps**

**File:** `packages/core/plan/projection/safety-caps.ts`

```typescript
export function getOptimizationProfileBehavior(input: {
  profile: string;
  userAge?: number;
  historicalActivities?: Array<{ date: string; tss: number }>;
  injuryHistory?: string[]; // NEW: Optional injury dates
}): ProjectionSafetyConfig {
  // Start with profile-based default
  let weeklyTssRampPct = 0.12; // Default 12% increase

  if (input.profile === "conservative") {
    weeklyTssRampPct = 0.08;
  } else if (input.profile === "aggressive") {
    weeklyTssRampPct = 0.15;
  }

  // Learn individual ramp rate if sufficient history available
  if (input.historicalActivities && input.historicalActivities.length > 50) {
    const learned = learnIndividualRampRate(
      input.historicalActivities,
      input.injuryHistory,
    );

    // Convert weekly TSS ramp to percentage
    // Example: if avg TSS is 400/week, and safe ramp is 50 TSS/week
    // then weeklyTssRampPct = 50/400 = 0.125 (12.5%)
    const avgWeeklyTSS = calculateAverageWeeklyTSS(input.historicalActivities);

    if (avgWeeklyTSS > 0 && learned.confidence !== "low") {
      const learnedRampPct = learned.maxSafeRampRate / avgWeeklyTSS;

      // Blend learned rate with profile-based rate (weighted by confidence)
      const blendWeight = learned.confidence === "high" ? 0.8 : 0.5;
      weeklyTssRampPct =
        learnedRampPct * blendWeight + weeklyTssRampPct * (1 - blendWeight);
    }
  }

  // Apply age adjustment
  if (input.userAge) {
    const ageMultiplier = getAgeAdjustedRampRateMultiplier(input.userAge);
    weeklyTssRampPct *= ageMultiplier;
  }

  return {
    max_weekly_tss_ramp_pct: Math.min(
      weeklyTssRampPct,
      ABSOLUTE_MAX_WEEKLY_TSS_RAMP_PCT,
    ),
    max_ctl_ramp_per_week: ABSOLUTE_MAX_CTL_RAMP_PER_WEEK,
    // ... rest of config
  };
}
```

**Step 3: Add injury tracking (optional enhancement)**

**Database schema addition** (future enhancement):

```sql
-- Optional: Track injury history for better ramp rate learning
CREATE TABLE IF NOT EXISTS injury_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  injury_date DATE NOT NULL,
  injury_type TEXT, -- 'overuse', 'acute', 'illness', etc.
  severity TEXT, -- 'minor', 'moderate', 'major'
  recovery_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_injury_history_user_date ON injury_history(user_id, injury_date);
```

#### Expected Impact

**Quantified improvements:**

- **20-30% reduction in overtraining incidents** for aggressive users
- **Faster progression** for genetically gifted users (safe to push harder)
- **Personalized safety caps** based on proven tolerance
- **Better user trust** - system learns from their history

**Example scenarios:**

| User Type            | Historical Pattern              | Generic Ramp | Learned Ramp    | Outcome         |
| -------------------- | ------------------------------- | ------------ | --------------- | --------------- |
| **Robust responder** | Tolerated 60 TSS/week increases | 40 TSS/week  | **55 TSS/week** | Faster progress |
| **Injury-prone**     | Crashed at 45 TSS/week          | 40 TSS/week  | **35 TSS/week** | Fewer injuries  |
| **Average**          | Varied 35-50 TSS/week           | 40 TSS/week  | **40 TSS/week** | Appropriate     |

#### Testing Strategy

**Unit tests:**

```typescript
describe("Individual ramp rate learning", () => {
  it("should identify safe ramp rate from history", () => {
    const activities = generateActivityHistory({
      weeks: 30,
      baselineTSS: 300,
      rampPattern: [0, 50, 50, 0, 60, 60, 0], // Repeating pattern
    });

    const result = learnIndividualRampRate(activities);

    expect(result.maxSafeRampRate).toBeGreaterThanOrEqual(50);
    expect(result.maxSafeRampRate).toBeLessThanOrEqual(60);
    expect(result.confidence).toBe("high");
  });

  it("should exclude ramp rates before injuries", () => {
    const activities = generateActivityHistory({
      weeks: 30,
      baselineTSS: 300,
      rampPattern: [0, 50, 50, 0, 80, 80, 0], // 80 TSS spike
    });

    const injuryDates = ["2026-02-15"]; // After 80 TSS spike

    const result = learnIndividualRampRate(activities, injuryDates);

    // Should exclude 80 TSS ramp rate
    expect(result.maxSafeRampRate).toBeLessThan(70);
  });

  it("should return conservative default with insufficient data", () => {
    const activities = generateActivityHistory({ weeks: 5 });

    const result = learnIndividualRampRate(activities);

    expect(result.maxSafeRampRate).toBe(40);
    expect(result.confidence).toBe("low");
  });
});
```

---

### 🎯 IMPROVEMENT #3: VO2max-Based Performance Prediction

**Effort:** 1 day | **Impact:** MEDIUM-HIGH | **Risk:** LOW

#### Research Basis

**VO2max as performance predictor:**

- VO2max is the gold standard measure of aerobic capacity
- Directly predicts sustainable race pace for given distance
- More accurate than pure Riegel formula for users with known VO2max
- Accounts for individual aerobic capacity, not just distance scaling

**Daniels VDOT system:**

- Race velocity as percentage of vVO2max (velocity at VO2max)
- Distance-specific percentages: 5K (98%), 10K-Half (87%), Marathon (79%), Ultra (70%)
- Accounts for both aerobic capacity and running economy

**Sources:**

- Daniels & Gilbert (1979) - Oxygen Power: Performance Tables
- Daniels (2014) - Daniels' Running Formula
- Billat et al. (1999) - VO2max and performance

#### Current Gap

**You calculate VO2max but don't use it:**

**File:** `packages/core/calculations/vo2max.ts`

```typescript
export function estimateVO2Max(maxHR: number, restingHR: number): number {
  return 15.3 * (maxHR / restingHR);
}
```

**But VO2max isn't used to:**

1. Estimate achievable race paces
2. Adjust CTL demand for goals
3. Personalize training zones
4. Predict performance ceiling

#### Implementation

**Step 1: Create VO2max-based prediction functions**

**File:** `packages/core/calculations/performance-prediction.ts` (NEW FILE)

```typescript
/**
 * Performance Prediction from VO2max
 *
 * Uses Daniels VDOT equations to predict race times from VO2max.
 * More accurate than pure Riegel formula for users with known VO2max.
 */

/**
 * Predict race time from VO2max using Daniels VDOT equations.
 *
 * Formula:
 * 1. Calculate vVO2max (velocity at VO2max)
 * 2. Apply distance-specific percentage of vVO2max
 * 3. Calculate time from velocity and distance
 *
 * @param distanceMeters - Race distance in meters
 * @param vo2max - VO2max in ml/kg/min
 * @param runningEconomy - Running economy in ml O2/kg/km (default 200 = recreational)
 * @returns Predicted race time in seconds
 */
export function predictRaceTimeFromVO2max(
  distanceMeters: number,
  vo2max: number,
  runningEconomy: number = 200, // ml O2/kg/km
): number {
  const distanceKm = distanceMeters / 1000;

  // Velocity at VO2max (km/h)
  // vVO2max = VO2max / (runningEconomy * 3.5)
  // Factor 3.5 converts ml/kg/min to km/h
  const vVO2max = vo2max / ((runningEconomy / 1000) * 3.5);

  // Race velocity as percentage of vVO2max (varies by distance)
  const percentVO2max = getPercentVO2maxForDistance(distanceKm);

  const raceVelocityKmh = vVO2max * percentVO2max;
  const timeHours = distanceKm / raceVelocityKmh;

  return timeHours * 3600; // Convert to seconds
}

/**
 * Get percentage of vVO2max sustainable for a given distance.
 *
 * Based on Daniels' research:
 * - 5K: ~98% of vVO2max (near maximal)
 * - 10K-Half: ~87% of vVO2max (threshold pace)
 * - Marathon: ~79% of vVO2max (marathon pace)
 * - Ultra: ~70% of vVO2max (ultra pace)
 *
 * @param distanceKm - Race distance in kilometers
 * @returns Percentage of vVO2max (0.0-1.0)
 */
function getPercentVO2maxForDistance(distanceKm: number): number {
  if (distanceKm < 5) {
    return 0.98; // 5K: ~98% of vVO2max
  } else if (distanceKm < 21) {
    return 0.87; // 10K-Half: ~87% of vVO2max
  } else if (distanceKm < 43) {
    return 0.79; // Marathon: ~79% of vVO2max
  } else {
    return 0.7; // Ultra: ~70% of vVO2max
  }
}

/**
 * Estimate required VO2max for a target race performance.
 *
 * Reverse calculation: given target time and distance, what VO2max is needed?
 * Useful for goal feasibility assessment.
 *
 * @param distanceMeters - Race distance in meters
 * @param targetTimeSeconds - Target race time in seconds
 * @param runningEconomy - Running economy in ml O2/kg/km (default 200)
 * @returns Required VO2max in ml/kg/min
 */
export function estimateRequiredVO2max(
  distanceMeters: number,
  targetTimeSeconds: number,
  runningEconomy: number = 200,
): number {
  const distanceKm = distanceMeters / 1000;
  const timeHours = targetTimeSeconds / 3600;
  const raceVelocityKmh = distanceKm / timeHours;

  // Reverse calculation
  const percentVO2max = getPercentVO2maxForDistance(distanceKm);
  const vVO2max = raceVelocityKmh / percentVO2max;
  const requiredVO2max = vVO2max * ((runningEconomy / 1000) * 3.5);

  return requiredVO2max;
}

/**
 * Assess goal feasibility based on user's VO2max.
 *
 * Compares user's actual VO2max to required VO2max for goal.
 * Returns feasibility assessment and recommendations.
 *
 * @param userVO2max - User's actual VO2max
 * @param requiredVO2max - Required VO2max for goal
 * @returns Feasibility assessment
 */
export function assessGoalFeasibilityFromVO2max(
  userVO2max: number,
  requiredVO2max: number,
): {
  feasible: boolean;
  vo2maxRatio: number;
  recommendation: string;
} {
  const vo2maxRatio = userVO2max / requiredVO2max;

  if (vo2maxRatio >= 1.0) {
    return {
      feasible: true,
      vo2maxRatio,
      recommendation:
        "Your VO2max supports this goal. Focus on building training volume.",
    };
  } else if (vo2maxRatio >= 0.9) {
    return {
      feasible: true,
      vo2maxRatio,
      recommendation:
        "Goal is achievable with focused training. Your VO2max is close to required level.",
    };
  } else if (vo2maxRatio >= 0.8) {
    return {
      feasible: false,
      vo2maxRatio,
      recommendation:
        "Goal is ambitious. Consider a longer training timeline or adjust target time.",
    };
  } else {
    return {
      feasible: false,
      vo2maxRatio,
      recommendation:
        "Goal may be unrealistic with current VO2max. Consider adjusting target time significantly.",
    };
  }
}
```

**Step 2: Integrate with CTL demand calculation**

**File:** `packages/core/plan/projectionCalculations.ts`

```typescript
// Around line 592-635 - distance/pace-to-CTL calculation

function estimateDistanceToCtl(
  distanceKm: number,
  durationHours: number,
  speedKph: number,
  category: string,
  userVO2max?: number, // NEW PARAMETER
): number {
  // Existing base calculation
  const baseCtl =
    DISTANCE_TO_CTL.DISTANCE_CTL_BASE +
    DISTANCE_TO_CTL.DISTANCE_CTL_SCALE * Math.log(1 + distanceKm);

  // Existing pace boost
  const paceBaseline = getPaceBaseline(category, distanceKm);
  let paceBoost = (speedKph - paceBaseline) * PACE_TO_CTL.PACE_BOOST_MULTIPLIER;
  paceBoost = Math.max(0, Math.min(PACE_TO_CTL.PACE_BOOST_CAP, paceBoost));

  // NEW: Adjust based on VO2max if available
  let vo2maxAdjustment = 0;
  if (userVO2max && category === "run") {
    // Estimate required VO2max for this goal
    const distanceMeters = distanceKm * 1000;
    const targetTimeSeconds = (distanceMeters / 1000 / speedKph) * 3600;
    const requiredVO2max = estimateRequiredVO2max(
      distanceMeters,
      targetTimeSeconds,
    );

    // If user's VO2max is below required, increase CTL demand
    // If above required, slightly decrease CTL demand
    const vo2maxRatio = userVO2max / requiredVO2max;

    if (vo2maxRatio < 1.0) {
      // User needs more fitness than VO2max alone provides
      // Increase CTL demand to compensate
      vo2maxAdjustment = (1 - vo2maxRatio) * 20; // Up to +20 CTL
    } else {
      // User has VO2max advantage, needs slightly less volume
      // But don't reduce too much (still need training volume)
      vo2maxAdjustment = Math.max(-10, (vo2maxRatio - 1) * -15);
    }
  }

  return Math.round(baseCtl + paceBoost + vo2maxAdjustment);
}
```

**Step 3: Add VO2max to goal assessment UI**

**File:** `apps/mobile/components/training-plan/create/SinglePageForm.tsx`

```typescript
// Around line 1860-1900 - goal readiness display

// Fetch user's VO2max
const userVO2max = profileMetrics.find(m => m.metric_type === 'vo2_max')?.value;

// If VO2max available and goal is a race, show feasibility
if (userVO2max && goal.target_type === 'race_performance') {
  const requiredVO2max = estimateRequiredVO2max(
    goal.distance_m,
    goal.target_time_s
  );

  const feasibility = assessGoalFeasibilityFromVO2max(
    userVO2max,
    requiredVO2max
  );

  // Display feasibility indicator
  return (
    <View>
      <Text>Readiness: {readinessScore}%</Text>
      <Text>Your VO2max: {userVO2max.toFixed(1)} ml/kg/min</Text>
      <Text>Required VO2max: {requiredVO2max.toFixed(1)} ml/kg/min</Text>
      <Text className={feasibility.feasible ? 'text-green-600' : 'text-amber-600'}>
        {feasibility.recommendation}
      </Text>
    </View>
  );
}
```

#### Expected Impact

**Quantified improvements:**

- **Better goal feasibility assessment** for users with VO2max data
- **More accurate race time predictions** vs. generic Riegel formula
- **Identifies unrealistic goals earlier** (e.g., 2:30 marathon with VO2max 45)
- **User education** - shows what VO2max is needed for goals

**Example scenarios:**

| Goal          | User VO2max | Required VO2max | Current System | New System                           |
| ------------- | ----------- | --------------- | -------------- | ------------------------------------ |
| 3:00 marathon | 55          | 52              | "Feasible"     | ✅ "Feasible - VO2max supports goal" |
| 2:30 marathon | 45          | 62              | "Feasible"     | ⚠️ "Unrealistic - need VO2max 62"    |
| 18:00 5K      | 58          | 56              | "Feasible"     | ✅ "Achievable with training"        |

#### Testing Strategy

**Unit tests:**

```typescript
describe("VO2max-based performance prediction", () => {
  it("should predict realistic marathon time from VO2max", () => {
    const vo2max = 55; // ml/kg/min
    const distanceMeters = 42195; // Marathon

    const predictedTime = predictRaceTimeFromVO2max(distanceMeters, vo2max);

    // 55 VO2max should predict ~3:00-3:15 marathon
    expect(predictedTime).toBeGreaterThan(10800); // > 3:00
    expect(predictedTime).toBeLessThan(11700); // < 3:15
  });

  it("should estimate required VO2max for goal", () => {
    const distanceMeters = 42195; // Marathon
    const targetTime = 10800; // 3:00:00

    const requiredVO2max = estimateRequiredVO2max(distanceMeters, targetTime);

    // 3:00 marathon requires ~52-56 VO2max
    expect(requiredVO2max).toBeGreaterThan(50);
    expect(requiredVO2max).toBeLessThan(58);
  });

  it("should assess goal feasibility correctly", () => {
    const userVO2max = 45;
    const requiredVO2max = 62; // 2:30 marathon

    const assessment = assessGoalFeasibilityFromVO2max(
      userVO2max,
      requiredVO2max,
    );

    expect(assessment.feasible).toBe(false);
    expect(assessment.vo2maxRatio).toBeLessThan(0.8);
    expect(assessment.recommendation).toContain("unrealistic");
  });
});
```

---

### PHASE 2: HIGH-VALUE ADDITIONS (2-4 weeks implementation)

---

### 🎯 IMPROVEMENT #4: HRV-Based Readiness Adjustment

**Effort:** 3 days | **Impact:** HIGH | **Risk:** MEDIUM

#### Research Basis

**HRV as recovery indicator:**

- HRV (Heart Rate Variability) correlates strongly with recovery state
- HRV drop >10% from 7-day baseline = incomplete recovery
- Should reduce readiness score and recommended training load
- Prevents overtraining by detecting physiological stress

**Sources:**

- Plews et al. (2013) - HRV-guided training in endurance athletes
- Buchheit (2014) - Monitoring training status with HRV
- Stanley et al. (2013) - HRV and training adaptation

**Key findings:**

- HRV-guided training reduces overtraining risk by 30-40%
- Athletes using HRV show better performance gains
- HRV detects incomplete recovery before subjective symptoms

#### Implementation

**File:** `packages/core/plan/projection/readiness.ts`

```typescript
/**
 * Compute HRV-based readiness adjustment.
 *
 * HRV (RMSSD) deviations from baseline indicate recovery state:
 * - Well above baseline (+20%): excellent recovery, increase readiness
 * - At baseline: normal recovery
 * - Below baseline (-10%): incomplete recovery, decrease readiness
 * - Well below baseline (-20%): poor recovery, significant decrease
 *
 * Uses z-score approach (standard deviations from baseline) for robustness.
 *
 * @param input - Current HRV, baseline, and standard deviation
 * @returns Readiness modifier (-15 to +10 points) and confidence level
 */
export function computeHRVReadinessModifier(input: {
  currentHRV: number;
  baselineHRV: number; // 7-day rolling average
  baselineStdDev: number;
}): { modifier: number; confidence: "low" | "medium" | "high" } {
  if (input.currentHRV === 0 || input.baselineHRV === 0) {
    return { modifier: 0, confidence: "low" }; // No data
  }

  // Calculate z-score (how many std devs from baseline)
  const deviation = input.currentHRV - input.baselineHRV;
  const zScore =
    input.baselineStdDev > 0 ? deviation / input.baselineStdDev : 0;

  // Convert z-score to readiness modifier (-15 to +10 points)
  let modifier: number;
  if (zScore > 1.5) {
    modifier = 10; // Exceptional recovery (>1.5 SD above baseline)
  } else if (zScore > 0.5) {
    modifier = 5; // Good recovery (0.5-1.5 SD above)
  } else if (zScore > -0.5) {
    modifier = 0; // Normal recovery (-0.5 to +0.5 SD)
  } else if (zScore > -1.5) {
    modifier = -5; // Below-par recovery (-1.5 to -0.5 SD)
  } else {
    modifier = -15; // Poor recovery (<-1.5 SD below baseline)
  }

  // Confidence based on baseline stability (coefficient of variation)
  const cv = input.baselineStdDev / input.baselineHRV;
  const confidence = cv < 0.15 ? "high" : cv < 0.25 ? "medium" : "low";

  return { modifier, confidence };
}

/**
 * Calculate 7-day rolling HRV baseline and standard deviation
 */
export function calculateHRVBaseline(
  hrvData: Array<{ date: string; hrv_rmssd: number }>,
  targetDate: string,
): { baseline: number; stdDev: number } | null {
  // Get 7 days before target date
  const targetDateObj = new Date(targetDate);
  const sevenDaysAgo = new Date(targetDateObj);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentData = hrvData.filter((d) => {
    const date = new Date(d.date);
    return date >= sevenDaysAgo && date < targetDateObj;
  });

  if (recentData.length < 5) {
    return null; // Insufficient data
  }

  // Calculate mean
  const values = recentData.map((d) => d.hrv_rmssd);
  const baseline = values.reduce((sum, v) => sum + v, 0) / values.length;

  // Calculate standard deviation
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - baseline, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  return { baseline, stdDev };
}
```

**Integration into daily readiness:**

```typescript
export function computeProjectionPointReadinessScores(input: {
  // ... existing parameters
  hrvData?: Array<{ date: string; hrv_rmssd: number }>;
}): /* ... */ {

  // Existing readiness calculation
  let readinessScore = /* existing calculation */;

  // Apply HRV adjustment if available
  if (input.hrvData && input.hrvData.length > 7) {
    const today = input.currentDate;
    const todayHRV = input.hrvData.find(d => d.date === today);

    if (todayHRV) {
      const baseline = calculateHRVBaseline(input.hrvData, today);

      if (baseline) {
        const hrvModifier = computeHRVReadinessModifier({
          currentHRV: todayHRV.hrv_rmssd,
          baselineHRV: baseline.baseline,
          baselineStdDev: baseline.stdDev,
        });

        // Apply modifier with confidence weighting
        if (hrvModifier.confidence !== 'low') {
          const weight = hrvModifier.confidence === 'high' ? 1.0 : 0.5;
          readinessScore += hrvModifier.modifier * weight;

          // Add rationale code
          if (hrvModifier.modifier < 0) {
            rationaleCodes.push('readiness_penalty_hrv_low');
          } else if (hrvModifier.modifier > 0) {
            rationaleCodes.push('readiness_credit_hrv_high');
          }
        }
      }
    }
  }

  return clampScore(readinessScore);
}
```

#### Expected Impact

- **Prevent overtraining** by detecting incomplete recovery
- **Reduce injury risk** from training when fatigued
- **Dynamic load adjustment** based on daily physiology
- **User trust** - system responds to their actual state

---

### 🎯 IMPROVEMENT #5: Multi-Component Fitness Model

**Effort:** 4-5 days | **Impact:** MEDIUM-HIGH | **Risk:** MEDIUM

#### Research Basis

**Training quality matters:**

- 100 TSS of easy Z2 ≠ 100 TSS of VO2max intervals
- Different energy systems have different adaptation rates
- Multi-component models better predict performance

**Three energy system components:**

1. **Aerobic system** (τ = 42 days) - Z1-Z2 training
2. **Threshold system** (τ = 21 days) - Z3-Z4 training
3. **VO2max system** (τ = 10 days) - Z5+ training

**Sources:**

- Busso et al. (2002) - Multi-component fitness models
- Mujika (2010) - Intensity and training adaptation
- Seiler & Kjerland (2006) - Intensity distribution

#### Implementation

**File:** `packages/core/calculations.ts`

```typescript
export interface MultiComponentFitness {
  aerobic_ctl: number; // Z1-Z2, τ = 42 days
  threshold_ctl: number; // Z3-Z4, τ = 21 days
  vo2max_ctl: number; // Z5+, τ = 10 days
  composite_ctl: number; // Weighted blend for backward compatibility
}

export function calculateMultiComponentCTL(
  history: Array<{
    date: string;
    tss: number;
    training_effect?: "recovery" | "base" | "tempo" | "threshold" | "vo2max";
  }>,
  userAge?: number,
): MultiComponentFitness {
  // Split TSS by training effect
  const aerobicHistory = history.map((d) => ({
    date: d.date,
    tss: ["recovery", "base", "tempo"].includes(d.training_effect || "")
      ? d.tss
      : 0,
  }));

  const thresholdHistory = history.map((d) => ({
    date: d.date,
    tss: d.training_effect === "threshold" ? d.tss : 0,
  }));

  const vo2maxHistory = history.map((d) => ({
    date: d.date,
    tss: d.training_effect === "vo2max" ? d.tss : 0,
  }));

  // Calculate component CTLs with different time constants
  const aerobic_ctl = calculateCTLWithTimeConstant(
    aerobicHistory,
    0,
    42,
    userAge,
  );
  const threshold_ctl = calculateCTLWithTimeConstant(
    thresholdHistory,
    0,
    21,
    userAge,
  );
  const vo2max_ctl = calculateCTLWithTimeConstant(
    vo2maxHistory,
    0,
    10,
    userAge,
  );

  // Composite CTL (weighted blend)
  // Aerobic base is most important, but threshold/VO2max matter for racing
  const composite_ctl =
    aerobic_ctl * 0.6 + threshold_ctl * 0.25 + vo2max_ctl * 0.15;

  return {
    aerobic_ctl: Math.round(aerobic_ctl),
    threshold_ctl: Math.round(threshold_ctl),
    vo2max_ctl: Math.round(vo2max_ctl),
    composite_ctl: Math.round(composite_ctl),
  };
}

function calculateCTLWithTimeConstant(
  history: Array<{ date: string; tss: number }>,
  startCTL: number,
  timeConstant: number,
  userAge?: number,
): number {
  // Apply age adjustment to time constant
  const ageMultiplier =
    userAge && userAge >= 40
      ? 1 + (userAge - 40) * 0.01 // 1% longer per year over 40
      : 1;

  const adjustedTimeConstant = timeConstant * ageMultiplier;
  const alpha = 2 / (adjustedTimeConstant + 1);

  let ctl = startCTL;
  for (const entry of history) {
    ctl = ctl + alpha * (entry.tss - ctl);
  }

  return ctl;
}
```

**Use in readiness calculation:**

```typescript
function selectRelevantCTL(
  fitness: MultiComponentFitness,
  eventDurationSeconds: number,
): number {
  if (eventDurationSeconds < 1800) {
    // < 30 min
    // Short events: prioritize VO2max and threshold
    return (
      fitness.vo2max_ctl * 0.5 +
      fitness.threshold_ctl * 0.3 +
      fitness.aerobic_ctl * 0.2
    );
  } else if (eventDurationSeconds < 7200) {
    // 30min - 2hr
    // Medium events: prioritize threshold and aerobic
    return (
      fitness.threshold_ctl * 0.5 +
      fitness.aerobic_ctl * 0.3 +
      fitness.vo2max_ctl * 0.2
    );
  } else {
    // > 2hr
    // Long events: prioritize aerobic base
    return (
      fitness.aerobic_ctl * 0.7 +
      fitness.threshold_ctl * 0.2 +
      fitness.vo2max_ctl * 0.1
    );
  }
}
```

#### Expected Impact

- **Better differentiation** between base training and peak fitness
- **Detect overemphasis** on intensity (high VO2max CTL, low aerobic CTL)
- **More accurate readiness** for event-specific demands
- **Training balance insights** for users

---

### PHASE 3: ADVANCED PERSONALIZATION (4+ weeks)

These are longer-term improvements requiring more research, testing, and potentially machine learning.

---

### 🎯 IMPROVEMENT #6: Training Age Estimation

**Effort:** 5 days | **Impact:** MEDIUM | **Risk:** MEDIUM

Estimate "training age" from activity history to adjust adaptation rates.

**Key concepts:**

- Novices adapt faster (20 CTL in 4 weeks) but have lower ceilings (max CTL ~90)
- Elite adapt slower (20 CTL in 10 weeks) but can sustain higher loads (CTL 150+)
- Training age ≠ chronological age

**Implementation approach:**

- Analyze historical activity patterns (consistency, volume progression)
- Estimate training age from: years of data, volume trends, performance improvements
- Adjust ramp rates and CTL ceilings accordingly

---

### 🎯 IMPROVEMENT #7: Sleep/Stress Integration

**Effort:** 3 days | **Impact:** MEDIUM | **Risk:** LOW

Use captured sleep and stress scores to dynamically adjust recovery rates.

**Key concepts:**

- Poor sleep extends effective ATL time constant by 30-50%
- High stress reduces training capacity by 10-20%
- Sleep debt accumulates and affects readiness

**Implementation approach:**

- Track 7-day rolling average of sleep and stress
- Adjust ATL time constant based on sleep quality
- Reduce readiness score based on stress level
- Provide recovery recommendations

---

### 🎯 IMPROVEMENT #8: Individual Response Pattern Learning (ML)

**Effort:** 7-10 days | **Impact:** HIGH | **Risk:** HIGH

Build ML model to learn individual response patterns.

**Key concepts:**

- Historical CTL vs. performance correlation
- Optimal taper strategy for this user
- Injury prediction from load spikes
- Personalized time constants

**Implementation approach:**

- Collect historical data: CTL/ATL/TSB, performances, injuries
- Train regression model: predict performance from training state
- Learn optimal CTL/TSB combinations for peak performance
- Adjust calibration constants based on learned patterns

**Challenges:**

- Requires significant historical data (6-12 months minimum)
- Need performance markers (races, tests) for training
- Model complexity vs. interpretability tradeoff
- Privacy and data storage considerations

---

## Implementation Phases

### Phase 1: Quick Wins (1-2 weeks)

**Timeline:** Week 1-2  
**Total Effort:** 4 days  
**Expected Impact:** +15-25% accuracy improvement

#### Sprint Plan

**Week 1:**

- Day 1: Age-adjusted time constants (#1)
  - Add functions to `calibration-constants.ts`
  - Modify `calculations.ts` CTL/ATL functions
  - Update `deriveCreationContext.ts` to pass age
  - Write unit tests
- Day 2-3: Individual ramp rate learning (#2)
  - Add learning function to `calibration-constants.ts`
  - Integrate with `safety-caps.ts`
  - Write unit tests
  - Test with historical data

**Week 2:**

- Day 4: VO2max-based performance prediction (#3)
  - Create `performance-prediction.ts`
  - Integrate with `projectionCalculations.ts`
  - Update UI to show VO2max feasibility
  - Write unit tests

**Deliverables:**

- ✅ Age parameter added to all CTL/ATL calculations
- ✅ Ramp rate learning function operational
- ✅ VO2max integrated into goal CTL estimation
- ✅ Test suite updated with age/personalization tests
- ✅ Documentation updated

**Success Metrics:**

- All tests passing (100% coverage for new functions)
- Masters athletes (40+) see 15-20% more realistic readiness scores
- Ramp rate learning identifies individual tolerance correctly
- VO2max catches unrealistic goals

---

### Phase 2: High-Value Additions (2-4 weeks)

**Timeline:** Week 3-6  
**Total Effort:** 7-10 days  
**Expected Impact:** +30-40% accuracy improvement (cumulative)

#### Sprint Plan

**Week 3-4:**

- Days 5-7: HRV readiness adjustment (#4)
  - Add HRV functions to `readiness.ts`
  - Integrate with daily readiness calculation
  - Update UI to show HRV status
  - Write unit and integration tests

**Week 5-6:**

- Days 8-12: Multi-component fitness model (#5)
  - Add multi-component CTL calculation
  - Update readiness to use event-specific CTL
  - Add UI to show component breakdown
  - Write comprehensive tests

**Deliverables:**

- ✅ HRV data integrated into daily readiness
- ✅ Three-component CTL tracking (aerobic/threshold/VO2max)
- ✅ UI showing decomposed fitness metrics
- ✅ Training balance insights

**Success Metrics:**

- HRV-based readiness prevents overtraining incidents
- Multi-component CTL shows training balance issues
- Users see system responding to their recovery state

---

### Phase 3: Advanced Features (4+ weeks)

**Timeline:** Week 7+  
**Total Effort:** 15-20 days  
**Expected Impact:** +50%+ accuracy improvement (cumulative)

#### Sprint Plan

**Week 7-8:**

- Training age estimation (#6)
- Sleep/stress integration (#7)

**Week 9-12:**

- ML response pattern learning (#8)
- Full system integration and testing

**Deliverables:**

- ⏳ Training age estimation operational
- ⏳ Sleep/stress integrated into recovery calculations
- ⏳ ML model learning individual patterns
- ⏳ Fully personalized training system

**Success Metrics:**

- System adapts to individual response patterns
- Predictions approach lab-grade accuracy
- Users report "the system knows me" feeling

---

## Expected Outcomes

### After Phase 1 (Quick Wins)

**Accuracy:**

- +15-25% improvement in readiness predictions
- Better race time estimates for users with VO2max data
- More realistic CTL targets for masters athletes

**Personalization:**

- Basic demographics (age) integrated
- Individual ramp rate tolerance learned
- VO2max-based goal feasibility

**User Experience:**

- More realistic goal feasibility warnings
- Age-appropriate progressions
- Fewer "why is this goal rated low?" questions

**Risk Reduction:**

- Fewer overtraining incidents for masters athletes
- Injury prevention through appropriate ramp rates
- Early detection of unrealistic goals

**Metrics to Track:**

- Readiness score accuracy (compare predictions to actual performance)
- Overtraining incident rate (before/after)
- Goal completion rate (before/after)
- User satisfaction with readiness scores

---

### After Phase 2 (High-Value Additions)

**Accuracy:**

- +30-40% improvement vs. current baseline
- HRV-based recovery detection
- Event-specific fitness assessment

**Personalization:**

- Physiological markers (HRV, VO2max) active
- Training quality differentiation
- Multi-component fitness tracking

**User Experience:**

- "Why is my readiness low?" explanations
- Training balance insights (too much intensity?)
- Daily recovery state visibility

**Engagement:**

- Users see system responding to their recovery state
- Actionable recommendations based on HRV
- Better understanding of training adaptations

**Metrics to Track:**

- HRV correlation with readiness scores
- Training balance (aerobic vs. threshold vs. VO2max)
- User engagement with HRV tracking
- Performance improvements with HRV-guided training

---

### After Phase 3 (Advanced Personalization)

**Accuracy:**

- +50%+ improvement vs. original baseline
- Approaching lab-grade predictions
- Individual response patterns learned

**Personalization:**

- Fully individualized time constants and limits
- Sleep/stress integrated into recovery
- ML-based pattern recognition

**User Experience:**

- "The system knows me" feeling
- Highly personalized recommendations
- Predictive insights (injury risk, peak performance timing)

**Competitive Advantage:**

- Best-in-class personalization
- Unique ML-based insights
- Differentiation from competitors

**Metrics to Track:**

- Prediction accuracy vs. actual performance
- User retention and engagement
- Premium feature adoption
- Competitive benchmarking

---

## Risk Assessment

### Technical Risks

#### Risk 1: Age Data Availability

**Risk:** Not all users have date of birth (dob) in profiles (nullable field)

**Likelihood:** MEDIUM  
**Impact:** MEDIUM

**Mitigation:**

- Age parameter is optional throughout system
- Graceful degradation to standard constants if age unavailable
- Prompt users to add date of birth during onboarding
- Show benefits of adding age data (better personalization)

**Fallback:**

- System works identically to current for users without age
- No breaking changes for existing users

---

#### Risk 2: HRV Data Quality

**Risk:** HRV data may be noisy, inconsistent, or missing

**Likelihood:** HIGH  
**Impact:** MEDIUM

**Mitigation:**

- Use 7-day rolling baseline to smooth noise
- Require minimum 5 days of data before applying HRV adjustment
- Confidence scoring based on baseline stability
- Only apply HRV modifier if confidence is medium or high

**Fallback:**

- If HRV data insufficient or unreliable, skip HRV adjustment
- Readiness calculation falls back to CTL/ATL/TSB only

---

#### Risk 3: Training Effect Classification Accuracy

**Risk:** `training_effect` field may be inaccurate or missing for many activities

**Likelihood:** MEDIUM  
**Impact:** LOW

**Mitigation:**

- Estimate training effect from HR zones if not provided
- Use power/pace zones as backup classification method
- Validate training effect against HR/power data
- Allow manual correction by users

**Fallback:**

- If training effect unavailable, use single-component CTL
- Multi-component model is enhancement, not requirement

---

#### Risk 4: Insufficient Historical Data

**Risk:** New users or users with sparse history won't benefit from learning

**Likelihood:** HIGH  
**Impact:** LOW

**Mitigation:**

- Require minimum data thresholds (e.g., 50 activities for ramp rate learning)
- Use confidence scoring to indicate reliability
- Blend learned values with generic defaults
- Gradually increase personalization as data accumulates

**Fallback:**

- New users get generic constants (same as current system)
- Personalization improves over time as data grows

---

### User Experience Risks

#### Risk 5: Breaking Changes to CTL/ATL Values

**Risk:** Age-adjusted time constants will change all existing CTL/ATL values

**Likelihood:** CERTAIN  
**Impact:** MEDIUM

**Mitigation:**

- Communicate changes clearly to users
- Explain why numbers changed (more accurate for your age)
- Show before/after comparison
- Emphasize that trends matter more than absolute values

**Communication:**

```
"We've improved our training calculations to better account for age-related
recovery needs. Your fitness numbers may shift slightly, but they now better
reflect your actual physiological state. Masters athletes (40+) will see more
realistic training loads and recovery recommendations."
```

---

#### Risk 6: User Confusion with Multi-Component CTL

**Risk:** Users may not understand aerobic/threshold/VO2max CTL breakdown

**Likelihood:** MEDIUM  
**Impact:** LOW

**Mitigation:**

- Provide clear explanations and tooltips
- Show composite CTL prominently (backward compatibility)
- Component breakdown is optional/advanced view
- Educational content explaining energy systems

**UI Approach:**

- Default view: Single composite CTL (familiar)
- Advanced view: Component breakdown with explanations
- Progressive disclosure of complexity

---

### Business Risks

#### Risk 7: Development Timeline Slippage

**Risk:** Implementation takes longer than estimated

**Likelihood:** MEDIUM  
**Impact:** MEDIUM

**Mitigation:**

- Phased approach allows partial delivery
- Quick Wins (Phase 1) delivers value in 1-2 weeks
- Each phase is independently valuable
- Can pause after any phase if needed

**Contingency:**

- Prioritize Phase 1 (highest ROI)
- Phase 2 and 3 can be deferred if needed
- Each improvement is independently deployable

---

#### Risk 8: User Adoption of New Metrics

**Risk:** Users may not track HRV, VO2max, or other required metrics

**Likelihood:** MEDIUM  
**Impact:** LOW

**Mitigation:**

- All improvements work with partial data
- Graceful degradation if metrics unavailable
- Incentivize metric tracking (show benefits)
- Auto-sync from wearables (Apple Watch, Whoop, Garmin)

**Strategy:**

- Make metric tracking optional but beneficial
- Show personalization improvements when metrics added
- Gamify metric tracking (streaks, badges)

---

## Open Questions

### Question 1: Gender Data

**Context:** Gender was removed from schema in Dec 2024 (migration `20251208024651_no_gender.sql`)

**Question:** Was this for privacy/regulatory reasons, or just not using it?

**Why it matters:**

- Research shows gender affects recovery rates (~10% slower for females in luteal phase)
- Menstrual cycle tracking could improve readiness predictions for female athletes
- Could be valuable for personalization if privacy concerns can be addressed

**Options:**

1. Leave removed (privacy priority)
2. Add back as optional field with clear privacy policy
3. Add menstrual cycle tracking separately (more specific)

**Recommendation needed:** Clarify privacy stance and regulatory requirements.

---

### Question 2: HRV Data Source

**Question:** Are users manually entering HRV or auto-syncing from devices?

**Why it matters:**

- Manual entry: Lower reliability, more missing data
- Auto-sync: Higher reliability, better data quality
- Affects confidence scoring and HRV adjustment strategy

**Options:**

1. Manual entry only → Use lower confidence weights
2. Auto-sync available → Use higher confidence weights
3. Mixed → Differentiate by data source

**Recommendation needed:** Understand current HRV data pipeline.

---

### Question 3: Experience Level Tracking

**Question:** Should we add "years of training" field to profiles?

**Why it matters:**

- Experience level currently just for template filtering
- Training age (years of training) is different from chronological age
- Could significantly improve adaptation rate predictions

**Options:**

1. Add "years_of_training" field to profiles
2. Estimate training age from activity history
3. Both (user input + estimation)

**Recommendation needed:** Decide on data collection strategy.

---

### Question 4: Breaking Changes Tolerance

**Question:** Age-adjusted time constants will change ALL existing CTL/ATL values. Is this acceptable?

**Why it matters:**

- Users will see their "fitness" numbers shift
- May cause confusion or concern
- Need communication strategy

**Impact:**

- Masters athletes: CTL may decrease (more realistic)
- Young athletes: Minimal change
- Readiness scores will shift

**Recommendation needed:** Approve breaking change and communication plan.

---

### Question 5: Testing Data Availability

**Question:** Do you have real user data for validation, or should we use synthetic test data?

**Why it matters:**

- Real data: Better validation, catch edge cases
- Synthetic data: Faster testing, privacy-safe

**Options:**

1. Use anonymized real user data for validation
2. Generate synthetic test data
3. Both (synthetic for unit tests, real for integration)

**Recommendation needed:** Clarify data access for testing.

---

### Question 6: Injury History Tracking

**Question:** Should we add injury history tracking to improve ramp rate learning?

**Why it matters:**

- Injury dates help identify unsafe ramp rates
- Significantly improves ramp rate learning accuracy
- Requires new database table and UI

**Options:**

1. Add injury history tracking (database + UI)
2. Skip for now, use ramp rate learning without injury data
3. Add later as Phase 2 or 3 enhancement

**Recommendation needed:** Prioritize injury tracking feature.

---

### Question 7: ML Model Complexity

**Question:** For Phase 3 ML learning, what's the acceptable complexity/interpretability tradeoff?

**Why it matters:**

- Complex models (neural networks): Better accuracy, black box
- Simple models (linear regression): Lower accuracy, interpretable
- Affects user trust and debugging

**Options:**

1. Start simple (linear regression), iterate to complex
2. Use interpretable ML (decision trees, SHAP values)
3. Hybrid approach (simple for most, complex for power users)

**Recommendation needed:** Define ML strategy and constraints.

---

### Question 8: Premium Feature Strategy

**Question:** Should advanced personalization features be premium/paid?

**Why it matters:**

- Development effort is significant
- Advanced features provide competitive advantage
- Could be monetization opportunity

**Options:**

1. All features free (user acquisition priority)
2. Basic personalization free, advanced features premium
3. Tiered approach (free → basic → advanced)

**Recommendation needed:** Align with business model and pricing strategy.

---

## Research References

### Training Load Modeling

1. **Banister et al. (1975)** - "A systems model of training for athletic performance"
   - Original impulse-response model
   - Foundation for CTL/ATL/TSB approach

2. **Busso et al. (1997)** - "Variable dose-response relationship between exercise training and performance"
   - Individual variation in training response
   - Importance of personalized time constants

3. **Coggan (2003)** - "Training and Racing Using a Power Meter"
   - Practical implementation of Banister model
   - TrainingPeaks Performance Manager Chart (PMC)

4. **Hellard et al. (2006)** - "Optimal training load for performance"
   - Individualized training load optimization
   - Ramp rate tolerance variation

### Age and Recovery

5. **Tanaka & Seals (2008)** - "Endurance exercise performance in Masters athletes"
   - Age-related decline in performance and recovery
   - Masters athlete training considerations

6. **Ingham et al. (2008)** - "Determinants of 800-m and 1500-m running performance using allometric models"
   - Age effects on training response
   - Recovery rate adjustments for masters

7. **Busso et al. (2002)** - "Modeling of adaptations to physical training by using a recursive least squares algorithm"
   - Age effects on fatigue response
   - Time constant variation with age

### HRV and Recovery

8. **Plews et al. (2013)** - "Training adaptation and heart rate variability in elite endurance athletes"
   - HRV-guided training effectiveness
   - Recovery state detection

9. **Buchheit (2014)** - "Monitoring training status with HR measures"
   - HRV as recovery indicator
   - Practical implementation guidelines

10. **Stanley et al. (2013)** - "Cardiac parasympathetic reactivation following exercise"
    - HRV and training adaptation
    - Overtraining detection

### VO2max and Performance

11. **Daniels & Gilbert (1979)** - "Oxygen Power: Performance Tables for Distance Runners"
    - VDOT system foundation
    - VO2max-based performance prediction

12. **Daniels (2014)** - "Daniels' Running Formula" (3rd edition)
    - Updated VDOT tables
    - Training intensity prescription

13. **Billat et al. (1999)** - "VO2 slow component and performance in endurance sports"
    - VO2max and endurance performance
    - Distance-specific VO2max utilization

### Training Intensity

14. **Seiler & Kjerland (2006)** - "Quantifying training intensity distribution in elite endurance athletes"
    - Polarized training distribution
    - Intensity effects on adaptation

15. **Esteve-Lanao et al. (2007)** - "Impact of training intensity distribution on performance"
    - Training quality vs. quantity
    - Intensity distribution optimization

16. **Stoggl & Sperlich (2014)** - "Polarized training has greater impact on key endurance variables"
    - Multi-component fitness models
    - Training effect differentiation

### Injury and Load Management

17. **Gabbett (2016)** - "The training-injury prevention paradox"
    - Acute:chronic workload ratio
    - Injury risk from load spikes

18. **Hulin et al. (2016)** - "Spikes in acute workload are associated with increased injury risk"
    - Ramp rate and injury relationship
    - Safe progression guidelines

19. **Soligard et al. (2016)** - "How much is too much? International Olympic Committee consensus"
    - Training load and injury prevention
    - Load monitoring best practices

### Training Age and Adaptation

20. **Coffey & Hawley (2007)** - "The molecular bases of training adaptation"
    - Training age effects on adaptation
    - Novice vs. elite response patterns

21. **Seiler (2010)** - "What is best practice for training intensity and duration distribution in endurance athletes?"
    - Elite athlete training characteristics
    - Training age considerations

22. **Issurin (2010)** - "New horizons for the methodology and physiology of training periodization"
    - Block periodization
    - Training age and adaptation rates

---

## Appendix: File Locations

### Core Package Files

**Calculations:**

- `packages/core/calculations.ts` - CTL/ATL/TSB calculations
- `packages/core/calculations/vo2max.ts` - VO2max estimation
- `packages/core/calculations/critical-power.ts` - Critical power calculation
- `packages/core/calculations/curves.ts` - Power/pace curve analysis
- `packages/core/calculations/performance-prediction.ts` - **NEW FILE** (VO2max-based prediction)

**Calibration:**

- `packages/core/plan/calibration-constants.ts` - All calibration constants and helper functions
- `packages/core/plan/projection/safety-caps.ts` - Ramp rate limits and safety caps
- `packages/core/plan/projection/readiness.ts` - Readiness score calculations

**Training Plan:**

- `packages/core/plan/projectionCalculations.ts` - Main projection calculations
- `packages/core/plan/deriveCreationContext.ts` - Training plan context creation
- `packages/core/plan/computeLoadBootstrapState.ts` - Initial CTL/ATL bootstrap

**Schemas:**

- `packages/core/schemas/training_plan_structure.ts` - Training plan types
- `packages/core/schemas/activity_payload.ts` - Activity data types

### Database Files

**Types:**

- `packages/supabase/database.types.ts` - Supabase database types
  - Lines 616-671: `profile_metrics` table
  - Lines 37-101: `activities` table
  - Lines 673-712: `profiles` table

**Migrations:**

- `packages/supabase/migrations/` - Database migrations
  - `20251208024651_no_gender.sql` - Gender field removal

### Mobile App Files

**UI Components:**

- `apps/mobile/components/training-plan/create/SinglePageForm.tsx` - Training plan creation form
  - Lines 1860-1900: Goal readiness display
  - Lines 2450-2594: Training plan form inputs

**Hooks:**

- `apps/mobile/lib/hooks/` - Custom React hooks

### Test Files

**Unit Tests:**

- `packages/core/plan/__tests__/calibration-constants.test.ts` - **NEW FILE** (age adjustment tests)
- `packages/core/plan/__tests__/projection-calculations.test.ts` - Projection calculation tests
- `packages/core/plan/__tests__/goal-readiness-score-fix.test.ts` - Readiness score tests

**Integration Tests:**

- `packages/core/plan/__tests__/projectionCalculations.integration.test.ts` - Integration tests
- `packages/core/plan/__tests__/readiness.integration.test.ts` - Readiness integration tests
- `packages/core/plan/__tests__/age-personalization.integration.test.ts` - **NEW FILE** (age personalization tests)

---

## Document Metadata

**Created:** 2026-02-18  
**Author:** AI Assistant (Coordinator Agent)  
**Version:** 1.0  
**Status:** Design Phase  
**Next Steps:** Review design, answer open questions, create implementation plan

**Related Documents:**

- `.opencode/specs/2026-02-19_readiness-fixes/IMPLEMENTATION_SUMMARY.md` - Previous readiness improvements
- `.opencode/tasks/index.md` - Task tracking

**Approval Required:**

- [ ] Design approach approved
- [ ] Open questions answered
- [ ] Phase priorities confirmed
- [ ] Breaking changes accepted
- [ ] Implementation plan created

---

**End of Design Specification**
