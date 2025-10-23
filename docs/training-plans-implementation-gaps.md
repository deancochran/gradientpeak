# Training Plans Implementation Gaps Analysis

**Status:** Database ✅ | Basic CRUD ✅ | Advanced Features ⚠️

This document compares the HANDOFF.md requirements against the current implementation to identify what still needs to be built.

---

## ✅ Completed Implementation

### Database Schema
- ✅ `training_plans` table with JSONB structure
- ✅ One plan per user constraint (`unique_training_plan_per_user`)
- ✅ Extended `planned_activities` with `training_plan_id`, `activity_intensity`, `notes_override`, `modification_history`
- ✅ Extended `activities` with `training_plan_id`
- ✅ Indexes and triggers

### Core Package
- ✅ `trainingPlanStructureSchema` - Complete Zod validation
- ✅ `intensityDistributionSchema` - Validates percentages sum to 100%
- ✅ `periodizationTemplateSchema` - Long-term progression plan
- ✅ TypeScript types exported

### tRPC: training-plans Router
- ✅ `get()` - Get user's training plan (equivalent to `getActive()`)
- ✅ `create()` - Create new plan (enforces one-per-user)
- ✅ `update()` - Update plan configuration
- ✅ `delete()` - Delete plan with warnings
- ✅ `exists()` - Quick check if plan exists
- ✅ `getById()` - Get specific plan

### tRPC: planned-activities Router
- ✅ `list()` - List planned activities with filtering
- ✅ `getById()` - Get single planned activity
- ✅ `getToday()` - Today's planned activities
- ✅ `getWeekCount()` - Count for current week
- ✅ `create()` - Create planned activity
- ✅ `update()` - Update planned activity
- ✅ `delete()` - Delete planned activity

---

## ❌ Missing Implementation

### 1. Training Plans Router - Advanced Endpoints

#### ❌ `getConstraintStatus(id, weekStart)`
**Purpose:** Weekly constraint validation showing compliance with plan rules

**Required Logic:**
- Calculate weekly TSS (planned vs actual)
- Count activities in week
- Count hard workouts
- Check consecutive training days
- Validate rest days
- Check spacing between hard workouts

**Return Type:**
```typescript
{
  weekStart: string;
  weekEnd: string;
  constraints: {
    weeklyTSS: {
      target: { min: number; max: number };
      actual: number;
      planned: number;
      status: 'pass' | 'warning' | 'violation';
    };
    activityFrequency: {
      target: number;
      actual: number;
      status: 'pass' | 'warning' | 'violation';
    };
    hardWorkouts: {
      max: number;
      actual: number;
      status: 'pass' | 'warning' | 'violation';
    };
    consecutiveDays: {
      max: number;
      current: number;
      status: 'pass' | 'warning' | 'violation';
    };
    restDays: {
      min: number;
      actual: number;
      status: 'pass' | 'warning' | 'violation';
    };
  };
  warnings: string[];
  recommendations: string[];
}
```

---

#### ❌ `getIdealCurve(id, dates)`
**Purpose:** Generate ideal training progression curve based on plan configuration

**Required Logic:**
- Extract periodization template from plan
- Calculate day-by-day ideal CTL/ATL/TSB
- Use exponential weighted moving average (EWMA)
- CTL time constant = 42 days
- ATL time constant = 7 days
- Apply ramp rate from periodization template

**Return Type:**
```typescript
{
  dates: string[];
  idealCTL: number[];
  idealATL: number[];
  idealTSB: number[];
  projectedWeeklyTSS: number[];
}
```

**Algorithm:**
```
For each day from startDate to endDate:
  1. Calculate target CTL based on ramp rate and weeks elapsed
  2. Calculate daily TSS needed to maintain target CTL
  3. Update ATL using EWMA: ATL = ATL + (dailyTSS - ATL) * (1 - e^(-1/7))
  4. Calculate TSB = CTL - ATL
  5. Store values for the day
```

---

#### ❌ `getComparison(id, dates)`
**Purpose:** Compare ideal vs actual training curves

**Required Logic:**
- Calculate ideal curve (from `getIdealCurve`)
- Calculate actual curve from completed activities
- Compute variance and compliance metrics
- Generate recommendations based on gaps

**Return Type:**
```typescript
{
  dates: string[];
  ideal: {
    ctl: number[];
    atl: number[];
    tsb: number[];
  };
  actual: {
    ctl: number[];
    atl: number[];
    tsb: number[];
  };
  metrics: {
    avgCTLVariance: number;
    avgATLVariance: number;
    complianceRate: number; // % of planned workouts completed
    weeklyTSSCompliance: number; // % meeting TSS targets
  };
  recommendations: string[];
}
```

---

#### ❌ Training Metrics Calculation Functions

These should be implemented in `packages/core/calculations.ts` and exposed via tRPC:

**`calculateCTL(activities, date)`**
- Chronic Training Load (42-day exponentially weighted moving average)
- Formula: `CTL_new = CTL_old + (TSS - CTL_old) * (1 - e^(-1/42))`

**`calculateATL(activities, date)`**
- Acute Training Load (7-day exponentially weighted moving average)
- Formula: `ATL_new = ATL_old + (TSS - ATL_old) * (1 - e^(-1/7))`

**`calculateTSB(ctl, atl)`**
- Training Stress Balance
- Formula: `TSB = CTL - ATL`
- Interpretation:
  - TSB > 25: Well-rested, may be losing fitness
  - TSB 10-25: Optimal race readiness zone
  - TSB -10-10: Productive training zone
  - TSB < -10: High fatigue, risk of overtraining

---

### 2. Planned Activities Router - Extensions

#### ❌ `listByWeek(planId, weekStart)`
**Purpose:** Get 7-day schedule for a specific week

**Current:** `list()` exists but doesn't have week-specific filtering optimized

**Need to Add:**
```typescript
listByWeek: protectedProcedure
  .input(z.object({
    training_plan_id: z.string().uuid().optional(),
    weekStart: z.string(), // ISO date for start of week
  }))
  .query(async ({ ctx, input }) => {
    const weekEnd = addDays(input.weekStart, 7);
    // Query planned_activities for the week
    // Include activity_plan details
    // Include completed activity if exists
    // Calculate weekly totals
  })
```

---

#### ❌ `create()` - Add Training Plan Fields
**Current:** Basic create exists but missing:
- `training_plan_id` field
- `activity_intensity` field
- Constraint validation before scheduling

**Need to Update:**
```typescript
create: protectedProcedure
  .input(z.object({
    activity_plan_id: z.string().uuid(),
    scheduled_date: z.string(),
    training_plan_id: z.string().uuid().optional(),
    activity_intensity: z.enum(['recovery', 'easy', 'moderate', 'hard', 'race']).optional(),
    notes_override: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Validate constraints if training_plan_id provided
    // Insert with all fields
  })
```

---

#### ❌ `validateConstraints(planId, activity, date)`
**Purpose:** Pre-flight validation before scheduling workout

**Required Logic:**
```typescript
validateConstraints: protectedProcedure
  .input(z.object({
    training_plan_id: z.string().uuid(),
    scheduled_date: z.string(),
    activity: z.object({
      estimated_tss: number,
      intensity: z.enum(['recovery', 'easy', 'moderate', 'hard', 'race']),
    }),
  }))
  .query(async ({ ctx, input }) => {
    // 1. Get training plan structure
    // 2. Get all planned activities for that week
    // 3. Get all activities in previous days (for consecutive check)
    // 4. Run validation checks (see Key Validation Logic in HANDOFF)
    // 5. Return validation result
  })
```

**Validation Checks:**
1. Weekly TSS: `planned + new ≤ max?`
2. Frequency: `activities + 1 ≤ target?`
3. Hard limit: `hard_count + (is_hard ? 1 : 0) ≤ max?`
4. Consecutive: `would create > max_consecutive?`
5. Rest days: `week has ≥ min_rest?`
6. Spacing: `last hard workout ≥ min_hours_between?`

**Return Type:**
```typescript
{
  passes: boolean;
  warnings: Array<{
    type: 'tss' | 'frequency' | 'hard_limit' | 'consecutive' | 'rest' | 'spacing';
    severity: 'warning' | 'violation';
    message: string;
  }>;
  projectedWeeklyTSS: number;
  projectedActivityCount: number;
}
```

---

#### ❌ `reschedule(id, newDate)`
**Purpose:** Move activity to new date with history tracking

**Need to Add:**
```typescript
reschedule: protectedProcedure
  .input(z.object({
    id: z.string().uuid(),
    new_date: z.string(),
    reason: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Get existing planned activity
    // 2. Validate constraints for new date
    // 3. Update scheduled_date
    // 4. Append to modification_history JSONB:
    //    { from: oldDate, to: newDate, timestamp: now, reason }
  })
```

---

### 3. Analytics Router (NEW)

**File:** `packages/trpc/src/routers/analytics.ts`

This entire router needs to be created:

#### ❌ `calculateActualCurve(dates)`
**Purpose:** Historical CTL/ATL/TSB from completed activities

```typescript
calculateActualCurve: protectedProcedure
  .input(z.object({
    start_date: z.string(),
    end_date: z.string(),
  }))
  .query(async ({ ctx, input }) => {
    // 1. Query all activities in date range
    // 2. Calculate daily CTL/ATL/TSB using EWMA
    // 3. Return time series data
  })
```

---

#### ❌ `getWeeklySummary(planId, weeks)`
**Purpose:** Week-by-week planned vs actual comparison

```typescript
getWeeklySummary: protectedProcedure
  .input(z.object({
    training_plan_id: z.string().uuid(),
    weeks_back: z.number().default(12),
  }))
  .query(async ({ ctx, input }) => {
    // For each week:
    // 1. Get planned activities and sum TSS
    // 2. Get completed activities and sum TSS
    // 3. Calculate completion rate
    // 4. Calculate CTL change
    // 5. Identify missed workouts
  })
```

**Return Type:**
```typescript
{
  weeks: Array<{
    weekStart: string;
    weekEnd: string;
    planned: {
      activityCount: number;
      totalTSS: number;
      hardCount: number;
    };
    actual: {
      activityCount: number;
      totalTSS: number;
      hardCount: number;
    };
    completionRate: number;
    ctlChange: number;
    missedWorkouts: Array<{
      id: string;
      name: string;
      scheduled_date: string;
    }>;
    status: 'on_track' | 'behind' | 'ahead';
  }>;
}
```

---

#### ❌ `getIntensityDistribution(planId, dates)`
**Purpose:** Compare target vs actual intensity balance

```typescript
getIntensityDistribution: protectedProcedure
  .input(z.object({
    training_plan_id: z.string().uuid(),
    start_date: z.string(),
    end_date: z.string(),
  }))
  .query(async ({ ctx, input }) => {
    // 1. Get plan's target intensity_distribution
    // 2. Query completed activities with intensity
    // 3. Calculate actual distribution by TSS or time
    // 4. Compare and compute variance
  })
```

**Return Type:**
```typescript
{
  target: {
    recovery: number;
    easy: number;
    moderate: number;
    hard: number;
    race: number;
  };
  actual: {
    recovery: { tss: number; percentage: number };
    easy: { tss: number; percentage: number };
    moderate: { tss: number; percentage: number };
    hard: { tss: number; percentage: number };
    race: { tss: number; percentage: number };
  };
  variance: {
    recovery: number;
    easy: number;
    moderate: number;
    hard: number;
    race: number;
  };
  recommendations: string[];
}
```

---

#### ❌ `getCurrentStatus()`
**Purpose:** Current training status with recommendations

```typescript
getCurrentStatus: protectedProcedure
  .query(async ({ ctx }) => {
    // 1. Get user's training plan
    // 2. Calculate current CTL/ATL/TSB
    // 3. Compare to ideal values
    // 4. Generate recommendations
  })
```

**Return Type:**
```typescript
{
  current: {
    ctl: number;
    atl: number;
    tsb: number;
    form: 'excellent' | 'good' | 'tired' | 'overreached';
  };
  ideal: {
    ctl: number;
    atl: number;
    tsb: number;
  };
  variance: {
    ctl: number;
    atl: number;
  };
  thisWeek: {
    plannedTSS: number;
    actualTSS: number;
    activitiesCompleted: number;
    activitiesPlanned: number;
  };
  recommendations: Array<{
    type: 'rest' | 'recovery' | 'maintain' | 'increase' | 'taper';
    priority: 'high' | 'medium' | 'low';
    message: string;
  }>;
}
```

---

### 4. Activity Library Router

**Note:** This likely refers to the existing `activity_plans` router, which already has filtering.

**Minor Enhancements Needed:**
- ✅ Already has `list()` with filtering by type
- ✅ Already has search capability
- ⚠️ May need "recommended" filter based on constraint compatibility
- ⚠️ May need TSS range filtering

---

## 📦 Required Core Package Functions

### File: `packages/core/calculations.ts`

These functions should be implemented in the core package for reuse:

#### ❌ Training Load Calculations
```typescript
export function calculateCTL(
  activities: Array<{ date: string; tss: number }>,
  targetDate: string,
  previousCTL: number = 0
): number;

export function calculateATL(
  activities: Array<{ date: string; tss: number }>,
  targetDate: string,
  previousATL: number = 0
): number;

export function calculateTSB(ctl: number, atl: number): number;
```

#### ❌ Constraint Validation
```typescript
export function validateTrainingConstraints(
  plan: TrainingPlanStructure,
  proposedActivity: {
    date: string;
    tss: number;
    intensity: 'recovery' | 'easy' | 'moderate' | 'hard' | 'race';
  },
  existingActivities: Array<{
    date: string;
    tss: number;
    intensity: string;
  }>
): {
  passes: boolean;
  warnings: Array<{
    type: string;
    severity: 'warning' | 'violation';
    message: string;
  }>;
  projectedWeeklyTSS: number;
};
```

#### ❌ Week Utilities
```typescript
export function getWeekStart(date: string): string;
export function getWeekEnd(date: string): string;
export function getWeekActivities(
  activities: Array<{ date: string }>,
  weekStart: string
): Array<any>;
```

---

## 🎯 Implementation Priority

### Phase 1: Core Calculations (Week 1)
**Priority: HIGH** - Required for all advanced features

1. Implement CTL/ATL/TSB calculations in `core/calculations.ts`
2. Add unit tests for calculation accuracy
3. Implement constraint validation logic
4. Add week utility functions

### Phase 2: Constraint Validation (Week 1-2)
**Priority: HIGH** - Critical for Plan Tab UX

1. Add `validateConstraints()` to planned-activities router
2. Update `create()` to validate before insert
3. Add `reschedule()` with history tracking
4. Add `listByWeek()` endpoint

### Phase 3: Training Curves (Week 2)
**Priority: MEDIUM** - Required for Trends Tab

1. Add `getIdealCurve()` to training-plans router
2. Add `calculateActualCurve()` to analytics router
3. Add `getComparison()` to training-plans router

### Phase 4: Analytics Router (Week 2-3)
**Priority: MEDIUM** - Required for Trends Tab

1. Create analytics router
2. Implement `getCurrentStatus()`
3. Implement `getWeeklySummary()`
4. Implement `getIntensityDistribution()`

### Phase 5: Weekly Status (Week 3)
**Priority: LOW** - Nice to have

1. Add `getConstraintStatus()` to training-plans router
2. Add weekly compliance tracking

---

## 📊 Summary

| Category | Total | Completed | Missing | % Complete |
|----------|-------|-----------|---------|------------|
| Database | 4 | 4 | 0 | 100% |
| Core Schemas | 5 | 5 | 0 | 100% |
| Training Plans Router | 9 | 4 | 5 | 44% |
| Planned Activities Router | 7 | 7 | 4 updates | 70% |
| Analytics Router | 4 | 0 | 4 | 0% |
| Core Calculations | 6 | 0 | 6 | 0% |
| **TOTAL** | **35** | **20** | **15** | **57%** |

---

## 🚀 Next Actions

1. **Implement Core Calculations** (`packages/core/calculations.ts`)
   - CTL/ATL/TSB functions
   - Constraint validation logic
   - Week utilities

2. **Extend Planned Activities Router**
   - Add `training_plan_id` and `activity_intensity` to create/update
   - Add `validateConstraints()` endpoint
   - Add `reschedule()` with history tracking
   - Add `listByWeek()` endpoint

3. **Create Analytics Router**
   - All 4 endpoints from scratch

4. **Extend Training Plans Router**
   - Add curve calculation endpoints
   - Add constraint status endpoint

5. **Frontend Implementation** (after backend complete)
   - Plan Tab components
   - Trends Tab components
   - Modals with constraint validation