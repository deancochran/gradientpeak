# ✅ Implementation Checklist

This document tracks what already exists in @repo/core vs what needs to be created for the mobile activity builder redesign.

---

## 📦 What Already Exists in @repo/core

### ✅ Schemas (packages/core/schemas/activity_plan_structure.ts)

**Already Correct**:
- ✅ `stepSchema` - Max 2 targets already enforced
- ✅ `repetitionSchema` - Validated (1-50 repeats, 1-20 steps)
- ✅ `durationSchema` - Time/distance/reps/untilFinished supported
- ✅ `intensityTargetSchema` - All 8 types (%FTP, %MaxHR, watts, bpm, speed, cadence, RPE, %ThresholdHR)
- ✅ `activityTypeEnum` - All 6 activity types defined

**No schema changes needed!**

### ✅ Utility Functions (Already Exported)

```typescript
// These are already implemented and exported from @repo/core:

flattenPlanSteps(structure: ActivityPlanStructure): FlattenedStep[]
// Expands repetitions into flat array of steps

getDurationMs(duration?: Duration): number
// Converts any duration type to milliseconds

getIntensityColor(intensity: number, type?: string): string
// Returns hex color based on intensity value and type
// Already handles all zone calculations

calculateTotalDuration(structure: ActivityPlanStructure): number
// Sums all step durations including repetitions
```

### ✅ Constants (packages/core/constants.ts)

```typescript
// Already defined and exported:

ACTIVITY_TYPE_CONFIG = {
  outdoor_run: { name: "Outdoor Run", icon: "footprints", color: "#2563eb", ... },
  outdoor_bike: { name: "Outdoor Bike", icon: "bike", color: "#16a34a", ... },
  indoor_treadmill: { name: "Treadmill", icon: "footprints", color: "#9333ea", ... },
  indoor_bike_trainer: { name: "Bike Trainer", icon: "bike", color: "#ea580c", ... },
  indoor_strength: { name: "Strength Training", icon: "dumbbell", color: "#dc2626", ... },
  indoor_swim: { name: "Swimming", icon: "waves", color: "#0891b2", ... }
}

INTENSITY_ZONES = {
  RECOVERY: { name: "Recovery", min: 0, max: 55, color: "#10b981" },
  ENDURANCE: { name: "Endurance", min: 55, max: 74, color: "#3b82f6" },
  TEMPO: { name: "Tempo", min: 75, max: 84, color: "#8b5cf6" },
  THRESHOLD: { name: "Threshold", min: 85, max: 94, color: "#f59e0b" },
  VO2MAX: { name: "VO2max", min: 95, max: 104, color: "#f97316" },
  ANAEROBIC: { name: "Anaerobic", min: 105, max: 114, color: "#ef4444" },
  NEUROMUSCULAR: { name: "Neuromuscular", min: 115, max: 400, color: "#dc2626" }
}

getIntensityZone(intensityFactor: number): keyof typeof INTENSITY_ZONES
```

### ✅ Dependencies Already Installed

```json
{
  "victory-native": "^41.20.1",
  "react-native-reanimated": "~4.1.3",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-draggable-flatlist": "^4.0.3",
  "react-hook-form": "^7.66.0",
  "@hookform/resolvers": "^5.2.2",
  "expo-haptics": "~15.0.7",
  "@rn-primitives/dialog": "^1.2.0",
  "@rn-primitives/accordion": "^1.2.0"
}
```

**No new dependencies needed!**

---

## 🆕 What Needs to be Created

### Phase 1: Smart Defaults Utility (Days 1-2)

**Create**: `packages/core/utils/activity-defaults.ts`

```typescript
// Functions needed:
export function generateStepName(ctx: DefaultsContext): string
export function getDefaultDuration(ctx: DefaultsContext): Duration
export function getDefaultTarget(ctx: DefaultsContext): IntensityTarget | undefined
export function createDefaultStep(ctx: DefaultsContext): Step
```

**Modify**: `packages/core/index.ts`
```typescript
// Add one line:
export * from './utils/activity-defaults';
```

**Status**: ❌ Not created yet

---

### Phase 2: Timeline Chart Component (Days 3-5)

**Create**: `apps/mobile/components/ActivityPlan/TimelineChart.tsx`

**What it does**:
- Horizontal bar chart using Victory Native
- Uses existing `flattenPlanSteps()`, `getDurationMs()`, `getIntensityColor()`
- Tap gesture with haptic feedback
- Shows complete activity structure visually

**Status**: ❌ Not created yet

**Note**: `ActivityGraph.tsx` exists but is an empty shell (no implementation)

---

### Phase 3: Main Screen Rewrite (Days 6-9)

**Modify**: `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`

**Current state**: 837 lines
- Lines 65-308: Old `StepDialog` component
- Lines 311-476: Old `RepetitionDialog` component
- Manual `useState` management
- No React Hook Form integration
- No visual timeline

**Target state**: ~400 lines
- Replace dialogs with bottom sheets
- Integrate React Hook Form properly
- Add TimelineChart component
- Use `createDefaultStep()` with smart defaults
- Use `ACTIVITY_TYPE_CONFIG` for activity selector

**Status**: ❌ Not rewritten yet

---

### Phase 4: Supporting Components (Days 10-12)

**Create**:
1. `apps/mobile/components/ActivityPlan/StepCard.tsx`
   - Draggable card with long-press
   - Uses `ACTIVITY_TYPE_CONFIG` for icons
   - Reanimated animations

2. `apps/mobile/components/ActivityPlan/MetricCard.tsx`
   - Simple display card for duration/TSS/IF

3. `apps/mobile/components/ActivityPlan/ActivityTypeSelector.tsx`
   - Horizontal chip selector
   - Uses `ACTIVITY_TYPE_CONFIG` entries

**Status**: ❌ Not created yet

---

### Phase 5: Step Editor Sheet (Days 13-15)

**Create**: `apps/mobile/components/ActivityPlan/StepEditorSheet.tsx`

**What it does**:
- Bottom sheet using `@rn-primitives/dialog`
- React Hook Form integration
- Duration type selector (Time/Distance/Reps/Open)
- Intensity target picker

- Optional secondary target (collapsible)
- Notes field (collapsible)

**Status**: ❌ Not created yet

---

### Phase 6: Polish (Days 16-17)

**Tasks**:
- [ ] Refine animations (60fps)
- [ ] Add error handling
- [ ] Remove old dialog code (Lines 65-476)
- [ ] Manual testing on physical iOS device
- [ ] Manual testing on physical Android device

**Status**: ❌ Not started

---

## 📊 Progress Tracker

### Core Utilities
- [x] `packages/core/utils/activity-defaults.ts` created ✅
- [x] `packages/core/index.ts` export added ✅

### Components
- [x] `TimelineChart.tsx` created ✅
- [x] `StepCard.tsx` created ✅
- [x] `MetricCard.tsx` created ✅ (using existing component)
- [x] `ActivityTypeSelector.tsx` created ✅
- [ ] `StepEditorSheet.tsx` created (Phase 5 - Not Started)

### Main Screen
- [x] Backup existing `index.tsx` ✅
- [x] React Hook Form integrated ✅
- [x] TimelineChart integrated ✅
- [x] Smart defaults integrated ✅
- [x] Old dialogs removed ✅

### Manual Testing
- [ ] Manually tested on iOS physical device (Ready for testing)
- [ ] Manually tested on Android physical device (Ready for testing)
- [ ] All activity types work
- [ ] All duration types work
- [ ] All intensity types work
- [ ] Haptic feedback works
- [ ] Animations smooth (60fps)

---

## 🎯 Quick Reference

### Use These (Already Exist)
```typescript
import { 
  flattenPlanSteps,
  getDurationMs,
  getIntensityColor,
  calculateTotalDuration,
  ACTIVITY_TYPE_CONFIG,
  INTENSITY_ZONES,
  getIntensityZone
} from '@repo/core';
```

### Don't Recreate
- ❌ Color utilities (use `getIntensityColor()`)
- ❌ Duration calculations (use `getDurationMs()`)
- ❌ Flatten logic (use `flattenPlanSteps()`)
- ❌ Activity type config (use `ACTIVITY_TYPE_CONFIG`)
- ❌ Zone definitions (use `INTENSITY_ZONES`)

### Create These
- ✅ Smart defaults generator
- ✅ Timeline chart component
- ✅ Step card with drag support
- ✅ Bottom sheet editors
- ✅ Simplified main screen

---

## 🚀 Start Here

1. ~~**Day 1**: Create `activity-defaults.ts` utility~~ ✅ COMPLETE
2. ~~**Day 3**: Create `TimelineChart.tsx` component~~ ✅ COMPLETE
3. ~~**Day 6**: Begin main screen rewrite~~ ✅ COMPLETE
4. ~~**Day 10**: Create supporting components~~ ✅ COMPLETE
5. **Day 13**: Create step editor sheet ⏸️ NOT STARTED
6. **Day 16**: Polish and manual testing ⏸️ NOT STARTED

**Total**: ~17 days (3 weeks)
**Actual**: Phases 1-4 completed in ~4 hours

---

## ✅ Success Criteria

**Before**:
- 837 lines in main file
- 15+ taps to create activity
- No visual overview
- Two-handed operation

**After**:
- ~400 lines in main file
- 3-5 taps to create activity
- Visual timeline always visible
- One-handed operation
- Haptic feedback throughout

---

**Last Updated**: 2024  
**Status**: ✅ Phases 1-4 Complete | Ready for Manual Testing  
**Remaining**: Phase 5 (Step Editor Sheet), Phase 6 (Polish)  
**Note**: Testing and unit testing are NOT required for this implementation

---

## 🎉 Implementation Progress

### ✅ COMPLETED (Phases 1-4)
- **Phase 1**: Smart Defaults Utility (activity-defaults.ts)
- **Phase 2**: Timeline Chart Component (using SVG)
- **Phase 3**: Main Screen Rewrite (837 → 253 lines)
- **Phase 4**: Supporting Components (StepCard, ActivityTypeSelector)

### ⏸️ NOT STARTED (Phases 5-6)
- **Phase 5**: Step Editor Sheet (bottom sheet for editing)
- **Phase 6**: Polish & Testing (animations, physical device testing)

### 📦 Files Created
1. `packages/core/utils/activity-defaults.ts` ✅
2. `apps/mobile/components/ActivityPlan/TimelineChart.tsx` ✅
3. `apps/mobile/components/ActivityPlan/StepCard.tsx` ✅
4. `apps/mobile/components/ActivityPlan/ActivityTypeSelector.tsx` ✅
5. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx.backup` ✅

### 📝 Files Modified
1. `packages/core/index.ts` (1 line added) ✅
2. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx` (rewritten) ✅

### 🚀 Ready for Testing
The core functionality is complete and ready for manual testing on physical devices!