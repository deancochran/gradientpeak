# Intensity Calculation Refactor Summary

**Date:** 2025-01-23  
**Status:** ✅ Complete

## Overview

Refactored the intensity calculation approach to align with training science principles. Intensity is now **calculated from workout data (IF)** rather than **pre-assigned during planning**.

---

## Key Principle

**Intensity Factor (IF) is the source of truth. Everything else is derived.**

- IF = Normalized Power / FTP
- TSS = (duration × IF² × 100) / 3600
- Intensity zones are derived from IF at display time

---

## Changes Made

### 1. Core Package Updates

#### `packages/core/calculations.ts`
**Added Functions:**
- ✅ `calculateIntensityFactor(normalizedPower, functionalThreshold)` - Calculate IF from workout data
- ✅ `getIntensityZone(intensityFactor)` - Derive zone from IF (for display only)
- ✅ `calculateTSS(durationSeconds, intensityFactor)` - Calculate TSS from IF
- ✅ `estimateTSS(durationMinutes, effortLevel)` - Estimate TSS for planning purposes

**Key Points:**
- All calculations use IF as input
- Zones are never stored, only derived
- Estimation function for planning uses average IF values

#### `packages/core/schemas/training_plan_structure.ts`
**Removed:**
- ❌ `intensityDistributionSchema` - No longer prescribing intensity distribution
- ❌ `intensityDistribution` field from `trainingPlanStructureSchema`
- ❌ `min_hours_between_hard` constraint - Can't validate proactively
- ❌ `max_hard_activities_per_week` constraint - Can't validate proactively
- ❌ `IntensityDistribution` type export

**Why:** Intensity is measured after workout completion, not prescribed beforehand.

#### `packages/core/schemas/planned_activity.ts`
**Created New File:**
- ✅ `plannedActivityCreateSchema` - Simplified to essential fields only
- ✅ `plannedActivityUpdateSchema` - Partial update schema
- ✅ `plannedActivityRescheduleSchema` - For moving activities

**Removed Fields:**
- ❌ `estimated_tss` - Comes from activity_plan
- ❌ `estimated_duration_minutes` - Comes from activity_plan
- ❌ `planned_effort_level` - Not needed, workout describes itself
- ❌ `intensity` - Never should have existed

**Kept Fields:**
- ✅ `activity_plan_id` - Links to workout template
- ✅ `scheduled_date` - When to do it
- ✅ `training_plan_id` (optional) - Links to training plan if applicable
- ✅ `notes` - User notes

#### `packages/core/schemas/index.ts`
**Updated:**
- ✅ Export `planned_activity` schemas
- ✅ Use new simplified planned activity schemas
- ✅ Removed old planned activity schemas with intensity fields

---

### 2. tRPC Router Updates

#### `packages/trpc/src/routers/planned_activities.ts`

**Updated `validateConstraints` Endpoint:**

**Before:**
```typescript
input: {
  training_plan_id: uuid,
  scheduled_date: string,
  activity: {
    estimated_tss: number,
    intensity: enum('recovery', 'easy', 'moderate', 'hard', 'race')
  }
}
```

**After:**
```typescript
input: {
  training_plan_id: uuid,
  scheduled_date: string,
  activity_plan_id: uuid  // Get estimated_tss from activity_plan
}
```

**Removed Validations:**
- ❌ Hard workout spacing - Requires knowing actual IF
- ❌ Intensity-based constraints - Can't know intensity until after workout

**Kept Validations:**
- ✅ Weekly TSS limits - Use estimated_tss from activity_plans
- ✅ Workout frequency - Count scheduled activities
- ✅ Consecutive training days - Check date patterns
- ✅ Rest days per week - Count non-workout days

**Key Changes:**
- Query `activity_plans` table to get `estimated_tss`
- Remove `training_plan_id` filters from planned_activities queries (not all planned activities are part of a plan)
- Use `profile_id` for filtering user's activities
- Return only volume-based constraint checks

---

### 3. Database Schema

**No Migration Required!**

The existing schema already has what we need:
- ✅ `activities.intensity_factor` (0-100) - Stores IF
- ✅ `activities.training_stress_score` - Stores TSS
- ✅ `activities.normalized_power` - Used to calculate IF
- ✅ `activity_plans.estimated_tss` - For planning
- ✅ `planned_activities` - Links to activity_plans

**What We DON'T Need:**
- ❌ No `calculated_intensity_zone` column
- ❌ No `planned_effort_level` column
- ❌ No `intensity` enum anywhere
- ❌ No database functions for intensity calculation
- ❌ No `modification_history` JSONB (over-engineering)

**Reasoning:**
- Intensity zones are derived at runtime via `getIntensityZone(IF)`
- All calculations happen in application code (core package)
- Database stores raw metrics (IF, TSS), application interprets them

---

### 4. Documentation

#### Created: `apps/mobile/docs/INTENSITY_CALCULATION.md`
Comprehensive documentation covering:
- Core concepts (IF, TSS, zones)
- Data flow (planning → recording → analysis → display)
- Database schema
- Code implementation
- Training plan constraints
- Retrospective analysis examples
- Benefits of this approach
- Migration guide
- Common questions

---

## What Changed in Practice

### Planning a Workout (Before)
```typescript
// ❌ OLD: Had to pre-assign intensity
{
  activity_plan_id: "uuid",
  scheduled_date: "2025-01-23",
  intensity: "moderate",  // Wrong!
  estimated_tss: 60
}
```

### Planning a Workout (After)
```typescript
// ✅ NEW: Just link to activity plan
{
  activity_plan_id: "uuid",  // Has estimated_tss already
  scheduled_date: "2025-01-23",
  training_plan_id: "uuid"   // Optional
}
```

### Displaying Intensity (Before)
```typescript
// ❌ OLD: Read from database
<Text>{activity.intensity}</Text>  // "moderate"
```

### Displaying Intensity (After)
```typescript
// ✅ NEW: Calculate from IF
const if_value = activity.intensity_factor / 100;  // 0.82
const zone = getIntensityZone(if_value);  // "moderate"
<Text>{zone} (IF {if_value.toFixed(2)})</Text>
```

### Analyzing Distribution (Before)
```typescript
// ❌ OLD: Count pre-assigned intensities
SELECT intensity, COUNT(*) 
FROM activities 
GROUP BY intensity
```

### Analyzing Distribution (After)
```typescript
// ✅ NEW: Calculate from IF values
const activities = await getActivities();
const distribution = activities.reduce((acc, a) => {
  const zone = getIntensityZone(a.intensity_factor / 100);
  acc[zone] = (acc[zone] || 0) + 1;
  return acc;
}, {});
```

---

## Mobile UI Changes Needed

### Components to Update

#### 1. Remove Intensity Pickers
**Files:**
- `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/modals/AddWorkoutModal.tsx`
- `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/modals/components/IntensityPicker.tsx`

**Action:**
- ❌ Remove IntensityPicker component entirely
- ✅ Just show estimated_tss from activity_plan
- ✅ Remove intensity from constraint validation calls

#### 2. Update Training Plan Wizard
**Files:**
- `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/create/components/steps/Step4IntensityDistribution.tsx`
- `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/create/components/hooks/useWizardForm.ts`

**Action:**
- ❌ Remove Step 4 entirely (intensity distribution)
- ✅ Renumber steps: Step 5 (Periodization) becomes Step 4
- ✅ Remove `intensityDistribution` from form state
- ✅ Remove intensity validation logic

#### 3. Update Trends Screen
**File:**
- `apps/mobile/src/app/(internal)/(tabs)/trends.tsx`

**Action:**
- ✅ Change intensity distribution calculation to use IF
- ✅ Call `getIntensityZone()` for each activity's IF
- ✅ Update UI to show "Calculated from IF" instead of "Target vs Actual"
- ✅ Remove intensity distribution target comparison

#### 4. Update Activity Display
**Files:**
- Any component displaying activity details

**Action:**
- ✅ Calculate zone from IF: `getIntensityZone(activity.intensity_factor / 100)`
- ✅ Display IF value prominently
- ✅ Show derived zone as secondary info
- ✅ Remove any stored intensity fields

---

## tRPC Endpoint Changes

### `planned_activities.validateConstraints`

**Before:**
```typescript
validateConstraints({
  training_plan_id: "uuid",
  scheduled_date: "2025-01-23",
  activity: {
    estimated_tss: 60,
    intensity: "moderate"
  }
})
```

**After:**
```typescript
validateConstraints({
  training_plan_id: "uuid",
  scheduled_date: "2025-01-23",
  activity_plan_id: "uuid"  // Fetch estimated_tss from activity_plans
})
```

**Response Before:**
```typescript
{
  constraints: {
    weeklyTSS: { ... },
    workoutsPerWeek: { ... },
    consecutiveDays: { ... },
    restDays: { ... },
    hardWorkoutSpacing: { ... }  // ❌ Removed
  }
}
```

**Response After:**
```typescript
{
  constraints: {
    weeklyTSS: { ... },
    workoutsPerWeek: { ... },
    consecutiveDays: { ... },
    restDays: { ... }
    // No hardWorkoutSpacing - can't validate proactively
  }
}
```

---

## Training Plan Structure Changes

### Before (JSONB structure)
```json
{
  "target_weekly_tss_min": 200,
  "target_weekly_tss_max": 400,
  "target_activities_per_week": 5,
  "max_consecutive_days": 3,
  "min_rest_days_per_week": 1,
  "intensity_distribution": {
    "recovery": 0.20,
    "easy": 0.50,
    "moderate": 0.20,
    "hard": 0.08,
    "race": 0.02
  },
  "min_hours_between_hard": 48,
  "max_hard_activities_per_week": 2,
  "periodization_template": { ... }
}
```

### After (JSONB structure)
```json
{
  "target_weekly_tss_min": 200,
  "target_weekly_tss_max": 400,
  "target_activities_per_week": 5,
  "max_consecutive_days": 3,
  "min_rest_days_per_week": 1,
  "periodization_template": { ... }
}
```

**Removed:**
- `intensity_distribution` - Can't prescribe, only analyze
- `min_hours_between_hard` - Can't validate without actual IF
- `max_hard_activities_per_week` - Can't validate without actual IF

---

## Retrospective Analysis (New Capability)

After workouts are completed, we CAN analyze intensity:

```typescript
// Get intensity distribution from completed activities
function getActualIntensityDistribution(activities) {
  const totalTSS = activities.reduce((sum, a) => 
    sum + a.training_stress_score, 0);
  
  const distribution = { recovery: 0, easy: 0, moderate: 0, hard: 0, race: 0 };
  
  activities.forEach(a => {
    const zone = getIntensityZone(a.intensity_factor / 100);
    distribution[zone] += a.training_stress_score;
  });
  
  return Object.entries(distribution).reduce((acc, [zone, tss]) => {
    acc[zone] = (tss / totalTSS) * 100;
    return acc;
  }, {});
}

// Check if hard workouts are too close
function checkHardWorkoutSpacing(activities, minHours = 48) {
  const hardWorkouts = activities
    .filter(a => (a.intensity_factor / 100) >= 0.90)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  
  const violations = [];
  for (let i = 1; i < hardWorkouts.length; i++) {
    const hoursBetween = 
      (new Date(hardWorkouts[i].started_at) - 
       new Date(hardWorkouts[i-1].started_at)) / (1000 * 60 * 60);
    
    if (hoursBetween < minHours) {
      violations.push({
        workout1: hardWorkouts[i-1],
        workout2: hardWorkouts[i],
        hoursBetween
      });
    }
  }
  
  return violations;
}
```

---

## Testing Checklist

### Core Package
- [ ] `calculateIntensityFactor()` returns correct IF
- [ ] `getIntensityZone()` maps IF to correct zones
- [ ] `calculateTSS()` matches training science formula
- [ ] `estimateTSS()` returns reasonable estimates

### tRPC Endpoints
- [ ] `validateConstraints` uses activity_plan estimated_tss
- [ ] Constraint validation works without intensity
- [ ] Weekly TSS check uses correct values
- [ ] Consecutive days calculation works
- [ ] Rest days validation works

### Mobile UI
- [ ] Activity cards show calculated intensity from IF
- [ ] Trends screen calculates distribution from IF
- [ ] Training plan wizard removed intensity step
- [ ] Workout scheduling modal removed intensity picker
- [ ] Constraint validation UI shows updated checks

---

## Migration Path for Existing Data

### If You Have Stored Intensity Values

**Don't panic!** You don't need to migrate old data:

1. **Old Activities**: If they have `intensity_factor`, you're good. Derive zones on the fly.
2. **Planned Activities**: Just ignore any old intensity fields. They're not used anymore.
3. **Training Plans**: Update the JSONB structure to remove intensity fields.

### Clean Up (Optional)

```sql
-- Remove intensity distribution from existing plans
UPDATE training_plans
SET structure = structure - 'intensity_distribution' 
                         - 'min_hours_between_hard' 
                         - 'max_hard_activities_per_week';
```

---

## Benefits Summary

✅ **Scientifically Accurate** - Intensity measured, not guessed  
✅ **Flexible Planning** - Users adapt to how they feel  
✅ **Simpler Data Model** - Fewer fields, less complexity  
✅ **Accurate Analysis** - Real data, not pre-assignments  
✅ **Better UX** - Less input required from users  
✅ **Retrospective Insights** - Analyze what actually happened  

---

## References

- [Training Peaks: What is TSS?](https://www.trainingpeaks.com/blog/what-is-tss/)
- [Intensity Factor Explained](https://www.trainingpeaks.com/blog/normalized-power-intensity-factor-training-stress/)
- [Polarized Training Research](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6683776/)

---

## Next Steps

1. Update mobile UI components (remove intensity pickers)
2. Update training plan wizard (remove Step 4)
3. Update trends screen (calculate from IF)
4. Test constraint validation with new logic
5. Update documentation for users
6. Consider adding retrospective analysis features

---

**Status:** Core implementation complete. UI updates pending.