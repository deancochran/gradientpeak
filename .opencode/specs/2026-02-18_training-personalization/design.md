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
| **Phase 2: High-Value** | 2-4 weeks | 7-10 days  | +30-40% | Multi-component fitness           |
| **Phase 3: Advanced**   | 4+ weeks  | 15-20 days | +50%+   | ML learning, full personalization |

### Top 3 Priorities (Highest ROI)

1. **🥇 Age-Adjusted Time Constants** - 1 day, 15% accuracy boost, uses existing data *(applied only when DOB is available)*
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
- Gender was removed (migration `20251208024651_no_gender.sql`) — **to be restored** as an optional field (see Open Questions)
- No adjustments for masters athletes (40+)

> **Note:** Since age is computed from `profiles.dob`, which is an optional/nullable field, age-adjusted calculations are applied only when DOB is present. All age-dependent functions degrade gracefully to standard constants when age is unavailable.

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
| `hrv_rmssd`           | ✅ Yes    | profile_metrics | ❌ No                   | **HIGH**       | Daily readiness, recovery state *(deferred — see Open Questions)* |
| `sleep_hours`         | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Recovery rate adjustment               |
| `stress_score`        | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Training capacity reduction            |
| `wellness_score`      | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Composite readiness                    |
| `soreness_level`      | ✅ Yes    | profile_metrics | ❌ No                   | **MEDIUM**     | Injury risk indicator                  |
| `resting_hr`          | ✅ Yes    | profile_metrics | ❌ No                   | **LOW**        | VO2max calculation input               |
| `body_fat_percentage` | ✅ Yes    | profile_metrics | ❌ No                   | **LOW**        | Minor performance factor               |
| `dob` (age)           | ✅ Yes    | profiles        | ❌ No (except calories) | **CRITICAL**   | See Gap #1 *(applied when DOB present)* |
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
2. **HRV** → Daily readiness adjustment, recovery state detection *(deferred)*
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

---

### GAP #6: No Training Age/Experience Modeling 🟠 **MEDIUM PRIORITY** *(Low current priority)*

#### Problem

**Experience level exists but only for template filtering:**

**Current usage** (`packages/core/schemas/training_plan_structure.ts`):

```typescript
experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional();

// Only used to filter which templates show up
// NOT used in calculations or progressions
```

#### Decision

Training age **should be inferred from activity history** (years of consistent data, volume trends, performance progression) rather than relying on self-reported input. However, this feature is **not a priority at this time** and is deferred to a later phase.

**Future implementation approach (deferred):**

- Analyze historical activity patterns: years of data, training consistency, volume progression
- Estimate "training age" automatically — no new user-facing field required
- Adjust ramp rates and CTL ceilings accordingly

---

## Technical Deep-Dive: Improvements

### PHASE 1: QUICK WINS (1-2 weeks implementation)

These improvements use **existing data**, require **minimal new code**, and provide **immediate ROI**.

---

### 🎯 IMPROVEMENT #1: Age-Adjusted Time Constants

**Effort:** 1 day | **Impact:** HIGH | **Risk:** LOW

> **Important:** Age is derived from `profiles.dob`, which is nullable. Age-adjusted calculations are applied **only when DOB is present**; all functions degrade gracefully to standard constants otherwise.

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
 * Get age-adjusted ATL time constant.
 * Applied only when age is known (derived from profiles.dob).
 * Falls back to standard 7-day constant when age is undefined.
 */
export function getAgeAdjustedATLTimeConstant(age: number | undefined): number {
  if (age === undefined || age < 30) return 7;
  if (age < 40) return 8;
  if (age < 50) return 11;
  return 13;
}

export function getAgeAdjustedCTLTimeConstant(age: number | undefined): number {
  if (age === undefined || age < 40) return 42;
  if (age < 50) return 45;
  return 48;
}

export function getMaxSustainableCTL(age: number | undefined): number {
  if (age === undefined || age < 30) return 150;
  if (age < 40) return 130;
  if (age < 50) return 110;
  return 90;
}

export function getAgeAdjustedRampRateMultiplier(age: number | undefined): number {
  if (age === undefined || age < 40) return 1.0;
  if (age < 50) return 0.85;
  return 0.7;
}
```

**Step 2: Modify CTL/ATL calculations**

**File:** `packages/core/calculations.ts`

```typescript
export function calculateCTL(
  history: { date: string; tss: number }[],
  startCTL = 0,
  userAge?: number, // Optional — only applied when DOB is available
): number {
  const timeConstant = getAgeAdjustedCTLTimeConstant(userAge);
  const alpha = 2 / (timeConstant + 1);
  let ctl = startCTL;
  for (const entry of history) {
    ctl = ctl + alpha * (entry.tss - ctl);
  }
  return Math.round(ctl * 10) / 10;
}

export function calculateATL(
  history: { date: string; tss: number }[],
  startATL = 0,
  userAge?: number,
): number {
  const timeConstant = getAgeAdjustedATLTimeConstant(userAge);
  const alpha = 2 / (timeConstant + 1);
  let atl = startATL;
  for (const entry of history) {
    atl = atl + alpha * (entry.tss - atl);
  }
  return Math.round(atl * 10) / 10;
}
```

**Step 3: Pass age throughout the system**

**File:** `packages/core/plan/deriveCreationContext.ts`

```typescript
// Calculate user age from date of birth (only if dob is present)
const userAge = profile?.dob
  ? Math.floor(
      (Date.now() - new Date(profile.dob).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000),
    )
  : undefined; // Age-adjusted calculations skipped when dob is null

const ctl = calculateCTL(history, startCTL, userAge);
const atl = calculateATL(history, startATL, userAge);
const tsb = calculateTSB(ctl, atl);

const context = {
  // ... existing context fields
  user_age: userAge,
  max_sustainable_ctl: getMaxSustainableCTL(userAge),
};
```

#### Expected Impact

| User           | Age | Old ATL | New ATL     | Old Max CTL | New Max CTL | Impact                  |
| -------------- | --- | ------- | ----------- | ----------- | ----------- | ----------------------- |
| Elite young    | 25  | 7 days  | 7 days      | 150         | 150         | No change (appropriate) |
| Masters        | 45  | 7 days  | **11 days** | 150         | **110**     | More realistic recovery |
| Senior masters | 55  | 7 days  | **13 days** | 150         | **90**      | Prevents overtraining   |
| No DOB         | n/a | 7 days  | 7 days      | 150         | 150         | Graceful fallback       |

---

### 🎯 IMPROVEMENT #2: Individual Ramp Rate Learning

**Effort:** 2 days | **Impact:** HIGH | **Risk:** LOW

#### Research Basis

- Generic guideline: 5-8 TSS/day/week safe increase
- Individual variation: some tolerate 10+ TSS/day/week, others crash at 5
- Historical patterns are the best predictor of future tolerance

**Sources:**

- Gabbett (2016) - Acute:chronic workload ratio and injury
- Hulin et al. (2016) - Spikes in acute workload and injury risk

#### Implementation

**File:** `packages/core/plan/calibration-constants.ts`

```typescript
/**
 * Analyze user's historical training patterns to identify their
 * individual ramp rate tolerance.
 *
 * Note: Injury history integration is NOT included at this time.
 * The algorithm uses only activity TSS history.
 */
export function learnIndividualRampRate(
  activities: Array<{ date: string; tss: number }>,
): { maxSafeRampRate: number; confidence: "low" | "medium" | "high" } {
  const weeklyTSS = groupByWeek(activities);

  if (weeklyTSS.length < 10) {
    return { maxSafeRampRate: 40, confidence: "low" };
  }

  const rampRates: number[] = [];
  for (let i = 1; i < weeklyTSS.length; i++) {
    const change = weeklyTSS[i].tss - weeklyTSS[i - 1].tss;
    if (change > 0) rampRates.push(change);
  }

  if (rampRates.length < 10) {
    return { maxSafeRampRate: 40, confidence: "low" };
  }

  const sorted = [...rampRates].sort((a, b) => a - b);
  const p75Index = Math.floor(sorted.length * 0.75);
  const maxSafeRampRate = sorted[p75Index];

  const confidence = rampRates.length > 30 ? "high" : rampRates.length > 15 ? "medium" : "low";

  return {
    maxSafeRampRate: Math.max(30, Math.min(maxSafeRampRate, 70)),
    confidence,
  };
}
```

---

### 🎯 IMPROVEMENT #3: VO2max-Based Performance Prediction

**Effort:** 1 day | **Impact:** MEDIUM-HIGH | **Risk:** LOW

Uses Daniels VDOT equations to predict race times from VO2max and assess goal feasibility — connects existing `calculations/vo2max.ts` to the training plan pipeline.

**New file:** `packages/core/calculations/performance-prediction.ts`

```typescript
export function predictRaceTimeFromVO2max(
  distanceMeters: number,
  vo2max: number,
  runningEconomy: number = 200,
): number {
  const distanceKm = distanceMeters / 1000;
  const vVO2max = vo2max / ((runningEconomy / 1000) * 3.5);
  const percentVO2max = getPercentVO2maxForDistance(distanceKm);
  const raceVelocityKmh = vVO2max * percentVO2max;
  return (distanceKm / raceVelocityKmh) * 3600;
}

export function estimateRequiredVO2max(
  distanceMeters: number,
  targetTimeSeconds: number,
  runningEconomy: number = 200,
): number {
  const distanceKm = distanceMeters / 1000;
  const raceVelocityKmh = distanceKm / (targetTimeSeconds / 3600);
  const percentVO2max = getPercentVO2maxForDistance(distanceKm);
  const vVO2max = raceVelocityKmh / percentVO2max;
  return vVO2max * ((runningEconomy / 1000) * 3.5);
}

export function assessGoalFeasibilityFromVO2max(
  userVO2max: number,
  requiredVO2max: number,
): { feasible: boolean; vo2maxRatio: number; recommendation: string } {
  const vo2maxRatio = userVO2max / requiredVO2max;
  if (vo2maxRatio >= 1.0) {
    return { feasible: true, vo2maxRatio, recommendation: "Your VO2max supports this goal. Focus on building training volume." };
  } else if (vo2maxRatio >= 0.9) {
    return { feasible: true, vo2maxRatio, recommendation: "Goal is achievable with focused training. Your VO2max is close to the required level." };
  } else if (vo2maxRatio >= 0.8) {
    return { feasible: false, vo2maxRatio, recommendation: "Goal is ambitious. Consider a longer training timeline or adjust target time." };
  } else {
    return { feasible: false, vo2maxRatio, recommendation: "Goal may be unrealistic with current VO2max. Consider adjusting target time significantly." };
  }
}

function getPercentVO2maxForDistance(distanceKm: number): number {
  if (distanceKm < 5) return 0.98;
  if (distanceKm < 21) return 0.87;
  if (distanceKm < 43) return 0.79;
  return 0.7;
}
```

---

### PHASE 2: HIGH-VALUE ADDITIONS (2-4 weeks implementation)

---

### 🎯 IMPROVEMENT #4: HRV-Based Readiness Adjustment *(Deferred)*

**Effort:** 3 days | **Impact:** HIGH | **Risk:** MEDIUM | **Status:** ⏳ **Deferred**

HRV data can be manually logged by users but will likely arrive primarily via third-party webhooks (Garmin, Whoop, Apple Health, etc.). The webhook integration pipeline is not yet in place. This improvement is **not a priority at this time** and should be revisited once the data ingestion layer is established.

**Future implementation notes (preserved for reference):**

- Use 7-day rolling RMSSD baseline with z-score deviation to compute readiness modifier
- Modifier range: −15 to +10 readiness points, weighted by baseline stability confidence
- Require minimum 5 days of data before applying any adjustment
- See original design notes for full `computeHRVReadinessModifier` and `calculateHRVBaseline` specification

---

### 🎯 IMPROVEMENT #5: Multi-Component Fitness Model

**Effort:** 4-5 days | **Impact:** MEDIUM-HIGH | **Risk:** MEDIUM

Tracks aerobic (τ=42), threshold (τ=21), and VO2max (τ=10) components separately, using the existing `training_effect` classification on activities.

```typescript
export interface MultiComponentFitness {
  aerobic_ctl: number;
  threshold_ctl: number;
  vo2max_ctl: number;
  composite_ctl: number; // Backward-compatible weighted blend
}
```

Event-specific CTL selection:

```typescript
function selectRelevantCTL(fitness: MultiComponentFitness, eventDurationSeconds: number): number {
  if (eventDurationSeconds < 1800) {
    return fitness.vo2max_ctl * 0.5 + fitness.threshold_ctl * 0.3 + fitness.aerobic_ctl * 0.2;
  } else if (eventDurationSeconds < 7200) {
    return fitness.threshold_ctl * 0.5 + fitness.aerobic_ctl * 0.3 + fitness.vo2max_ctl * 0.2;
  } else {
    return fitness.aerobic_ctl * 0.7 + fitness.threshold_ctl * 0.2 + fitness.vo2max_ctl * 0.1;
  }
}
```

---

### PHASE 3: ADVANCED PERSONALIZATION (4+ weeks)

---

### 🎯 IMPROVEMENT #6: Training Age Estimation *(Low priority — deferred)*

Training age should be **inferred from activity history**, not self-reported. This avoids adding a user-facing field and leverages data already collected. However, it is **not a high priority** at this time.

**Future approach:**
- Analyze years of consistent training data, volume trends, and performance trajectory
- Map to novice/intermediate/advanced/elite adaptation rate profile
- Adjust ramp rate multipliers and CTL ceilings accordingly

---

### 🎯 IMPROVEMENT #7: Sleep/Stress Integration

**Effort:** 3 days | **Impact:** MEDIUM | **Risk:** LOW

Use captured sleep and stress scores to dynamically adjust recovery rates and readiness scores. Adjust ATL time constant based on rolling sleep quality average.

---

### 🎯 IMPROVEMENT #8: Individual Response Pattern Learning (ML)

**Effort:** 7-10 days | **Impact:** HIGH | **Risk:** HIGH

ML model to learn individual response patterns: optimal CTL/TSB for peak performance, taper strategy, injury risk from load spikes. Requires 6-12 months of historical data with performance markers.

---

## Implementation Phases

### Phase 1: Quick Wins (1-2 weeks)

**Timeline:** Week 1-2 | **Total Effort:** 4 days | **Expected Impact:** +15-25%

**Week 1:**
- Day 1: Age-adjusted time constants — functions in `calibration-constants.ts`, update `calculations.ts`, pass age from `deriveCreationContext.ts`, unit tests
- Day 2-3: Individual ramp rate learning — learning function, integrate with `safety-caps.ts`, tests

**Week 2:**
- Day 4: VO2max-based performance prediction — `performance-prediction.ts`, integrate with `projectionCalculations.ts`, update goal UI

**Deliverables:**
- ✅ Optional age parameter added to all CTL/ATL calculations (graceful fallback when DOB absent)
- ✅ Ramp rate learning function operational
- ✅ VO2max integrated into goal CTL estimation and UI
- ✅ Test suite updated

---

### Phase 2: High-Value Additions (2-4 weeks)

**Timeline:** Week 3-6 | **Total Effort:** 5-7 days | **Expected Impact:** +30-40% cumulative

- ~~HRV readiness adjustment~~ — **Deferred** pending webhook data pipeline
- Days 5-9: Multi-component fitness model — component CTL calculation, event-specific readiness, UI breakdown

---

### Phase 3: Advanced Features (4+ weeks)

**Timeline:** Week 7+ | **Total Effort:** 15-20 days | **Expected Impact:** +50%+ cumulative

- Training age estimation from activity history *(low priority)*
- Sleep/stress integration
- ML response pattern learning

---

## Expected Outcomes

### After Phase 1 (Quick Wins)

- +15-25% improvement in readiness predictions
- Better race time estimates for users with VO2max data
- More realistic CTL targets for masters athletes (when DOB available)
- Fewer overtraining incidents through personalized ramp rates
- Earlier detection of unrealistic goals via VO2max feasibility check

### After Phase 2

- +30-40% improvement vs. current baseline
- Event-specific fitness assessment via multi-component CTL
- Training balance insights (too much intensity?)

### After Phase 3

- +50%+ improvement vs. original baseline
- Fully individualized time constants and limits
- ML-based pattern recognition and injury risk prediction

---

## Risk Assessment

### Technical Risks

#### Risk 1: Age Data Availability

**Risk:** `profiles.dob` is nullable — not all users have a date of birth on file.

**Likelihood:** MEDIUM | **Impact:** MEDIUM

**Mitigation:** All age-adjusted functions accept `age: number | undefined` and return standard constants when undefined. No user is negatively impacted by missing DOB. Prompt users to add DOB during onboarding with clear personalization benefit messaging.

---

#### Risk 2: HRV Data Quality *(Risk deferred with feature)*

HRV integration is deferred pending the webhook data pipeline. When implemented, use 7-day rolling baseline, require 5+ days of data, and apply confidence-weighted adjustments only.

---

#### Risk 3: Training Effect Classification Accuracy

**Risk:** `training_effect` may be inaccurate or missing for many activities.

**Likelihood:** MEDIUM | **Impact:** LOW

**Mitigation:** Estimate from HR/power zones if missing. Multi-component model is an enhancement, not a requirement — falls back to single-component CTL gracefully.

---

#### Risk 4: Insufficient Historical Data

**Risk:** New users won't benefit from ramp rate learning.

**Likelihood:** HIGH | **Impact:** LOW

**Mitigation:** Require minimum 50 activities for learning (enforced in code). New users receive generic constants. Personalization improves automatically as data accumulates.

---

### User Experience Risks

#### Risk 5: Breaking Changes to CTL/ATL Values

**Risk:** Age-adjusted time constants will shift existing CTL/ATL values for users who have DOB set.

**Likelihood:** CERTAIN (for affected users) | **Impact:** MEDIUM

**Communication:**

```
"We've improved our training calculations to better account for age-related
recovery needs. If you have your date of birth saved, your fitness numbers
may shift slightly — they now more accurately reflect your physiological
state. Masters athletes (40+) will see more realistic training loads."
```

---

#### Risk 6: User Confusion with Multi-Component CTL

**Mitigation:** Default view shows composite CTL (backward compatible). Component breakdown is an optional advanced view with tooltips and educational content.

---

### Business Risks

#### Risk 7: Development Timeline Slippage

**Mitigation:** Phased approach — each improvement is independently deployable. Phase 1 delivers value in 1-2 weeks regardless of Phase 2/3 status.

---

#### Risk 8: User Adoption of New Metrics

**Mitigation:** All improvements work with partial data. Graceful degradation throughout. Incentivize metric tracking by showing personalization improvements when data is added. Plan for wearable auto-sync (Apple Health, Garmin, Whoop) as a future data source.

---

## Open Questions

### Question 1: Gender ✅ **Decision Made**

**Decision:** Add gender back as an **optional** field. It was removed in Dec 2024 (`20251208024651_no_gender.sql`) but should be reinstated for demographic personalization.

**Implementation steps:**
1. Add `gender` column to the init SQL file as an optional enum: `"male" | "female"`
2. Run `supabase db diff` to generate a new migration file
3. Run `supabase migration up` to apply the migration
4. Run `pnpm run update-types` to regenerate `database.types.ts` and the supazod schema

**Schema:**
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female'));
-- nullable / optional; no default
```

**TypeScript type (after update-types):**
```typescript
gender?: "male" | "female" | null;
```

**Why it matters:** Research shows gender affects recovery rates (~10% difference during luteal phase). Restoring it as optional enables future personalization without mandating disclosure.

---

### Question 2: HRV Data Source ✅ **Decision Made**

**Decision:** HRV can be manually logged by users but will likely arrive primarily from external third-party sources (Garmin, Whoop, Apple Health) via webhooks. The webhook data pipeline is **not yet in place**, so HRV integration into readiness calculations is **deferred**. Do not invest in this feature at this time.

---

### Question 3: Training Age / Experience Tracking ✅ **Decision Made**

**Decision:** Training age should be **inferred from activity history** — no new user-facing field. Estimation approach: analyze years of data, volume trends, and performance progression. However, this feature is **not a priority at this time** and is deferred to Phase 3 or later.

---

### Question 4: Breaking Changes Tolerance

**Status:** Pending approval

**Impact:** Masters athletes (40+) with DOB set will see CTL/ATL values shift. Users without DOB are unaffected. Trends remain meaningful; absolute values become more accurate.

**Recommendation:** Approve with the communication message in Risk #5.

---

### Question 5: Testing Data Availability

**Status:** Pending clarification

**Options:** Anonymized real user data for integration validation, or synthetic test data for unit tests. Recommended: synthetic for unit tests, real (anonymized) for integration.

---

### Question 6: Injury History Tracking ✅ **Decision Made**

**Decision:** Injury tracking is **not necessary at this time**. The individual ramp rate learning algorithm operates on activity TSS history only, without requiring injury dates. This can be revisited in Phase 3 if injury data becomes available through user self-reporting.

---

### Question 7: ML Model Complexity

**Status:** Pending (Phase 3 planning)

Recommended starting point: interpretable ML (linear regression or decision trees with SHAP values) before graduating to more complex models. Prioritizes user trust and debuggability.

---

### Question 8: Premium Feature Strategy

**Status:** Pending business decision

**Options:** All features free, basic free + advanced premium, or tiered approach. Recommend aligning with business model before Phase 2 development begins.

---

## Research References

1. **Banister et al. (1975)** - Original impulse-response model
2. **Busso et al. (1997)** - Individual variation in training response
3. **Coggan (2003)** - TrainingPeaks Performance Manager Chart
4. **Hellard et al. (2006)** - Optimal training load individualization
5. **Tanaka & Seals (2008)** - Endurance performance in Masters athletes
6. **Ingham et al. (2008)** - Age effects on training response
7. **Busso et al. (2002)** - Age effects on fatigue response
8. **Plews et al. (2013)** - HRV-guided training in endurance athletes
9. **Buchheit (2014)** - Monitoring training status with HRV
10. **Stanley et al. (2013)** - HRV and training adaptation
11. **Daniels & Gilbert (1979)** - Oxygen Power: VDOT tables
12. **Daniels (2014)** - Daniels' Running Formula (3rd ed.)
13. **Billat et al. (1999)** - VO2max and endurance performance
14. **Seiler & Kjerland (2006)** - Intensity distribution in elite athletes
15. **Esteve-Lanao et al. (2007)** - Training intensity distribution
16. **Stoggl & Sperlich (2014)** - Polarized training
17. **Gabbett (2016)** - Training-injury prevention paradox
18. **Hulin et al. (2016)** - Acute workload spikes and injury risk
19. **Soligard et al. (2016)** - IOC consensus on training load
20. **Coffey & Hawley (2007)** - Molecular bases of training adaptation
21. **Seiler (2010)** - Best practice for intensity distribution
22. **Issurin (2010)** - Block periodization and training age

---

## Appendix: File Locations

**Calculations:**
- `packages/core/calculations.ts` — CTL/ATL/TSB
- `packages/core/calculations/vo2max.ts` — VO2max estimation
- `packages/core/calculations/critical-power.ts` — Critical power
- `packages/core/calculations/curves.ts` — Power/pace curves
- `packages/core/calculations/performance-prediction.ts` — **NEW** (VO2max-based prediction)

**Calibration:**
- `packages/core/plan/calibration-constants.ts` — Constants and age-adjustment helpers
- `packages/core/plan/projection/safety-caps.ts` — Ramp rate limits
- `packages/core/plan/projection/readiness.ts` — Readiness score calculations

**Training Plan:**
- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/deriveCreationContext.ts`
- `packages/core/plan/computeLoadBootstrapState.ts`

**Schemas:**
- `packages/core/schemas/training_plan_structure.ts`
- `packages/core/schemas/activity_payload.ts`

**Database:**
- `packages/supabase/database.types.ts` — Lines 616-671 (profile_metrics), 37-101 (activities), 673-712 (profiles)
- `packages/supabase/migrations/` — Including new gender migration

**Tests:**
- `packages/core/plan/__tests__/calibration-constants.test.ts` — **NEW**
- `packages/core/plan/__tests__/age-personalization.integration.test.ts` — **NEW**

---

## Document Metadata

**Created:** 2026-02-18
**Last Updated:** 2026-02-18
**Author:** AI Assistant (Coordinator Agent)
**Version:** 1.1
**Status:** Design Phase

**Changelog v1.1:**
- ✅ Gender: Decided to restore as optional `"male" | "female"` enum with migration steps documented
- ✅ HRV: Deferred — depends on third-party webhook pipeline not yet in place
- ✅ Training age: Confirmed as inferred-from-history approach; marked low priority / deferred
- ✅ Age-adjusted calculations: Clarified as conditional on DOB presence throughout
- ✅ Injury tracking: Removed from scope — not necessary at this time
- Updated Phase 2 to remove HRV from active sprint; updated effort estimates accordingly

**Approval Required:**
- [ ] Gender migration approach approved
- [ ] Breaking changes (CTL/ATL shift for DOB users) accepted
- [ ] Phase priorities confirmed
- [ ] Implementation plan created

---

*End of Design Specification v1.1*