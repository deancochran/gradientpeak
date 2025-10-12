
## 📋 Executive Summary

Consolidate duplicated workout-related utilities from mobile app components into the core package to enable reuse across the entire stack. This refactoring affects 5 primary files and will create 3 new core utilities modules.

**Estimated Implementation Time:** 4-6 hours
**Risk Level:** Low (backward compatible, incremental changes)
**Testing Strategy:** Manual testing with existing workout flows

---

## 🗂️ File Impact Analysis

### **Files to Modify**

| File | Impact Level | Changes Required |
|------|-------------|------------------|
| `apps/mobile/src/app/(internal)/follow-along/index.tsx` | HIGH | Replace 6 functions with core imports |
| `apps/mobile/src/components/RecordingCarousel/cards/EnhancedPlanCard.tsx` | HIGH | Replace 3 functions with core imports |
| `packages/core/schemas/activity_plan_structure.ts` | MEDIUM | Add 3 new utility functions |
| `packages/core/index.ts` | LOW | Export new modules |
| `apps/mobile/src/app/(internal)/(tabs)/record-launcher.tsx` | NONE | No changes (reference only) |

### **Files to Create**

| File | Purpose |
|------|---------|
| `packages/core/schemas/profile_conversions.ts` | Profile-based target conversions |
| `packages/core/schemas/workout_analysis.ts` | Workout structure analysis utilities |
| `packages/core/schemas/step_progression.ts` | Step progress tracking utilities |

---

## 📦 Phase 1: Create Core Utilities

### **1.1 Create `packages/core/schemas/profile_conversions.ts`**

```typescript
import { z } from "zod";
import type { IntensityTarget } from "./activity_plan_structure";

// Schema for profile metrics
export const profileMetricsSchema = z.object({
  ftp: z.number().optional(),
  thresholdHr: z.number().optional(),
  maxHr: z.number().optional(),
  restingHr: z.number().optional(),
  weight: z.number().optional(),
});
export type ProfileMetrics = z.infer<typeof profileMetricsSchema>;

// Schema for converted target
export const convertedTargetSchema = z.object({
  intensity: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string(),
  label: z.string(),
});
export type ConvertedTarget = z.infer<typeof convertedTargetSchema>;

/**
 * Convert a percentage-based target to absolute values using profile data
 * Migrated from: EnhancedPlanCard.tsx lines 75-155
 */
export function convertTargetToAbsolute(
  target: IntensityTarget,
  profile: ProfileMetrics
): ConvertedTarget {
  // Copy implementation from EnhancedPlanCard.tsx convertTarget()
  // Lines 75-155
}

/**
 * Convert absolute value to percentage based on profile
 */
export function convertAbsoluteToPercentage(
  value: number,
  type: string,
  profile: ProfileMetrics
): number {
  switch (type) {
    case "watts":
      return profile.ftp ? (value / profile.ftp) * 100 : value;
    case "bpm":
      return profile.thresholdHr ? (value / profile.thresholdHr) * 100 : value;
    default:
      return value;
  }
}

/**
 * Format target with profile-aware conversion
 */
export function formatTargetWithProfile(
  target: IntensityTarget,
  profile?: ProfileMetrics
): string {
  if (!profile) {
    return formatTargetRange(target); // Use existing function
  }

  const converted = convertTargetToAbsolute(target, profile);
  if (converted.min && converted.max) {
    return `${converted.min}-${converted.max}${converted.unit}`;
  }
  if (converted.intensity) {
    return `${converted.intensity}${converted.unit}`;
  }
  return "No target";
}
```

### **1.2 Create `packages/core/schemas/workout_analysis.ts`**

```typescript
import type { ActivityPlanStructure, FlattenedStep } from "./activity_plan_structure";
import { flattenPlanSteps, getDurationMs } from "./activity_plan_structure";
import type { ProfileMetrics } from "./profile_conversions";

export interface WorkoutSummary {
  totalDuration: number;
  totalWork: number;
  totalRest: number;
  averageIntensity: number;
  primaryTargetType: string | null;
  stepCount: number;
  hasRepetitions: boolean;
  estimatedTSS?: number;
}

/**
 * Analyze workout structure for summary statistics
 */
export function analyzeWorkoutStructure(
  plan: ActivityPlanStructure,
  profile?: ProfileMetrics
): WorkoutSummary {
  const steps = flattenPlanSteps(plan.steps);

  let totalDuration = 0;
  let totalWork = 0;
  let totalRest = 0;
  let intensitySum = 0;
  let intensityCount = 0;

  const targetTypes = new Map<string, number>();

  for (const step of steps) {
    const duration = step.duration ? getDurationMs(step.duration) : 0;
    totalDuration += duration;

    // Determine if work or rest
    const isRest = step.name?.toLowerCase().includes('rest') ||
                   step.name?.toLowerCase().includes('recovery');

    if (isRest) {
      totalRest += duration;
    } else {
      totalWork += duration;
    }

    // Track intensity
    if (step.targets?.length > 0) {
      const primaryTarget = step.targets[0];
      targetTypes.set(
        primaryTarget.type,
        (targetTypes.get(primaryTarget.type) || 0) + 1
      );

      if (primaryTarget.intensity) {
        intensitySum += primaryTarget.intensity;
        intensityCount++;
      }
    }
  }

  // Find primary target type
  let primaryTargetType: string | null = null;
  let maxCount = 0;
  for (const [type, count] of targetTypes) {
    if (count > maxCount) {
      maxCount = count;
      primaryTargetType = type;
    }
  }

  return {
    totalDuration,
    totalWork,
    totalRest,
    averageIntensity: intensityCount > 0 ? intensitySum / intensityCount : 0,
    primaryTargetType,
    stepCount: steps.length,
    hasRepetitions: plan.steps.some(s => s.type === 'repetition'),
    estimatedTSS: profile ? calculateWorkoutTSS(plan, profile) : undefined,
  };
}

/**
 * Calculate total duration from plan steps
 * Replaces: follow-along/index.tsx lines 157-161
 */
export function calculateTotalDuration(steps: FlattenedStep[]): number {
  return steps.reduce((total, step) => {
    return total + (step.duration ? getDurationMs(step.duration) : 0);
  }, 0);
}

/**
 * Build workout description string
 * Consolidates: follow-along formatWorkoutSummary (lines 192-232)
 */
export function formatWorkoutDescription(step: FlattenedStep): string {
  const parts: string[] = [];

  // Add duration
  if (step.duration && step.duration !== "untilFinished") {
    const ms = getDurationMs(step.duration);
    parts.push(formatDurationCompactMs(ms));
  }

  // Add primary target
  if (step.targets && step.targets.length > 0) {
    const target = step.targets[0];
    parts.push(formatMetricValue(target.intensity, target.type));
  }

  return parts.join(' @ ');
}
```

### **1.3 Create `packages/core/schemas/step_progression.ts`**

```typescript
import type { FlattenedStep } from "./activity_plan_structure";
import { getDurationMs } from "./activity_plan_structure";

export interface StepProgress {
  currentStepIndex: number;
  totalSteps: number;
  completedDuration: number;
  remainingDuration: number;
  percentComplete: number;
  currentStep?: FlattenedStep;
  nextStep?: FlattenedStep;
}

/**
 * Calculate workout progress
 * Replaces: follow-along calculateProgress (lines 187-190)
 */
export function calculateStepProgress(
  steps: FlattenedStep[],
  currentIndex: number,
  elapsedInStep?: number
): StepProgress {
  const totalSteps = steps.length;
  const currentStep = steps[currentIndex];
  const nextStep = steps[currentIndex + 1];

  // Calculate completed duration
  let completedDuration = 0;
  for (let i = 0; i < currentIndex; i++) {
    const step = steps[i];
    if (step.duration) {
      completedDuration += getDurationMs(step.duration);
    }
  }

  // Add elapsed time in current step
  if (elapsedInStep) {
    completedDuration += elapsedInStep;
  }

  // Calculate remaining duration
  let remainingDuration = 0;
  for (let i = currentIndex; i < steps.length; i++) {
    const step = steps[i];
    if (step.duration) {
      const stepDuration = getDurationMs(step.duration);
      if (i === currentIndex && elapsedInStep) {
        remainingDuration += Math.max(0, stepDuration - elapsedInStep);
      } else {
        remainingDuration += stepDuration;
      }
    }
  }

  const totalDuration = completedDuration + remainingDuration;
  const percentComplete = totalDuration > 0
    ? (completedDuration / totalDuration) * 100
    : 0;

  return {
    currentStepIndex: currentIndex,
    totalSteps,
    completedDuration,
    remainingDuration,
    percentComplete: Math.min(100, Math.max(0, percentComplete)),
    currentStep,
    nextStep,
  };
}

/**
 * Get upcoming steps for preview
 */
export function getUpcomingSteps(
  steps: FlattenedStep[],
  currentIndex: number,
  count: number = 3
): FlattenedStep[] {
  return steps.slice(currentIndex + 1, currentIndex + 1 + count);
}
```

### **1.4 Update `packages/core/schemas/activity_plan_structure.ts`**

Add these functions to the existing file:

```typescript
/**
 * Format interval description with optional profile conversion
 * Migrated from: EnhancedPlanCard.tsx lines 160-192
 */
export function formatIntervalDescription(
  duration: number,
  targets?: IntensityTarget[],
  profile?: ProfileMetrics
): string {
  const parts: string[] = [];

  if (duration > 0) {
    parts.push(formatDurationCompactMs(duration));
  }

  if (targets && targets.length > 0) {
    const primaryTarget = targets[0];

    if (profile) {
      // Use profile conversion
      const converted = convertTargetToAbsolute(primaryTarget, profile);
      if (converted.intensity) {
        parts.push(`${converted.intensity}${converted.unit}`);
      }
    } else {
      // Fallback to basic formatting
      parts.push(formatTargetRange(primaryTarget));
    }
  }

  return parts.join(' @ ');
}

/**
 * Build workout cards for UI display
 * Generic version of follow-along buildWorkoutCards (lines 163-177)
 */
export interface WorkoutCard {
  id: string;
  type: 'overview' | 'step' | 'completion';
  workout?: any;
  step?: FlattenedStep;
  stepNumber?: number;
}

export function buildWorkoutCards(
  workout: any,
  steps: FlattenedStep[]
): WorkoutCard[] {
  return [
    { id: 'overview', type: 'overview', workout },
    ...steps.map((step, index) => ({
      id: `step-${index}`,
      type: 'step' as const,
      step,
      stepNumber: index + 1,
    })),
    { id: 'completion', type: 'completion' },
  ];
}
```

---

## 🔄 Phase 2: Update Mobile Components

### **2.1 Update `apps/mobile/src/app/(internal)/follow-along/index.tsx`**

**Remove these functions (lines to delete):**
- Lines 136-155: `flattenSteps()`
- Lines 157-161: `calculateTotalDuration()`
- Lines 163-177: `buildWorkoutCards()`
- Lines 179-185: `getTargetDisplayName()` and `getTargetUnit()`
- Lines 187-190: `calculateProgress()`
- Lines 192-254: `formatWorkoutSummary()` and `formatTargetSummary()`

**Add imports at top of file:**
```typescript
import {
  flattenPlanSteps,
  buildWorkoutCards,
  getMetricDisplayName,
  getTargetUnit,
  formatIntervalDescription,
  calculateStepProgress,
  calculateTotalDuration,
  type WorkoutCard,
} from "@repo/core";
```

**Update usages:**
```typescript
// Line 497: Replace flattenSteps with flattenPlanSteps
const baseSteps = useMemo(
  () => workout?.structure?.steps
    ? flattenPlanSteps(workout.structure.steps)
    : [],
  [workout]
);

// Update any calls to removed functions with core imports
// getTargetDisplayName → getMetricDisplayName
// calculateProgress → calculateStepProgress
// formatWorkoutSummary → formatIntervalDescription
```

**Remove TARGET_CONFIG object (lines 47-56)** - Use core functions instead

### **2.2 Update `apps/mobile/src/components/RecordingCarousel/cards/EnhancedPlanCard.tsx`**

**Remove these functions:**
- Lines 75-155: `convertTarget()`
- Lines 160-192: `formatIntervalDescription()`
- Lines 197-212: `isInTargetRange()`

**Add imports:**
```typescript
import {
  convertTargetToAbsolute,
  formatIntervalDescription,
  isValueInTargetRange,
  type ProfileMetrics,
  type ConvertedTarget,
} from "@repo/core";
```

**Update function calls:**
```typescript
// Line 274: Replace convertTarget with convertTargetToAbsolute
const converted = convertTargetToAbsolute(target, profile);

// Line 469: formatIntervalDescription now imported from core
// No change needed, just uses the imported version

// Replace isInTargetRange with isValueInTargetRange
// Update any calls to match the core function signature
```

**Keep `getProfileMetrics()` function** (lines 55-70) - This is specific to accessing service internals

### **2.3 Update `packages/core/index.ts`**

Add exports for new modules:

```typescript
// Add to existing exports
export * from "./schemas/profile_conversions";
export * from "./schemas/workout_analysis";
export * from "./schemas/step_progression";

// These utilities are now available from main @repo/core import
```

---

## 📝 Implementation Checklist

### **Order of Implementation:**

1. **[ ] Create Core Utilities** (1-2 hours)
   - [ ] Create `profile_conversions.ts`
   - [ ] Create `workout_analysis.ts`
   - [ ] Create `step_progression.ts`
   - [ ] Update `activity_plan_structure.ts`
   - [ ] Update `index.ts` exports

2. **[ ] Update EnhancedPlanCard** (30 minutes)
   - [ ] Remove duplicate functions
   - [ ] Add core imports
   - [ ] Update function calls
   - [ ] Test recording with structured workout

3. **[ ] Update Follow-Along** (30 minutes)
   - [ ] Remove duplicate functions
   - [ ] Add core imports
   - [ ] Update function calls
   - [ ] Test with swim/strength/other activities

4. **[ ] Validation Testing** (1 hour)
   - [ ] Test follow-along with template
   - [ ] Test follow-along with planned activity
   - [ ] Test EnhancedPlanCard during recording
   - [ ] Test profile-based conversions
   - [ ] Test workouts without profile data

---

## ⚠️ Migration Notes

### **Backward Compatibility:**
- All existing functions remain available
- New functions are additions, not replacements
- Type interfaces are compatible with existing usage

### **Function Mapping:**

| Old Function | New Function | Location |
|--------------|--------------|----------|
| `follow-along/flattenSteps()` | `flattenPlanSteps()` | `@repo/core` |
| `follow-along/calculateTotalDuration()` | `calculateTotalDuration()` | `@repo/core/schemas/workout_analysis` |
| `follow-along/getTargetDisplayName()` | `getMetricDisplayName()` | `@repo/core` |
| `EnhancedPlanCard/convertTarget()` | `convertTargetToAbsolute()` | `@repo/core/schemas/profile_conversions` |
| `EnhancedPlanCard/isInTargetRange()` | `isValueInTargetRange()` | `@repo/core` |

### **Edge Cases to Test:**
1. Workouts without profile data (FTP/threshold not set)
2. Open-ended steps (duration = "untilFinished")
3. Steps without targets
4. Repetition blocks with nested steps
5. Empty workout structures

---

## 🎯 Success Criteria

- [ ] No regression in follow-along functionality
- [ ] No regression in EnhancedPlanCard display
- [ ] All templates work in follow-along
- [ ] All planned activities work in follow-along
- [ ] Profile-based conversions work when profile exists
- [ ] Graceful fallback when profile data is missing
- [ ] No TypeScript errors
- [ ] Reduced total lines of code
- [ ] Core utilities can be imported and used immediately in web app

---

## 💡 Future Enhancements

Once this refactoring is complete, these core utilities will enable:

1. **Web Dashboard** - Activity analysis with same calculations
2. **Template Builder** - Consistent workout preview
3. **Training Calendar** - Workout summaries and TSS calculations
4. **Activity Comparison** - Consistent metrics across platforms
5. **API Endpoints** - Server-side workout analysis using same logic

This implementation maintains full backward compatibility while setting up a foundation for cross-platform workout features.
