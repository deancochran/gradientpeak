# Plan Tab Refactoring Migration Guide

**Date:** 2025-01-23  
**Priority:** HIGH  
**Estimated Effort:** 2-3 sprints

---

## Overview

This guide provides step-by-step instructions for refactoring the plan tab pages to improve consistency, type safety, and developer experience.

---

## Phase 1: Foundation (Week 1) - CRITICAL

### 1.1 Remove Duplicate Activity Type Configs

**Status:** ✅ COMPLETED - Added to `packages/core/constants.ts`

**Before:**
```typescript
// library/index.tsx (and 2+ other files)
const ACTIVITY_CONFIGS = {
  outdoor_run: { name: "Outdoor Run", icon: Footprints, color: "text-blue-600" },
  // ... duplicated everywhere
};
```

**After:**
```typescript
// Import from core
import { ACTIVITY_TYPE_CONFIG, ActivityType } from '@gradientpeak/core';

// Usage in components
const config = ACTIVITY_TYPE_CONFIG[activity.activity_type];
```

**Files to Update:**
- [x] `packages/core/constants.ts` - Added
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/library/index.tsx`
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/planned_activities/index.tsx`
- [ ] Any other files using `ACTIVITY_CONFIGS`

**Migration Steps:**
1. Search codebase for `ACTIVITY_CONFIGS` or similar patterns
2. Replace with imports from `@gradientpeak/core`
3. Update icon references (see Icon Migration section below)
4. Test all activity type displays

### 1.2 Convert `planned_activities/index.tsx` to NativeWind

**Status:** 🔴 NOT STARTED - HIGHEST PRIORITY

**Problem:** Uses 180+ lines of React Native `StyleSheet`, inconsistent with rest of app.

**Before:**
```typescript
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: { padding: 16 },
  // ... 180+ lines
});

<View style={styles.container}>
  <Text style={styles.headerTitle}>Scheduled Workouts</Text>
</View>
```

**After:**
```typescript
// No StyleSheet import needed
<View className="flex-1 bg-background">
  <Text className="text-2xl font-bold">Scheduled Workouts</Text>
</View>
```

**Migration Mapping:**
| StyleSheet Property | NativeWind Class |
|---------------------|------------------|
| `{ flex: 1 }` | `className="flex-1"` |
| `{ padding: 16 }` | `className="p-4"` |
| `{ fontSize: 24, fontWeight: "bold" }` | `className="text-2xl font-bold"` |
| `{ color: "#6b7280" }` | `className="text-muted-foreground"` |
| `{ backgroundColor: "#f9fafb" }` | `className="bg-muted/30"` |
| `{ borderRadius: 8 }` | `className="rounded-lg"` |
| `{ marginBottom: 24 }` | `className="mb-6"` |
| `{ gap: 12 }` | `className="gap-3"` |

**Files to Update:**
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/planned_activities/index.tsx`

**Estimated Time:** 2-3 hours

### 1.3 Extract Date Grouping Utility

**Status:** 🔴 NOT STARTED

**Problem:** Complex 50+ line `groupActivitiesByDate` function in component.

**Create New File:**
```typescript
// packages/core/utils/date-grouping.ts

export interface DateGroup<T> {
  today: T[];
  tomorrow: T[];
  thisWeek: T[];
  nextWeek: T[];
  later: T[];
}

export function groupActivitiesByDate<T extends { scheduled_date: string }>(
  activities: T[]
): DateGroup<T> {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  // ... implementation
  
  return {
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };
}
```

**Files to Update:**
- [ ] Create `packages/core/utils/date-grouping.ts`
- [ ] Update `apps/mobile/src/app/(internal)/(tabs)/plan/planned_activities/index.tsx`
- [ ] Add unit tests in `packages/core/utils/__tests__/date-grouping.test.ts`

**Estimated Time:** 2 hours

### 1.4 Add Proper TypeScript Types

**Status:** 🔴 NOT STARTED

**Problem:** Extensive use of `any` types throughout.

**Create Type Definitions:**
```typescript
// packages/core/src/types/training-plan.ts

export interface TrainingPlanStructure {
  target_weekly_tss_min: number;
  target_weekly_tss_max: number;
  target_activities_per_week: number;
  min_rest_days_per_week: number;
}

export interface TrainingPlan {
  id: string;
  name: string;
  description: string | null;
  structure: TrainingPlanStructure;
  created_at: string;
  updated_at: string;
}

export interface CurrentStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form: 'fresh' | 'optimal' | 'neutral' | 'tired' | 'overreaching';
  weekProgress: {
    completedTSS: number;
    plannedTSS: number;
    targetTSS: number;
    completedWorkouts: number;
    totalPlannedWorkouts: number;
  };
  upcomingWorkouts: UpcomingWorkout[];
}

export interface UpcomingWorkout {
  id: string;
  name: string;
  scheduled_date: string;
  estimated_tss: number;
  estimated_duration: number;
  activity_type: ActivityType;
}
```

**Files to Create:**
- [ ] `packages/core/src/types/training-plan.ts`
- [ ] `packages/core/src/types/activity-plan.ts`
- [ ] `packages/core/src/types/planned-activity.ts`
- [ ] Export from `packages/core/index.ts`

**Files to Update (replace `any`):**
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/index.tsx`
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/index.tsx`
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/library/index.tsx`
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/planned_activities/index.tsx`

**Estimated Time:** 4 hours

---

## Phase 2: Intensity Factor Integration (Week 2)

### 2.1 Display Intensity Factor on Activity Cards

**Status:** 🔴 NOT STARTED

**Adds:**
- IF badge on activity cards
- Zone color coding
- Tooltip/description

**Before:**
```typescript
<ActivityCard>
  <Text>{duration} min</Text>
  <Text>TSS {tss}</Text>
</ActivityCard>
```

**After:**
```typescript
<ActivityCard>
  <ActivityMetrics
    duration={duration}
    tss={tss}
    intensityFactor={0.85}
    zone="Threshold"
  />
</ActivityCard>
```

**New Components to Create:**
```typescript
// components/activities/ActivityMetrics.tsx
interface ActivityMetricsProps {
  duration: number;
  tss: number;
  intensityFactor?: number; // 0-400 (percentage)
  zone?: keyof typeof INTENSITY_ZONES;
}

// components/activities/IntensityBadge.tsx
interface IntensityBadgeProps {
  intensityFactor: number;
  zone: keyof typeof INTENSITY_ZONES;
  size?: 'sm' | 'md' | 'lg';
}
```

**Files to Update:**
- [ ] Create `components/activities/ActivityMetrics.tsx`
- [ ] Create `components/activities/IntensityBadge.tsx`
- [ ] Update `library/index.tsx` - PlanCard
- [ ] Update `planned_activities/index.tsx` - ActivityCard
- [ ] Update `training-plan/components/UpcomingWorkoutsCard.tsx`

**Estimated Time:** 4 hours

### 2.2 Add Intensity Distribution to Weekly Summary

**Status:** 🔴 NOT STARTED

**Adds:**
- TSS-weighted zone distribution bar chart
- Zone breakdown (% in each zone)
- Recovery insights

**New Component:**
```typescript
// components/training/IntensityDistribution.tsx
interface IntensityDistributionProps {
  zones: {
    recovery: number;
    endurance: number;
    tempo: number;
    threshold: number;
    vo2max: number;
    anaerobic: number;
    neuromuscular: number;
  };
  totalTSS: number;
}

// Shows stacked bar chart like:
// [====RECOVERY====][=========ENDURANCE=========][==THRESHOLD==][V]
```

**Files to Update:**
- [ ] Create `components/training/IntensityDistribution.tsx`
- [ ] Update `training-plan/components/WeeklyProgressCard.tsx`
- [ ] Update `training-plan/calendar.tsx` - Weekly summary

**Estimated Time:** 5 hours

### 2.3 Add Recovery Insights

**Status:** 🔴 NOT STARTED

**Adds:**
- Days since last hard workout (IF > 0.85)
- Recovery readiness indicator
- Recommendation text

**New Component:**
```typescript
// components/training/RecoveryInsight.tsx
interface RecoveryInsightProps {
  daysSinceHardWorkout: number;
  currentTSB: number;
  recommendation: 'ready' | 'caution' | 'rest_needed';
}

// Example output:
// 🟢 Ready for Intensity
// "3 days since last hard workout. Your form is optimal (TSB: +5)"

// 🟡 Proceed with Caution
// "1 day since last hard workout. Consider an easier session (TSB: -5)"

// 🔴 Rest Recommended
// "Back-to-back hard workouts detected. Recovery session advised (TSB: -15)"
```

**Files to Update:**
- [ ] Create `components/training/RecoveryInsight.tsx`
- [ ] Update `training-plan/index.tsx` - Show in overview
- [ ] Update `training-plan/calendar.tsx` - Show in weekly view

**Estimated Time:** 3 hours

---

## Phase 3: Component Standardization (Week 3)

### 3.1 Create Shared ActivityCard Component

**Status:** 🔴 NOT STARTED

**Problem:** Different card designs across pages.

**Create Standard Component:**
```typescript
// components/activities/ActivityCard.tsx
interface ActivityCardProps {
  id: string;
  name: string;
  activityType: ActivityType;
  duration?: number;
  tss?: number;
  intensityFactor?: number;
  scheduledDate?: string;
  status?: 'completed' | 'scheduled' | 'in_progress';
  onPress?: () => void;
  onLongPress?: () => void;
  actions?: ReactNode;
}

// Subcomponents:
ActivityCard.Header
ActivityCard.Meta
ActivityCard.IntensityBadge
ActivityCard.Actions
ActivityCard.StatusIndicator
```

**Files to Update:**
- [ ] Create `components/activities/ActivityCard.tsx`
- [ ] Replace cards in `library/index.tsx`
- [ ] Replace cards in `planned_activities/index.tsx`
- [ ] Replace cards in `training-plan/components/UpcomingWorkoutsCard.tsx`
- [ ] Replace cards in `plan/index.tsx` (Today's Workouts)

**Estimated Time:** 6 hours

### 3.2 Simplify Main Plan Index

**Status:** 🔴 NOT STARTED

**Before:** 3 primary buttons + 2 secondary cards + stats
**After:** 2 primary buttons + contextual content

**Changes:**
```typescript
// Remove:
- "Create Workout Plan" button (move to library FAB)
- "Browse Workout Library" button (combine with training plan)
- Quick Stats card (not meaningful)

// Keep:
- "Training Plan" button (primary CTA)
- Today's Workouts section (key content)

// Add:
- Quick stats in header (e.g., "Week 4 of 12 • 250/400 TSS")
- This Week preview card (upcoming workouts)
```

**Files to Update:**
- [ ] `apps/mobile/src/app/(internal)/(tabs)/plan/index.tsx`

**Estimated Time:** 3 hours

### 3.3 Enhanced Library Filtering

**Status:** 🔴 NOT STARTED

**Add Filters:**
- Duration: < 30min, 30-60min, > 60min
- TSS: Low (< 50), Medium (50-100), High (> 100)
- Zone focus: Recovery, Endurance, Threshold, VO2max

**New Component:**
```typescript
// components/library/FilterSheet.tsx
interface FilterSheetProps {
  onApply: (filters: LibraryFilters) => void;
  currentFilters: LibraryFilters;
}

interface LibraryFilters {
  activityTypes: ActivityType[];
  durationRange: [number, number];
  tssRange: [number, number];
  zoneFocus?: keyof typeof INTENSITY_ZONES;
}
```

**Files to Update:**
- [ ] Create `components/library/FilterSheet.tsx`
- [ ] Update `library/index.tsx`

**Estimated Time:** 4 hours

---

## Phase 4: Calendar Completion (Week 3-4)

### 4.1 Complete Calendar tRPC Endpoints

**Status:** 🔴 NOT STARTED - BLOCKS PRODUCTION

**Missing Endpoints:**
```typescript
// apps/web/app/api/trpc/routers/planned-activities.ts

// Add:
export const plannedActivitiesRouter = router({
  // ... existing

  listByWeek: protectedProcedure
    .input(z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }))
    .query(async ({ ctx, input }) => {
      // Implementation
    }),
});

// apps/web/app/api/trpc/routers/activities.ts

// Add:
export const activitiesRouter = router({
  // ... existing

  listByDateRange: protectedProcedure
    .input(z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }))
    .query(async ({ ctx, input }) => {
      // Implementation
    }),
});
```

**Files to Update:**
- [ ] `apps/web/app/api/trpc/routers/planned-activities.ts`
- [ ] `apps/web/app/api/trpc/routers/activities.ts`
- [ ] Update `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/calendar.tsx`

**Estimated Time:** 4 hours

### 4.2 Extract Calendar Calculation Utilities

**Status:** 🔴 NOT STARTED

**Create Utilities:**
```typescript
// packages/core/utils/training-calendar.ts

export function calculateWeeklySummary(
  completedActivities: Activity[],
  plannedActivities: PlannedActivity[],
  targetTSS: number
): WeeklySummary { ... }

export function getWorkoutsForDate(
  date: Date,
  completed: Activity[],
  planned: PlannedActivity[]
): DayWorkout[] { ... }

export function validateWorkoutConstraints(
  workout: PlannedActivity,
  existingWorkouts: PlannedActivity[],
  rules: RecoveryRules
): ConstraintValidation { ... }
```

**Files to Update:**
- [ ] Create `packages/core/utils/training-calendar.ts`
- [ ] Update `calendar.tsx` to use utilities
- [ ] Add unit tests

**Estimated Time:** 5 hours

---

## Icon Migration Reference

Since `ACTIVITY_TYPE_CONFIG` stores icon names as strings, components need to map them:

```typescript
// Create icon mapping helper
// components/ui/activity-icon.tsx

import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";

const ICON_MAP = {
  footprints: Footprints,
  bike: Bike,
  dumbbell: Dumbbell,
  waves: Waves,
  activity: Activity,
} as const;

export function getActivityIcon(iconName: string) {
  return ICON_MAP[iconName as keyof typeof ICON_MAP] || Activity;
}

// Usage in components:
const config = ACTIVITY_TYPE_CONFIG[activityType];
const IconComponent = getActivityIcon(config.icon);

<Icon as={IconComponent} size={20} style={{ color: config.color }} />
```

---

## Testing Checklist

### Unit Tests
- [ ] `date-grouping.ts` utility
- [ ] `training-calendar.ts` utilities
- [ ] `getIntensityZone()` function
- [ ] Activity card component
- [ ] Intensity badge component

### Integration Tests
- [ ] Library filtering and search
- [ ] Calendar week navigation
- [ ] Plan scheduling flow
- [ ] Activity completion with IF calculation

### Visual Regression Tests
- [ ] Activity cards render consistently
- [ ] Calendar layout across screen sizes
- [ ] Empty states display correctly
- [ ] Loading states show properly

### User Acceptance Tests
- [ ] Can view training plan overview
- [ ] Can schedule workout from library
- [ ] Can view weekly calendar
- [ ] Can see intensity factor on activities
- [ ] Can understand recovery status

---

## Rollout Plan

### Stage 1: Foundation (No User Impact)
- Extract shared constants
- Add TypeScript types
- Create utility functions
- **Can deploy without feature flags**

### Stage 2: Style Consistency (Low Risk)
- Convert StyleSheet to NativeWind
- Standardize card components
- **Can deploy, purely visual changes**

### Stage 3: Calendar Completion (Medium Risk)
- Complete tRPC endpoints
- Wire up calendar data
- **Requires testing, feature flag recommended**

### Stage 4: Intensity Integration (Medium Risk)
- Add IF display
- Show zone distribution
- Add recovery insights
- **Requires testing, feature flag recommended**

### Stage 5: Enhanced Features (Low Risk)
- Enhanced filtering
- Simplified navigation
- **Can deploy incrementally**

---

## Success Metrics

### Developer Experience
- [ ] Zero duplicate `ACTIVITY_CONFIGS`
- [ ] Zero `any` types in plan pages
- [ ] All components < 300 lines
- [ ] 100% TypeScript type coverage
- [ ] Zero StyleSheet usage

### User Experience
- [ ] All cards use consistent design
- [ ] Intensity Factor visible on 100% of activities
- [ ] Calendar shows real data (not TODOs)
- [ ] Page load time < 1 second
- [ ] Zero console errors/warnings

### Code Quality
- [ ] All utilities have unit tests
- [ ] Test coverage > 80%
- [ ] No linting errors
- [ ] All TODOs resolved
- [ ] Documentation updated

---

## Questions to Resolve

1. **Icon Library:** Should we use Lucide icons consistently, or support multiple icon libraries?
   - **Recommendation:** Stick with Lucide for consistency

2. **Color System:** Hard-coded hex colors vs Tailwind theme colors?
   - **Recommendation:** Use Tailwind theme (`bg-blue-600`) for dark mode support

3. **Type Generation:** Generate types from tRPC vs manual definitions?
   - **Recommendation:** Manual definitions in `core`, import in tRPC

4. **Calendar Data Source:** SQLite (offline) + Supabase (sync) or Supabase only?
   - **Recommendation:** Needs clarification from architecture team

5. **Intensity Factor UI:** Badge, chip, or color overlay?
   - **Recommendation:** Badge with zone color + tooltip

---

## Maintenance Notes

### After Refactoring
- Update component storybook examples
- Record video demos for team
- Update onboarding documentation
- Create migration guide for future changes
- Schedule tech debt review in 6 months

### Monitoring
- Track bundle size impact (should decrease)
- Monitor render performance (should improve)
- Watch for user feedback on new UI
- Check error rates in production

---

## Contact

**Questions?** Contact the development team or refer to:
- `PLAN_UI_REVIEW.md` - Detailed analysis
- `packages/core/README.md` - Core package documentation
- `apps/mobile/README.md` - Mobile app structure

**Last Updated:** 2025-01-23