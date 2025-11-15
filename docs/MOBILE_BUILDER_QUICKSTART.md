# 🚀 Mobile Activity Builder - Quick Start Guide

**Goal**: Transform complex modal workflow into visual timeline builder
**Time**: ~15 days (3 weeks)
**Approach**: Leverage existing @repo/core utilities, minimal new dependencies

---

## 📋 What Already Exists

### ✅ In @repo/core (Don't Recreate!)

**Schemas** (`packages/core/schemas/activity_plan_structure.ts`):
- `stepSchema` - Already limited to max 2 targets ✅
- `repetitionSchema` - Already validated (1-50 repeats, 1-20 steps) ✅
- `durationSchema` - Time/distance/reps/untilFinished ✅
- All intensity target types (8 types: %FTP, %MaxHR, watts, bpm, etc.) ✅

**Utilities** (Already exported from `@repo/core`):
```typescript
import {
  flattenPlanSteps,      // ✅ Expands repetitions to flat list
  getDurationMs,         // ✅ Converts duration to milliseconds
  getIntensityColor,     // ✅ Returns color based on intensity/type
  calculateTotalDuration // ✅ Sums all step durations
} from '@repo/core';
```

**Constants** (`packages/core/constants.ts`):
```typescript
import {
  ACTIVITY_TYPE_CONFIG,  // ✅ Icons, colors, names for all activity types
  INTENSITY_ZONES,       // ✅ 7 zones with colors and descriptions
  getIntensityZone       // ✅ Calculate zone from intensity value
} from '@repo/core';
```

**Colors Already Defined**:
```typescript
// These colors are already in getIntensityColor() function:
// Z1: #06b6d4 (cyan)
// Z2: #16a34a (green)
// Z3: #ca8a04 (yellow)
// Z4: #ea580c (orange)
// Z5: #dc2626 (red)
```

### ✅ Dependencies Already Installed

```json
{
  "victory-native": "^41.20.1",          // ✅ Charts
  "react-native-reanimated": "~4.1.3",   // ✅ Animations
  "react-native-gesture-handler": "~2.28.0", // ✅ Gestures
  "react-native-draggable-flatlist": "^4.0.3", // ✅ Drag & drop
  "react-hook-form": "^7.66.0",          // ✅ Forms
  "@hookform/resolvers": "^5.2.2",       // ✅ Zod integration
  "expo-haptics": "~15.0.7",             // ✅ Tactile feedback
  "@rn-primitives/*": "^1.2.0"           // ✅ UI components
}
```

**No new dependencies needed!**

---

## 🎯 What Needs to be Created

### Phase 1: Smart Defaults (Days 1-2) ⚡ START HERE

**Create**: `packages/core/utils/activity-defaults.ts`

```typescript
import type { Step, Duration, IntensityTarget } from '../schemas';

export interface DefaultsContext {
  activityType: string;
  position: number; // 0 = first, -1 = last
  totalSteps: number;
}

export function generateStepName(ctx: DefaultsContext): string {
  if (ctx.position === 0) return ctx.activityType.includes('swim') ? 'Easy Swim' : 'Warm-up';
  if (ctx.position === ctx.totalSteps - 1) return ctx.activityType.includes('swim') ? 'Easy Swim' : 'Cool-down';
  return `Interval ${ctx.position}`;
}

export function getDefaultDuration(ctx: DefaultsContext): Duration {
  const isWarmup = ctx.position === 0;
  const isCooldown = ctx.position === ctx.totalSteps - 1;

  if (ctx.activityType.includes('run') || ctx.activityType.includes('bike')) {
    return { type: 'time', value: isWarmup ? 10 : isCooldown ? 5 : 20, unit: 'minutes' };
  }

  if (ctx.activityType.includes('swim')) {
    return { type: 'distance', value: isWarmup ? 200 : isCooldown ? 100 : 400, unit: 'meters' };
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
// Add this line:
export * from './utils/activity-defaults';
```

---

### Phase 2: Timeline Chart (Days 3-5)

**Create**: `apps/mobile/components/ActivityPlan/TimelineChart.tsx`

```typescript
import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { VictoryBar, VictoryChart, VictoryStack } from 'victory-native';
import * as Haptics from 'expo-haptics';
import {
  flattenPlanSteps,      // ✅ Use existing
  getDurationMs,         // ✅ Use existing
  getIntensityColor,     // ✅ Use existing
  calculateTotalDuration, // ✅ Use existing
  type ActivityPlanStructure
} from '@repo/core';

interface TimelineChartProps {
  structure: ActivityPlanStructure;
  selectedStepIndex?: number;
  onStepPress?: (index: number) => void;
  height?: number;
}

export function TimelineChart({ structure, selectedStepIndex, onStepPress, height = 120 }: TimelineChartProps) {
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

**Uses These Existing Utilities**:
- ✅ `flattenPlanSteps()` - Already implemented
- ✅ `getDurationMs()` - Already implemented
- ✅ `getIntensityColor()` - Already implemented
- ✅ `calculateTotalDuration()` - Already implemented

---

### Phase 3: Main Screen Rewrite (Days 6-9)

**Location**: `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`

**Current Issues**:
- 837 lines (too long)
- Lines 65-308: Old `StepDialog` component
- Lines 311-476: Old `RepetitionDialog` component
- Manual state management with `useState`
- No visual timeline

**New Structure** (~400 lines):
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createActivityPlanSchema, createDefaultStep, ACTIVITY_TYPE_CONFIG } from '@repo/core';
import { TimelineChart } from '@/components/ActivityPlan/TimelineChart';
import DraggableFlatList from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';

export default function CreateActivityPlanScreen() {
  // Replace manual useState with React Hook Form
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

  // Auto-calculate metrics using existing utilities
  const metrics = useMemo(() => ({
    duration: calculateTotalDuration(structure),
    tss: 0, // TODO
    if: 0   // TODO
  }), [structure]);

  // Add step with smart defaults
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
      <Controller name="name" control={form.control} render={...} />

      {/* Activity type selector using ACTIVITY_TYPE_CONFIG */}
      <Controller name="activity_type" control={form.control} render={...} />

      {/* Metrics cards */}
      <View className="flex-row gap-2">
        <MetricCard label="Duration" value={formatDuration(metrics.duration)} />
        <MetricCard label="TSS" value={metrics.tss} />
      </View>

      {/* Timeline chart */}
      <TimelineChart structure={structure} selectedStepIndex={selectedStepIndex} />

      {/* Draggable list */}
      <DraggableFlatList
        data={structure.steps}
        onDragEnd={({ data }) => form.setValue('structure.steps', data)}
        renderItem={({ item }) => <StepCard step={item} />}
      />

      {/* FAB */}
      <Button onPress={handleAddStep}>Add Step</Button>
    </View>
  );
}
```

**Key Changes**:
1. ✅ Use React Hook Form properly
2. ✅ Add TimelineChart component
3. ✅ Use `createDefaultStep()` with smart defaults
4. ✅ Use `ACTIVITY_TYPE_CONFIG` for activity types
5. ✅ Remove old dialog components (Lines 65-476)

---

### Phase 4: Supporting Components (Days 10-12)

**Create Simple Components**:

1. **StepCard.tsx** - Draggable step display
```typescript
import { Pressable, View, Text } from 'react-native';
import { ACTIVITY_TYPE_CONFIG } from '@repo/core';
import * as Haptics from 'expo-haptics';

export function StepCard({ step, onPress, onLongPress }) {
  const activityConfig = ACTIVITY_TYPE_CONFIG[step.activityType];

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <View className="p-4 border rounded-lg">
        <Text>{activityConfig.icon} {step.name}</Text>
        <Text>{formatDuration(step.duration)}</Text>
      </View>
    </Pressable>
  );
}
```

2. **MetricCard.tsx** - Simple display
```typescript
export function MetricCard({ label, value }) {
  return (
    <View className="flex-1 p-3 bg-card rounded-lg">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-xl font-semibold">{value}</Text>
    </View>
  );
}
```

3. **ActivityTypeSelector.tsx** - Using existing config
```typescript
import { ACTIVITY_TYPE_CONFIG } from '@repo/core';

export function ActivityTypeSelector({ value, onChange }) {
  return (
    <ScrollView horizontal>
      {Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, config]) => (
        <Pressable key={key} onPress={() => onChange(key)}>
          <View className={value === key ? 'bg-primary' : 'bg-secondary'}>
            <Text>{config.icon} {config.shortName}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

---

### Phase 5: Step Editor Sheet (Days 13-15)

**Create**: `apps/mobile/components/ActivityPlan/StepEditorSheet.tsx`

**Use Existing UI Primitives**:
```typescript
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'; // ✅ Already installed
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { stepSchema } from '@repo/core';

export function StepEditorSheet({ isOpen, onClose, step, onSave }) {
  const form = useForm({
    resolver: zodResolver(stepSchema),
    defaultValues: step || createDefaultStep(...)
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>Edit Step</DialogHeader>
        {/* Form fields */}
        <Controller name="name" ... />
        <Controller name="duration.type" ... />
        <Controller name="duration.value" ... />
        <Controller name="targets.0.type" ... />
        <Controller name="targets.0.intensity" ... />
      </DialogContent>
    </Dialog>
  );
}
```

---

## 📁 Files Summary

### New Files (6 total)
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

### Modified Files (2 total)
```
packages/core/index.ts (add 1 export line)
apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx (rewrite ~400 lines)
```

### Remove Later
```
Lines 65-308: Old StepDialog (remove after new editor works)
Lines 311-476: Old RepetitionDialog (remove after new editor works)
```

---

## ✅ Manual Testing Checklist

### Before Merging (Manual Testing Only)
- [ ] Create activity on iOS device
- [ ] Create activity on Android device
- [ ] Add/edit/delete steps works
- [ ] Drag to reorder works
- [ ] All activity types work (6 types)
- [ ] All duration types work (time/distance/reps)
- [ ] All intensity types work (8 types)
- [ ] Haptic feedback works (physical device only)
- [ ] Animations smooth (60fps)
- [ ] Form validation shows errors
- [ ] Save activity to database works

**Note**: Unit testing is NOT required for this implementation

---

## 🎯 Success Metrics

**Before**:
- 837 lines in main file
- 15+ taps to create activity
- 3-5 minutes to create simple activity
- Two-handed operation required
- No visual overview

**After**:
- ~400 lines in main file
- 3-5 taps to create activity
- <60 seconds to create simple activity
- One-handed operation
- Visual timeline always visible

---

## 🚀 Start Now

### Step 1: Create Smart Defaults
```bash
cd packages/core
mkdir -p utils
# Create utils/activity-defaults.ts
# Update index.ts to export
pnpm build
```

### Step 2: Create Timeline Chart
```bash
cd apps/mobile/components/ActivityPlan
# Create TimelineChart.tsx
# Test with existing activity data
```

### Step 3: Start Main Screen Rewrite
```bash
cd apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan
# Backup index.tsx
cp index.tsx index.tsx.backup
# Start rewriting with React Hook Form
```

---

## 💡 Key Principles

### DO ✅
- Use existing @repo/core utilities
- Leverage existing UI primitives (@rn-primitives/*)
- Keep it simple (no over-engineering)
- Test on physical devices
- One feature at a time

### DON'T ❌
- Recreate color utilities (use `getIntensityColor`)
- Recreate duration utils (use `getDurationMs`)
- Recreate flatten logic (use `flattenPlanSteps`)
- Add new dependencies
- Build complex template system yet
- Over-complicate animations
- Write unit tests (not required)

---

**Total Time**: ~15 days (3 weeks)
**Focus**: Mobile-first, leverage existing code, simplify UX
**Note**: Testing and unit testing are NOT required for this implementation

Ready? Start with Phase 1! 🚀
