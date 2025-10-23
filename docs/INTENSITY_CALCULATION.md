# Intensity Calculation Architecture

## Overview

This document explains how GradientPeak handles workout intensity. The key principle is:

**Intensity is CALCULATED from workout data, not PRE-ASSIGNED.**

## Core Concepts

### 1. Intensity Factor (IF) is the Source of Truth

- **IF (Intensity Factor)** = (Normalized Power / Functional Threshold Power) × 100
- Stored as integer 0-400 (representing 0% - 400%)
- Calculated AFTER workout completion from actual performance data
- Used to derive TSS and intensity classifications

### 2. Training Stress Score (TSS)

TSS is calculated from duration and IF:

```
TSS = (duration_in_seconds × (IF/100)² × 100) / 3600
```

**Example:**
- 1 hour workout at IF = 75 (75% or 0.75 decimal)
- TSS = (3600 × 0.75² × 100) / 3600 = 56.25

### 3. Intensity Zones (Display Only)

Intensity zones are **derived** from IF at display time, never stored:

| Zone     | IF Range (%)| IF Range (Decimal) | Description                      |
|----------|-------------|--------------------|---------------------------------|
| Recovery | < 55        | < 0.55             | Active recovery, very easy      |
| Easy     | 55 - 74     | 0.55 - 0.74        | Aerobic base building           |
| Moderate | 75 - 89     | 0.75 - 0.89        | Tempo, steady state             |
| Hard     | 90 - 104    | 0.90 - 1.04        | Threshold, VO2max intervals     |
| Race     | ≥ 105       | ≥ 1.05             | Race effort, all-out            |

## Data Flow

### Planning Phase (Before Workout)

```
User selects activity plan
   ↓
Activity plan has estimated_tss (stored in activity_plans table)
   ↓
System uses estimated_tss for:
   - Weekly TSS projection
   - Training load forecasting
   - Constraint validation
```

**No intensity is assigned or stored at planning time.**

### Recording Phase (During Workout)

```
User records activity
   ↓
System captures:
   - Power data (for cycling)
   - Heart rate data
   - Pace data (for running)
   - Duration
   ↓
Data stored in activity_streams table
```

### Analysis Phase (After Workout)

```
Activity completed
   ↓
Calculate Normalized Power from power stream
   ↓
Calculate IF = (NP / FTP) × 100
   ↓
Store IF in activities.intensity_factor (as 0-400 percentage)
   ↓
Calculate TSS = (duration × (IF/100)² × 100) / 3600
   ↓
Store TSS in activities.training_stress_score
```

### Display Phase (When Viewing)

```
Load activity.intensity_factor (e.g., 82)
   ↓
Convert to decimal: 82 / 100 = 0.82
   ↓
Derive zone: getIntensityZone(0.82) → "moderate"
   ↓
Display to user: "Moderate intensity (IF 82% or 0.82)"
```

## Database Schema

### Activities Table

```sql
-- Calculated metrics (populated after workout)
intensity_factor integer,  -- 0-400 (represents 0%-400%)
training_stress_score integer,  -- Calculated from IF and duration
normalized_power integer,  -- For cycling

-- NO intensity_zone column - derived at runtime
```

### Activity Plans Table

```sql
-- For planning purposes only
estimated_tss integer,  -- Used for forecasting
estimated_duration integer,  -- Minutes

-- NO intensity field - not relevant for planning
```

### Planned Activities Table

```sql
-- Links to activity plan
activity_plan_id uuid,
scheduled_date date,
notes text,

-- NO intensity fields
-- NO estimated_tss (comes from activity_plan)
-- NO effort_level
```

## Code Implementation

### Core Functions (packages/core/calculations.ts)

```typescript
// Calculate IF from workout data (returns decimal, e.g., 0.82)
export function calculateIntensityFactor(
  normalizedPower: number,
  functionalThresholdPower: number
): number {
  return normalizedPower / functionalThresholdPower;
}

// Derive zone from IF (for display)
export function getIntensityZone(intensityFactor: number): string {
  if (intensityFactor < 0.55) return 'recovery';
  if (intensityFactor < 0.75) return 'easy';
  if (intensityFactor < 0.90) return 'moderate';
  if (intensityFactor < 1.05) return 'hard';
  return 'race';
}

// Calculate TSS
export function calculateTSS(
  durationSeconds: number,
  intensityFactor: number
): number {
  return (durationSeconds * Math.pow(intensityFactor, 2) * 100) / 3600;
}

// Estimate TSS for planning (before workout)
export function estimateTSS(
  durationMinutes: number,
  expectedEffort: 'easy' | 'moderate' | 'hard'
): number {
  const estimatedIF = {
    easy: 0.65,    // 65%
    moderate: 0.80, // 80%
    hard: 0.95,     // 95%
  };
  return calculateTSS(durationMinutes * 60, estimatedIF[expectedEffort]);
}
```

### Usage in UI

```typescript
// Display activity intensity
function ActivityCard({ activity }) {
  const if_value = activity.intensity_factor / 100; // Convert 82 → 0.82 decimal
  const zone = getIntensityZone(if_value);
  
  return (
    <View>
      <Text>{activity.name}</Text>
      <Text>IF: {activity.intensity_factor}% ({if_value.toFixed(2)})</Text>
      <Text>Zone: {zone}</Text>
      <Text>TSS: {activity.training_stress_score}</Text>
    </View>
  );
}

// Analyze intensity distribution
function IntensityAnalysis({ activities }) {
  const distribution = activities.reduce((acc, activity) => {
    const if_value = activity.intensity_factor / 100;
    const zone = getIntensityZone(if_value);
    acc[zone] = (acc[zone] || 0) + 1;
    return acc;
  }, {});
  
  return (
    <View>
      <Text>Recovery: {distribution.recovery || 0} workouts</Text>
      <Text>Easy: {distribution.easy || 0} workouts</Text>
      <Text>Moderate: {distribution.moderate || 0} workouts</Text>
      <Text>Hard: {distribution.hard || 0} workouts</Text>
      <Text>Race: {distribution.race || 0} workouts</Text>
    </View>
  );
}
```

## Training Plan Constraints

### What CAN Be Validated (Proactively)

✅ **Weekly TSS limits** - Use estimated_tss from activity_plans
✅ **Workout frequency** - Count planned activities per week
✅ **Consecutive training days** - Check scheduled_date patterns
✅ **Rest days per week** - Calculate from scheduled activities

### What CANNOT Be Validated (Proactively)

❌ **Hard workout spacing** - Requires knowing actual intensity (IF)
❌ **Intensity distribution** - Requires completed workout data
❌ **Effort balance** - Requires actual performance metrics

### Retrospective Analysis (After Workouts)

These can be analyzed AFTER workouts are completed:

```typescript
// Analyze actual intensity distribution
function analyzeIntensityDistribution(activities) {
  const totalTSS = activities.reduce((sum, a) => sum + a.training_stress_score, 0);
  
  const distribution = {
    recovery: 0,
    easy: 0,
    moderate: 0,
    hard: 0,
    race: 0,
  };
  
  activities.forEach(activity => {
    const if_value = activity.intensity_factor / 100;
    const zone = getIntensityZone(if_value);
    distribution[zone] += activity.training_stress_score;
  });
  
  // Convert to percentages
  return Object.entries(distribution).reduce((acc, [zone, tss]) => {
    acc[zone] = (tss / totalTSS) * 100;
    return acc;
  }, {});
}

// Check hard workout spacing (retrospective)
function checkHardWorkoutSpacing(activities, minHours = 48) {
  const hardWorkouts = activities
    .filter(a => (a.intensity_factor / 100) >= 0.90)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  
  const violations = [];
  for (let i = 1; i < hardWorkouts.length; i++) {
    const hoursBetween = (
      new Date(hardWorkouts[i].started_at) - 
      new Date(hardWorkouts[i-1].started_at)
    ) / (1000 * 60 * 60);
    
    if (hoursBetween < minHours) {
      violations.push({
        workout1: hardWorkouts[i-1],
        workout2: hardWorkouts[i],
        hoursBetween,
      });
    }
  }
  
  return violations;
}
```

## Benefits of This Approach

### 1. Training Science Accuracy
- Intensity is measured, not guessed
- Reflects actual athlete performance
- Accounts for fatigue, conditions, equipment

### 2. Flexibility in Planning
- Don't have to predict intensity before workout
- User can respond to how they feel
- Planned workouts are guidance, not constraints

### 3. Accurate Analysis
- Real intensity distribution from actual data
- True training stress calculated
- Meaningful trends and insights

### 4. Simpler Data Model
- No intensity enums or pre-assignment
- Fewer database fields
- Less validation complexity

## Migration from Old Approach

If you previously stored intensity on planned_activities or activities:

### Do NOT Store
- ❌ `planned_activities.intensity` or `planned_activities.planned_effort_level`
- ❌ `activities.intensity_zone` or `activities.preset_intensity`

### Do Store
- ✅ `activities.intensity_factor` (0-400 as percentage)
- ✅ `activities.training_stress_score`
- ✅ `activities.normalized_power`
- ✅ `activity_plans.estimated_tss` (for planning)

### UI Changes
- Replace intensity dropdowns with estimated TSS display
- Show calculated intensity on completed workouts
- Derive zones in real-time for display
- Use IF as the primary metric

## Common Questions

**Q: How do users know what intensity to train at?**
A: Activity plans describe the workout (e.g., "30min easy run", "2x8min threshold intervals"). Users execute based on feel and zones. Actual intensity is measured afterward.

**Q: Can we suggest intensity before a workout?**
A: Yes, via workout descriptions and estimated TSS, but don't enforce it. Let the athlete respond to their body.

**Q: How do we show intensity trends?**
A: Query completed activities, calculate zone from IF, aggregate by time period. All done at query time.

**Q: What about workouts without power data?**
A: Use heart rate or perceived exertion to estimate IF. Running can use pace relative to threshold pace.

**Q: How do we validate training plan compliance?**
A: Use volume-based metrics (TSS, frequency, rest days). Analyze intensity distribution retrospectively.

## References

- Training Peaks TSS: https://www.trainingpeaks.com/blog/what-is-tss/
- Intensity Factor: https://www.trainingpeaks.com/blog/normalized-power-intensity-factor-training-stress/
- Polarized Training: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6683776/