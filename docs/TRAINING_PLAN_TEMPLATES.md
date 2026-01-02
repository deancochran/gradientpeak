# GradientPeak Training Plan Templates

This document describes the system training plan templates available in the GradientPeak platform. These templates serve as starting points for users and provide comprehensive examples of periodized and maintenance training plans.

## Overview

The system includes **10 training plan templates** across 2 categories:
- **7 Periodized Plans** - Goal-oriented plans with structured phases
- **3 Maintenance Plans** - Flexible plans for off-season or general fitness

## Training Plan Types

### Periodized Plans

Periodized plans are goal-oriented with specific target dates and progressive training phases (mesocycles). They include:
- **Base Phase** - Building aerobic foundation
- **Build Phase** - Increasing intensity and specificity
- **Peak Phase** - Race-specific sharpening
- **Taper Phase** - Pre-race volume reduction

Each mesocycle defines:
- Duration in weeks
- Intensity distribution (easy/moderate/hard ratios)
- TSS multiplier for volume adjustment

### Maintenance Plans

Maintenance plans are flexible, open-ended plans without specific goals. They focus on:
- Maintaining a baseline fitness level (CTL)
- Consistent training without periodization
- General health and activity

## Available Templates

### 1. 16-Week Marathon Build
**Type:** Periodized  
**ID:** `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`  
**Duration:** 16 weeks  
**Target CTL:** 60 → 100  
**Weekly TSS:** 400-500  
**Activities/Week:** 5

Progressive build for marathon racing with:
- 4-week base building phase
- Two 4-week build phases
- 2-week peak phase
- 2-week taper

**Activity Distribution:**
- Run: 80%
- Strength: 15%
- Mobility: 5%

---

### 2. 12-Week Half Marathon Build
**Type:** Periodized  
**ID:** `b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e`  
**Duration:** 12 weeks  
**Target CTL:** 50 → 80  
**Weekly TSS:** 300-400  
**Activities/Week:** 5

Balanced approach for half marathon with:
- 4-week aerobic base
- 4-week tempo build
- 2-week race sharpening
- 2-week taper

**Activity Distribution:**
- Run: 85%
- Strength: 10%
- Mobility: 5%

---

### 3. 20-Week Ironman Build
**Type:** Periodized  
**ID:** `c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f`  
**Duration:** 20 weeks  
**Target CTL:** 70 → 130  
**Weekly TSS:** 500-700  
**Activities/Week:** 8

Comprehensive triathlon plan with:
- 6-week foundation phase
- Two 5-week build phases
- 2-week race preparation
- 2-week taper

**Activity Distribution:**
- Bike: 45%
- Run: 30%
- Swim: 15%
- Strength: 10%

---

### 4. 12-Week Century Ride Build
**Type:** Periodized  
**ID:** `d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a`  
**Duration:** 12 weeks  
**Target CTL:** 55 → 90  
**Weekly TSS:** 350-500  
**Activities/Week:** 5

Cycling-focused endurance for 100-mile events:
- 5-week endurance foundation
- 4-week sweet spot build
- 2-week event preparation
- 1-week taper

**Activity Distribution:**
- Bike: 85%
- Strength: 10%
- Yoga: 5%

---

### 5. 12-Week Hybrid Athlete Build
**Type:** Periodized  
**ID:** `e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b`  
**Duration:** 12 weeks  
**Target CTL:** 50 → 75  
**Weekly TSS:** 350-450  
**Activities/Week:** 6

Balanced endurance and strength development:
- 6-week foundation building
- 4-week progressive build
- 2-week maintenance phase

**Activity Distribution:**
- Run: 40%
- Bike: 25%
- Strength: 25%
- Yoga: 10%

---

### 6. 8-Week Sprint Triathlon
**Type:** Periodized  
**ID:** `c9d0e1f2-a3b4-4c5d-6e7f-8a9b0c1d2e3f`  
**Duration:** 8 weeks  
**Target CTL:** 40 → 65  
**Weekly TSS:** 250-350  
**Activities/Week:** 6

Quick build for sprint distance:
- 3-week base phase
- 3-week build & peak
- 2-week race week taper

**Activity Distribution:**
- Bike: 40%
- Run: 35%
- Swim: 25%

---

### 7. 24-Week Ultra Marathon Build
**Type:** Periodized  
**ID:** `d0e1f2a3-b4c5-4d6e-7f8a-9b0c1d2e3f4a`  
**Duration:** 24 weeks  
**Target CTL:** 65 → 120  
**Weekly TSS:** 450-650  
**Activities/Week:** 6

Extended ultra-distance preparation:
- Two 6-week base phases
- 6-week build phase
- 4-week peak phase
- 2-week taper

**Activity Distribution:**
- Run: 85%
- Strength: 10%
- Mobility: 5%

---

### 8. Off-Season Maintenance
**Type:** Maintenance  
**ID:** `f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c`  
**Baseline CTL:** 50  
**Weekly TSS:** 250-350  
**Activities/Week:** 4

Flexible off-season plan to stay active without specific race goals.

**Intensity Distribution:**
- Easy: 65%
- Moderate: 25%
- Hard: 10%

**Activity Distribution:**
- Run: 40%
- Bike: 30%
- Strength: 20%
- Swim: 10%

---

### 9. Active Recovery
**Type:** Maintenance  
**ID:** `a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d`  
**Baseline CTL:** 40  
**Weekly TSS:** 150-250  
**Activities/Week:** 3

Low-volume recovery and regeneration.

**Intensity Distribution:**
- Easy: 80%
- Moderate: 15%
- Hard: 5%

**Activity Distribution:**
- Run: 35%
- Bike: 25%
- Yoga: 20%
- Swim: 20%

---

### 10. High Volume Base Builder
**Type:** Maintenance  
**ID:** `b8c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c1d2e`  
**Baseline CTL:** 80  
**Weekly TSS:** 450-600  
**Activities/Week:** 7

High-volume base building for experienced athletes.

**Intensity Distribution:**
- Easy: 75%
- Moderate: 20%
- Hard: 5%

**Activity Distribution:**
- Run: 45%
- Bike: 35%
- Swim: 15%
- Strength: 5%

---

## Schema Structure

All training plans follow the `TrainingPlanStructure` schema defined in `packages/core/schemas/training_plan_structure.ts`.

### Periodized Plan Structure
```typescript
{
  plan_type: "periodized",
  target_weekly_tss_min: number,
  target_weekly_tss_max: number,
  target_activities_per_week: number,
  max_consecutive_training_days: number,
  min_rest_days_per_week: number,
  max_consecutive_rest_days: number,
  periodization_template: {
    starting_ctl: number,
    target_ctl: number,
    ramp_rate: number,
    target_date: string,
    recovery_week_frequency: number,
    recovery_week_reduction: number,
    mesocycles: Array<{
      name: string,
      phase: "base" | "build" | "peak" | "taper" | "recovery" | "maintenance",
      duration_weeks: number,
      intensity_distribution: {
        easy: number,
        moderate: number,
        hard: number
      },
      tss_multiplier: number
    }>
  },
  activity_type_distribution?: Record<string, number>
}
```

### Maintenance Plan Structure
```typescript
{
  plan_type: "maintenance",
  target_weekly_tss_min: number,
  target_weekly_tss_max: number,
  target_activities_per_week: number,
  max_consecutive_training_days: number,
  min_rest_days_per_week: number,
  max_consecutive_rest_days: number,
  baseline_ctl?: number,
  intensity_distribution?: {
    easy: number,
    moderate: number,
    hard: number
  },
  activity_type_distribution?: Record<string, number>
}
```

## Usage

### Import All Templates
```typescript
import { SAMPLE_TRAINING_PLANS } from "@gradientpeak/core/samples";
// Returns array with all 10 training plan templates
```

### Import by Type
```typescript
import { SAMPLE_TRAINING_PLANS_BY_TYPE } from "@gradientpeak/core/samples";

const periodizedPlans = SAMPLE_TRAINING_PLANS_BY_TYPE.periodized;
const maintenancePlans = SAMPLE_TRAINING_PLANS_BY_TYPE.maintenance;
```

### Get Plan by Name
```typescript
import { getSamplePlanByName } from "@gradientpeak/core/samples";

const marathonPlan = getSamplePlanByName("16-Week Marathon Build");
```

## Seeding the Database

System templates are seeded to the database using the seed script:

```bash
# Seed all training plan templates
pnpm seed-training-plans

# Dry run to preview changes
pnpm seed-training-plans --dry-run

# Seed only periodized plans
pnpm seed-training-plans --type=periodized

# Seed only maintenance plans
pnpm seed-training-plans --type=maintenance

# Prevent deletion of templates not in code
pnpm seed-training-plans --no-delete
```

The seed script:
1. Fetches existing system templates from the database
2. Compares with local code definitions by ID
3. Creates new templates
4. Updates changed templates
5. Deletes removed templates (unless `--no-delete`)

## Database Schema

Training plans are stored in the `training_plans` table with the following key fields:

```sql
create table training_plans (
  id uuid primary key,
  profile_id uuid references profiles(id),  -- null for system templates
  is_system_template boolean not null default false,
  name text not null,
  description text,
  structure jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint training_plans_template_profile_check check (
    (is_system_template = true and profile_id is null) or
    (is_system_template = false and profile_id is not null)
  )
);
```

## Helper Functions

The schema exports several helper functions:

### `getCurrentMesocycle()`
Get the current mesocycle based on the plan start date:
```typescript
const currentMeso = getCurrentMesocycle(plan, planStartDate);
```

### `getWeeklyIntensityBreakdown()`
Calculate how many easy/moderate/hard sessions for the current week:
```typescript
const breakdown = getWeeklyIntensityBreakdown(plan, planStartDate);
// { easy: 3, moderate: 1, hard: 1 }
```

### `getTargetWeeklyTSS()`
Get the adjusted TSS targets for the current mesocycle:
```typescript
const tss = getTargetWeeklyTSS(plan, planStartDate);
// { min: 440, max: 550 } (with 1.1x multiplier)
```

### `weeksUntilTarget()`
Calculate weeks remaining until target date:
```typescript
const weeks = weeksUntilTarget("2026-04-26");
```

## Type Guards

```typescript
import { isPeriodizedPlan, isMaintenancePlan } from "@gradientpeak/core/schemas/training_plan_structure";

if (isPeriodizedPlan(plan.structure)) {
  // TypeScript knows this is a PeriodizedPlanStructure
  console.log(plan.structure.periodization_template.target_ctl);
}

if (isMaintenancePlan(plan.structure)) {
  // TypeScript knows this is a MaintenancePlanStructure
  console.log(plan.structure.baseline_ctl);
}
```

## Development Notes

When adding new templates:
1. Create the template constant in `packages/core/samples/training-plans.ts`
2. Include a unique UUID in the `id` field
3. Add to the `SAMPLE_TRAINING_PLANS` array export
4. Ensure target_date is in the future (will need updating periodically)
5. Run `pnpm seed-training-plans` to sync to database

## References

- Schema definition: `packages/core/schemas/training_plan_structure.ts`
- Sample templates: `packages/core/samples/training-plans.ts`
- Seed script: `packages/supabase/scripts/seed-training-plan-templates.ts`
- Database migration: `packages/supabase/schemas/init.sql`
