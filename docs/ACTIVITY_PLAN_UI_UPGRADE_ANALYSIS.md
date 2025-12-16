# Activity Plan UI/UX Upgrade Analysis

## Executive Summary

The activity plan structure has been significantly upgraded to **Version 2 (V2)**, featuring a flat architecture, runtime evaluation, and enhanced capabilities. However, the mobile app UI remains built around the **legacy V1 nested structure**, creating a critical gap between backend capabilities and user experience.

This document identifies specific UI components requiring updates and provides actionable recommendations to modernize the mobile app's activity plan creation experience.

---

## New V2 Structure Overview

### Key V2 Improvements

1. **Flat Structure**: Repetitions are expanded at creation time into individual steps (no nested structures)
2. **Runtime Evaluation**: Step completion is evaluated in real-time during recording, not at plan creation
3. **Dynamic Tolerances**: Range validation adapts during actual performance
4. **Enhanced Duration Types**: `time`, `distance`, `repetitions`, `untilFinished`
5. **Flexible Intensity Targets**: Up to 3 targets per step (increased from 2 in UI)
6. **Segment Metadata**: Optional `segmentName`, `segmentIndex`, and `originalRepetitionCount` for grouping

### V2 Schema Highlights

**Duration Schema V2:**
```typescript
{
  type: "time" | "distance" | "repetitions" | "untilFinished";
  seconds?: number;      // for time
  meters?: number;       // for distance
  count?: number;        // for repetitions
}
```

**Plan Step V2:**
```typescript
{
  name: string;                        // 1-100 chars
  description?: string;                // NEW: Optional description
  notes?: string;                      // max 1000 chars
  duration: DurationV2;                // Required
  targets?: IntensityTargetV2[];       // max 3 targets (increased)
  segmentName?: string;                // NEW: For grouping (e.g., "Warmup")
  segmentIndex?: number;               // NEW: Repetition tracking
  originalRepetitionCount?: number;    // NEW: Original repeat value
}
```

**Activity Plan Structure V2:**
```typescript
{
  version: 2;
  steps: PlanStepV2[];  // Flat array (1-200 max)
}
```

---

## Current Mobile UI Architecture

### Core Components

1. **Create Activity Plan Screen** (`create_activity_plan/index.tsx`)
   - Activity category selector
   - Name, description, location inputs
   - Route selector
   - Structure metrics card
   - Timeline chart preview

2. **Structure Editor Screen** (`structure/index.tsx`)
   - Timeline chart (static SVG)
   - Drag-and-drop step list
   - Add menu (Step or Repeat Block)
   - Step/Repeat cards

3. **Step Editor Dialog** (`StepEditorDialog.tsx`)
   - Step name input
   - Duration type selector
   - Duration value/unit inputs
   - Intensity targets (max 2)
   - Notes field

4. **Repeat Editor Screen** (`structure/repeat/index.tsx`)
   - Manages repetition blocks
   - Edit repeat count and contained steps

5. **State Management** (`activityPlanCreation.ts`)
   - Zustand store
   - V1 nested structure with `StepOrRepetition[]`

---

## Gap Analysis: V2 vs Current UI

### Critical Gaps

| V2 Feature | Current UI Status | Impact |
|------------|-------------------|--------|
| Flat structure with `version: 2` | Uses V1 nested structure | **HIGH** - Backend expects V2, UI sends V1 |
| `description` field on steps | Not available in UI | **MEDIUM** - Missing step-level context |
| 3 targets per step | UI limits to 2 targets | **MEDIUM** - Feature limitation |
| `segmentName` metadata | Not captured in UI | **MEDIUM** - Missing workout organization |
| New duration schema (seconds, meters, count) | Uses old schema (value + unit) | **HIGH** - Schema mismatch |
| `segmentIndex` and `originalRepetitionCount` | Not tracked | **LOW** - Backend can infer |

### Specific Issues

#### 1. **Data Structure Mismatch** (CRITICAL)

**Problem:** Mobile app stores structure as:
```typescript
structure: {
  steps: StepOrRepetition[]  // V1 nested structure
}
```

But V2 expects:
```typescript
structure: {
  version: 2,
  steps: PlanStepV2[]  // Flat array
}
```

**Impact:** Plans created in mobile app may fail validation or be incorrectly processed.

**Location:** 
- `apps/mobile/lib/stores/activityPlanCreation.ts:14-16`
- `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts:79-82`

---

#### 2. **Duration Schema Conversion** (CRITICAL)

**Problem:** UI uses old duration format:
```typescript
duration: {
  type: "time",
  value: 10,
  unit: "minutes"
}
```

V2 expects:
```typescript
duration: {
  type: "time",
  seconds: 600
}
```

**Impact:** Duration values won't be correctly interpreted by V2 validators.

**Location:**
- `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx:45-77`

---

#### 3. **Missing Step Description Field** (MEDIUM)

**Problem:** V2 supports `description` at step level, but UI only has `notes`.

**Impact:** Users cannot provide structured descriptions for steps, limiting documentation.

**Recommendation:** Add optional description field above notes in Step Editor Dialog.

**Location:**
- `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx:383-395`

---

#### 4. **Intensity Targets Limited to 2** (MEDIUM)

**Problem:** UI enforces max 2 targets per step:
```typescript
targets: z.array(intensityTargetSchema).max(2)
```

V2 supports up to 3 targets:
```typescript
targets: z.array(intensityTargetSchemaV2).max(3)
```

**Impact:** Advanced users cannot create multi-metric training zones.

**Location:**
- `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx:47`
- `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx:261`

---

#### 5. **No Segment Metadata Capture** (MEDIUM)

**Problem:** V2 supports `segmentName` for grouping (e.g., "Warmup", "Main Set", "Cooldown"), but UI doesn't capture this.

**Impact:** Users cannot organize complex workouts into logical sections. Backend has grouping capability (`groupStepsBySegment()`) that UI doesn't leverage.

**Recommendation:** Add segment selector/input in Step Editor Dialog or Repeat Editor.

**Location:**
- `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx` - needs new field
- `packages/core/schemas/activity_plan_v2.ts:70-72` - V2 segment fields

---

#### 6. **Repetition Expansion Not Implemented** (HIGH)

**Problem:** V2 expects repetitions to be expanded into flat steps at creation time. UI still uses nested `Repetition` structure and relies on backend to flatten.

**Impact:** 
- Mobile app doesn't control how repetitions are expanded
- Cannot preview exact step sequence before saving
- `segmentIndex` and `originalRepetitionCount` not set

**Location:**
- `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/index.tsx`
- `apps/mobile/lib/stores/activityPlanCreation.ts:60-63`

---

#### 7. **Timeline Chart Uses V1 Structure** (MEDIUM)

**Problem:** TimelineChart component expects nested structure and uses `flattenPlanSteps()` utility. Should work directly with V2 flat steps.

**Impact:** Potential inconsistencies in visualization if V2 structure is used.

**Location:**
- `apps/mobile/components/ActivityPlan/TimelineChart.tsx`

---

## Detailed Component Update Recommendations

### 1. Update Zustand Store (CRITICAL)

**File:** `apps/mobile/lib/stores/activityPlanCreation.ts`

**Current:**
```typescript
structure: {
  steps: StepOrRepetition[];
}
```

**Recommended:**
```typescript
structure: {
  version: 2 as const;
  steps: PlanStepV2[];  // Flat array only
}
```

**Actions:**
- Replace `StepOrRepetition[]` with `PlanStepV2[]`
- Remove `addRepeat()` action
- Add `expandRepetition()` helper to convert repeat blocks into flat steps with metadata
- Update `addStep()` to accept optional segment metadata

**Impact:** Ensures V2 compatibility throughout the app.

---

### 2. Upgrade Step Editor Dialog (HIGH)

**File:** `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx`

**Changes Required:**

**A. Add Description Field**
```typescript
// Add after step name, before duration
<View>
  <Label nativeID="step-description">Description (Optional)</Label>
  <Controller
    control={form.control}
    name="description"
    render={({ field: { onChange, value } }) => (
      <Textarea
        value={value || ""}
        onChangeText={onChange}
        placeholder="Brief description of this step..."
        className="min-h-[60px]"
      />
    )}
  />
</View>
```

**B. Increase Target Limit to 3**
```typescript
// Change from 2 to 3
targets: z.array(intensityTargetSchema).max(3)

// Update UI text
{targets.length === 3 && (
  <Text className="text-xs text-muted-foreground mt-1">
    Maximum 3 targets per step
  </Text>
)}
```

**C. Add Segment Name Field**
```typescript
<View>
  <Label nativeID="segment-name">Segment (Optional)</Label>
  <Input
    value={segmentName || ""}
    onChangeText={setSegmentName}
    placeholder="e.g., Warmup, Main Set, Cooldown"
  />
</View>
```

**D. Convert Duration to V2 Schema**
```typescript
// Convert form values to V2 duration before saving
const convertToV2Duration = (duration: Duration): DurationV2 => {
  if (duration === "untilFinished") {
    return { type: "untilFinished" };
  }
  
  switch (duration.type) {
    case "time":
      const seconds = duration.unit === "minutes" 
        ? duration.value * 60 
        : duration.value;
      return { type: "time", seconds };
    
    case "distance":
      const meters = duration.unit === "km" 
        ? duration.value * 1000 
        : duration.value;
      return { type: "distance", meters };
    
    case "repetitions":
      return { type: "repetitions", count: duration.value };
  }
};
```

---

### 3. Refactor Repeat Functionality (HIGH)

**Current Approach:** Nested repetition blocks stored as `Repetition` type.

**V2 Approach:** Expand repetitions into flat steps at creation time.

**Recommended Implementation:**

**A. Replace Repeat Editor Screen**

Instead of a separate repeat editor, add a "Create Interval" dialog that:
1. Asks for work step, rest step, and repeat count
2. Generates flat steps with segment metadata
3. Shows preview of expanded steps before adding

**B. Add Expansion Helper**
```typescript
// In activityPlanCreation.ts
expandAndAddInterval: (
  workStep: PlanStepV2,
  restStep: PlanStepV2,
  repeatCount: number,
  segmentName: string = "Intervals"
) => {
  const expandedSteps: PlanStepV2[] = [];
  
  for (let i = 0; i < repeatCount; i++) {
    expandedSteps.push({
      ...workStep,
      segmentName,
      segmentIndex: i,
      originalRepetitionCount: repeatCount,
    });
    
    expandedSteps.push({
      ...restStep,
      segmentName,
      segmentIndex: i,
      originalRepetitionCount: repeatCount,
    });
  }
  
  set((state) => ({
    structure: {
      version: 2,
      steps: [...state.structure.steps, ...expandedSteps]
    }
  }));
}
```

**C. Update Structure Editor**

Change "Add Repeat Block" to "Add Interval Set" with inline expansion preview.

---

### 4. Update Form Submission (CRITICAL)

**File:** `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts`

**Current Submission:**
```typescript
const payload = {
  name,
  description,
  activity_location: activityLocation,
  activity_category: activityCategory,
  structure,  // V1 nested structure
  // ...
};
```

**Recommended:**
```typescript
const payload = {
  name,
  description,
  activity_location: activityLocation,
  activity_category: activityCategory,
  structure: {
    version: 2,
    steps: structure.steps  // Already flat in V2 store
  },
  // ...
};
```

---

### 5. Upgrade Timeline Chart (MEDIUM)

**File:** `apps/mobile/components/ActivityPlan/TimelineChart.tsx`

**Current:** Uses `flattenPlanSteps()` to convert nested structure.

**Recommended:** 
- Work directly with flat `steps` array from V2 structure
- Remove flattening logic
- Use `segmentName` to group steps visually
- Add visual dividers between segments

**Example:**
```typescript
// Group by segment
const segments = groupStepsBySegment(structure.steps);

// Render with segment headers
segments.map(segment => (
  <View key={segment.segmentName}>
    <Text className="text-xs text-muted-foreground">
      {segment.segmentName}
    </Text>
    {segment.steps.map(step => (
      <StepBar key={step.name} step={step} />
    ))}
  </View>
))
```

---

### 6. Update StepCard and RepeatCard (MEDIUM)

**StepCard:** `apps/mobile/components/ActivityPlan/StepCard.tsx`

**Changes:**
- Add description field display (if present)
- Show segment name badge
- Display segment index if part of interval

**RepeatCard:** May become obsolete with flat structure approach.

**Alternative:** Replace RepeatCard with "IntervalGroupCard" that shows a collapsed view of steps sharing the same `segmentName` and `originalRepetitionCount`.

---

### 7. Enhance Structure Metrics Display (LOW)

**File:** `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`

**Current Metrics:** Duration, TSS, IF, Step Count

**Recommended Additions:**
- Segment count (number of unique segments)
- Interval count (number of step groups with `originalRepetitionCount`)
- Average intensity per segment

---

### 8. Add Migration Logic (CRITICAL)

**Purpose:** Handle existing V1 plans and gracefully upgrade to V2.

**File:** Create new `apps/mobile/lib/utils/activityPlanMigration.ts`

```typescript
export function migrateV1ToV2(v1Structure: {
  steps: StepOrRepetition[];
}): ActivityPlanStructureV2 {
  const flatSteps: PlanStepV2[] = [];
  
  for (const item of v1Structure.steps) {
    if (item.type === "step") {
      flatSteps.push(convertStepToV2(item));
    } else if (item.type === "repetition") {
      for (let i = 0; i < item.repeat; i++) {
        for (const step of item.steps) {
          flatSteps.push(convertStepToV2(step, {
            segmentName: "Interval",
            segmentIndex: i,
            originalRepetitionCount: item.repeat
          }));
        }
      }
    }
  }
  
  return {
    version: 2,
    steps: flatSteps
  };
}

function convertStepToV2(
  v1Step: Step,
  metadata?: {
    segmentName?: string;
    segmentIndex?: number;
    originalRepetitionCount?: number;
  }
): PlanStepV2 {
  return {
    name: v1Step.name,
    notes: v1Step.notes,
    duration: convertDurationToV2(v1Step.duration),
    targets: v1Step.targets,
    ...metadata
  };
}

function convertDurationToV2(
  v1Duration?: Duration
): DurationV2 {
  if (!v1Duration || v1Duration === "untilFinished") {
    return { type: "untilFinished" };
  }
  
  switch (v1Duration.type) {
    case "time":
      return {
        type: "time",
        seconds: v1Duration.unit === "minutes" 
          ? v1Duration.value * 60 
          : v1Duration.value
      };
    case "distance":
      return {
        type: "distance",
        meters: v1Duration.unit === "km" 
          ? v1Duration.value * 1000 
          : v1Duration.value
      };
    case "repetitions":
      return {
        type: "repetitions",
        count: v1Duration.value
      };
  }
}
```

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)

**Priority:** Ensure V2 compatibility and prevent data corruption.

1. ✅ Update Zustand store to V2 structure
2. ✅ Implement duration schema conversion
3. ✅ Add migration utility for V1 to V2
4. ✅ Update form submission to send V2 structure
5. ✅ Add version check and defensive validation

**Testing Focus:** Create, save, and load plans without errors.

---

### Phase 2: Feature Parity (Week 2)

**Priority:** Match V2 capabilities in UI.

1. ✅ Add step description field
2. ✅ Increase target limit to 3
3. ✅ Add segment name input
4. ✅ Update Timeline Chart for flat structure
5. ✅ Refactor repetition expansion logic

**Testing Focus:** Advanced users can create complex multi-segment workouts.

---

### Phase 3: UX Enhancements (Week 3)

**Priority:** Leverage V2 features for better UX.

1. ✅ Add segment-based organization in Structure Editor
2. ✅ Implement interval creation wizard
3. ✅ Add segment grouping in Timeline Chart
4. ✅ Show segment metadata in StepCard
5. ✅ Add interval group collapse/expand

**Testing Focus:** Workout creation feels intuitive and powerful.

---

### Phase 4: Polish and Optimization (Week 4)

**Priority:** Refine and optimize.

1. ✅ Add workout templates using V2 structure
2. ✅ Implement undo/redo for step editing
3. ✅ Add drag-and-drop between segments
4. ✅ Optimize rendering for large plans (200 steps)
5. ✅ Add export/import for workout sharing

**Testing Focus:** Performance, edge cases, user feedback.

---

## UX Design Considerations

### Segment-Based Workflow

**Current:** Linear list of steps and repeat blocks.

**Recommended:** Segment-centric approach:

1. **Add Segment Button** → Create named section (Warmup, Main Set, etc.)
2. **Add Steps to Segment** → Steps inherit segment name
3. **Add Interval to Segment** → Inline expansion with preview
4. **Reorder Segments** → Drag entire sections
5. **Collapse/Expand Segments** → Reduce visual clutter

**Mockup Flow:**
```
┌─────────────────────────────────────────┐
│ WARMUP (3 steps)                    [v] │ ← Collapsible header
├─────────────────────────────────────────┤
│ 1. Easy pace     5min   Z2              │
│ 2. Build pace    3min   Z3              │
│ 3. Easy pace     2min   Z2              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ MAIN SET (12 steps)                 [v] │
├─────────────────────────────────────────┤
│ Interval 1/4                            │
│ 4. Hard effort   4min   Z4              │
│ 5. Recovery      2min   Z2              │
│ [... 3 more intervals]                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ COOLDOWN (2 steps)                  [v] │
├─────────────────────────────────────────┤
│ 16. Easy pace    5min   Z1              │
│ 17. Stretch      5min   Until Finished  │
└─────────────────────────────────────────┘
```

---

### Interval Creation Wizard

**Current:** Navigate to separate repeat editor screen.

**Recommended:** Inline modal with real-time preview:

```
┌───────────────────────────────────────────────┐
│ Create Interval Set                           │
├───────────────────────────────────────────────┤
│                                               │
│ Segment Name: [Main Set                    ] │
│                                               │
│ Work Step:                                    │
│   Name: [Hard effort                       ] │
│   Duration: [4] [minutes ▼]                  │
│   Target: [%FTP ▼] [95]                      │
│                                               │
│ Rest Step:                                    │
│   Name: [Recovery                          ] │
│   Duration: [2] [minutes ▼]                  │
│   Target: [%FTP ▼] [55]                      │
│                                               │
│ Repeat: [4] times                            │
│                                               │
│ Preview (8 steps):                           │
│ ┌─────────────────────────────────────────┐ │
│ │ █████ Hard (4min)  ▂▂▂ Recovery (2min)  │ │
│ │ █████ Hard (4min)  ▂▂▂ Recovery (2min)  │ │
│ │ █████ Hard (4min)  ▂▂▂ Recovery (2min)  │ │
│ │ █████ Hard (4min)  ▂▂▂ Recovery (2min)  │ │
│ └─────────────────────────────────────────┘ │
│                                               │
│           [Cancel]  [Add Interval Set]        │
└───────────────────────────────────────────────┘
```

---

## Testing Strategy

### Unit Tests

**Files to Test:**
- `activityPlanMigration.ts` - V1 to V2 conversion
- `useActivityPlanForm.ts` - Form submission with V2 structure
- `activityPlanCreation.ts` - Store actions

**Test Cases:**
- Convert V1 nested structure to V2 flat
- Convert V1 duration schema to V2
- Expand intervals into flat steps with metadata
- Handle edge cases (empty plans, max limits)

---

### Integration Tests

**Scenarios:**
1. Create new plan with segments → Save → Reload → Verify structure
2. Create plan with intervals → Expand → Verify flat steps
3. Edit existing V1 plan → Migrate to V2 → Save → Verify
4. Create plan with 3 targets → Save → Verify backend accepts

---

### E2E Tests

**User Flows:**
1. New user creates structured workout with warmup, intervals, cooldown
2. Advanced user creates complex plan with multiple segments and 3 targets per step
3. Existing user opens old V1 plan, edits, saves as V2
4. User drags steps between segments
5. User collapses/expands segments

---

## Backward Compatibility

### Strategy

1. **Detect Version on Load:**
   - If `structure.version === 2`, use directly
   - If no version or V1, run migration utility

2. **Always Save as V2:**
   - All new plans use V2
   - All edited V1 plans upgraded to V2

3. **API Compatibility:**
   - Backend already supports V2
   - V1 plans still readable for historical data

4. **User Communication:**
   - Toast notification: "Your workout has been upgraded to the latest format"
   - No action required from user

---

## Success Metrics

### Functional Metrics

- ✅ 100% of new plans created as V2 structure
- ✅ 0 validation errors on plan creation
- ✅ All V2 features accessible in UI

### UX Metrics

- ✅ Segment-based organization reduces plan creation time by 30%
- ✅ Interval wizard reduces steps to create intervals from 8 to 3
- ✅ Timeline chart clearly shows workout structure at a glance

### Performance Metrics

- ✅ Render 200-step plans without lag
- ✅ Drag-and-drop remains responsive with 50+ steps
- ✅ Form submission completes within 2 seconds

---

## Files Requiring Updates

### Critical Priority

1. `apps/mobile/lib/stores/activityPlanCreation.ts` - Store structure
2. `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts` - Form submission
3. `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx` - Duration conversion

### High Priority

4. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/index.tsx` - Structure editor
5. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/index.tsx` - Interval creation
6. `apps/mobile/components/ActivityPlan/TimelineChart.tsx` - Visualization

### Medium Priority

7. `apps/mobile/components/ActivityPlan/StepCard.tsx` - Display step details
8. `apps/mobile/components/ActivityPlan/RepeatCard.tsx` - Display intervals
9. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx` - Metrics display

### New Files

10. `apps/mobile/lib/utils/activityPlanMigration.ts` - V1 to V2 migration
11. `apps/mobile/components/ActivityPlan/IntervalWizard.tsx` - Interval creation UI
12. `apps/mobile/components/ActivityPlan/SegmentHeader.tsx` - Segment grouping

---

## Conclusion

The V2 structure represents a significant architectural improvement that enables better workout organization, runtime evaluation, and user experience. However, the mobile UI requires substantial updates to leverage these capabilities fully.

**Immediate Action Required:**
- Fix critical data structure mismatches to prevent validation errors
- Implement duration schema conversion for V2 compatibility
- Add migration utility to handle existing V1 plans

**Next Steps:**
- Follow the 4-phase implementation roadmap
- Focus on segment-based UX workflow
- Test thoroughly with real-world workout scenarios

**Long-term Vision:**
- Make workout creation as intuitive as building a playlist
- Leverage V2 metadata for smart workout suggestions
- Enable workout sharing and community templates

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-14  
**Author:** AI Assistant  
**Stakeholders:** Mobile Development Team, Product Design, Backend Team
