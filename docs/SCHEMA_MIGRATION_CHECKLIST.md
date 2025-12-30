# Activity Plan Schema Migration Checklist

## Schema Change Summary

**Changed:** `ActivityPlanStructureV2` from flat `steps[]` to nested `intervals[]`

### Old Structure (V2 Flat)
```typescript
{
  version: 2,
  steps: PlanStepV2[]  // Flat array with metadata (segmentName, segmentIndex, originalRepetitionCount)
}
```

### New Structure (V2 Intervals)
```typescript
{
  version: 2,
  intervals: IntervalV2[]  // Array of intervals, each containing steps and repetitions
}

// Where IntervalV2 is:
{
  id: string (uuid),
  name: string,
  repetitions: number (default: 1),
  steps: IntervalStepV2[],
  notes?: string
}

// And IntervalStepV2 is:
{
  id: string (uuid),
  name: string,
  duration: DurationV2,
  targets?: IntensityTargetV2[],
  description?: string,
  notes?: string
}
```

## Files Requiring Updates

### ✅ Core Package (`packages/core`)

#### 1. **schemas/activity_plan_v2.ts** - COMPLETED ✅
- Added `IntervalStepV2` schema with `id` field
- Added `IntervalV2` schema with `id`, `name`, `repetitions`, `steps[]`
- Updated `ActivityPlanStructureV2` to use `intervals[]` instead of `steps[]`
- Kept deprecated `PlanStepV2` for migration purposes
- Updated helper functions to accept both old and new types

#### 2. **calculations_v2.ts** - NEEDS UPDATE ❌
**Errors:**
- Line 111: `structure.steps` → should iterate `structure.intervals`
- Line 114: Implicit `any` types for `step` and `index`
- Line 151: `structure.steps` → should iterate `structure.intervals`
- Line 168, 174: Implicit `any` types
- Line 242: `structure.steps` → should iterate `structure.intervals`

**Required Changes:**
- Update to iterate over `structure.intervals[]` and expand `repetitions`
- For each interval, multiply calculations by `interval.repetitions`
- Update all step references to `interval.steps`

#### 3. **estimation/index.ts** - NEEDS UPDATE ❌
**Errors:**
- Line 57: `structure.steps` (used twice) → iterate `structure.intervals`

**Required Changes:**
- Update estimation logic to iterate intervals and their steps
- Account for repetitions in calculations

#### 4. **estimation/strategies.ts** - NEEDS UPDATE ❌
**Errors:**
- Line 90: `structure.steps` (used twice) → iterate `structure.intervals`
- Line 95: `structure.steps` → iterate `structure.intervals`

**Required Changes:**
- Update TSS/IF calculation strategies to handle intervals
- Multiply step contributions by interval repetitions

#### 5. **schemas/plan_builder_v2.ts** - NEEDS UPDATE ❌
**Errors:**
- Line 149: Trying to create `{ version: 2, steps: [] }` → should create `{ version: 2, intervals: [] }`

**Required Changes:**
- Update `.build()` method to return intervals instead of flat steps
- Change `.interval()` method to create `IntervalV2` objects (not expand)
- Change `.step()` method to create interval with 1 step, 1 repetition
- Update `.warmup()`, `.cooldown()`, `.rest()` to create intervals
- Add UUID generation for intervals and steps

#### 6. **utils/plan-view-logic.ts** - NEEDS UPDATE ❌
**Errors:**
- Line 29: `structure.steps` (used twice) → iterate `structure.intervals`

**Required Changes:**
- Update view configuration logic to work with intervals

---

### ❌ Mobile App (`apps/mobile`)

#### 7. **lib/stores/activityPlanCreation.ts** - NEEDS MAJOR UPDATE ❌
**Errors:**
- Multiple errors: state structure expects `steps[]` but schema has `intervals[]`
- All CRUD methods (addStep, updateStep, removeStep, etc.) reference `steps[]`

**Required Changes:**
- Change initial structure: `{ version: 2, intervals: [] }` instead of `{ version: 2, steps: [] }`
- Replace methods:
  - `addStep()` → `addInterval(interval: IntervalV2)`
  - `updateStep()` → `updateInterval(intervalId: string, updates)`
  - `removeStep()` → `removeInterval(intervalId: string)`
  - `addSteps()` → `addIntervals(intervals: IntervalV2[])`
  - `reorderSteps()` → `reorderIntervals(intervals: IntervalV2[])`
- Add new methods for step management within intervals:
  - `addStepToInterval(intervalId: string, step: IntervalStepV2)`
  - `updateStepInInterval(intervalId: string, stepId: string, updates)`
  - `removeStepFromInterval(intervalId: string, stepId: string)`
- Remove deprecated methods:
  - `updateSegmentName()` - no longer needed
  - `removeSegment()` - no longer needed

#### 8. **app/(internal)/(tabs)/plan/create_activity_plan/index.tsx** - NEEDS UPDATE ❌
**Errors:**
- Line 77: `structure.steps` (used twice) → `structure.intervals`
- Line 87: Creating object with `steps[]` → should use `intervals[]`

**Required Changes:**
- Update initialization logic to create default interval structure
- Update metrics calculations to iterate intervals

#### 9. **app/(internal)/(tabs)/plan/create_activity_plan/structure/index.tsx** - NEEDS MAJOR UPDATE ❌
**Errors:**
- Line 55: `structure.steps` (used twice) → `structure.intervals`
- Line 64: Implicit `any` types in reduce function
- Uses `groupStepsBySegment()` which is deprecated

**Required Changes:**
- Remove `groupStepsBySegment()` call - no longer needed
- Iterate directly over `structure.intervals[]`
- Update to render `IntervalCard` components (not `SegmentHeader`)
- Update metrics calculation to handle intervals × repetitions
- Update drag/drop to reorder intervals (not steps)

#### 10. **app/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/index.tsx** - NEEDS MAJOR UPDATE ❌
**Errors:**
- Line 70: `structure.steps`
- Lines 71, 84, 316, 322, 347: Multiple references to `steps[]`
- Line 471: Creating object with `steps[]`

**Required Changes:**
- This entire component may need to be redesigned or removed
- Current logic tries to reconstruct intervals from flat steps
- With native intervals, this reconstruction is unnecessary

#### 11. **components/ActivityPlan/TimelineChart.tsx** - NEEDS UPDATE ❌
**Errors:**
- Line 36-37: `structure.steps` (used twice) → `structure.intervals`

**Required Changes:**
- Iterate over `structure.intervals[]`
- For each interval, render steps × repetitions
- Expand intervals for visualization (show all repetitions)

#### 12. **components/RecordingCarousel/cards/EnhancedPlanCard.tsx** - NEEDS UPDATE ❌
**Errors:**
- Lines 419, 421, 543, 544: Multiple `structure.steps` references
- Lines 424, 439, 455: Implicit `any` types

**Required Changes:**
- Update to iterate intervals and expand repetitions
- Update progress tracking to work with intervals
- Update step navigation logic

#### 13. **lib/hooks/forms/useActivityPlanForm.ts** - NEEDS UPDATE ❌
**Errors:**
- Lines 127, 188, 250: Multiple `structure.steps` references
- Line 129: Implicit `any` type for step

**Required Changes:**
- Update form logic to work with intervals
- Update validation to check interval structure

#### 14. **lib/services/ActivityRecorder/index.ts** - NEEDS UPDATE ❌
**Errors:**
- Lines 400, 402: `structure.steps` references

**Required Changes:**
- Update recording service to expand intervals into flat steps for playback
- Create helper function: `expandIntervalsToPlaybackSteps(structure)`

#### 15. **lib/services/ActivityRecorder/plan.ts** - NEEDS UPDATE ❌
**Errors:**
- Line 51: `structure.steps`

**Required Changes:**
- Update plan step tracking to work with expanded intervals

---

### 🔄 TRPC/Backend (Future - Not Breaking Yet)

#### 16. **packages/trpc/src/routers/activity_plans.ts**
- Will need to validate new structure
- May need migration logic for old plans

#### 17. **packages/trpc/src/lib/integrations/wahoo/plan-converter.ts**
- Will need to iterate intervals instead of reconstructing from flat steps

---

## Migration Strategy

### Phase 1: Core Schema (Completed ✅)
- [x] Update `activity_plan_v2.ts` with interval-based structure
- [x] Keep deprecated types for migration

### Phase 2: Core Package Updates
- [ ] Update `calculations_v2.ts`
- [ ] Update `estimation/index.ts`
- [ ] Update `estimation/strategies.ts`
- [ ] Update `plan_builder_v2.ts`
- [ ] Update `utils/plan-view-logic.ts`

### Phase 3: Mobile Store & Services
- [ ] Update `activityPlanCreation.ts` store (major rewrite)
- [ ] Update `ActivityRecorder` services
- [ ] Update `useActivityPlanForm.ts`

### Phase 4: Mobile UI Components
- [ ] Update `TimelineChart.tsx`
- [ ] Update `EnhancedPlanCard.tsx`
- [ ] Update structure index pages
- [ ] Update or remove repeat index component

### Phase 5: Backend & Integrations
- [ ] Update TRPC validation
- [ ] Update Wahoo converter
- [ ] Create migration script

---

## Key Implementation Notes

### UUID Generation
All intervals and steps now require UUIDs. Use:
```typescript
import { randomUUID } from 'crypto';
// or
import { v4 as uuidv4 } from 'uuid';
```

### Expanding Intervals for Display/Recording
When displaying or recording, intervals need to be expanded:
```typescript
function expandIntervals(structure: ActivityPlanStructureV2): ExpandedStep[] {
  const expanded: ExpandedStep[] = [];
  
  for (const interval of structure.intervals) {
    for (let rep = 0; rep < interval.repetitions; rep++) {
      for (const step of interval.steps) {
        expanded.push({
          ...step,
          intervalName: interval.name,
          repetitionIndex: rep,
          totalRepetitions: interval.repetitions,
        });
      }
    }
  }
  
  return expanded;
}
```

### Calculating Metrics
All metrics must account for repetitions:
```typescript
let totalDuration = 0;
for (const interval of structure.intervals) {
  const intervalDuration = interval.steps.reduce((sum, step) => 
    sum + getStepDuration(step), 0
  );
  totalDuration += intervalDuration * interval.repetitions;
}
```

---

## Testing Checklist

- [ ] Unit tests for new schema validation
- [ ] Unit tests for interval expansion logic
- [ ] Unit tests for calculations with intervals
- [ ] Integration test: Create activity plan with intervals
- [ ] Integration test: Display activity plan with intervals
- [ ] Integration test: Record activity from interval-based plan
- [ ] Migration test: Convert old flat structure to intervals

---

## Estimated Effort

- **Core Package Updates**: 4-6 hours
- **Mobile Store & Services**: 6-8 hours
- **Mobile UI Components**: 8-10 hours
- **Backend & Migration**: 4-6 hours
- **Testing & Bug Fixes**: 6-8 hours

**Total**: 28-38 hours (~1 week of focused work)
