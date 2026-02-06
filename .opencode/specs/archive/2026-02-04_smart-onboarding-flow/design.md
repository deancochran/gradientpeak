# Smart Onboarding Flow: Design Document

## Quick Reference

**Files in this spec:**

- **[design.md](./design.md)** (this file) - Complete technical design, algorithms, data flow, experience paths
- **[plan.md](./plan.md)** - Phase-by-phase implementation guide with code examples
- **[tasks.md](./tasks.md)** - Granular task checklist for implementation

---

## Executive Summary

Design a **clever, progressive onboarding flow** that maximizes the creation of `activity_efforts` and `profile_metrics` records while minimizing user burden. The system uses **intelligent derivations** (FTP → activity_effort, Max HR + Resting HR → VO2max → profile_metrics) to populate the database with actionable performance data from minimal user input.

**Key Innovations:**

1. **Experience-based paths** - Beginners get auto-applied defaults (< 1 min), intermediates validate estimates (1-2 min), advanced enter exact metrics (2-3 min)
2. **Sport coverage** - Full support for **cycling** (FTP/power), **running** (threshold pace), and **swimming** (CSS/pace)
3. **Data multiplier** - 2.7-3.2x records created vs user inputs (e.g., 16 records from 5 inputs)
4. **Beginner-friendly** - Zero technical knowledge required, plain language prompts

---

## Core Philosophy

### The Problem

Users need rich performance data (FTP, threshold pace, VO2max, LTHR, etc.) to:

- Generate accurate training plans
- Follow structured interval workouts with proper zones
- Track performance improvements over time

**But:**

- **Beginners** don't know what "FTP" or "LTHR" means
- **Novices** haven't tested their performance metrics
- **Experts** want granular control over every value
- Asking users to manually calculate and enter all their "best efforts" (5s, 1m, 5m, 20m power/pace) is tedious and error-prone

### The Solution

**Experience-Based Onboarding with Smart Derivation:**

#### Path 1: Quick Start (Beginner/Novice)

1. User selects **experience level** ("Just starting out" / "I train regularly" / "I know my metrics")
2. System provides **one-click baseline profiles** based on age, weight, gender, sport
3. User starts training immediately with reasonable defaults
4. System refines metrics as user uploads activities

#### Path 2: Guided Setup (Intermediate)

1. User follows **friendly, jargon-free prompts** ("How hard can you go for 1 hour?")
2. System **translates answers** to technical metrics behind the scenes
3. System **derives complete performance profile** from minimal input
4. User gets accurate zones without understanding formulas

#### Path 3: Custom Setup (Advanced)

1. User enters **precise technical metrics** (FTP, LTHR, VO2max)
2. System **derives activity_efforts** from these metrics using sport science formulas
3. System **calculates dependent metrics** (VO2max from HR data, zones from thresholds)
4. System **creates synthetic activity_efforts** for standard durations (5s, 1m, 5m, 20m, etc.)
5. Result: User has a **complete performance profile** ready for training plans

---

## Database Architecture Review

### Tables Involved

#### 1. `profile_metrics`

**Purpose:** Biometric and physiological state metrics
**Metric Types:**

- `weight_kg` - Body weight
- `resting_hr` - Resting heart rate
- `max_hr` - Maximum heart rate
- `lthr` - Lactate threshold heart rate
- `vo2_max` - Maximal oxygen consumption
- `body_fat_percentage` - Body composition
- `hrv_rmssd` - Heart rate variability
- `sleep_hours`, `hydration_level`, `stress_score`, `soreness_level`, `wellness_score`

**Key Insight:** These are **point-in-time snapshots** that change over time.

#### 2. `activity_efforts`

**Purpose:** Best performance efforts across all durations
**Schema:**

```sql
CREATE TABLE activity_efforts (
  id UUID PRIMARY KEY,
  activity_id UUID REFERENCES activities(id),  -- NULL for manual/estimated
  profile_id UUID REFERENCES profiles(id),
  activity_category activity_category,          -- 'bike', 'run', 'swim'
  duration_seconds INTEGER,                     -- 5, 60, 300, 1200, etc.
  effort_type effort_type,                      -- 'power' or 'speed'
  value NUMERIC,                                -- watts or m/s
  unit TEXT,                                    -- 'watts' or 'meters_per_second'
  start_offset INTEGER,                         -- NULL for manual entries
  recorded_at TIMESTAMPTZ
);
```

**Key Insight:** These represent **"what the athlete can do"** at specific durations. They can be:

- **Actual** (extracted from FIT files)
- **Manual** (user-entered test results)
- **Estimated** (derived from other metrics)

---

## Smart Derivation Algorithms

### 1. FTP → Power Curve (Cycling)

**Input:** User enters FTP (e.g., 250W)

**Derivation Logic:**

```typescript
// Critical Power Model (Monod & Scherrer)
// Assumes W' (anaerobic capacity) = 20 kJ for recreational cyclist

const FTP = 250; // watts
const W_PRIME = 20000; // joules (20 kJ)

// Generate power curve for standard durations
const durations = [5, 10, 30, 60, 180, 300, 600, 1200, 1800, 3600]; // seconds

durations.forEach((duration) => {
  // Power = CP + (W' / duration)
  const power = FTP + W_PRIME / duration;

  createActivityEffort({
    activity_id: null, // Manual/estimated
    profile_id: userId,
    activity_category: "bike",
    duration_seconds: duration,
    effort_type: "power",
    value: power,
    unit: "watts",
    recorded_at: new Date(),
    source: "estimated_from_ftp",
  });
});
```

**Result:** 10 `activity_efforts` records created from 1 user input.

**Example Output:**
| Duration | Power (W) | Calculation |
|----------|-----------|-------------|
| 5s | 4250 | 250 + (20000/5) |
| 1m | 583 | 250 + (20000/60) |
| 5m | 317 | 250 + (20000/300) |
| 20m | 267 | 250 + (20000/1200) |
| 60m | 250 | FTP (input) |

---

### 2. Threshold Pace → Speed Curve (Running)

**Input:** User enters threshold pace (e.g., 4:30/km = 270 seconds/km)

**Derivation Logic:**

```typescript
// Riegel Formula for race predictions
// T2 = T1 × (D2 / D1)^1.06

const thresholdPaceSecondsPerKm = 270; // 4:30/km
const thresholdSpeedMps = 1000 / thresholdPaceSecondsPerKm; // 3.70 m/s

// Standard durations for running efforts
const durations = [5, 10, 30, 60, 180, 300, 600, 1200, 1800, 3600]; // seconds

durations.forEach((duration) => {
  // Adjust speed based on duration (shorter = faster)
  let speedMps;

  if (duration < 60) {
    // Sprint efforts: 10-20% faster than threshold
    speedMps = thresholdSpeedMps * 1.15;
  } else if (duration < 300) {
    // VO2max efforts: 5-10% faster
    speedMps = thresholdSpeedMps * 1.08;
  } else if (duration < 1200) {
    // Threshold efforts: baseline
    speedMps = thresholdSpeedMps;
  } else {
    // Tempo/endurance: 5-10% slower
    speedMps = thresholdSpeedMps * 0.92;
  }

  createActivityEffort({
    activity_id: null,
    profile_id: userId,
    activity_category: "run",
    duration_seconds: duration,
    effort_type: "speed",
    value: speedMps,
    unit: "meters_per_second",
    recorded_at: new Date(),
    source: "estimated_from_threshold_pace",
  });
});
```

**Result:** 10 `activity_efforts` records created from 1 user input.

---

### 3. Critical Swim Speed (CSS) → Swim Pace Curve (Swimming)

**Input:** User enters CSS (e.g., 1:30/100m = 90 seconds per 100m)

**Derivation Logic:**

```typescript
// Critical Swim Speed (CSS) model
// CSS is the pace sustainable for ~30 minutes (~1500-2000m)

const cssSecondsPerHundredMeters = 90; // 1:30/100m
const cssSpeedMps = 100 / cssSecondsPerHundredMeters; // 1.11 m/s

// Generate pace curve for standard swim durations
const durations = [10, 20, 30, 60, 120, 180, 300, 600, 900, 1800]; // seconds

durations.forEach((duration) => {
  // Adjust speed based on duration
  let speedMps;

  if (duration < 60) {
    // Sprint efforts (25m, 50m): 8-12% faster than CSS
    speedMps = cssSpeedMps * 1.1;
  } else if (duration < 180) {
    // 100m-200m efforts: 5-8% faster than CSS
    speedMps = cssSpeedMps * 1.06;
  } else if (duration < 600) {
    // 400m efforts: CSS baseline
    speedMps = cssSpeedMps;
  } else {
    // Distance efforts (800m+): 5-8% slower than CSS
    speedMps = cssSpeedMps * 0.93;
  }

  createActivityEffort({
    activity_id: null,
    profile_id: userId,
    activity_category: "swim",
    duration_seconds: duration,
    effort_type: "speed",
    value: speedMps,
    unit: "meters_per_second",
    recorded_at: new Date(),
    source: "estimated_from_css",
  });
});
```

**Result:** 10 `activity_efforts` records created from 1 user input.

**Example Output:**
| Duration | Pace (per 100m) | Speed (m/s) | Distance | Effort Type |
|----------|----------------|-------------|----------|-------------|
| 10s | 1:21/100m | 1.22 | ~12m | Sprint |
| 30s | 1:21/100m | 1.22 | ~37m | Sprint (50m)|
| 1m | 1:25/100m | 1.18 | ~71m | 100m pace |
| 2m | 1:25/100m | 1.18 | ~141m | 200m pace |
| 5m | 1:30/100m | 1.11 | ~333m | CSS (400m) |
| 10m | 1:30/100m | 1.11 | ~667m | CSS |
| 15m | 1:37/100m | 1.03 | ~930m | Distance |
| 30m | 1:37/100m | 1.03 | ~1860m | Distance |

**Note:** Swimming uses **pace per 100m** as the standard metric (e.g., 1:30/100m), but stores as **speed (m/s)** in the database for consistency with other sports.

---

### 4. Max HR + Resting HR → VO2max → Profile Metrics

**Input:**

- Max HR: 190 bpm
- Resting HR: 55 bpm

**Derivation Logic:**

```typescript
const maxHR = 190;
const restingHR = 55;

// 1. Calculate VO2max using Uth-Sørensen-Overgaard-Pedersen formula
// VO2max = 15.3 × (Max HR / Resting HR)
const vo2max = 15.3 * (maxHR / restingHR);
// Result: 52.8 ml/kg/min

// 2. Estimate LTHR (85% of max HR)
const lthr = Math.round(maxHR * 0.85);
// Result: 162 bpm

// 3. Create profile_metrics records
createProfileMetric({
  profile_id: userId,
  metric_type: "max_hr",
  value: maxHR,
  unit: "bpm",
  recorded_at: new Date(),
  source: "manual",
});

createProfileMetric({
  profile_id: userId,
  metric_type: "resting_hr",
  value: restingHR,
  unit: "bpm",
  recorded_at: new Date(),
  source: "manual",
});

createProfileMetric({
  profile_id: userId,
  metric_type: "vo2_max",
  value: vo2max,
  unit: "ml/kg/min",
  recorded_at: new Date(),
  source: "estimated_from_hr",
});

createProfileMetric({
  profile_id: userId,
  metric_type: "lthr",
  value: lthr,
  unit: "bpm",
  recorded_at: new Date(),
  source: "estimated",
});
```

**Result:** 4 `profile_metrics` records created from 2 user inputs.

---

### 4. Weight + Gender + Age → Estimated FTP/Threshold Pace

**Input:**

- Weight: 70 kg
- Gender: Male
- Age: 30

**Derivation Logic (Recreational Athlete Baseline):**

```typescript
const weightKg = 70;
const gender = "male";
const age = 30;

// Recreational cyclist baseline: 2.5-3.0 W/kg for males, 2.0-2.5 for females
const ftpPerKg = gender === "male" ? 2.75 : 2.25;
const estimatedFTP = Math.round(weightKg * ftpPerKg);
// Result: 193W for 70kg male

// Recreational runner baseline: 5:00-5:30/km for males, 5:30-6:00 for females
const baselinePaceSecondsPerKm = gender === "male" ? 315 : 345; // 5:15 or 5:45
const estimatedThresholdPace = baselinePaceSecondsPerKm;
// Result: 5:15/km for male

// Present as suggestions (not auto-filled)
return {
  suggestedFTP: estimatedFTP,
  suggestedThresholdPace: estimatedThresholdPace,
  confidence: "low", // User should validate
};
```

**Result:** Provide **smart defaults** that user can accept or override.

---

## Experience-Based Onboarding Profiles

### Profile 1: "Just Starting Out" (Beginner)

**User Persona:**

- New to the sport or returning after long break
- Doesn't know technical terms (FTP, LTHR, VO2max)
- Wants to start training without overwhelming setup
- Willing to use conservative baseline estimates

**Baseline Values (Auto-Applied):**

#### Cycling

| Metric     | Male      | Female    | Basis              |
| ---------- | --------- | --------- | ------------------ |
| FTP        | 2.0 W/kg  | 1.5 W/kg  | Untrained baseline |
| Max HR     | 220 - age | 220 - age | Age formula        |
| Resting HR | 70 bpm    | 75 bpm    | Untrained average  |

**Example:** 70kg male, age 30

- FTP: 140W (conservative)
- Max HR: 190 bpm
- Resting HR: 70 bpm
- VO2max: 41 ml/kg/min (calculated)
- LTHR: 162 bpm (estimated)

#### Running

| Metric         | Male      | Female    | Basis             |
| -------------- | --------- | --------- | ----------------- |
| Threshold Pace | 6:30/km   | 7:00/km   | Beginner baseline |
| Max HR         | 220 - age | 220 - age | Age formula       |
| Resting HR     | 70 bpm    | 75 bpm    | Untrained average |

#### Swimming

| Metric     | Male      | Female    | Basis                    |
| ---------- | --------- | --------- | ------------------------ |
| CSS        | 2:00/100m | 2:15/100m | Beginner baseline (pool) |
| Max HR     | 220 - age | 220 - age | Age formula              |
| Resting HR | 70 bpm    | 75 bpm    | Untrained average        |

**Note:** CSS (Critical Swim Speed) is the pace you can sustain for ~30 minutes (approximately 1500-2000m for beginners).

**Friendly Language:**

- "I'm new to [sport] and just want to get started!"
- "Set me up with beginner-friendly defaults"
- "I'll update my metrics as I learn more"

**System Actions:**

1. Create conservative baseline metrics
2. Derive complete power/speed curves
3. Show welcome message: "Your profile is ready! Don't worry, we'll refine these as you train."
4. Enable "Refine Profile" tutorial for later

---

### Profile 2: "I Train Regularly" (Intermediate)

**User Persona:**

- Trains 2-4 times per week consistently
- Knows basic fitness (can sustain hard effort for 20-30 min)
- Familiar with exertion levels but not technical metrics
- Has some awareness of their capabilities

**Baseline Values (Auto-Applied):**

#### Cycling

| Metric     | Male      | Female    | Basis                |
| ---------- | --------- | --------- | -------------------- |
| FTP        | 2.75 W/kg | 2.25 W/kg | Recreational trained |
| Max HR     | 220 - age | 220 - age | Age formula          |
| Resting HR | 60 bpm    | 65 bpm    | Trained average      |

**Example:** 70kg male, age 30

- FTP: 193W (reasonable)
- Max HR: 190 bpm
- Resting HR: 60 bpm
- VO2max: 48 ml/kg/min (calculated)
- LTHR: 162 bpm (estimated)

#### Running

| Metric         | Male      | Female    | Basis                |
| -------------- | --------- | --------- | -------------------- |
| Threshold Pace | 5:15/km   | 5:45/km   | Recreational trained |
| Max HR         | 220 - age | 220 - age | Age formula          |
| Resting HR     | 60 bpm    | 65 bpm    | Trained average      |

#### Swimming

| Metric     | Male      | Female    | Basis                       |
| ---------- | --------- | --------- | --------------------------- |
| CSS        | 1:40/100m | 1:50/100m | Recreational trained (pool) |
| Max HR     | 220 - age | 220 - age | Age formula                 |
| Resting HR | 60 bpm    | 65 bpm    | Trained average             |

**Note:** This is a comfortable pace for 1500-2000m continuous swimming.

**Friendly Language:**

- "I work out regularly and know my fitness level"
- "Give me typical values for someone like me"
- "I can refine these if needed"

**System Actions:**

1. Create realistic recreational athlete metrics
2. Derive complete power/speed curves
3. Show message: "Your profile looks good! You can update specific metrics anytime in settings."
4. Optionally show "Quick Test" suggestions to validate FTP/pace

---

### Profile 3: "I Know My Metrics" (Advanced)

**User Persona:**

- Has tested FTP, LTHR, or threshold pace
- Understands technical terminology
- Wants precise control over metrics
- May have power meter, HR monitor, or Garmin watch data

**Baseline Values (Manual Entry):**

- User enters known values (FTP, threshold pace, max HR, etc.)
- System derives missing metrics
- No assumptions made without user input

**Friendly Language:**

- "I know my FTP, threshold pace, or heart rate zones"
- "I want to enter my exact metrics"
- "I've done performance tests"

**System Actions:**

1. Present detailed metric entry form
2. Show estimation helpers for unknown values
3. Derive activity_efforts from entered metrics
4. Show validation warnings for outliers

---

### Profile 4: "Skip Setup" (Expert/Returning User)

**User Persona:**

- Wants to start immediately and configure later
- Plans to sync data from Strava/Garmin
- Will upload activities first to auto-detect metrics
- Confident in figuring it out themselves

**Baseline Values (Minimal):**

- Only basic profile (age, weight, gender, sport)
- No performance metrics created
- Empty activity_efforts table

**Friendly Language:**

- "I'll configure this later"
- "I want to upload activities first"
- "Let me explore the app"

**System Actions:**

1. Create basic profile only
2. Show dashboard with "Complete Your Profile" prompt
3. Enable "Quick Setup" from settings anytime
4. Auto-detect metrics from first uploaded activity

---

## Experience Level Selection Flow

### Step 0: Welcome & Experience Selection (NEW)

**Display:**

```
Welcome to GradientPeak! 🎯

To get you started, tell us about your experience:

┌────────────────────────────────────────┐
│  🌱 Just Starting Out                  │
│  New to [sport] or getting back into it│
│                                        │
│  → Quick setup with beginner defaults  │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🏃 I Train Regularly                  │
│  I work out 2-4 times per week         │
│                                        │
│  → Setup with typical athlete values   │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  📊 I Know My Metrics                  │
│  I've tested my performance metrics    │
│                                        │
│  → Enter my exact FTP, pace, or zones  │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  ⏭️  Skip Setup                        │
│  I'll configure this later             │
│                                        │
│  → Start exploring immediately         │
└────────────────────────────────────────┘
```

**Actions:**

#### If "Just Starting Out" → Quick Setup Flow

1. Collect basic profile (age, weight, gender, sport)
2. Apply beginner baseline metrics automatically
3. Derive complete performance profile
4. Skip Steps 2-3 (technical metrics)
5. Go directly to completion

**Total Time:** < 1 minute

#### If "I Train Regularly" → Quick Setup Flow

1. Collect basic profile
2. Apply intermediate baseline metrics automatically
3. Derive complete performance profile
4. Optionally show validation: "Does this sound right?"
   - "I can sustain 190W for an hour" (for FTP)
   - "I run 5:15 per kilometer pace for 20+ minutes" (for threshold)
5. Skip technical steps or allow refinement

**Total Time:** 1-2 minutes

#### If "I Know My Metrics" → Guided Setup Flow

1. Collect basic profile
2. Show Step 2: Heart Rate Metrics (optional)
3. Show Step 3: Performance Metrics (with estimation helpers)
4. Show Step 4: Training Context (optional)
5. Full experience as originally designed

**Total Time:** 2-3 minutes

#### If "Skip Setup" → Minimal Flow

1. Collect basic profile only
2. Complete immediately
3. Show dashboard with "Complete Profile" card

**Total Time:** < 30 seconds

---

## Friendly Language Translation Guide

### Technical → Beginner-Friendly

| Technical Term                       | Beginner-Friendly                      | Explanation                                          |
| ------------------------------------ | -------------------------------------- | ---------------------------------------------------- |
| **FTP** (Functional Threshold Power) | "How hard you can go for 1 hour"       | Power you can sustain for 60 minutes                 |
| **Threshold Pace** (Running)         | "Your steady, hard pace"               | Pace you can hold for 30-60 minutes                  |
| **CSS** (Critical Swim Speed)        | "Your comfortable swim pace"           | Pace you can hold for 1500-2000m (~30 minutes)       |
| **LTHR** (Lactate Threshold HR)      | "Your hard-effort heart rate"          | Heart rate during sustained hard efforts             |
| **VO2max**                           | "Your fitness score"                   | How efficiently your body uses oxygen                |
| **Max HR**                           | "Your highest heart rate"              | Highest HR you've ever seen during exercise          |
| **Resting HR**                       | "Your morning heart rate"              | HR when you wake up, before getting out of bed       |
| **W' (W Prime)**                     | "Your sprint capacity"                 | How much extra power you have for short bursts       |
| **Power Curve**                      | "What you can do at different efforts" | Your capabilities from sprint to endurance           |
| **Pace per 100m**                    | "Your 100-meter lap time"              | How fast you swim each pool length (e.g., 1:30/100m) |

### Beginner-Friendly Prompts (Step 2 Alternative)

**Instead of:**

> "Enter your Lactate Threshold Heart Rate (LTHR)"

**Use:**

> "What's your heart rate during a hard, sustained effort?"
>
> 💡 This is the heart rate you see during a tough 20-30 minute workout.
>
> [Input field] bpm
>
> [Don't know?] We'll estimate it for you.

**Instead of:**

> "Enter your FTP (Functional Threshold Power)"

**Use:**

> "How much power can you sustain for an hour?"
>
> 💡 If you've done a 20-minute test, enter 95% of your average power.
>
> [Input field] watts
>
> [Don't know?] We'll estimate based on your weight (~ 193W)

**Instead of:**

> "Enter your Threshold Pace"

**Use:**

> "What pace can you hold for 30-60 minutes?"
>
> 💡 This is your "comfortably hard" pace - tough but sustainable.
>
> [Input field] min/km
>
> [Don't know?] We'll estimate based on your experience (~5:15/km)

**Instead of:**

> "Enter your Critical Swim Speed (CSS)"

**Use:**

> "What's your comfortable swim pace for 30 minutes?"
>
> 💡 This is the pace you can hold for about 1500-2000 meters continuously.
>
> [Input field] min:sec per 100m
>
> [Don't know?] We'll estimate based on your experience (~1:40/100m)

---

## Onboarding Flow Design

### Step 1: Basic Profile (Required)

**Fields:**

- Date of Birth (YYYY-MM-DD)
- Weight (kg or lbs with toggle)
- Gender (Male / Female / Other)
- Primary Sport (Cycling / Running / Swimming / Triathlon / Other)

**Actions:**

- Create `profile_metrics` record for `weight_kg`
- Calculate age for downstream estimations
- Store gender and primary sport in `profiles` table

---

### Step 2: Heart Rate Metrics (Optional - Skipped for Beginners)

**Display Logic:**

- **Beginners ("Just Starting Out"):** Skip this step entirely, use defaults
- **Intermediate ("I Train Regularly"):** Skip or show simplified version
- **Advanced ("I Know My Metrics"):** Show full technical form

**Fields (Advanced Mode):**

- Max Heart Rate (bpm)
  - **Technical Hint:** "Your max HR during hardest effort"
  - **Beginner Hint:** "Your highest heart rate ever (we'll estimate: 190 bpm)"
  - **Helper:** "Use Estimate" button → `220 - age`
- Resting Heart Rate (bpm)
  - **Technical Hint:** "Measure first thing in the morning"
  - **Beginner Hint:** "Your heart rate when you wake up (typical: 70 bpm)"
- Lactate Threshold HR (bpm)
  - **Technical Hint:** "HR you can sustain for ~1 hour"
  - **Beginner Hint:** "Your heart rate during hard, steady efforts"
  - **Helper:** "Use Estimate" button → `Max HR × 0.85`

**Fields (Simplified Mode for Intermediate):**

Display as single yes/no question:

> "Do you track your heart rate during workouts?"
>
> [Yes] → Show simplified fields with estimates pre-filled
> [No] → Skip to next step, use age-based defaults

**Smart Actions:**

1. **If skipped (Beginner/Intermediate):**
   - Auto-calculate Max HR from age (220 - age)
   - Auto-set Resting HR based on profile (70 bpm beginner, 60 bpm intermediate)
   - Auto-calculate LTHR and VO2max from defaults
2. **If provided (Advanced):**
   - Calculate VO2max → create `profile_metrics` record
   - Estimate LTHR if not provided → create `profile_metrics` record
   - Create `profile_metrics` records for all entered values

**Result:** 2-4 `profile_metrics` records created (regardless of path).

---

### Step 3: Sport-Specific Performance (Optional - Auto-Applied for Beginners)

**Display Logic:**

- **Beginners ("Just Starting Out"):** Skip entirely, apply beginner defaults automatically
- **Intermediate ("I Train Regularly"):** Show validation prompt with pre-filled estimates
- **Advanced ("I Know My Metrics"):** Show full technical form

**Conditional Display Based on Primary Sport:**

#### For Cycling / Triathlon:

**Beginner Mode (Auto-Applied):**

```
✓ We've set up your cycling profile!

Your estimated power:
• 1-hour effort: 140W (2.0 W/kg)
• 20-minute effort: 147W
• 5-minute effort: 207W

This is a conservative starting point.
You can update this anytime as you progress!
```

**Intermediate Mode (Validation):**

```
Does this sound right for you?

Your estimated 1-hour power: 193W (2.75 W/kg)

This means you can sustain about 193 watts for an hour-long ride.

[Yes, that's about right] [No, let me adjust]
```

**Advanced Mode (Technical):**

**Field:** FTP - Functional Threshold Power (watts)

- **Technical Label:** "FTP - Functional Threshold Power (watts)"
- **Beginner Label:** "How hard you can go for 1 hour (watts)"
- **Helper:** "Estimate" button → `Weight × 2.75 W/kg` (male) or `Weight × 2.25 W/kg` (female)
- **Hint:** "Power you can sustain for ~1 hour"
- **Tooltip:** "If you've done a 20-min test, enter 95% of your average power"

**Smart Actions:**

1. **Beginner:** Auto-apply 2.0 W/kg (male) or 1.5 W/kg (female)
2. **Intermediate:** Pre-fill 2.75 W/kg (male) or 2.25 W/kg (female), allow adjustment
3. **Advanced:** Show empty field with estimate button
4. **All paths:** Derive power curve and create 10+ `activity_efforts` records

#### For Running / Triathlon:

**Beginner Mode (Auto-Applied):**

```
✓ We've set up your running profile!

Your estimated pace:
• 1-hour pace: 6:30/km
• 5K pace: 5:50/km
• 10K pace: 6:15/km

This is a comfortable starting point.
You can update this anytime as you improve!
```

**Intermediate Mode (Validation):**

```
Does this sound right for you?

Your estimated threshold pace: 5:15/km

This means you can hold about 5:15 per kilometer for 30-60 minutes.

[Yes, that's about right] [No, let me adjust]
```

**Advanced Mode (Technical):**

**Field:** Threshold Pace (min/km)

- **Technical Label:** "Threshold Pace (min/km)"
- **Beginner Label:** "Your steady, hard pace (min/km)"
- **Input Format:** "M:SS" (e.g., "5:00")
- **Hint:** "Pace you can sustain for ~1 hour"
- **Tooltip:** "Your 'comfortably hard' pace - tough but sustainable for 30-60 minutes"

**Smart Actions:**

1. **Beginner:** Auto-apply 6:30/km (male) or 7:00/km (female)
2. **Intermediate:** Pre-fill 5:15/km (male) or 5:45/km (female), allow adjustment
3. **Advanced:** Show empty field with estimate button
4. **All paths:** Derive speed curve and create 10+ `activity_efforts` records

#### For Swimming / Triathlon:

**Beginner Mode (Auto-Applied):**

```
✓ We've set up your swimming profile!

Your estimated pace:
• 100m pace: 2:00/100m
• 400m pace: 2:00/100m
• 1500m pace: 2:09/100m

This is a comfortable starting point.
You can update this anytime as you improve!
```

**Intermediate Mode (Validation):**

```
Does this sound right for you?

Your estimated Critical Swim Speed: 1:40/100m

This means you can hold 1:40 per 100m for about 1500-2000 meters.

[Yes, that's about right] [No, let me adjust]
```

**Advanced Mode (Technical):**

**Field:** Critical Swim Speed - CSS (min:sec/100m)

- **Technical Label:** "CSS - Critical Swim Speed (per 100m)"
- **Beginner Label:** "Your comfortable swim pace (per 100m)"
- **Input Format:** "M:SS" (e.g., "1:30")
- **Hint:** "Pace you can sustain for 1500-2000m (~30 minutes)"
- **Tooltip:** "Your best average pace for a continuous 1500-2000m swim"

**Smart Actions:**

1. **Beginner:** Auto-apply 2:00/100m (male) or 2:15/100m (female)
2. **Intermediate:** Pre-fill 1:40/100m (male) or 1:50/100m (female), allow adjustment
3. **Advanced:** Show empty field with estimate button
4. **All paths:** Derive swim pace curve and create 10+ `activity_efforts` records

**Note on Swimming HR:**

- Swimming HR is typically 10-15 bpm lower than land-based sports due to horizontal body position and cooling effect of water
- System automatically adjusts HR zones for swimming activities

#### For All Sports:

**Field:** VO2max (ml/kg/min) - Advanced Only

- **Display:** Only show for "I Know My Metrics" path
- **Hint:** "Your fitness score (ml/kg/min) - skip if unknown"
- **Auto-filled** if calculated from Max HR + Resting HR in Step 2

**Smart Actions:**

- If manually entered, override calculated VO2max
- Create/update `profile_metrics` record

**Result:** 10-20 `activity_efforts` records + 1 `profile_metrics` record (all experience levels).

---

## Data Flow Summary

### Scenario 1: Beginner ("Just Starting Out")

**User enters (< 1 minute):**

1. **Experience Level:** "Just Starting Out"
2. DOB: 1994-01-01 (Age: 32)
3. Weight: 70 kg
4. Gender: Male
5. Primary Sport: Cycling

**System auto-applies:**

- FTP: 140W (2.0 W/kg - beginner baseline)
- Max HR: 188 bpm (220 - 32)
- Resting HR: 70 bpm (untrained baseline)
- LTHR: 160 bpm (85% of max HR)
- VO2max: 40.3 ml/kg/min (calculated from HR)

**System creates (16 records):**

- **1 `profiles` update** (DOB, gender, primary sport, experience_level)
- **5 `profile_metrics` records:**
  - `weight_kg`: 70
  - `max_hr`: 188 (auto)
  - `resting_hr`: 70 (auto)
  - `vo2_max`: 40.3 (calculated)
  - `lthr`: 160 (estimated)
- **10 `activity_efforts` records** (power curve from auto-applied FTP):
  - 5s: 4140W
  - 10s: 2140W
  - 30s: 807W
  - 1m: 473W
  - 3m: 207W
  - 5m: 207W
  - 10m: 173W
  - 20m: 157W
  - 30m: 151W
  - 60m: 140W

**Total:** 16 records from 5 inputs
**Data Multiplier:** 3.2x
**Time:** < 1 minute
**User Effort:** Minimal (no technical knowledge required)

---

### Scenario 2: Intermediate ("I Train Regularly")

**User enters (1-2 minutes):**

1. **Experience Level:** "I Train Regularly"
2. DOB: 1990-01-01 (Age: 36)
3. Weight: 70 kg
4. Gender: Male
5. Primary Sport: Running
6. **Validation:** Confirms estimated pace of 5:15/km is correct

**System auto-applies (with validation):**

- Threshold Pace: 5:15/km (315 seconds/km - recreational trained)
- Max HR: 184 bpm (220 - 36)
- Resting HR: 60 bpm (trained baseline)
- LTHR: 156 bpm (85% of max HR)
- VO2max: 47.0 ml/kg/min (calculated from HR)

**System creates (16 records):**

- **1 `profiles` update** (DOB, gender, primary sport, experience_level)
- **5 `profile_metrics` records:**
  - `weight_kg`: 70
  - `max_hr`: 184 (auto)
  - `resting_hr`: 60 (auto)
  - `vo2_max`: 47.0 (calculated)
  - `lthr`: 156 (estimated)
- **10 `activity_efforts` records** (speed curve from validated threshold pace):
  - 5s: 3.66 m/s (sprint)
  - 10s: 3.66 m/s (sprint)
  - 30s: 3.66 m/s (sprint)
  - 1m: 3.43 m/s (VO2max)
  - 3m: 3.43 m/s (VO2max)
  - 5m: 3.17 m/s (threshold)
  - 10m: 3.17 m/s (threshold)
  - 20m: 3.17 m/s (threshold)
  - 30m: 2.92 m/s (tempo)
  - 60m: 2.92 m/s (tempo)

**Total:** 16 records from 6 inputs (including validation)
**Data Multiplier:** 2.7x
**Time:** 1-2 minutes
**User Effort:** Low (validates estimates, no calculations needed)

---

### Scenario 3: Advanced ("I Know My Metrics")

**User enters (2-3 minutes):**

1. **Experience Level:** "I Know My Metrics"
2. DOB: 1990-01-01 (Age: 36)
3. Weight: 70 kg
4. Gender: Male
5. Primary Sport: Triathlon
6. Max HR: 190 bpm
7. Resting HR: 55 bpm
8. FTP: 250W
9. Threshold Pace: 4:30 min/km (270 seconds/km)

**System derives:**

- LTHR: 162 bpm (85% of max HR)
- VO2max: 52.8 ml/kg/min (calculated from HR)
- Power curve from FTP (10 efforts)
- Speed curve from threshold pace (10 efforts)

**System creates (26 records):**

- **1 `profiles` update** (DOB, gender, primary sport, experience_level)
- **5 `profile_metrics` records:**
  - `weight_kg`: 70
  - `max_hr`: 190
  - `resting_hr`: 55
  - `vo2_max`: 52.8 (calculated)
  - `lthr`: 162 (estimated)
- **10 `activity_efforts` records** (power curve from FTP):
  - 5s: 4250W
  - 10s: 2250W
  - 30s: 917W
  - 1m: 583W
  - 3m: 317W
  - 5m: 267W
  - 10m: 283W
  - 20m: 267W
  - 30m: 261W
  - 60m: 250W
- **10 `activity_efforts` records** (speed curve from threshold pace):
  - 5s: 4.26 m/s (sprint)
  - 10s: 4.26 m/s (sprint)
  - 30s: 4.26 m/s (sprint)
  - 1m: 4.00 m/s (VO2max)
  - 3m: 4.00 m/s (VO2max)
  - 5m: 3.70 m/s (threshold)
  - 10m: 3.70 m/s (threshold)
  - 20m: 3.70 m/s (threshold)
  - 30m: 3.40 m/s (tempo)
  - 60m: 3.40 m/s (tempo)

**Total:** 26 records from 9 inputs
**Data Multiplier:** 2.9x
**Time:** 2-3 minutes
**User Effort:** Moderate (enters known metrics, system derives everything else)

---

### Scenario 3b: Beginner Swimmer

**User enters (< 1 minute):**

1. **Experience Level:** "Just Starting Out"
2. DOB: 1988-01-01 (Age: 38)
3. Weight: 75 kg
4. Gender: Female
5. Primary Sport: Swimming

**System auto-applies:**

- CSS: 2:15/100m (135 seconds/100m - beginner female baseline)
- Max HR: 182 bpm (220 - 38)
- Resting HR: 75 bpm (untrained female baseline)
- LTHR: 155 bpm (85% of max HR)
- VO2max: 37.4 ml/kg/min (calculated from HR)

**System creates (16 records):**

- **1 `profiles` update** (DOB, gender, primary sport, experience_level)
- **5 `profile_metrics` records:**
  - `weight_kg`: 75
  - `max_hr`: 182 (auto)
  - `resting_hr`: 75 (auto)
  - `vo2_max`: 37.4 (calculated)
  - `lthr`: 155 (estimated)
- **10 `activity_efforts` records** (swim pace curve from auto-applied CSS):
  - 10s: 0.81 m/s (2:03/100m - sprint)
  - 20s: 0.81 m/s (2:03/100m - sprint)
  - 30s: 0.81 m/s (2:03/100m - 50m pace)
  - 1m: 0.79 m/s (2:06/100m - 100m pace)
  - 2m: 0.79 m/s (2:06/100m - 200m pace)
  - 3m: 0.74 m/s (2:15/100m - CSS baseline)
  - 5m: 0.74 m/s (2:15/100m - CSS)
  - 10m: 0.74 m/s (2:15/100m - CSS)
  - 15m: 0.69 m/s (2:25/100m - distance)
  - 30m: 0.69 m/s (2:25/100m - distance)

**Total:** 16 records from 5 inputs
**Data Multiplier:** 3.2x
**Time:** < 1 minute
**User Effort:** Minimal (no technical knowledge required)

**Friendly Confirmation:**

```
✓ We've set up your swimming profile!

Your estimated pace:
• 50m pace: 1:02 (2:03/100m)
• 100m pace: 2:06
• 400m pace: 9:00 (2:15/100m)
• 1500m pace: 36:15 (2:25/100m)

This is a comfortable starting point.
You can update this anytime as you improve!
```

---

### Scenario 4: Skip Setup

**User enters (< 30 seconds):**

1. **Experience Level:** "Skip Setup"
2. DOB: 1990-01-01 (Age: 36)
3. Weight: 70 kg
4. Gender: Male
5. Primary Sport: Cycling

**System creates (2 records):**

- **1 `profiles` update** (DOB, gender, primary sport)
- **1 `profile_metrics` record:**
  - `weight_kg`: 70

**Total:** 2 records from 5 inputs
**Data Multiplier:** 0.4x
**Time:** < 30 seconds
**User Effort:** Minimal (will configure later)

**Note:** User sees dashboard with "Complete Your Profile" prompt and can run "Quick Setup" from settings anytime.

---

### Comparison Table

| Experience Path  | User Inputs | Records Created | Multiplier | Time    | Effort   |
| ---------------- | ----------- | --------------- | ---------- | ------- | -------- |
| **Beginner**     | 5           | 16              | 3.2x       | < 1 min | Minimal  |
| **Intermediate** | 6           | 16              | 2.7x       | 1-2 min | Low      |
| **Advanced**     | 9           | 26              | 2.9x       | 2-3 min | Moderate |
| **Skip Setup**   | 5           | 2               | 0.4x       | < 30s   | Minimal  |

**Key Insight:** Beginners get the BEST data multiplier (3.2x) with the LEAST effort (< 1 minute) because the system makes all the decisions for them!

---

## Technical Implementation

### Core Package Functions (`@repo/core`)

#### 1. `derivePowerCurveFromFTP(ftp: number, wPrime?: number): BestEffort[]`

**Location:** `packages/core/calculations/power-curve.ts`

```typescript
export function derivePowerCurveFromFTP(
  ftp: number,
  wPrime: number = 20000, // Default 20 kJ for recreational
): BestEffort[] {
  const durations = [5, 10, 30, 60, 180, 300, 600, 1200, 1800, 3600];

  return durations.map((duration) => ({
    duration_seconds: duration,
    effort_type: "power",
    value: ftp + wPrime / duration,
    unit: "watts",
    activity_category: "bike",
  }));
}
```

#### 2. `deriveSpeedCurveFromThresholdPace(thresholdPaceSecondsPerKm: number): BestEffort[]`

**Location:** `packages/core/calculations/speed-curve.ts`

```typescript
export function deriveSpeedCurveFromThresholdPace(
  thresholdPaceSecondsPerKm: number,
): BestEffort[] {
  const thresholdSpeedMps = 1000 / thresholdPaceSecondsPerKm;
  const durations = [5, 10, 30, 60, 180, 300, 600, 1200, 1800, 3600];

  return durations.map((duration) => {
    let multiplier = 1.0;

    if (duration < 60)
      multiplier = 1.15; // Sprint
    else if (duration < 300)
      multiplier = 1.08; // VO2max
    else if (duration < 1200)
      multiplier = 1.0; // Threshold
    else multiplier = 0.92; // Tempo

    return {
      duration_seconds: duration,
      effort_type: "speed",
      value: thresholdSpeedMps * multiplier,
      unit: "meters_per_second",
      activity_category: "run",
    };
  });
}
```

#### 3. `deriveSwimPaceCurveFromCSS(cssSecondsPerHundredMeters: number): BestEffort[]` (NEW)

**Location:** `packages/core/calculations/swim-pace-curve.ts`

```typescript
export function deriveSwimPaceCurveFromCSS(
  cssSecondsPerHundredMeters: number,
): BestEffort[] {
  const cssSpeedMps = 100 / cssSecondsPerHundredMeters;
  const durations = [10, 20, 30, 60, 120, 180, 300, 600, 900, 1800]; // seconds

  return durations.map((duration) => {
    let multiplier = 1.0;

    if (duration < 60) {
      // Sprint efforts (25m, 50m): 8-12% faster than CSS
      multiplier = 1.1;
    } else if (duration < 180) {
      // 100m-200m efforts: 5-8% faster than CSS
      multiplier = 1.06;
    } else if (duration < 600) {
      // 400m efforts: CSS baseline
      multiplier = 1.0;
    } else {
      // Distance efforts (800m+): 5-8% slower than CSS
      multiplier = 0.93;
    }

    return {
      duration_seconds: duration,
      effort_type: "speed",
      value: cssSpeedMps * multiplier,
      unit: "meters_per_second",
      activity_category: "swim",
    };
  });
}

/**
 * Helper: Convert pace per 100m to speed (m/s)
 */
export function pacePerHundredMetersToSpeed(
  secondsPerHundredMeters: number,
): number {
  return 100 / secondsPerHundredMeters;
}

/**
 * Helper: Convert speed (m/s) to pace per 100m
 */
export function speedToPacePerHundredMeters(metersPerSecond: number): number {
  return 100 / metersPerSecond;
}
```

#### 4. `calculateVO2MaxFromHR(maxHR: number, restingHR: number): number`

**Location:** `packages/core/calculations/vo2max.ts`

```typescript
export function calculateVO2MaxFromHR(
  maxHR: number,
  restingHR: number,
): number {
  // Uth-Sørensen-Overgaard-Pedersen formula
  return 15.3 * (maxHR / restingHR);
}
```

#### 4. `estimateLTHR(maxHR: number): number`

**Location:** `packages/core/calculations/heart-rate.ts`

```typescript
export function estimateLTHR(maxHR: number): number {
  return Math.round(maxHR * 0.85);
}
```

#### 5. `getBaselineProfile(experienceLevel, weightKg, gender, age, sport): BaselineProfile` (NEW)

**Location:** `packages/core/calculations/baseline-profiles.ts`

```typescript
export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "skip";
export type Sport = "cycling" | "running" | "swimming" | "triathlon" | "other";

export interface BaselineProfile {
  // Heart rate metrics
  max_hr: number;
  resting_hr: number;
  lthr: number;
  vo2_max: number;

  // Performance metrics (sport-specific)
  ftp?: number; // cycling/triathlon
  threshold_pace_seconds_per_km?: number; // running/triathlon
  css_seconds_per_hundred_meters?: number; // swimming/triathlon (NEW)

  // Metadata
  confidence: "high" | "medium" | "low";
  source: "baseline_beginner" | "baseline_intermediate" | "manual";
}

export function getBaselineProfile(
  experienceLevel: ExperienceLevel,
  weightKg: number,
  gender: "male" | "female" | "other",
  age: number,
  sport: Sport,
): BaselineProfile | null {
  if (experienceLevel === "skip" || experienceLevel === "advanced") {
    return null; // No baseline needed
  }

  // Heart rate baselines
  const max_hr = 220 - age;
  const resting_hr =
    experienceLevel === "beginner"
      ? gender === "male"
        ? 70
        : 75
      : gender === "male"
        ? 60
        : 65;
  const lthr = Math.round(max_hr * 0.85);
  const vo2_max = 15.3 * (max_hr / resting_hr);

  // Sport-specific baselines
  let ftp: number | undefined;
  let threshold_pace_seconds_per_km: number | undefined;

  if (sport === "cycling" || sport === "triathlon") {
    // FTP baselines (W/kg)
    const ftpPerKg =
      experienceLevel === "beginner"
        ? gender === "male"
          ? 2.0
          : 1.5
        : gender === "male"
          ? 2.75
          : 2.25;
    ftp = Math.round(weightKg * ftpPerKg);
  }

  if (sport === "running" || sport === "triathlon") {
    // Threshold pace baselines (seconds/km)
    threshold_pace_seconds_per_km =
      experienceLevel === "beginner"
        ? gender === "male"
          ? 390
          : 420 // 6:30 or 7:00
        : gender === "male"
          ? 315
          : 345; // 5:15 or 5:45
  }

  // Swimming baselines (NEW)
  let css_seconds_per_hundred_meters: number | undefined;

  if (sport === "swimming" || sport === "triathlon") {
    // CSS baselines (seconds per 100m)
    css_seconds_per_hundred_meters =
      experienceLevel === "beginner"
        ? gender === "male"
          ? 120 // 2:00/100m
          : 135 // 2:15/100m
        : gender === "male"
          ? 100 // 1:40/100m
          : 110; // 1:50/100m
  }

  return {
    max_hr,
    resting_hr,
    lthr,
    vo2_max,
    ftp,
    threshold_pace_seconds_per_km,
    css_seconds_per_hundred_meters, // NEW
    confidence: experienceLevel === "beginner" ? "low" : "medium",
    source:
      experienceLevel === "beginner"
        ? "baseline_beginner"
        : "baseline_intermediate",
  };
}
```

#### 6. `validateAgainstBaseline(metric, value, baseline): ValidationResult` (NEW)

**Location:** `packages/core/calculations/baseline-profiles.ts`

```typescript
export interface ValidationResult {
  isRealistic: boolean;
  percentileEstimate?: number; // e.g., 75th percentile
  warning?: string;
  suggestion?: string;
}

export function validateAgainstBaseline(
  metric: "ftp" | "threshold_pace" | "css" | "vo2_max",
  value: number,
  baseline: BaselineProfile,
): ValidationResult {
  // Check if user-entered value is realistic compared to baseline

  if (metric === "ftp" && baseline.ftp) {
    const deviation = (value - baseline.ftp) / baseline.ftp;

    if (deviation > 0.5) {
      // 50% above baseline
      return {
        isRealistic: false,
        warning: "This FTP seems high for your profile",
        suggestion: `Typical value for your profile: ${baseline.ftp}W. Are you sure this is correct?`,
      };
    } else if (deviation < -0.3) {
      // 30% below baseline
      return {
        isRealistic: true,
        warning: "This FTP is lower than typical",
        suggestion: `You might improve with training! Typical: ${baseline.ftp}W`,
      };
    }
  }

  // Similar logic for threshold_pace and vo2_max...

  return { isRealistic: true };
}
```

---

### tRPC Procedures (`@repo/trpc`)

#### New Router: `onboarding.ts`

```typescript
export const onboardingRouter = createTRPCRouter({
  /**
   * Complete onboarding with smart derivations.
   * Creates profile_metrics and activity_efforts from minimal input.
   * Supports experience-based baseline profiles.
   */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        // Experience level (NEW)
        experience_level: z.enum([
          "beginner",
          "intermediate",
          "advanced",
          "skip",
        ]),

        // Basic profile
        dob: z.string().datetime(),
        weight_kg: z.number().positive(),
        gender: z.enum(["male", "female", "other"]),
        primary_sport: z.enum([
          "cycling",
          "running",
          "swimming",
          "triathlon",
          "other",
        ]),

        // Heart rate metrics (optional - auto-applied for beginner/intermediate)
        max_hr: z.number().int().min(100).max(250).optional(),
        resting_hr: z.number().int().min(30).max(120).optional(),
        lthr: z.number().int().min(80).max(220).optional(),

        // Performance metrics (optional - auto-applied for beginner/intermediate)
        ftp: z.number().positive().optional(),
        threshold_pace_seconds_per_km: z.number().positive().optional(),
        vo2max: z.number().positive().optional(),

        // Training context (optional)
        training_frequency: z.enum(["1-2", "3-4", "5-6", "7+"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const userId = session.user.id;

      // Calculate age from DOB
      const age = new Date().getFullYear() - new Date(input.dob).getFullYear();

      // Get baseline profile if beginner/intermediate
      const baseline = getBaselineProfile(
        input.experience_level,
        input.weight_kg,
        input.gender,
        age,
        input.primary_sport,
      );

      // 1. Update profile
      await supabase
        .from("profiles")
        .update({
          dob: input.dob,
          gender: input.gender,
          primary_sport: input.primary_sport,
          training_frequency: input.training_frequency,
          experience_level: input.experience_level, // NEW
        })
        .eq("id", userId);

      // 2. Create profile_metrics
      const metricsToCreate = [];

      // Weight (always required)
      metricsToCreate.push({
        profile_id: userId,
        metric_type: "weight_kg",
        value: input.weight_kg,
        unit: "kg",
        recorded_at: new Date().toISOString(),
      });

      // Merge user input with baseline
      const finalMetrics = {
        max_hr: input.max_hr || baseline?.max_hr,
        resting_hr: input.resting_hr || baseline?.resting_hr,
        lthr: input.lthr || baseline?.lthr,
        vo2_max: input.vo2max || baseline?.vo2_max,
        ftp: input.ftp || baseline?.ftp,
        threshold_pace_seconds_per_km:
          input.threshold_pace_seconds_per_km ||
          baseline?.threshold_pace_seconds_per_km,
      };

      // Heart rate metrics
      if (finalMetrics.max_hr) {
        metricsToCreate.push({
          profile_id: userId,
          metric_type: "max_hr",
          value: input.max_hr,
          unit: "bpm",
          recorded_at: new Date().toISOString(),
        });
      }

      if (input.resting_hr) {
        metricsToCreate.push({
          profile_id: userId,
          metric_type: "resting_hr",
          value: input.resting_hr,
          unit: "bpm",
          recorded_at: new Date().toISOString(),
        });
      }

      // Calculate VO2max if both HR metrics provided
      if (input.max_hr && input.resting_hr) {
        const calculatedVO2max = calculateVO2MaxFromHR(
          input.max_hr,
          input.resting_hr,
        );
        metricsToCreate.push({
          profile_id: userId,
          metric_type: "vo2_max",
          value: input.vo2max || calculatedVO2max, // Use manual if provided
          unit: "ml/kg/min",
          recorded_at: new Date().toISOString(),
        });
      }

      // Estimate LTHR if max_hr provided and lthr not provided
      if (input.max_hr && !input.lthr) {
        const estimatedLTHR = estimateLTHR(input.max_hr);
        metricsToCreate.push({
          profile_id: userId,
          metric_type: "lthr",
          value: estimatedLTHR,
          unit: "bpm",
          recorded_at: new Date().toISOString(),
        });
      } else if (input.lthr) {
        metricsToCreate.push({
          profile_id: userId,
          metric_type: "lthr",
          value: input.lthr,
          unit: "bpm",
          recorded_at: new Date().toISOString(),
        });
      }

      await supabase.from("profile_metrics").insert(metricsToCreate);

      // 3. Create activity_efforts from FTP
      if (input.ftp) {
        const powerCurve = derivePowerCurveFromFTP(input.ftp);
        const effortsToCreate = powerCurve.map((effort) => ({
          activity_id: null, // Manual entry
          profile_id: userId,
          activity_category: "bike",
          duration_seconds: effort.duration_seconds,
          effort_type: "power",
          value: effort.value,
          unit: "watts",
          recorded_at: new Date().toISOString(),
        }));

        await supabase.from("activity_efforts").insert(effortsToCreate);
      }

      // 4. Create activity_efforts from threshold pace
      if (input.threshold_pace_seconds_per_km) {
        const speedCurve = deriveSpeedCurveFromThresholdPace(
          input.threshold_pace_seconds_per_km,
        );
        const effortsToCreate = speedCurve.map((effort) => ({
          activity_id: null,
          profile_id: userId,
          activity_category: "run",
          duration_seconds: effort.duration_seconds,
          effort_type: "speed",
          value: effort.value,
          unit: "meters_per_second",
          recorded_at: new Date().toISOString(),
        }));

        await supabase.from("activity_efforts").insert(effortsToCreate);
      }

      return { success: true };
    }),
});
```

---

## UI/UX Enhancements

### Progressive Disclosure

- **Step 1:** Required fields only (DOB, weight, gender, sport)
- **Step 2-4:** Optional with "Skip" buttons
- **Visual Feedback:** Show "X records created" after each step

### Smart Helpers

- **Estimate Buttons:** Pre-fill fields with calculated values
- **Tooltips:** Explain what each metric means
- **Examples:** "e.g., 250W for recreational cyclist"

### Validation

- **Real-time:** Show errors as user types
- **Range Checks:** Warn if values seem unrealistic (e.g., FTP > 500W)
- **Confirmation:** "We'll create 10 performance records from your FTP. Continue?"

---

## Future Enhancements

### 1. Test Result Import

Allow users to upload test results (e.g., Ramp Test, 20-min FTP test) and auto-populate metrics.

### 2. Strava/Garmin Sync

Fetch recent activities and extract best efforts automatically.

### 3. Adaptive Refinement

After first few activities, suggest updating onboarding metrics based on actual performance.

### 4. Manual Best Efforts Entry

Advanced users can manually enter specific duration bests (e.g., "My 5-min power is 320W").

---

## Success Metrics

### Quantitative

- **Data Density:** Average # of `activity_efforts` + `profile_metrics` per user after onboarding
- **Completion Rate:** % of users who complete all optional steps
- **Time to Complete:** Median time from start to finish

### Qualitative

- **User Feedback:** "Did onboarding feel too long?" (Yes/No)
- **Training Plan Quality:** Can users immediately create accurate training plans?

---

## Summary

This design creates a **2-3x data multiplier** by intelligently deriving performance curves from high-level metrics. Users enter 7-12 values and get 15-30 database records, enabling:

- ✅ Accurate training zone calculations
- ✅ Structured workout guidance
- ✅ Performance tracking from day 1
- ✅ Minimal user effort

**Key Innovation:** Treat onboarding inputs as **seeds** that grow into complete performance profiles through sport science algorithms.
