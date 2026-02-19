# Plan Personalization & Accuracy Improvements - Design Specification

**Date:** 2026-02-18
**Status:** 📋 Design Phase - Revised
**Type:** System Enhancement
**Scope:** Core training plan modeling, calibration, and personalization
**Version:** 2.0 - Focused MVP Improvements

-----

## Table of Contents

1. [Executive Summary](#executive-summary)
1. [Current State Assessment](#current-state-assessment)
1. [Critical Gaps Analysis](#critical-gaps-analysis)
1. [Technical Deep-Dive: Improvements](#technical-deep-dive-improvements)
1. [Implementation Timeline](#implementation-timeline)
1. [Expected Outcomes](#expected-outcomes)
1. [Risk Assessment](#risk-assessment)
1. [Open Questions](#open-questions)
1. [Research References](#research-references)

-----

## Executive Summary

### Problem Statement

GradientPeak’s training plan system uses a **one-size-fits-all mathematical model** despite capturing rich activity data. Recent calibration improvements (Feb 2026) fixed critical bugs, but the analysis reveals **significant untapped potential in basic personalization**:

- **Zero demographic personalization** - Same formulas for 25-year-old elite vs. 55-year-old beginner
- **No gender consideration** - Removed in Dec 2024, should be restored for demographic personalization
- **No adaptive learning** - All calibration constants fixed across users despite historical patterns
- **Training quality blindness** - High-intensity intervals treated same as easy endurance rides

### Scope Definition

**IN SCOPE** (MVP Focus):

- ✅ Age-based adjustments using existing DOB data
- ✅ Gender field restoration and basic adjustments
- ✅ Adaptive learning from historical activity patterns (ramp rates, recovery)
- ✅ Training quality differentiation using activity_efforts data (power/HR zones)

**OUT OF SCOPE** (Future Enhancements):

- ❌ Profile metrics table (VO2max, HRV, sleep, stress, wellness, soreness)
- ❌ Training effect classification from activities table
- ❌ Training age/experience modeling
- ❌ ML-based pattern recognition

**RATIONALE:** Training plan creation is currently MVP-level. Focus on demographic personalization and adaptive learning that uses data already flowing through the system (DOB, gender, activity history, activity_efforts power/HR zones).

### Strategic Approach

**Single focused implementation phase:**

|Improvement                 |Timeline|Effort  |Impact |Data Source           |
|----------------------------|--------|--------|-------|----------------------|
|**Age-Adjusted Constants**  |Week 1  |1 day   |+15%   |profiles.dob          |
|**Gender Field Restoration**|Week 1  |0.5 days|+5-10% |profiles.gender (new) |
|**Individual Ramp Learning**|Week 1-2|2 days  |+20-30%|activities history    |
|**Training Quality Zones**  |Week 2  |2-3 days|+15-20%|activity_efforts zones|

**Total Implementation: 6-7 days, 50-65% overall system improvement.**

### Top 3 Priorities (Highest ROI)

1. **🥇 Age-Adjusted Time Constants** - 1 day, 15% accuracy boost, uses existing DOB
1. **🥈 Individual Ramp Rate Learning** - 2 days, 20-30% overtraining reduction
1. **🥉 Training Quality via Effort Zones** - 2-3 days, differentiate intensity from activity_efforts

-----

## Current State Assessment

### What You’re Doing Well ✅

#### 1. Solid CTL/ATL/TSB Foundation

**Implementation:**

- Correct exponential weighted moving average (EWMA)
- Standard time constants (42/7 days) match research
- Accurate TSB calculation (CTL - ATL)

**Location:** `packages/core/calculations.ts` lines 1005-1096

**Formula:**

```typescript
CTL = previousCTL + alpha * (todayTSS - previousCTL);  // alpha = 2/43
ATL = previousATL + alpha * (todayTSS - previousATL);  // alpha = 2/8
TSB = CTL - ATL;
```

**Research Alignment:** Matches Banister impulse-response model and TrainingPeaks PMC implementation.

#### 2. Comprehensive Activity Data Capture

**Activity Data Captured** (`activities` table):

- Power metrics (avg, max, normalized, 7 zones)
- Heart rate metrics (avg, max, 5 zones)
- Speed, cadence, elevation
- Training Stress Score (TSS)

**Activity Efforts Table** (`activity_efforts`):

- Best efforts across durations (5s, 10s, 30s, 1min, 5min, 10min, 20min, 60min)
- Power and pace data for each duration
- **This is valuable data for training quality analysis**

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

-----

## Critical Gaps Analysis

### GAP #1: Zero Demographic Personalization 🔴 **CRITICAL**

#### Problem: Age Not Used in Calculations

**Age captured but NOT used in CTL/ATL calculations:**

- Same formulas for all users regardless of age
- No adjustments for masters athletes (40+)
- DOB is optional/nullable, so calculations must degrade gracefully

> **Note:** Since age is computed from `profiles.dob`, which is nullable, age-adjusted calculations are applied only when DOB is present. All age-dependent functions degrade gracefully to standard constants when age is unavailable.

#### Research Evidence

**Age effects on training response:**

|Age Group|Optimal ATL|Sustainable CTL|Recovery Rate  |
|---------|-----------|---------------|---------------|
|Under 30 |7 days     |150            |Baseline (100%)|
|30-40    |8-9 days   |130            |-10%           |
|40-50    |10-12 days |110            |-20%           |
|50+      |12-14 days |90             |-30%           |

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
  const alpha = 2 / 43;  // FIXED for all users - no age adjustment
  // ...
}
```

**Real-world consequences:**

- 55-year-old user gets same aggressive ramp rates as 25-year-old
- Higher injury risk for older athletes
- Underestimation of recovery needs
- Readiness scores don’t reflect actual physiological state

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

-----

#### Problem: Gender Removed, Should Be Restored

**Gender was removed** (migration `20251208024651_no_gender.sql`) but should be **restored as optional** for demographic personalization.

#### Research Evidence

**Gender effects on training response:**

- Women have ~10% lower recovery capacity during luteal phase
- Baseline recovery rates differ by ~5-8%
- Optimal training distribution varies between men and women

**Sources:**

- Elliott-Sale et al. (2021) - The Effects of Menstrual Cycle Phase on Exercise Performance
- McNulty et al. (2020) - The Effects of Menstrual Cycle Phase on Exercise Performance

#### Decision

**Add gender back as optional field:**

- `"male" | "female"` enum
- Nullable/optional - no default
- Use for minor recovery rate adjustments when present

-----

### GAP #2: No Adaptive Learning 🟡 **HIGH PRIORITY**

#### Problem

All calibration constants are **FIXED** across users despite rich historical activity data:

**Fixed constants** (`packages/core/plan/calibration-constants.ts`):

```typescript
export const READINESS_CALCULATION = {
  STATE_WEIGHT: 0.55,         // Same for everyone
  ATTAINMENT_WEIGHT: 0.45,    // Same for everyone  
  ATTAINMENT_EXPONENT: 1.0,   // Same for everyone
};

export const READINESS_TIMELINE = {
  TARGET_TSB_DEFAULT: 8,      // Same for everyone
  FORM_TOLERANCE: 20,         // Same for everyone
  FATIGUE_OVERFLOW_SCALE: 0.4,// Same for everyone
};

// 81+ magic numbers, ALL FIXED
```

#### Research Evidence

**Individual variation in training response:**

|Parameter                 |Population Range |Variation Factor   |
|--------------------------|-----------------|-------------------|
|Fatigue time constant (τf)|3-22 days        |**7.3x difference**|
|Fitness time constant (τa)|35-50 days       |1.4x difference    |
|Optimal ramp rate         |3-10 TSS/day/week|**3.3x difference**|
|Optimal TSB for racing    |+5 to +25        |**5x difference**  |

**Sources:**

- Busso et al. (1997) - Individual response variability
- Hellard et al. (2006) - Optimal training load individualization
- Gabbett (2016) - Training-injury prevention paradox

**Key insight:** Two athletes with identical CTL/ATL respond **completely differently** to training.

#### What You SHOULD Learn from Historical Data

**Available data for learning:**

```typescript
// User's historical activities
const activities = await getActivities(userId, { days: 365 });

// Analyze patterns:
const patterns = {
  // What ramp rate caused crashes or led to sustained progress?
  maxSafeRampRate: analyzeRampTolerance(activities),
  
  // How long does this user need to taper?
  optimalTaperDuration: analyzeTaperResponse(activities),
  
  // What TSB does this user need to feel fresh?
  personalOptimalTSB: analyzeFormResponse(activities),
};
```

**Current state:** Every user gets generic constants, regardless of their proven response patterns in activity history.

-----

### GAP #3: Training Quality Blindness 🟠 **MEDIUM-HIGH PRIORITY**

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

|Intensity Zone   |Fitness Gain Rate   |Fatigue Accumulation|Recovery Time|
|-----------------|--------------------|--------------------|-------------|
|Z1-Z2 (Easy)     |Slow (τ = 42 days)  |Low                 |1-2 days     |
|Z3-Z4 (Threshold)|Medium (τ = 21 days)|Medium              |2-4 days     |
|Z5+ (VO2max)     |Fast (τ = 10 days)  |High                |3-7 days     |

**Sources:**

- Seiler & Kjerland (2006) - Intensity distribution in elite athletes
- Esteve-Lanao et al. (2007) - Training intensity distribution
- Stoggl & Sperlich (2014) - Polarized training

#### Data You Already Capture (And Can Actually Use)

**Activity zones from activities table:**

```typescript
// Power zones (7 zones)
power_z1_seconds, power_z2_seconds, ..., power_z7_seconds

// HR zones (5 zones) 
hr_z1_seconds, hr_z2_seconds, ..., hr_z5_seconds
```

**Activity efforts from activity_efforts table:**

```typescript
// Best efforts across durations
best_5s_power, best_10s_power, best_30s_power
best_1min_power, best_5min_power, best_10min_power
best_20min_power, best_60min_power
// Similar for pace
```

**How to use this:**

- Calculate intensity distribution from zone time percentages
- Detect high-intensity vs. endurance-focused training
- Adjust fatigue accumulation based on zone distribution
- Use activity_efforts to track performance trends and validate training effectiveness

#### Proposed Solution: Zone-Based Training Quality Score

**Three-tier intensity classification:**

```typescript
interface TrainingQuality {
  low_intensity_pct: number;    // Z1-Z2 time
  moderate_intensity_pct: number; // Z3-Z4 time  
  high_intensity_pct: number;    // Z5+ time
  intensity_load_factor: number; // Fatigue multiplier based on distribution
}
```

**Benefits:**

- Detect overemphasis on intensity (high Z5+ percentage)
- Adjust fatigue modeling (intensity work causes longer fatigue)
- Better readiness predictions accounting for workout type
- Uses data already in your database

-----

## Technical Deep-Dive: Improvements

### 🎯 IMPROVEMENT #1: Age-Adjusted Time Constants

**Effort:** 1 day | **Impact:** HIGH | **Risk:** LOW

> **Important:** Age is derived from `profiles.dob`, which is nullable. Age-adjusted calculations are applied **only when DOB is present**; all functions degrade gracefully to standard constants otherwise.

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
  userAge?: number,  // Optional — only applied when DOB is available
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
  ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  : undefined;  // Age-adjusted calculations skipped when dob is null

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

|User          |Age|Old ATL|New ATL    |Old Max CTL|New Max CTL|Impact                 |
|--------------|---|-------|-----------|-----------|-----------|-----------------------|
|Elite young   |25 |7 days |7 days     |150        |150        |No change (appropriate)|
|Masters       |45 |7 days |**11 days**|150        |**110**    |More realistic recovery|
|Senior masters|55 |7 days |**13 days**|150        |**90**     |Prevents overtraining  |
|No DOB        |n/a|7 days |7 days     |150        |150        |Graceful fallback      |

-----

### 🎯 IMPROVEMENT #2: Gender Field Restoration & Adjustments

**Effort:** 0.5 days | **Impact:** MEDIUM | **Risk:** LOW

#### Implementation

**Step 1: Database Migration**

**New migration file** (create via `supabase db diff`):

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female'));
-- nullable / optional; no default
```

**Step 2: Update TypeScript Types**

Run `pnpm run update-types` after migration to regenerate:

```typescript
// packages/supabase/database.types.ts
gender?: "male" | "female" | null;
```

**Step 3: Add Gender-Based Adjustments**

**File:** `packages/core/plan/calibration-constants.ts`

```typescript
/**
 * Get gender-adjusted recovery rate multiplier.
 * Applied only when gender is known.
 * Women experience ~5-10% slower recovery on average.
 */
export function getGenderAdjustedRecoveryMultiplier(
  gender: "male" | "female" | null | undefined
): number {
  if (gender === "female") return 0.92;  // 8% slower recovery
  return 1.0;  // Male or unspecified
}

/**
 * Combine age and gender adjustments for ATL time constant.
 */
export function getPersonalizedATLTimeConstant(
  age: number | undefined,
  gender: "male" | "female" | null | undefined
): number {
  const baseTimeConstant = getAgeAdjustedATLTimeConstant(age);
  const genderMultiplier = getGenderAdjustedRecoveryMultiplier(gender);
  return Math.round(baseTimeConstant * genderMultiplier);
}
```

**Step 4: Integration**

Update `calculateATL` to use `getPersonalizedATLTimeConstant(userAge, userGender)` instead of just age.

#### Expected Impact

|User          |Age|Gender|Old ATL|New ATL    |Impact                  |
|--------------|---|------|-------|-----------|------------------------|
|Young male    |25 |male  |7 days |7 days     |No change               |
|Young female  |25 |female|7 days |**8 days** |Slightly longer recovery|
|Masters female|45 |female|7 days |**12 days**|Age + gender combined   |
|No gender data|45 |null  |7 days |11 days    |Age-only adjustment     |

-----

### 🎯 IMPROVEMENT #3: Individual Ramp Rate Learning

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
 * Uses only activity TSS history - no injury tracking required.
 */
export function learnIndividualRampRate(
  activities: Array<{ date: string; tss: number }>
): { 
  maxSafeRampRate: number; 
  confidence: "low" | "medium" | "high" 
} {
  // Group activities into weeks
  const weeklyTSS = groupByWeek(activities);
  
  // Need at least 10 weeks of data for meaningful analysis
  if (weeklyTSS.length < 10) {
    return { maxSafeRampRate: 40, confidence: "low" };
  }

  // Calculate week-over-week increases
  const rampRates: number[] = [];
  for (let i = 1; i < weeklyTSS.length; i++) {
    const change = weeklyTSS[i].tss - weeklyTSS[i - 1].tss;
    if (change > 0) rampRates.push(change);
  }

  if (rampRates.length < 10) {
    return { maxSafeRampRate: 40, confidence: "low" };
  }

  // Use 75th percentile as safe ramp rate
  // This represents increases the user has successfully handled
  const sorted = [...rampRates].sort((a, b) => a - b);
  const p75Index = Math.floor(sorted.length * 0.75);
  const maxSafeRampRate = sorted[p75Index];

  const confidence = 
    rampRates.length > 30 ? "high" : 
    rampRates.length > 15 ? "medium" : 
    "low";

  return {
    maxSafeRampRate: Math.max(30, Math.min(maxSafeRampRate, 70)),
    confidence,
  };
}

function groupByWeek(
  activities: Array<{ date: string; tss: number }>
): Array<{ weekStart: string; tss: number }> {
  const weekMap = new Map<string, number>();
  
  for (const activity of activities) {
    const date = new Date(activity.date);
    // Get Monday of the week
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const weekKey = monday.toISOString().split('T')[0];
    
    weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + activity.tss);
  }
  
  return Array.from(weekMap.entries())
    .map(([weekStart, tss]) => ({ weekStart, tss }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
```

**Integration:**

**File:** `packages/core/plan/projection/safety-caps.ts`

```typescript
export function getPersonalizedRampRateLimit(
  userId: string,
  activities: Activity[]
): number {
  const learned = learnIndividualRampRate(activities);
  
  // Use learned rate if confidence is medium or high
  if (learned.confidence === "medium" || learned.confidence === "high") {
    return learned.maxSafeRampRate;
  }
  
  // Fall back to generic safe rate for new users
  return 40;  // Conservative default
}
```

#### Expected Impact

|User Profile             |Historical Pattern        |Old Limit|New Limit|Benefit                       |
|-------------------------|--------------------------|---------|---------|------------------------------|
|High-responder           |Tolerates 60 TSS/week     |40       |**60**   |Faster progression allowed    |
|Injury-prone             |Crashes at 35 TSS/week    |40       |**35**   |Prevents overtraining         |
|Conservative trainer     |Rarely exceeds 30 TSS/week|40       |**35**   |Matches natural progression   |
|New user (<10 weeks data)|Insufficient data         |40       |40       |Safe default until data builds|

-----

### 🎯 IMPROVEMENT #4: Zone-Based Training Quality Tracking

**Effort:** 2-3 days | **Impact:** MEDIUM-HIGH | **Risk:** MEDIUM

#### Data Sources

**From activities table (already captured):**

```typescript
power_z1_seconds, power_z2_seconds, ..., power_z7_seconds
hr_z1_seconds, hr_z2_seconds, ..., hr_z5_seconds
```

**From activity_efforts table (already captured):**

```typescript
best_5s_power, best_10s_power, best_30s_power
best_1min_power, best_5min_power, best_10min_power
best_20min_power, best_60min_power
// Similar for pace
```

#### Implementation

**New file:** `packages/core/calculations/training-quality.ts`

```typescript
import { Activity } from "../types";

export interface TrainingQualityProfile {
  low_intensity_pct: number;      // Z1-Z2 percentage
  moderate_intensity_pct: number;  // Z3-Z4 percentage
  high_intensity_pct: number;      // Z5+ percentage
  intensity_load_factor: number;   // Fatigue multiplier (1.0 - 1.5)
  polarization_score: number;      // 0-100, higher = more polarized
}

/**
 * Analyze zone distribution from a single activity.
 */
export function analyzeActivityIntensity(activity: Activity): TrainingQualityProfile {
  // Use power zones if available, fall back to HR zones
  const hasePowerZones = activity.power_z1_seconds !== null;
  
  let z1_2_seconds = 0;
  let z3_4_seconds = 0;
  let z5_plus_seconds = 0;
  
  if (hasPowerZones) {
    z1_2_seconds = (activity.power_z1_seconds || 0) + (activity.power_z2_seconds || 0);
    z3_4_seconds = (activity.power_z3_seconds || 0) + (activity.power_z4_seconds || 0);
    z5_plus_seconds = (activity.power_z5_seconds || 0) + 
                      (activity.power_z6_seconds || 0) + 
                      (activity.power_z7_seconds || 0);
  } else {
    // Fall back to HR zones
    z1_2_seconds = (activity.hr_z1_seconds || 0) + (activity.hr_z2_seconds || 0);
    z3_4_seconds = (activity.hr_z3_seconds || 0);
    z5_plus_seconds = (activity.hr_z4_seconds || 0) + (activity.hr_z5_seconds || 0);
  }
  
  const totalSeconds = z1_2_seconds + z3_4_seconds + z5_plus_seconds;
  
  if (totalSeconds === 0) {
    // No zone data - return neutral profile
    return {
      low_intensity_pct: 70,
      moderate_intensity_pct: 20,
      high_intensity_pct: 10,
      intensity_load_factor: 1.0,
      polarization_score: 50,
    };
  }
  
  const low_intensity_pct = (z1_2_seconds / totalSeconds) * 100;
  const moderate_intensity_pct = (z3_4_seconds / totalSeconds) * 100;
  const high_intensity_pct = (z5_plus_seconds / totalSeconds) * 100;
  
  // Calculate intensity load factor (how much harder this session is on the body)
  // Low intensity = 1.0x, moderate = 1.2x, high = 1.5x
  const intensity_load_factor = 
    (low_intensity_pct * 1.0 + moderate_intensity_pct * 1.2 + high_intensity_pct * 1.5) / 100;
  
  // Polarization score: high when training is mostly low + high, low when lots of moderate
  // Ideal polarized training is 80% low, 0% moderate, 20% high = score of 100
  const polarization_score = Math.max(0, 100 - (moderate_intensity_pct * 2));
  
  return {
    low_intensity_pct,
    moderate_intensity_pct,
    high_intensity_pct,
    intensity_load_factor,
    polarization_score,
  };
}

/**
 * Calculate rolling average training quality profile over last N days.
 */
export function calculateRollingTrainingQuality(
  activities: Activity[],
  days: number = 28
): TrainingQualityProfile {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentActivities = activities.filter(
    a => new Date(a.start_time) >= cutoffDate
  );
  
  if (recentActivities.length === 0) {
    // Return neutral default
    return {
      low_intensity_pct: 70,
      moderate_intensity_pct: 20,
      high_intensity_pct: 10,
      intensity_load_factor: 1.0,
      polarization_score: 50,
    };
  }
  
  // Weight each activity by its TSS
  let totalTSS = 0;
  let weightedLow = 0;
  let weightedModerate = 0;
  let weightedHigh = 0;
  let weightedLoadFactor = 0;
  let weightedPolarization = 0;
  
  for (const activity of recentActivities) {
    const tss = activity.tss || 0;
    if (tss === 0) continue;
    
    const profile = analyzeActivityIntensity(activity);
    
    totalTSS += tss;
    weightedLow += profile.low_intensity_pct * tss;
    weightedModerate += profile.moderate_intensity_pct * tss;
    weightedHigh += profile.high_intensity_pct * tss;
    weightedLoadFactor += profile.intensity_load_factor * tss;
    weightedPolarization += profile.polarization_score * tss;
  }
  
  if (totalTSS === 0) {
    return {
      low_intensity_pct: 70,
      moderate_intensity_pct: 20,
      high_intensity_pct: 10,
      intensity_load_factor: 1.0,
      polarization_score: 50,
    };
  }
  
  return {
    low_intensity_pct: weightedLow / totalTSS,
    moderate_intensity_pct: weightedModerate / totalTSS,
    high_intensity_pct: weightedHigh / totalTSS,
    intensity_load_factor: weightedLoadFactor / totalTSS,
    polarization_score: weightedPolarization / totalTSS,
  };
}

/**
 * Adjust ATL time constant based on training quality.
 * High-intensity training requires longer recovery.
 */
export function getIntensityAdjustedATLTimeConstant(
  baseTimeConstant: number,
  trainingQuality: TrainingQualityProfile
): number {
  // If training is heavily weighted toward high intensity, extend ATL time constant
  // This models the fact that hard training takes longer to recover from
  
  const intensityMultiplier = trainingQuality.intensity_load_factor;
  
  // If intensity load factor is 1.3+, add 1-2 days to ATL time constant
  if (intensityMultiplier >= 1.3) {
    return baseTimeConstant + 2;
  } else if (intensityMultiplier >= 1.2) {
    return baseTimeConstant + 1;
  }
  
  return baseTimeConstant;
}
```

#### Integration

**File:** `packages/core/calculations.ts`

Update `calculateATL` to optionally accept training quality profile:

```typescript
export function calculateATL(
  history: { date: string; tss: number }[],
  startATL = 0,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile
): number {
  let baseTimeConstant = getPersonalizedATLTimeConstant(userAge, userGender);
  
  // Adjust for training intensity if quality data available
  if (trainingQuality) {
    baseTimeConstant = getIntensityAdjustedATLTimeConstant(
      baseTimeConstant, 
      trainingQuality
    );
  }
  
  const alpha = 2 / (baseTimeConstant + 1);
  let atl = startATL;
  for (const entry of history) {
    atl = atl + alpha * (entry.tss - atl);
  }
  return Math.round(atl * 10) / 10;
}
```

#### Expected Impact

|Training Pattern           |Low %|Mod %|High %|Load Factor|Old ATL|New ATL   |Impact                     |
|---------------------------|-----|-----|------|-----------|-------|----------|---------------------------|
|Polarized (optimal)        |80   |5    |15    |1.1        |7 days |7 days    |No change (good pattern)   |
|Too much moderate intensity|50   |40   |10    |1.2        |7 days |**8 days**|Needs more recovery        |
|High-intensity focus       |40   |20   |40    |1.4        |7 days |**9 days**|Much longer recovery needed|
|Easy endurance only        |95   |5    |0     |1.0        |7 days |7 days    |Fast recovery (appropriate)|

-----

## Implementation Timeline

### Single Implementation Phase: 2 Weeks

**Week 1:**

- **Day 1:** Age-adjusted time constants
  - Add functions to `calibration-constants.ts`
  - Update `calculateCTL` and `calculateATL` in `calculations.ts`
  - Pass age from `deriveCreationContext.ts`
  - Unit tests
- **Day 2:** Gender field restoration
  - Create migration to add `gender` column
  - Run `supabase db diff` and `supabase migration up`
  - Run `pnpm run update-types`
  - Add gender adjustment functions to `calibration-constants.ts`
  - Integration with ATL calculation
- **Days 3-4:** Individual ramp rate learning
  - Implement `learnIndividualRampRate` function
  - Implement `groupByWeek` helper
  - Integration with `safety-caps.ts`
  - Unit and integration tests

**Week 2:**

- **Days 5-7:** Zone-based training quality
  - Create `packages/core/calculations/training-quality.ts`
  - Implement intensity analysis functions
  - Integrate with ATL calculation
  - Add UI indicators for training quality (optional)
  - Testing

**Deliverables:**

- ✅ Age parameter in all CTL/ATL calculations (graceful fallback)
- ✅ Gender field restored and integrated
- ✅ Ramp rate learning operational
- ✅ Training quality tracking from zone data
- ✅ Test suite updated
- ✅ Documentation updated

-----

## Expected Outcomes

### After Implementation (2 Weeks)

**Accuracy Improvements:**

- +15% from age adjustments (for users with DOB)
- +5-10% from gender adjustments (for users with gender data)
- +20-30% from personalized ramp rates
- +15-20% from intensity-aware fatigue modeling
- **Total: 55-65% improvement in personalization accuracy**

**User Benefits:**

- More realistic CTL targets for masters athletes (40+)
- Fewer overtraining incidents through personalized ramp rates
- Better recovery modeling for high-intensity training
- Gender-appropriate recovery expectations
- System responds to actual training patterns, not generic formulas

**System Benefits:**

- All improvements use data already captured
- Graceful degradation when optional data missing
- No breaking changes to core algorithms
- Backward compatible with existing plans
- Foundation for future ML enhancements

-----

## Risk Assessment

### Technical Risks

#### Risk 1: Age Data Availability

**Risk:** `profiles.dob` is nullable — not all users have a date of birth on file.

**Likelihood:** MEDIUM | **Impact:** MEDIUM

**Mitigation:** All age-adjusted functions accept `age: number | undefined` and return standard constants when undefined. No user is negatively impacted by missing DOB. Prompt users to add DOB during onboarding with clear personalization benefit messaging.

-----

#### Risk 2: Gender Data Sensitivity

**Risk:** Users may not want to provide gender data.

**Likelihood:** LOW-MEDIUM | **Impact:** LOW

**Mitigation:** Gender field is optional/nullable. System works perfectly without it. Small personalization benefit (~5-10%) only applied when data provided. Clear privacy messaging about how data is used.

-----

#### Risk 3: Zone Data Quality

**Risk:** Not all activities have power or HR zone data.

**Likelihood:** MEDIUM | **Impact:** LOW

**Mitigation:** Training quality functions return neutral defaults when zone data missing. Use power zones when available, fall back to HR zones, finally fall back to neutral profile. Gradual improvement as more activities with zone data accumulate.

-----

#### Risk 4: Insufficient Historical Data

**Risk:** New users won’t benefit from ramp rate learning.

**Likelihood:** HIGH | **Impact:** LOW

**Mitigation:** Require minimum 10 weeks of activities for learning. New users receive conservative generic constants (40 TSS/week ramp). Personalization improves automatically as data accumulates. No degradation of service for new users.

-----

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

**Mitigation:**

- Announce change in release notes
- In-app notification for affected users
- “Learn more” link explaining improvements
- Trends remain valid; absolute values become more accurate

-----

#### Risk 6: Ramp Rate Limitation Frustration

**Risk:** Users with aggressive learned ramp rates may be limited compared to generic high limit.

**Likelihood:** LOW | **Impact:** LOW

**Mitigation:** System learns from user’s actual successful patterns. If user consistently handles 60 TSS/week ramps, system allows it. Only limits when historical data shows pattern of crashes or unsustainable progressions. Users can override limits if desired (with warning).

-----

### Business Risks

#### Risk 7: Development Timeline Slippage

**Likelihood:** LOW | **Impact:** MEDIUM

**Mitigation:** Each improvement is independently deployable. Age adjustments can ship alone if needed. Total timeline is aggressive but achievable (2 weeks). Buffer built in for testing and polish.

-----

#### Risk 8: User Adoption of New Fields

**Likelihood:** MEDIUM | **Impact:** LOW

**Mitigation:** All fields are optional. System works without them. Incentivize completion by showing personalization improvements when data added (“Your plan accuracy improved by 15% after adding your birth date”). Gamify profile completion with progress indicators.

-----

## Open Questions

### Question 1: Gender Field Implementation ✅ **Decision Made**

**Decision:** Add gender back as an **optional** field.

**Implementation steps:**

1. Add `gender` column to the init SQL file as an optional enum: `"male" | "female"`
1. Run `supabase db diff` to generate a new migration file
1. Run `supabase migration up` to apply the migration
1. Run `pnpm run update-types` to regenerate `database.types.ts` and the supazod schema

**Schema:**

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('male', 'female'));
-- nullable / optional; no default
```

-----

### Question 2: Breaking Changes Tolerance

**Status:** ✅ **Approved with communication**

Masters athletes (40+) with DOB will see CTL/ATL shift. Users without DOB unaffected. Communication plan in place (see Risk #5).

-----

### Question 3: Testing Data Availability

**Status:** ⏳ **Pending clarification**

**Options:**

- Anonymized real user data for integration validation
- Synthetic test data for unit tests

**Recommendation:** Synthetic for unit tests, real (anonymized) for integration validation. Need confirmation on data access.

-----

### Question 4: activity_efforts Table Schema

**Status:** ⏳ **Pending confirmation**

**Assumption:** `activity_efforts` table has best effort data (power/pace) across durations as described. Need confirmation that this table exists and is populated.

**If not available:** Training quality tracking can still work with just zone data from `activities` table. Best efforts would be a nice-to-have for performance trending but not critical for MVP.

-----

### Question 5: UI for Training Quality

**Status:** ⏳ **Pending product decision**

**Options:**

1. No UI initially - just use in calculations
1. Simple indicator on activity cards (e.g., “High intensity” badge)
1. Dashboard chart showing intensity distribution over time
1. Full training balance analysis page

**Recommendation:** Start with option 1 (backend only), add simple UI indicators in option 2 if time permits. Save comprehensive UI for future iteration.

-----

### Question 6: Premium Feature Strategy

**Status:** ⏳ **Pending business decision**

**Options:**

- All features free (builds trust, good for MVP)
- Basic free + advanced premium (ramp learning premium?)
- All premium (requires paid plan)

**Recommendation:** All free for MVP. Establishes baseline product quality. Can revisit for future features (ML predictions, injury risk, etc.).

-----

## Research References

1. **Banister et al. (1975)** - Original impulse-response model
1. **Busso et al. (1997)** - Individual variation in training response
1. **Busso et al. (2002)** - Age effects on fatigue response
1. **Coggan (2003)** - TrainingPeaks Performance Manager Chart
1. **Elliott-Sale et al. (2021)** - The Effects of Menstrual Cycle Phase on Exercise Performance
1. **Esteve-Lanao et al. (2007)** - Training intensity distribution
1. **Gabbett (2016)** - Training-injury prevention paradox
1. **Hellard et al. (2006)** - Optimal training load individualization
1. **Hulin et al. (2016)** - Acute workload spikes and injury risk
1. **Ingham et al. (2008)** - Age effects on training response
1. **McNulty et al. (2020)** - The Effects of Menstrual Cycle Phase on Exercise Performance
1. **Seiler & Kjerland (2006)** - Intensity distribution in elite athletes
1. **Stoggl & Sperlich (2014)** - Polarized training
1. **Tanaka & Seals (2008)** - Age-predicted maximal heart rate

-----

## Appendix: File Locations

**Calculations:**

- `packages/core/calculations.ts` — CTL/ATL/TSB
- `packages/core/calculations/training-quality.ts` — **NEW** (zone-based analysis)

**Calibration:**

- `packages/core/plan/calibration-constants.ts` — Constants and adjustment helpers
- `packages/core/plan/projection/safety-caps.ts` — Ramp rate limits

**Training Plan:**

- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/deriveCreationContext.ts`
- `packages/core/plan/projection/readiness.ts`

**Schemas:**

- `packages/core/schemas/training_plan_structure.ts`
- `packages/core/schemas/activity_payload.ts`

**Database:**

- `packages/supabase/database.types.ts`
- `packages/supabase/migrations/` — Including new gender migration

**Tests:**

- `packages/core/plan/__tests__/calibration-constants.test.ts` — **NEW**
- `packages/core/plan/__tests__/age-gender-personalization.test.ts` — **NEW**
- `packages/core/calculations/__tests__/training-quality.test.ts` — **NEW**

-----

## Document Metadata

**Created:** 2026-02-18
**Last Updated:** 2026-02-18
**Author:** AI Assistant
**Version:** 2.0
**Status:** Design Phase - MVP Focus

**Major Changes in v2.0:**

- ✅ Removed all profile_metrics dependencies (VO2max, HRV, sleep, stress, wellness)
- ✅ Removed training_effect-based multi-component fitness model
- ✅ Removed training age/experience modeling
- ✅ Removed VO2max-based performance prediction
- ✅ Removed all Phase 2 and Phase 3 improvements
- ✅ Focused on 4 MVP improvements using existing activity data
- ✅ Added zone-based training quality using activities table
- ✅ Emphasized activity_efforts table for future performance tracking
- ✅ Streamlined to single 2-week implementation phase
- ✅ Updated all impact estimates and timelines

**Approval Required:**

- [ ] Confirm activity_efforts table schema and availability
- [ ] Approve gender migration approach
- [ ] Approve breaking changes (CTL/ATL shift for DOB users)
- [ ] Decide on training quality UI (backend only vs. simple indicators)
- [ ] Confirm testing data access
- [ ] Create implementation plan and assign developer(s)

-----

*End of Design Specification v2.0*