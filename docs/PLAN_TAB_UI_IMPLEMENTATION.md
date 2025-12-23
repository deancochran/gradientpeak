# Plan Tab UI/UX Implementation Guide

## Executive Summary

This document provides a detailed, step-by-step guide to enhance the Plan tab UI/UX **without adding new features**. All required data and functionality already exist - this is purely a visual enhancement to improve information presentation and user experience.

**Key Principle**: Reuse and enhance existing components. Do not create new features or screens.

---

## Current State Analysis

### Existing Components (Already Built)
✅ **WeekStrip** - Week calendar with navigation arrows, day selection, status dots  
✅ **HeroCard** - Activity cards with metrics, structure preview, start button  
✅ **GhostCard** - Empty state for days with no activities  
✅ **WeeklyLedger** - Collapsible weekly totals (distance, time, count)  
✅ **PlanCard** - Generic plan display card (activity plans)  
✅ **ActivityCard** - Activity display card  

### Existing Data (Already Available)
✅ Training plan details (`trpc.trainingPlans.get`)  
✅ Training status with CTL/ATL/TSB (`trpc.trainingPlans.getCurrentStatus`)  
✅ Planned activities with full details (`trpc.plannedActivities.list`)  
✅ Activity plan structure (intervals, segments, zones)  
✅ Routes with potential thumbnails  
✅ Week progress tracking  

### Existing Screens
✅ **Plan Index** (`/plan/index.tsx`) - Main calendar view (what we're enhancing)  
✅ **Training Plan Overview** (`/plan/training-plan/index.tsx`) - Full plan detail page  

---

## Navigation Flow Map

Understanding how users move between screens is critical for this UI update. Here's the complete navigation architecture:

### Available Screens & Routes
1. **Plan Index** (`/plan`) - Main calendar view (what we're enhancing)
2. **Training Plan Overview** (`/plan/training-plan`) - Full plan detail page
3. **Create Activity Plan** (`/plan/create_activity_plan`) - Build custom workouts
4. **Activity Plan Library** (`/plan/library`) - Browse activity plan templates
5. **Create Planned Activity** (`/plan/create_planned_activity`) - Schedule an activity
6. **Planned Activities List** (`/plan/planned_activities`) - View all scheduled activities

### Navigation Paths from Plan Index

```
┌─────────────────────────────────────────────────────────────┐
│                    PLAN INDEX (Main Calendar)                │
│                  /plan/index.tsx                             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ [Calendar Icon] → Training Plan Overview
                    │   Route: ROUTES.PLAN.TRAINING_PLAN.INDEX
                    │   Purpose: View full plan details, CTL/ATL/TSB, weekly progress
                    │
                    ├─→ [Plan Progress Card Tap] → Training Plan Overview  
                    │   Route: ROUTES.PLAN.TRAINING_PLAN.INDEX
                    │   Purpose: Same as calendar icon (redundant for ease of access)
                    │
                    ├─→ [Plus Button] → Create Planned Activity
                    │   Route: ROUTES.PLAN.SCHEDULE_ACTIVITY (already exists)
                    │   Purpose: Schedule a new activity from library
                    │
                    ├─→ [GhostCard Tap] → Create Planned Activity
                    │   Route: ROUTES.PLAN.SCHEDULE_ACTIVITY (already exists)
                    │   Purpose: Schedule activity on empty day
                    │
                    ├─→ [Activity Card Tap] → Activity Detail Modal
                    │   Component: PlannedActivityDetailModal (already exists)
                    │   Purpose: View/edit/delete planned activity
                    │
                    └─→ [START WORKOUT Button] → Record Screen
                        Route: /record (already exists)
                        Purpose: Begin recording the workout
```

### Secondary Navigation from Plan Index

From the **PlannedActivityDetailModal** (opened when tapping an activity card):
- **Edit Activity** → Opens `/plan/create_planned_activity?activityId={id}` (edit mode)
- **Delete Activity** → Deletes and refreshes plan index
- **View Activity Plan** → Could navigate to activity plan detail (if implemented)

### Navigation from Training Plan Overview

```
┌─────────────────────────────────────────────────────────────┐
│              TRAINING PLAN OVERVIEW                          │
│              /plan/training-plan/index.tsx                   │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ [View Calendar Button] → Plan Index
                    │   Route: ROUTES.PLAN.INDEX
                    │   Purpose: Return to calendar view
                    │
                    ├─→ [View Trends Button] → Trends Screen
                    │   Route: ROUTES.TRENDS
                    │   Purpose: View fitness trends and analytics
                    │
                    └─→ [Settings Button] → Training Plan Settings
                        Route: ROUTES.PLAN.TRAINING_PLAN.SETTINGS
                        Purpose: Edit training plan configuration
```

### Create Activity Flow

```
┌─────────────────────────────────────────────────────────────┐
│          CREATE PLANNED ACTIVITY (Schedule Activity)         │
│          /plan/create_planned_activity/index.tsx             │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ [Select from Library] → Shows available activity plans
                    │   Data: trpc.activityPlans.list
                    │   Purpose: Choose pre-built workout
                    │
                    ├─→ [Create New Plan Button] → Create Activity Plan
                    │   Route: ROUTES.PLAN.CREATE
                    │   Purpose: Build custom workout from scratch
                    │
                    └─→ [Schedule Activity Button] → Returns to Plan Index
                        Action: Creates planned_activity record
                        Purpose: Schedule selected activity on chosen date
```

### Activity Plan Library Flow

```
┌─────────────────────────────────────────────────────────────┐
│              ACTIVITY PLAN LIBRARY                           │
│              /plan/library/index.tsx                         │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ [Activity Plan Card Tap] → Activity Plan Detail
                    │   Shows: Full workout structure, estimations
                    │   Actions: Schedule, Edit, Delete
                    │
                    ├─→ [Schedule Button] → Create Planned Activity
                    │   Route: ROUTES.PLAN.SCHEDULE_ACTIVITY + ?planId={id}
                    │   Purpose: Pre-select this plan for scheduling
                    │
                    └─→ [Create New Button] → Create Activity Plan
                        Route: ROUTES.PLAN.CREATE
                        Purpose: Build new custom workout
```

### All Planned Activities List

```
┌─────────────────────────────────────────────────────────────┐
│           PLANNED ACTIVITIES LIST (All Scheduled)            │
│           /plan/planned_activities/index.tsx                 │
└─────────────────────────────────────────────────────────────┘
                    │
                    ├─→ [Activity Card Tap] → Activity Detail Modal
                    │   Component: PlannedActivityDetailModal
                    │   Purpose: View/edit/delete planned activity
                    │
                    ├─→ [FAB Plus Button] → Activity Plan Library
                    │   Route: /plan/library
                    │   Purpose: Browse and schedule new activities
                    │
                    └─→ [Browse Library Button] → Activity Plan Library
                        Route: /plan/library
                        Purpose: Same as FAB (shown in empty state)
```

---

## What Needs to Change (Visual Only)

### 1. Update Header with Multiple Navigation Options
**Location**: `apps/mobile/app/(internal)/(tabs)/plan/index.tsx`

**Current Header**:
```tsx
<View className="flex-row items-center justify-between px-4 pt-3 pb-2">
  <Text className="text-2xl font-bold">
    {format(selectedDate, "MMMM")}
  </Text>
  <TouchableOpacity onPress={handleScheduleActivity} ...>
    <Plus />
  </TouchableOpacity>
</View>
```

**Change To**:
```tsx
<View className="flex-row items-center justify-between px-4 pt-3 pb-2">
  <Text className="text-2xl font-bold">
    {format(selectedDate, "MMMM")}
  </Text>
  
  {/* Navigation Icons */}
  <View className="flex-row gap-2">
    {/* Training Plan Overview - Only show if plan exists */}
    {plan && (
      <TouchableOpacity
        onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX)}
        className="w-12 h-12 rounded-full bg-muted items-center justify-center"
        activeOpacity={0.8}
      >
        <Icon as={Calendar} size={20} className="text-foreground" />
      </TouchableOpacity>
    )}
    
    {/* All Planned Activities List */}
    <TouchableOpacity
      onPress={() => router.push(ROUTES.PLAN.SCHEDULED)}
      className="w-12 h-12 rounded-full bg-muted items-center justify-center"
      activeOpacity={0.8}
    >
      <Icon as={CalendarDays} size={20} className="text-foreground" />
    </TouchableOpacity>
    
    {/* Schedule New Activity */}
    <TouchableOpacity
      onPress={handleScheduleActivity}
      className="w-12 h-12 rounded-full bg-primary items-center justify-center"
      activeOpacity={0.8}
    >
      <Icon as={Plus} size={24} className="text-primary-foreground" />
    </TouchableOpacity>
  </View>
</View>
```

**Add Import**:
```tsx
import { Calendar, CalendarDays, Plus } from "lucide-react-native";
```

**Navigation Summary**:
- **Calendar Icon** → Training plan overview (CTL/ATL/TSB, detailed stats)
- **CalendarDays Icon** → All planned activities list (full schedule view)
- **Plus Icon** → Schedule new activity

**Why**: Provides quick access to all key screens from the main calendar view.

---

### 2. Add Interactive Plan Progress Card
**Location**: `apps/mobile/app/(internal)/(tabs)/plan/index.tsx`

**Where to Add**: After the header, before the week strip (inside the sticky anchor section).

**Component to Create**: `apps/mobile/components/plan/TrainingPlanProgressCard.tsx`

```tsx
import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { format } from "date-fns";

interface TrainingPlanProgressCardProps {
  planName: string;
  goalDate?: string;
  currentWeek: number;
  totalWeeks: number;
  currentPhase?: string;
  onPress: () => void;
}

export function TrainingPlanProgressCard({
  planName,
  goalDate,
  currentWeek,
  totalWeeks,
  currentPhase,
  onPress
}: TrainingPlanProgressCardProps) {
  const percentage = Math.round((currentWeek / totalWeeks) * 100);
  
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="mx-4 mb-3">
        <CardContent className="p-4">
          {/* Header */}
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-1">
              <Text className="text-lg font-bold mb-1">{planName}</Text>
              {goalDate && (
                <Text className="text-xs text-muted-foreground">
                  Goal: {format(new Date(goalDate), "MMM d, yyyy")}
                </Text>
              )}
            </View>
            <View className="bg-primary/10 px-3 py-1 rounded-full">
              <Text className="text-xs font-semibold text-primary">
                {percentage}%
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View className="mb-3">
            <View className="w-full bg-muted rounded-full h-2 overflow-hidden mb-2">
              <View
                className="bg-primary h-full rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-xs text-muted-foreground">
                Week {currentWeek} of {totalWeeks}
              </Text>
              {currentPhase && (
                <Text className="text-xs font-medium text-foreground">
                  {currentPhase}
                </Text>
              )}
            </View>
          </View>

          {/* Tap hint */}
          <Text className="text-xs text-muted-foreground text-center">
            Tap to view full plan
          </Text>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
```

**Integration in Plan Index**:
```tsx
// After header, before WeekStrip
{plan && (
  <TrainingPlanProgressCard
    planName={plan.name}
    goalDate={plan.structure?.goal_race_date}
    currentWeek={getCurrentWeek(plan)}
    totalWeeks={plan.structure?.target_weeks || 16}
    currentPhase={plan.structure?.current_phase}
    onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX)}
  />
)}
```

**Helper Function** (add to file):
```tsx
function getCurrentWeek(plan: any): number {
  if (!plan?.created_at) return 0;
  const weeksSinceStart = Math.floor(
    (Date.now() - new Date(plan.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const totalWeeks = plan.structure?.target_weeks || 16;
  return Math.min(weeksSinceStart + 1, totalWeeks);
}
```

---

### 3. Enhance HeroCard with Better Metrics Layout
**Location**: `apps/mobile/components/plan/HeroCard.tsx`

**Current Metrics Section** (lines ~58-70):
```tsx
<View className="flex-row gap-4 mb-4">
  {activity.activity_plan?.estimated_duration && (
    <View className="flex-row items-center gap-1.5">
      <Icon as={Clock} size={16} className="text-muted-foreground" />
      <Text className="text-sm text-muted-foreground">
        {activity.activity_plan.estimated_duration} min
      </Text>
    </View>
  )}
  {activity.activity_plan?.estimated_tss && (
    <View className="flex-row items-center gap-1.5">
      <Icon as={Zap} size={16} className="text-muted-foreground" />
      <Text className="text-sm text-muted-foreground">
        {activity.activity_plan.estimated_tss} TSS
      </Text>
    </View>
  )}
</View>
```

**Change To** (three-column layout):
```tsx
<View className="flex-row justify-between mb-4 bg-muted/30 rounded-lg p-3">
  {/* Distance */}
  <View className="flex-1 items-center">
    <Text className="text-2xl font-bold">
      {activity.activity_plan?.distance 
        ? (activity.activity_plan.distance / 1000).toFixed(1)
        : "—"}
    </Text>
    <Text className="text-xs text-muted-foreground mt-1">Distance (mi)</Text>
  </View>
  
  {/* Time */}
  <View className="flex-1 items-center border-x border-border">
    <Text className="text-2xl font-bold">
      {activity.activity_plan?.estimated_duration
        ? formatDuration(activity.activity_plan.estimated_duration)
        : "—"}
    </Text>
    <Text className="text-xs text-muted-foreground mt-1">Est. Time</Text>
  </View>
  
  {/* Pace (if distance and duration available) */}
  <View className="flex-1 items-center">
    <Text className="text-2xl font-bold">
      {activity.activity_plan?.distance && activity.activity_plan?.estimated_duration
        ? calculatePace(
            activity.activity_plan.distance,
            activity.activity_plan.estimated_duration
          )
        : "—"}
    </Text>
    <Text className="text-xs text-muted-foreground mt-1">Goal Pace</Text>
  </View>
</View>
```

**Helper Function** (add to file):
```tsx
function calculatePace(distanceMeters: number, durationMinutes: number): string {
  const miles = distanceMeters / 1609.34;
  const paceMinPerMile = durationMinutes / miles;
  const minutes = Math.floor(paceMinPerMile);
  const seconds = Math.round((paceMinPerMile - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}:${mins.toString().padStart(2, '0')}` : `${mins}m`;
}
```

---

### 4. Add Intensity Chart Visualization
**Location**: Create new component `apps/mobile/components/plan/IntensityChart.tsx`

```tsx
import React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

interface WorkoutSegment {
  type: string;
  duration?: number;
  distance?: number;
  zone?: string;
  name?: string;
  repeat?: number;
}

interface IntensityChartProps {
  structure: {
    steps?: WorkoutSegment[];
  };
}

// Zone color mapping
const ZONE_COLORS = {
  Z1: { bg: "bg-green-500/20", border: "border-green-500" },
  Z2: { bg: "bg-blue-500/20", border: "border-blue-500" },
  Z3: { bg: "bg-yellow-500/20", border: "border-yellow-500" },
  Z4: { bg: "bg-orange-500/20", border: "border-orange-500" },
  Z5: { bg: "bg-red-500/20", border: "border-red-500" },
};

function getZoneColor(zone?: string) {
  if (!zone) return { bg: "bg-muted", border: "border-border" };
  const key = zone.toUpperCase() as keyof typeof ZONE_COLORS;
  return ZONE_COLORS[key] || { bg: "bg-muted", border: "border-border" };
}

function getSegmentLabel(segment: WorkoutSegment): string {
  if (segment.type === "warmup") return "WU";
  if (segment.type === "cooldown") return "CD";
  if (segment.zone) return segment.zone.toUpperCase();
  return segment.type.substring(0, 2).toUpperCase();
}

export function IntensityChart({ structure }: IntensityChartProps) {
  if (!structure?.steps || structure.steps.length === 0) {
    return null;
  }

  const steps = structure.steps;
  
  // Calculate total duration for proportional widths
  const totalDuration = steps.reduce((sum, step) => {
    const duration = step.duration || 10; // Default 10 min if not specified
    return sum + (duration * (step.repeat || 1));
  }, 0);

  // Generate segment display (handle repeats)
  const segments: Array<{ segment: WorkoutSegment; width: number }> = [];
  steps.forEach((step) => {
    const duration = step.duration || 10;
    const repeat = step.repeat || 1;
    const width = (duration / totalDuration) * 100;
    
    for (let i = 0; i < repeat; i++) {
      segments.push({ segment: step, width });
    }
  });

  // Build summary text
  const summary = steps
    .map((step) => {
      const label = step.name || step.type;
      return step.repeat && step.repeat > 1 ? `${step.repeat}x ${label}` : label;
    })
    .join(" • ");

  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-muted-foreground mb-2">
        WORKOUT STRUCTURE
      </Text>
      
      {/* Intensity Bar Chart */}
      <View className="flex-row h-12 gap-1 mb-2">
        {segments.map((item, idx) => {
          const colors = getZoneColor(item.segment.zone);
          const label = getSegmentLabel(item.segment);
          
          return (
            <View
              key={idx}
              className={`${colors.bg} ${colors.border} border rounded items-center justify-center`}
              style={{ flex: item.width }}
            >
              <Text className="text-xs font-semibold">{label}</Text>
            </View>
          );
        })}
      </View>
      
      {/* Summary Text */}
      <Text className="text-sm text-muted-foreground" numberOfLines={2}>
        {summary}
      </Text>
    </View>
  );
}
```

**Integration in HeroCard** (replace text structure preview):

**Remove** (lines ~73-86):
```tsx
{hasStructure && !isCompleted && activity.activity_plan && (
  <View className="bg-muted/50 rounded-lg p-3 mb-4">
    <Text className="text-xs text-muted-foreground font-semibold mb-2">
      STRUCTURE
    </Text>
    <Text className="text-sm" numberOfLines={2}>
      {((activity.activity_plan.structure as any).steps as any[])
        .slice(0, 3)
        .map((step: any, idx: number) => step.name || `Step ${idx + 1}`)
        .join(" → ")}
      {((activity.activity_plan.structure as any).steps as any[]).length > 3 && "..."}
    </Text>
  </View>
)}
```

**Add Instead**:
```tsx
{hasStructure && !isCompleted && activity.activity_plan && (
  <IntensityChart structure={activity.activity_plan.structure} />
)}
```

---

### 5. Add Route Thumbnail (If Available)
**Location**: `apps/mobile/components/plan/HeroCard.tsx`

**Add After Intensity Chart, Before Start Button**:
```tsx
{/* Route Thumbnail */}
{activity.route && (
  <View className="mb-4">
    <Text className="text-xs font-semibold text-muted-foreground mb-2">
      ROUTE
    </Text>
    <View className="bg-muted rounded-lg overflow-hidden">
      {activity.route.thumbnail_url ? (
        <Image
          source={{ uri: activity.route.thumbnail_url }}
          className="w-full h-32"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-32 items-center justify-center">
          <Icon as={MapPin} size={32} className="text-muted-foreground" />
        </View>
      )}
      <View className="p-2 bg-card/90">
        <Text className="text-sm font-medium">
          {activity.route.name || "Unnamed Route"}
        </Text>
      </View>
    </View>
  </View>
)}
```

**Add Import**:
```tsx
import { Image } from "react-native";
import { MapPin } from "lucide-react-native";
```

**Update Interface** (add route field):
```tsx
interface BaseActivity {
  id: string;
  scheduled_date: string;
  activity_plan?: {
    name: string;
    activity_category?: string;
    estimated_duration?: number;
    estimated_tss?: number;
    structure?: any;
    distance?: number;  // ADD THIS
  };
  route?: {  // ADD THIS
    name?: string;
    thumbnail_url?: string;
  };
  completed_activity_id?: string | null;
}
```

---

## Updated Navigation Handlers

### Existing Handler to Keep
The current `handleScheduleActivity` already exists and navigates correctly:
```tsx
const handleScheduleActivity = () => {
  router.push("/plan/create_planned_activity" as any);
};
```

**This stays as-is** - it's the Plus button handler.

### GhostCard Navigation
The GhostCard already calls `handleScheduleActivity`, so it will work correctly with the existing handler. **No changes needed.**

### Upcoming Activities Navigation
The "Up Next" section already has day selection that navigates within the calendar. If you want to add a "View All" link:

```tsx
{upcomingActivities.length > 0 && (
  <View className="mb-6">
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-base font-semibold">Up Next</Text>
      <TouchableOpacity onPress={() => router.push(ROUTES.PLAN.SCHEDULED)}>
        <Text className="text-sm text-primary font-medium">View All →</Text>
      </TouchableOpacity>
    </View>
    {/* existing upcoming activities list */}
  </View>
)}
```

**Optional Enhancement**: This adds a quick link to see all scheduled activities.

---

## Implementation Checklist

### Phase 1: Header & Navigation (10 minutes)
- [ ] Add Calendar icon to header in `/plan/index.tsx`
- [ ] Add CalendarDays icon to header for planned activities list
- [ ] Update Plus button styling to match new header
- [ ] Add conditional rendering for Calendar icon (only if plan exists)
- [ ] Add imports for new icons
- [ ] Test all three navigation flows
  - [ ] Calendar icon → Training Plan Overview
  - [ ] CalendarDays icon → Planned Activities List
  - [ ] Plus icon → Create Planned Activity

### Phase 2: Plan Progress Card (15 minutes)
- [ ] Create `TrainingPlanProgressCard.tsx` component
- [ ] Add helper function `getCurrentWeek()`
- [ ] Integrate card in plan index (after header, before week strip)
- [ ] Fetch plan data and pass to card
- [ ] Test tap navigation to full plan page

### Phase 3: Enhanced Activity Metrics (10 minutes)
- [ ] Update HeroCard metrics section to three-column layout
- [ ] Add `calculatePace()` helper function
- [ ] Add `formatDuration()` helper function
- [ ] Update data queries to fetch distance field
- [ ] Test metrics display with real data

### Phase 4: Intensity Chart (20 minutes)
- [ ] Create `IntensityChart.tsx` component
- [ ] Add zone color mapping
- [ ] Implement segment rendering with proportional widths
- [ ] Add summary text generation
- [ ] Replace text structure in HeroCard with IntensityChart
- [ ] Test with various workout types

### Phase 5: Route Thumbnail (10 minutes)
- [ ] Add route display section to HeroCard
- [ ] Update data queries to fetch route information
- [ ] Add conditional rendering for thumbnail
- [ ] Test with activities that have/don't have routes

### Phase 6: Optional Enhancements (10 minutes)
- [ ] Add "View All" link to "Up Next" section
- [ ] Test with different screen sizes
- [ ] Verify accessibility (font scaling, touch targets)

### Phase 7: Testing & Polish (10 minutes)
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Verify all navigation flows work:
  - [ ] Header Calendar icon → Training Plan Overview
  - [ ] Header CalendarDays icon → Planned Activities List
  - [ ] Header Plus button → Create Planned Activity
  - [ ] Plan Progress Card → Training Plan Overview
  - [ ] GhostCard → Create Planned Activity
  - [ ] Activity Card → Activity Detail Modal
  - [ ] START WORKOUT button → Record Screen
  - [ ] "Up Next" View All → Planned Activities List (if added)
- [ ] Check loading states
- [ ] Verify error states
- [ ] Test with empty data scenarios:
  - [ ] No training plan
  - [ ] No activities scheduled
  - [ ] No workout structure
  - [ ] No route assigned

---

## Data Updates Required

### Update Plan Index Query
```tsx
// In /plan/index.tsx, update the query to fetch route data
const {
  data: allPlannedActivities,
  isLoading: loadingAllPlanned,
  refetch: refetchActivities,
} = trpc.plannedActivities.list.useQuery({
  limit: 100,
});
```

**Check Backend**: Ensure the `plannedActivities.list` query includes route data. If not, update the TRPC router query:

```tsx
// In packages/trpc/src/routers/planned_activities.ts
.select(`
  id,
  idx,
  profile_id,
  activity_plan_id,
  scheduled_date,
  created_at,
  activity_plan:activity_plans (*),
  route:routes (id, name, thumbnail_url)  // ADD THIS LINE
`)
```

---

## Styling Guidelines

### Use Only Tailwind Theme Colors
```tsx
// Background
bg-background
bg-card
bg-muted
bg-primary
bg-accent

// Text
text-foreground
text-muted-foreground
text-primary
text-primary-foreground

// Borders
border-border
border-primary

// Data Visualization (Zones) - Only exception
bg-green-500/20 border-green-500   // Z1
bg-blue-500/20 border-blue-500     // Z2
bg-yellow-500/20 border-yellow-500 // Z3
bg-orange-500/20 border-orange-500 // Z4
bg-red-500/20 border-red-500       // Z5
```

### Spacing Scale
```tsx
p-2  // 8px
p-3  // 12px
p-4  // 16px
p-6  // 24px

gap-2  // 8px
gap-3  // 12px
gap-4  // 16px

mb-2, mb-3, mb-4 // margins
```

### Typography
```tsx
text-xs    // 12px
text-sm    // 14px
text-base  // 16px
text-lg    // 18px
text-xl    // 20px
text-2xl   // 24px

font-medium
font-semibold
font-bold
```

---

## Edge Cases to Handle

### 1. No Training Plan
- Don't show TrainingPlanProgressCard
- Calendar icon should still work (goes to empty state)

### 2. No Workout Structure
- IntensityChart returns null
- Falls back to existing behavior (no structure preview)

### 3. No Route Assigned
- Route section doesn't render
- No empty state needed

### 4. Missing Distance/Duration
- Show "—" in metrics columns
- Don't calculate pace if either is missing

### 5. Very Long Plan Names
- Use `numberOfLines={2}` with ellipsis
- Ensure card doesn't overflow

---

## Files to Modify

### New Files (Create)
1. `apps/mobile/components/plan/TrainingPlanProgressCard.tsx`
2. `apps/mobile/components/plan/IntensityChart.tsx`

### Modified Files (Update)
1. `apps/mobile/app/(internal)/(tabs)/plan/index.tsx` - Header, plan card integration
2. `apps/mobile/components/plan/HeroCard.tsx` - Metrics, intensity chart, route
3. `apps/mobile/components/plan/index.ts` - Export new components
4. `packages/trpc/src/routers/planned_activities.ts` - (If needed) Add route to query

---

## Testing Strategy

### Manual Testing Checklist
1. **Navigation**
   - [ ] Calendar icon navigates to training plan overview
   - [ ] Plan progress card navigates to training plan overview
   - [ ] Back navigation works correctly

2. **Plan Progress Card**
   - [ ] Shows correct plan name
   - [ ] Shows correct week progress
   - [ ] Shows correct percentage
   - [ ] Shows goal date if available
   - [ ] Shows current phase if available
   - [ ] Doesn't show if no plan exists

3. **Activity Metrics**
   - [ ] Distance displays correctly (converted to miles)
   - [ ] Time displays in correct format (h:mm or mm)
   - [ ] Pace calculates correctly (min/mile)
   - [ ] Shows "—" for missing values

4. **Intensity Chart**
   - [ ] Displays for structured workouts
   - [ ] Segments are proportional to duration
   - [ ] Zone colors are correct
   - [ ] Labels are readable
   - [ ] Summary text is accurate
   - [ ] Handles repeats correctly

5. **Route Display**
   - [ ] Shows thumbnail if available
   - [ ] Shows placeholder if no thumbnail
   - [ ] Shows route name
   - [ ] Doesn't show if no route assigned

6. **Edge Cases**
   - [ ] Works with no training plan
   - [ ] Works with no workout structure
   - [ ] Works with missing metrics
   - [ ] Works on small screens
   - [ ] Works on large screens

### Device Testing
- [ ] iOS Simulator (iPhone 14)
- [ ] Android Emulator (Pixel 6)
- [ ] Physical device (if available)

---

## Estimated Time: 75-85 minutes

- **Planning & Setup**: 10 min
- **Phase 1 - Header Navigation**: 10 min
- **Phase 2 - Plan Progress Card**: 15 min
- **Phase 3 - Activity Metrics**: 10 min
- **Phase 4 - Intensity Chart**: 20 min
- **Phase 5 - Route Thumbnail**: 10 min
- **Phase 6 - Optional Enhancements**: 10 min
- **Phase 7 - Testing & Fixes**: 10 min

**Total**: ~75-85 minutes for full implementation with all navigation enhancements

---

## Success Criteria

### Visual Enhancements
✅ Header has three navigation icons (Calendar, CalendarDays, Plus)  
✅ Calendar icon navigates to training plan overview (conditional on plan exists)  
✅ CalendarDays icon navigates to planned activities list  
✅ Plus button maintains existing schedule activity functionality  
✅ Plan progress card shows current training plan progress visually  
✅ Plan progress card is tappable and navigates to training plan overview  
✅ Activity cards show distance, time, and pace in three-column layout  
✅ Activity cards show intensity chart instead of text structure  
✅ Activity cards show route thumbnail when available  
✅ All styling uses Tailwind theme colors (except zone visualization)  

### Navigation Integrity
✅ All existing navigation paths still work:
  - GhostCard → Create Planned Activity
  - Activity Card → Activity Detail Modal
  - START WORKOUT → Record Screen
  - "Up Next" day selection → Updates selected date
✅ New navigation paths work correctly:
  - Header Calendar → Training Plan Overview
  - Header CalendarDays → Planned Activities List
  - Plan Progress Card → Training Plan Overview
  - (Optional) "Up Next" View All → Planned Activities List

### Technical Requirements
✅ No new features added - only visual enhancements  
✅ All existing functionality continues to work  
✅ No breaking changes to existing components  
✅ UI is responsive on iOS and Android  
✅ Loading states display correctly  
✅ Error states handled gracefully  
✅ Empty states show appropriate content  

---

## Notes

- **Do not add new features** - this is purely visual enhancement
- **Reuse existing data** - all data is already being fetched
- **Maintain existing patterns** - follow current code style and conventions
- **Test thoroughly** - ensure nothing breaks
- **Keep it simple** - don't over-engineer

---

## Complete Navigation Reference

For quick reference when implementing, here are all navigation paths:

### From Plan Index Header
```tsx
// Calendar icon (training plan overview)
router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX);
// or: router.push("/plan/training-plan" as any);

// CalendarDays icon (all planned activities)
router.push(ROUTES.PLAN.SCHEDULED);
// or: router.push("/plan/planned_activities" as any);

// Plus button (schedule new activity)
router.push("/plan/create_planned_activity" as any);
```

### From Plan Progress Card
```tsx
// Tap anywhere on card → training plan overview
onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX)}
```

### From GhostCard
```tsx
// Already implemented correctly
onPress={handleScheduleActivity} // Goes to create_planned_activity
```

### From Activity Card
```tsx
// Already implemented correctly
onPress={() => handleSelectPlannedActivity(activity.id)} // Opens modal
```

### From HeroCard START WORKOUT Button
```tsx
// Already implemented correctly
onPress={() => handleStartActivity(activity)} // Goes to /record
```

### Optional: From "Up Next" Section
```tsx
// View All link
onPress={() => router.push(ROUTES.PLAN.SCHEDULED)}
```

---

## Questions to Resolve

1. **Route Thumbnail**: Are route thumbnails already stored in the database? If not, this feature can be skipped until thumbnails are implemented.

2. **Distance Field**: Is `distance` already part of `activity_plan`? Need to verify the database schema.

3. **Current Phase**: Does the training plan structure include a `current_phase` field? If not, this can be omitted from the progress card.

4. **Goal Race Date**: Is this stored in `plan.structure.goal_race_date`? Need to verify.

---

## Key Navigation Principles

1. **Multiple Entry Points**: Users can reach training plan overview from two places (header icon and progress card) for convenience
2. **Clear Purpose**: Each icon has a distinct purpose:
   - Calendar = View training plan details
   - CalendarDays = View all scheduled activities
   - Plus = Schedule new activity
3. **Conditional Display**: Calendar icon only shows if training plan exists (no point showing it otherwise)
4. **No Breaking Changes**: All existing navigation continues to work (GhostCard, activity cards, start buttons)
5. **Consistent Patterns**: All navigation uses expo-router's `router.push()` with route constants

---

## Future Enhancements (Not in Scope)

- Interactive intensity chart (tap to see segment details)
- Plan phase timeline visualization
- Weekly mileage trends
- Activity rearrangement via drag & drop
- Plan template selection
- Quick actions on activity cards (swipe to delete, long-press menu)
- Calendar month view
- Multi-week view

These can be considered after the current UI enhancements are complete and tested.
