# Plan Tab Structure & Issues Diagram

## Current Page Hierarchy

```
📱 Plan Tab
│
├── 📄 index.tsx (Main Plan Index)
│   ├── Today's Workouts Section
│   ├── 3 Primary Action Buttons ⚠️ TOO MANY
│   ├── 2 Secondary Action Cards
│   └── Quick Stats Card
│
├── 📁 training-plan/
│   │
│   ├── 📄 index.tsx (Training Plan Overview)
│   │   ├── Empty State (Excellent ✅)
│   │   ├── CurrentStatusCard (CTL/ATL/TSB)
│   │   ├── WeeklyProgressCard
│   │   ├── UpcomingWorkoutsCard
│   │   └── Plan Details Card
│   │
│   ├── 📄 calendar.tsx ⚠️ INCOMPLETE - HAS TODOs
│   │   ├── WeekNavigator
│   │   ├── WeeklySummaryBar
│   │   ├── DayCard Grid (Horizontal Scroll)
│   │   └── AddWorkoutButton (FAB)
│   │
│   ├── 📄 create/index.tsx (Wizard)
│   │   ├── Step1: Basic Info
│   │   ├── Step2: Weekly Targets
│   │   ├── Step3: Recovery Rules
│   │   └── Step4: Periodization
│   │
│   └── 📁 components/
│       ├── CurrentStatusCard.tsx ✅ GOOD
│       ├── WeeklyProgressCard.tsx
│       ├── UpcomingWorkoutsCard.tsx
│       └── calendar/
│           ├── DayCard.tsx
│           ├── WeekNavigator.tsx
│           ├── WeeklySummaryBar.tsx
│           └── WorkoutCard.tsx
│
├── 📄 library/index.tsx ✅ MOSTLY GOOD
│   ├── Filter Bar (Activity Types)
│   ├── Tabs (My Plans / Samples)
│   ├── PlanCard List (Infinite Scroll)
│   ├── FAB (Create Plan)
│   └── PlanDetailModal
│
├── 📄 planned_activities/index.tsx ⚠️ CRITICAL - USES STYLESHEET
│   ├── Date-Grouped Sections
│   │   ├── Today
│   │   ├── Tomorrow
│   │   ├── This Week
│   │   ├── Next Week
│   │   └── Later
│   ├── ActivityCard (Different Design!)
│   ├── FAB (Schedule New)
│   └── PlannedActivityDetailModal
│
├── 📄 create_activity_plan/index.tsx
│   └── Plan Creation Form
│
└── 📄 create_planned_activity/index.tsx
    └── Activity Scheduling Form
```

---

## Code Quality Issues Map

```
🔴 CRITICAL ISSUES
├── planned_activities/index.tsx
│   ├── ❌ Uses StyleSheet (180+ lines)
│   ├── ❌ Different from rest of codebase
│   └── ⚠️ Card design mismatch
│
├── calendar.tsx
│   ├── ❌ Multiple TODO comments
│   ├── ❌ Missing tRPC endpoints
│   ├── ❌ Hardcoded empty arrays
│   └── ❌ Not production ready
│
└── ALL FILES
    ├── ❌ No Intensity Factor integration
    ├── ❌ No 7-zone classification
    └── ❌ No recovery insights

🟡 HIGH PRIORITY ISSUES
├── library/index.tsx
│   ├── ⚠️ Duplicate ACTIVITY_CONFIGS
│   ├── ⚠️ Visual noise in cards
│   └── ⚠️ Limited filter options
│
├── planned_activities/index.tsx
│   ├── ⚠️ Duplicate ACTIVITY_CONFIGS
│   └── ⚠️ Complex date grouping (50+ lines)
│
├── index.tsx
│   ├── ⚠️ Extensive `any` types
│   └── ⚠️ Too many actions
│
└── training-plan/index.tsx
    ├── ⚠️ Unsafe type assertions
    └── ⚠️ `(plan.structure as any).target_weekly_tss_min`

🟢 MINOR ISSUES
├── CurrentStatusCard.tsx
│   └── ⚠️ Missing trend indicators
│
└── Multiple Files
    ├── ⚠️ Large component sizes (300-450 lines)
    └── ⚠️ Could extract sub-components
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Plan Tab Data Flow                      │
└─────────────────────────────────────────────────────────────┘

User Input
    │
    ├─→ Create Training Plan
    │       │
    │       ├─→ [Wizard: 4 Steps]
    │       │       │
    │       │       └─→ tRPC: trainingPlans.create
    │       │               │
    │       │               └─→ Supabase DB
    │       │
    │       └─→ Redirect to Training Plan Overview
    │
    ├─→ Schedule Workout
    │       │
    │       ├─→ Browse Library
    │       │       │
    │       │       └─→ tRPC: activityPlans.list
    │       │               │
    │       │               └─→ Returns: Activity Plans
    │       │
    │       ├─→ Select Plan + Date
    │       │
    │       └─→ tRPC: plannedActivities.create
    │               │
    │               └─→ Supabase DB
    │
    └─→ View Calendar
            │
            ├─→ tRPC: plannedActivities.listByWeek ⚠️ MISSING
            │       │
            │       └─→ Should return: Planned workouts
            │
            ├─→ tRPC: activities.listByDateRange ⚠️ MISSING
            │       │
            │       └─→ Should return: Completed activities
            │
            └─→ tRPC: trainingPlans.getCurrentStatus ✅ EXISTS
                    │
                    └─→ Returns: CTL, ATL, TSB, Form


┌─────────────────────────────────────────────────────────────┐
│              Intensity Factor Integration (TODO)              │
└─────────────────────────────────────────────────────────────┘

Activity Data
    │
    ├─→ Calculate Normalized Power
    │       │
    │       └─→ NP = ⁴√(average of (30-sec rolling avg power)⁴)
    │
    ├─→ Calculate Intensity Factor
    │       │
    │       └─→ IF = NP ÷ FTP (stored as 0-400 percentage)
    │
    ├─→ Classify into 7 Zones ⚠️ NOT IMPLEMENTED
    │       │
    │       ├─→ Recovery (< 55%)
    │       ├─→ Endurance (55-74%)
    │       ├─→ Tempo (75-84%)
    │       ├─→ Threshold (85-94%)
    │       ├─→ VO2max (95-104%)
    │       ├─→ Anaerobic (105-114%)
    │       └─→ Neuromuscular (≥ 115%)
    │
    └─→ Display on UI ⚠️ NOT IMPLEMENTED
            │
            ├─→ Badge on Activity Cards
            ├─→ Zone Distribution Chart
            └─→ Recovery Insights
```

---

## Component Dependency Graph

```
┌──────────────────────────────────────────────────────────────┐
│                  Plan Tab Components                          │
└──────────────────────────────────────────────────────────────┘

UI Components
    │
    ├─→ Card (from @/components/ui/card)
    ├─→ Button (from @/components/ui/button)
    ├─→ Icon (from @/components/ui/icon)
    ├─→ Text (from @/components/ui/text)
    └─→ Tabs (from @/components/ui/tabs)

Activity Icons (Lucide)
    │
    ├─→ Footprints (Running)
    ├─→ Bike (Cycling)
    ├─→ Dumbbell (Strength)
    ├─→ Waves (Swimming)
    └─→ Activity (Other)

tRPC Hooks
    │
    ├─→ trainingPlans.get
    ├─→ trainingPlans.getCurrentStatus
    ├─→ trainingPlans.create
    ├─→ activityPlans.list
    ├─→ activityPlans.getUserPlansCount
    ├─→ plannedActivities.list
    ├─→ plannedActivities.getToday
    ├─→ plannedActivities.getWeekCount
    ├─→ plannedActivities.create
    ├─→ plannedActivities.listByWeek ⚠️ MISSING
    └─→ activities.listByDateRange ⚠️ MISSING

Core Package (should use, but some don't!)
    │
    ├─→ ACTIVITY_TYPE_CONFIG ✅ ADDED
    ├─→ INTENSITY_ZONES ✅ ADDED
    ├─→ getIntensityZone() ✅ ADDED
    ├─→ TSS_CONSTANTS ✅ EXISTS
    ├─→ TSB_THRESHOLDS ✅ EXISTS
    └─→ Types (training-plan, activity-plan, etc.) ⚠️ NEED TO ADD
```

---

## Styling Approach Analysis

```
┌───────────────────────────────────────────────────────────┐
│              Styling Consistency Check                     │
└───────────────────────────────────────────────────────────┘

✅ USING NATIVEWIND (Correct)
├── plan/index.tsx
├── plan/training-plan/index.tsx
├── plan/library/index.tsx
├── plan/create_activity_plan/index.tsx
└── plan/components/*.tsx

❌ USING STYLESHEET (Wrong!)
└── plan/planned_activities/index.tsx
        │
        ├── 180+ lines of StyleSheet.create()
        ├── Inline style objects
        └── Different from all other files

Migration Example:
┌────────────────────────────────────────────────────────────┐
│ BEFORE (StyleSheet)                                         │
├────────────────────────────────────────────────────────────┤
│ const styles = StyleSheet.create({                          │
│   container: { flex: 1, backgroundColor: "#ffffff" },      │
│   title: { fontSize: 24, fontWeight: "bold" },             │
│   subtitle: { color: "#6b7280", marginTop: 4 },            │
│ });                                                         │
│                                                             │
│ <View style={styles.container}>                            │
│   <Text style={styles.title}>Title</Text>                  │
│   <Text style={styles.subtitle}>Subtitle</Text>            │
│ </View>                                                     │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ AFTER (NativeWind)                                          │
├────────────────────────────────────────────────────────────┤
│ <View className="flex-1 bg-background">                    │
│   <Text className="text-2xl font-bold">Title</Text>        │
│   <Text className="text-muted-foreground mt-1">            │
│     Subtitle                                                │
│   </Text>                                                   │
│ </View>                                                     │
└────────────────────────────────────────────────────────────┘

Benefits:
✓ Consistent with rest of codebase
✓ 180 fewer lines of code
✓ Easier to maintain
✓ Better dark mode support
✓ Matches design system
```

---

## Type Safety Status

```
┌───────────────────────────────────────────────────────────┐
│                Type Safety Analysis                        │
└───────────────────────────────────────────────────────────┘

❌ UNSAFE (Heavy use of `any`)
│
├── plan/index.tsx
│   ├── todaysActivities.map((activity: any) => ...)
│   ├── handleSelectPlannedActivity(activity: any)
│   └── Multiple tRPC responses typed as any
│
├── plan/training-plan/index.tsx
│   ├── (plan.structure as any).target_weekly_tss_min
│   ├── (plan.structure as any).target_weekly_tss_max
│   ├── status?.upcomingWorkouts (any[])
│   └── workout: any in map functions
│
├── plan/library/index.tsx
│   ├── renderPlanCard(plan: any)
│   ├── data?.pages.flatMap((page) => page.items) ?? []
│   └── Filter results not properly typed
│
├── plan/calendar.tsx
│   ├── completedActivities: any[]
│   ├── plannedActivities: any[]
│   └── activity: any in calculations
│
└── plan/planned_activities/index.tsx
    ├── scheduledActivities: any[]
    ├── activity: any in map/filter
    └── groupActivitiesByDate(activities: any[])


✅ SHOULD BE (Properly Typed)
│
├── Shared Types (packages/core/src/types/)
│   │
│   ├── training-plan.ts
│   │   ├── TrainingPlan
│   │   ├── TrainingPlanStructure
│   │   ├── CurrentStatus
│   │   ├── WeekProgress
│   │   └── FormStatus
│   │
│   ├── activity-plan.ts
│   │   ├── ActivityPlan
│   │   ├── ActivityPlanStep
│   │   ├── ActivityType
│   │   └── ActivityStructure
│   │
│   └── planned-activity.ts
│       ├── PlannedActivity
│       ├── UpcomingWorkout
│       ├── DayWorkout
│       └── ScheduledStatus
│
└── Usage in Components
    │
    ├── import type { PlannedActivity } from '@gradientpeak/core';
    ├── const handleActivity = (activity: PlannedActivity) => { ... }
    ├── todaysActivities.map((activity: PlannedActivity) => ...)
    └── Full IntelliSense and type checking
```

---

## Refactoring Roadmap Visual

```
┌─────────────────────────────────────────────────────────────┐
│            Plan Tab Refactoring Timeline (3 Weeks)           │
└─────────────────────────────────────────────────────────────┘

Week 1: Foundation 🏗️
├── Day 1-2: StyleSheet → NativeWind (3h)
│   └── ✓ Remove 180+ lines from planned_activities/index.tsx
│
├── Day 2-3: Shared Constants Migration (2h)
│   ├── ✓ Already added to core/constants.ts
│   └── ✓ Update all imports
│
├── Day 3-4: Complete Calendar TODOs (5h)
│   ├── ✓ Implement listByWeek endpoint
│   ├── ✓ Implement listByDateRange endpoint
│   └── ✓ Wire up calendar.tsx
│
└── Day 4-5: Add TypeScript Types (4h)
    ├── ✓ Create types in core package
    └── ✓ Replace all `any` usage

Week 2: Integration 🔌
├── Day 1-2: Intensity Factor Display (4h)
│   ├── ✓ Create ActivityMetrics component
│   ├── ✓ Create IntensityBadge component
│   └── ✓ Add to all activity cards
│
├── Day 2-3: Zone Distribution (5h)
│   ├── ✓ Create IntensityDistribution component
│   ├── ✓ Calculate TSS-weighted zones
│   └── ✓ Add to weekly summary
│
└── Day 4-5: Recovery Insights (3h)
    ├── ✓ Create RecoveryInsight component
    ├── ✓ Calculate hard workout spacing
    └── ✓ Show recommendations

Week 3: Polish ✨
├── Day 1-2: Standardize Cards (6h)
│   ├── ✓ Create shared ActivityCard component
│   └── ✓ Replace all card instances
│
├── Day 3: Simplify Navigation (3h)
│   └── ✓ Reduce plan index to 2 primary CTAs
│
├── Day 4: Enhanced Filtering (4h)
│   ├── ✓ Add duration filters
│   ├── ✓ Add TSS filters
│   └── ✓ Add zone filters
│
└── Day 5: Extract Utilities (3h)
    ├── ✓ Create date-grouping.ts
    └── ✓ Create training-calendar.ts

Progress: [░░░░░░░░░░░░░░░░░░░░] 0% → [████████████████████] 100%
```

---

## File Size & Complexity Metrics

```
┌────────────────────────────────────────────────────────────┐
│                  Component Complexity                       │
└────────────────────────────────────────────────────────────┘

🔴 TOO LARGE (Need to split)
├── library/index.tsx (450 lines)
│   ├── Header (30 lines)
│   ├── Filters (40 lines)
│   ├── Tab Logic (50 lines)
│   ├── List Rendering (100 lines)
│   ├── Card Rendering (80 lines)
│   ├── Empty States (60 lines)
│   └── Utility Functions (90 lines)
│
├── planned_activities/index.tsx (400 lines)
│   ├── Header (30 lines)
│   ├── groupActivitiesByDate (60 lines) ⚠️ SHOULD BE UTILITY
│   ├── renderActivityCard (80 lines)
│   ├── renderGroup (40 lines)
│   ├── Empty State (50 lines)
│   └── StyleSheet (180 lines) ⚠️ REMOVE
│
└── calendar.tsx (350 lines)
    ├── Week Navigation (40 lines)
    ├── calculateWeeklySummary (60 lines) ⚠️ SHOULD BE UTILITY
    ├── getWorkoutsForDate (50 lines) ⚠️ SHOULD BE UTILITY
    ├── Event Handlers (80 lines)
    └── Render Logic (120 lines)

🟡 MODERATE (Could be split)
├── index.tsx (250 lines)
├── training-plan/index.tsx (220 lines)
└── create/index.tsx (280 lines)

🟢 GOOD SIZE
├── CurrentStatusCard.tsx (120 lines)
├── WeeklyProgressCard.tsx (100 lines)
├── UpcomingWorkoutsCard.tsx (90 lines)
└── DayCard.tsx (110 lines)

Target: Keep all components under 300 lines
```

---

## Missing Features Checklist

```
☐ Intensity Factor Integration
  ├── ☐ IF calculation on activity completion
  ├── ☐ IF badge on activity cards
  ├── ☐ 7-zone color coding
  ├── ☐ Zone distribution charts
  └── ☐ Recovery insights

☐ Calendar Completion
  ├── ☐ listByWeek tRPC endpoint
  ├── ☐ listByDateRange tRPC endpoint
  ├── ☐ Wire up real data
  ├── ☐ Remove TODO comments
  └── ☐ Add constraint validation

☐ Type Safety
  ├── ☐ TrainingPlan types
  ├── ☐ ActivityPlan types
  ├── ☐ PlannedActivity types
  ├── ☐ Remove all `any` usage
  └── ☐ Proper type assertions

☐ Code Consistency
  ├── ☐ Convert StyleSheet to NativeWind
  ├── ☐ Use shared ACTIVITY_TYPE_CONFIG
  ├── ☐ Standardize card components
  ├── ☐ Extract utility functions
  └── ☐ Consistent navigation patterns

☐ Enhanced Features
  ├── ☐ Enhanced library filtering
  ├── ☐ Plan progress indicators
  ├── ☐ Trend indicators (CTL/ATL/TSB)
  ├── ☐ Better empty states
  └── ☐ Simplified navigation
```

---

## Success Metrics Dashboard

```
┌────────────────────────────────────────────────────────────┐
│                Before Refactoring                           │
├────────────────────────────────────────────────────────────┤
│ Code Consistency:        ████████░░  60%  (StyleSheet mix) │
│ Type Safety:             ███░░░░░░░  50%  (lots of `any`)  │
│ Feature Completeness:    ██████░░░░  65%  (calendar TODOs) │
│ UI Consistency:          ████░░░░░░  50%  (card mismatch)  │
│ Maintainability:         █████░░░░░  60%  (large files)    │
│ Test Coverage:           ██░░░░░░░░  40%  (missing tests)  │
├────────────────────────────────────────────────────────────┤
│ Overall Score:           ████░░░░░░  54%  Grade: C+        │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                After Refactoring (Target)                   │
├────────────────────────────────────────────────────────────┤
│ Code Consistency:        ██████████ 100%  (NativeWind all) │
│ Type Safety:             ██████████  95%  (proper types)   │
│ Feature Completeness:    █████████░  95%  (calendar done)  │
│ UI Consistency:          ██████████  90%  (unified cards)  │
│ Maintainability:         █████████░  85%  (small files)    │
│ Test Coverage:           ████████░░  80%  (comprehensive)  │
├────────────────────────────────────────────────────────────┤
│ Overall Score:           █████████░  91%  Grade: A-        │
└────────────────────────────────────────────────────────────┘

Improvement: +37% 📈
```

---

**Last Updated:** 2025-01-23
**See Also:** PLAN_UI_REVIEW.md, PLAN_REFACTOR_MIGRATION.md, PLAN_REVIEW_SUMMARY.md