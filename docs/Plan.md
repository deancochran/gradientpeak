# 🎨 Activity Plan Creation UX Redesign - Mobile First

**Platform**: React Native (Expo) Mobile Application
**Location**: `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`
**Key Tech**: Expo Router, Reanimated, Victory Native, React Hook Form, Zod

---

## 📊 Current State Analysis

### Existing Implementation
**File**: `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx` (837 lines)

**Problems**:
- ❌ Modal-heavy: `StepDialog` (Lines 65-308), `RepetitionDialog` (Lines 311-476)
- ❌ No visual timeline: `ActivityGraph.tsx` exists but is empty shell
- ❌ Manual state: Direct `useState`, manual Zod validation (Lines 619-631)
- ❌ Poor mobile UX: Requires two-handed operation, many taps

### Already Implemented in @repo/core ✅

**Schema** (`packages/core/schemas/activity_plan_structure.ts`):
- ✅ `stepSchema` - Already has max 2 targets
- ✅ `repetitionSchema` - Already validated (1-50 repeats, 1-20 steps)
- ✅ `durationSchema` - Time/distance/reps/untilFinished
- ✅ All intensity target types (8 types)

**Utilities Already Available**:
- ✅ `flattenPlanSteps()` - Expands repetitions into flat list
- ✅ `getDurationMs()` - Converts duration to milliseconds
- ✅ `getIntensityColor()` - Returns color based on intensity/type
- ✅ `calculateTotalDuration()` - Sums all step durations

**Constants** (`packages/core/constants.ts`):
- ✅ `ACTIVITY_TYPE_CONFIG` - All activity types with icons, colors
- ✅ `INTENSITY_ZONES` - 7 zones with colors (#10b981 to #dc2626)
- ✅ `ZONE_COLORS` - Already defined with proper hex codes

**What's Missing** (Need to Create):
- ❌ Smart defaults generator (activity-aware step creation)
- ❌ Quick start templates (Easy 30min, Intervals, etc.)
- ❌ Timeline chart component (Victory Native implementation)
- ❌ Mobile-optimized editing experience

---

## 🎯 New Design Vision

### Core Principles
1. **Visual First**: Horizontal timeline chart shows complete structure
2. **Mobile Gestures**: Tap, long-press, swipe (no complex interactions)
3. **Smart Defaults**: Auto-populate based on activity type and position
4. **Progressive Disclosure**: Essential fields first, advanced collapsed

### Interaction Model

| Action | Gesture | Feedback |
|--------|---------|----------|
| Select step | Tap card | Haptic Light, highlight |
| Edit step | Double-tap | Bottom sheet opens |
| Reorder | Long-press 300ms | Haptic Medium, drag mode |
| Delete | Swipe left | Haptic Heavy, confirm dialog |
| Add step | Tap FAB | Sheet with smart defaults |

### Screen Layout

```
┌────────────────────────────────────────┐
│ [< Back]  Activity Name  [Save ✓]      │
├────────────────────────────────────────┤
│ [🏃 Run] [🚴 Bike] [🏊 Swim]          │
├────────────────────────────────────────┤
│ [⏱ 45:00] [💪 TSS: 67] [🎯 IF: 0.82] │
├────────────────────────────────────────┤
│ Timeline Chart (Victory Native)        │
│ [████▓▓██████████▓▓]                   │
├────────────────────────────────────────┤
│ Structure List (Draggable)             │
│ ┌────────────────────────────────────┐ │
│ │ 🌅 Warm-up   10:00   Zone 2       │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ ▼ Repeat 5x        [4 steps]      │ │
│ │   ├ Work    2:00   Zone 5         │ │
│ │   └ Rest    1:00   Zone 1         │ │
│ └────────────────────────────────────┘ │
│                                        │
│                   [🔁 Interval] [+]   │
└────────────────────────────────────────┘
```

---

## 🔧 Implementation Plan

### Phase 1: Smart Defaults (Days 1-2)

**Create**: `packages/core/utils/activity-defaults.ts`

```typescript
import { activityTypeEnum, type Step, type Duration, type IntensityTarget } from '../schemas';

export interface DefaultsContext {
  activityType: string;
  position: number; // 0=first, -1=last
  totalSteps: number;
}

export function generateStepName(ctx: DefaultsContext): string {
  if (ctx.position === 0) {
    return ctx.activityType.includes('swim') ? 'Easy Swim' : 'Warm-up';
  }
  if (ctx.position === ctx.totalSteps - 1 || ctx.position === -1) {
    return ctx.activityType.includes('swim') ? 'Easy Swim' : 'Cool-down';
  }
  return `Interval ${ctx.position}`;
}

export function getDefaultDuration(ctx: DefaultsContext): Duration {
  const isWarmup = ctx.position === 0;
  const isCooldown = ctx.position === ctx.totalSteps - 1;

  if (ctx.activityType.includes('run') || ctx.activityType.includes('bike')) {
    return {
      type: 'time',
      value: isWarmup ? 10 : isCooldown ? 5 : 20,
      unit: 'minutes'
    };
  }

  if (ctx.activityType.includes('swim')) {
    return {
      type: 'distance',
      value: isWarmup ? 200 : isCooldown ? 100 : 400,
      unit: 'meters'
    };
  }

  if (ctx.activityType.includes('strength')) {
    return { type: 'repetitions', value: 10, unit: 'reps' };
  }

  return { type: 'time', value: 15, unit: 'minutes' };
}

export function getDefaultTarget(ctx: DefaultsContext): IntensityTarget | undefined {
  const isWarmup = ctx.position === 0;

  if (ctx.activityType.includes('bike')) {
    return { type: '%FTP', intensity: isWarmup ? 60 : 80 };
  }

  if (ctx.activityType.includes('run')) {
    return { type: '%MaxHR', intensity: isWarmup ? 60 : 75 };
  }

  if (ctx.activityType.includes('swim')) {
    return { type: 'RPE', intensity: isWarmup ? 4 : 7 };
  }

  return undefined;
}

export function createDefaultStep(ctx: DefaultsContext): Step {
  const target = getDefaultTarget(ctx);
  return {
    type: 'step',
    name: generateStepName(ctx),
    duration: getDefaultDuration(ctx),
    targets: target ? [target] : [],
    notes: ''
  };
}
```

**Update**: `packages/core/index.ts`
```typescript
export * from './utils/activity-defaults';
```

---

### Phase 2: Timeline Chart (Days 3-5)

**Create**: `apps/mobile/components/ActivityPlan/TimelineChart.tsx`

```typescript
import { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { VictoryBar, VictoryChart, VictoryStack } from 'victory-native';
import * as Haptics from 'expo-haptics';
import {
  flattenPlanSteps,
  getDurationMs,
  getIntensityColor,
  calculateTotalDuration,
  type ActivityPlanStructure
} from '@repo/core';

interface TimelineChartProps {
  structure: ActivityPlanStructure;
  selectedStepIndex?: number;
  onStepPress?: (index: number) => void;
  height?: number;
}

export function TimelineChart({
  structure,
  selectedStepIndex,
  onStepPress,
  height = 120
}: TimelineChartProps) {
  const flatSteps = useMemo(() => flattenPlanSteps(structure), [structure]);
  const totalDuration = useMemo(() => calculateTotalDuration(structure), [structure]);

  if (flatSteps.length === 0) {
    return (
      <View className="h-[120px] border-2 border-dashed border-muted rounded-lg items-center justify-center">
        <Text className="text-muted-foreground">Tap + to add steps</Text>
      </View>
    );
  }

  const chartData = flatSteps.map((step, index) => {
    const durationMs = getDurationMs(step.duration);
    const widthPercent = (durationMs / totalDuration) * 100;
    const intensity = step.targets?.[0]?.intensity || 0;
    const type = step.targets?.[0]?.type;
    const color = getIntensityColor(intensity, type);

    return { x: index, y: widthPercent, color, isSelected: index === selectedStepIndex };
  });

  return (
    <View style={{ height }}>
      <VictoryChart horizontal height={height} padding={{ top: 10, bottom: 10, left: 0, right: 0 }}>
        <VictoryStack>
          {chartData.map((data, idx) => (
            <VictoryBar
              key={idx}
              data={[data]}
              style={{
                data: {
                  fill: data.color,
                  opacity: data.isSelected ? 1 : 0.85,
                  stroke: data.isSelected ? '#3B82F6' : 'transparent',
                  strokeWidth: 3
                }
              }}
              cornerRadius={4}
              animate={{ duration: 300 }}
              events={[{
                target: 'data',
                eventHandlers: {
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onStepPress?.(idx);
                    return [];
                  }
                }
              }]}
            />
          ))}
        </VictoryStack>
      </VictoryChart>
    </View>
  );
}
```

**Uses Existing**:
- ✅ `flattenPlanSteps()` from @repo/core
- ✅ `getDurationMs()` from @repo/core
- ✅ `getIntensityColor()` from @repo/core
- ✅ `calculateTotalDuration()` from @repo/core

---

### Phase 3: Main Screen Rebuild (Days 6-9)

**Rewrite**: `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`

**Key Changes**:
1. Replace dialogs with bottom sheets
2. Add TimelineChart component
3. Use React Hook Form properly
4. Add smart defaults on step creation
5. Simplify to ~400 lines (from 837)

**Structure**:
```typescript
export default function CreateActivityPlanScreen() {
  const form = useForm({
    resolver: zodResolver(createActivityPlanSchema),
    defaultValues: {
      name: 'New Activity',
      activity_type: 'outdoor_run',
      structure: { steps: [] }
    }
  });

  const structure = form.watch('structure');
  const activityType = form.watch('activity_type');

  // Auto-calculate metrics
  const metrics = useMemo(() => ({
    duration: calculateTotalDuration(structure),
    tss: 0, // TODO: Implement
    if: 0
  }), [structure]);

  const handleAddStep = () => {
    const newStep = createDefaultStep({
      activityType,
      position: structure.steps.length,
      totalSteps: structure.steps.length + 1
    });
    form.setValue('structure.steps', [...structure.steps, newStep]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View className="flex-1">
      {/* Header with name input */}
      {/* Activity type selector using ACTIVITY_TYPE_CONFIG */}
      {/* Metrics cards */}
      <TimelineChart structure={structure} />
      <DraggableFlatList
        data={structure.steps}
        renderItem={({ item }) => <StepCard step={item} />}
      />
      {/* FAB buttons */}
    </View>
  );
}
```

---

### Phase 4: Supporting Components (Days 10-12)

**Create**:
1. `StepCard.tsx` - Draggable card with Reanimated
2. `MetricCard.tsx` - Simple display card
3. `ActivityTypeSelector.tsx` - Chips using `ACTIVITY_TYPE_CONFIG`

**StepCard Features**:
- Long-press (300ms) enables drag
- Reanimated scale/opacity animations
- Uses `ACTIVITY_TYPE_CONFIG` for icons

---

### Phase 5: Step Editor Sheet (Days 13-15)

**Create**: `apps/mobile/components/ActivityPlan/StepEditorSheet.tsx`

**Form Fields**:
1. Name (TextInput)
2. Duration Type (Segmented: Time/Distance/Reps/Open)
3. Duration Value (Number input + unit)
4. Primary Target (Type select + value input)
5. Secondary Target (Optional, collapsible)
6. Notes (Optional, collapsible)

**Bottom Sheet** - Use `@rn-primitives/dialog` (already installed)

---

### Phase 6: Polish (Days 16-17)

**Tasks**:
- Refine all animations (60fps)
- Add error handling
- Remove old dialog components
- Manual testing on iOS/Android physical devices

---

## 📁 Files to Create/Modify

### New Files
```
packages/core/utils/
└── activity-defaults.ts

apps/mobile/components/ActivityPlan/
├── TimelineChart.tsx
├── StepCard.tsx
├── MetricCard.tsx
├── ActivityTypeSelector.tsx
└── StepEditorSheet.tsx
```

### Files to Modify
```
packages/core/index.ts (add export)
apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx (rewrite)
```

### Files to Remove Later
```
Lines 65-308: Old StepDialog
Lines 311-476: Old RepetitionDialog
```

---

## ✅ Success Criteria

### User Experience
- ✅ Create activity in <60 seconds (vs 3-5 min)
- ✅ Reduce taps from 15+ to 3-5
- ✅ All operations work one-handed
- ✅ Visual timeline always visible

### Technical
- ✅ Use existing @repo/core utilities (no duplication)
- ✅ Properly integrate React Hook Form + Zod
- ✅ 60fps animations with Reanimated
- ✅ Reduce file from 837 to ~400 lines

---

## 🚀 Quick Start

### Step 1: Create Smart Defaults
```bash
cd packages/core
mkdir -p utils
# Create utils/activity-defaults.ts (see Phase 1)
# Update index.ts to export
```

### Step 2: Create Timeline Chart
```bash
cd apps/mobile/components/ActivityPlan
# Create TimelineChart.tsx (see Phase 2)
# Test with existing activities
```

### Step 3: Start Screen Rewrite
```bash
cd apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan
# Backup current index.tsx
# Start new implementation with React Hook Form
# Integrate TimelineChart
# Add smart defaults on step creation
```

---

## 📝 Key Decisions

### Why NOT Over-Engineer

**Don't Create**:
- ❌ New color system (use existing `getIntensityColor()`)
- ❌ New duration utils (use existing `getDurationMs()`)
- ❌ New flatten logic (use existing `flattenPlanSteps()`)
- ❌ Complex template system (start with 2-3 simple templates)
- ❌ Advanced animations (Victory Native handles most)

**Do Create**:
- ✅ Smart defaults (doesn't exist)
- ✅ Timeline chart component (ActivityGraph is empty)
- ✅ Mobile-optimized editing (current is modal-heavy)

### Dependencies Already Installed
- ✅ `victory-native: ^41.20.1`
- ✅ `react-native-reanimated: ~4.1.3`
- ✅ `react-hook-form: ^7.66.0`
- ✅ `react-native-draggable-flatlist: ^4.0.3`
- ✅ `expo-haptics: ~15.0.7`
- ✅ `@rn-primitives/*: ^1.2.0`

**No new dependencies needed!**

---

## 🎯 Immediate Next Steps

1. Create `packages/core/utils/activity-defaults.ts`
2. Export from `packages/core/index.ts`
3. Create `TimelineChart.tsx` component
4. Test chart with existing activity data
5. Begin main screen rewrite with React Hook Form

**Estimated Total Time**: 17 days (~3 weeks)

**Focus**: Simplify, leverage existing code, mobile-first UX
