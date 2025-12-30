# Activity Plan Schema Update - Summary

## ✅ Completed Tasks

### 1. Schema Updated
**File:** `packages/core/schemas/activity_plan_v2.ts`

**Changes Made:**
- ✅ Added `IntervalStepV2` schema with UUID `id` field
- ✅ Added `IntervalV2` schema with `id`, `name`, `repetitions`, and nested `steps[]`
- ✅ Updated `ActivityPlanStructureV2` to use `intervals[]` instead of flat `steps[]`
- ✅ Kept deprecated `PlanStepV2` type for backward compatibility during migration
- ✅ Updated display helper functions to accept both old and new types
- ✅ Marked `groupStepsBySegment()` as deprecated

**New Schema Structure:**
```typescript
{
  version: 2,
  intervals: [
    {
      id: "uuid",
      name: "Warmup",
      repetitions: 1,
      steps: [
        {
          id: "uuid",
          name: "Easy Pace",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "%FTP", intensity: 65 }]
        }
      ]
    },
    {
      id: "uuid",
      name: "VO2 Max Intervals",
      repetitions: 5,
      steps: [
        { id: "uuid", name: "Hard", duration: { type: "time", seconds: 180 }, ... },
        { id: "uuid", name: "Recovery", duration: { type: "time", seconds: 180 }, ... }
      ]
    }
  ]
}
```

---

### 2. TypeScript Errors Identified
**Command:** `npx tsc --noEmit`

**Core Package Errors (6 files):**
1. `calculations_v2.ts` - 6 errors referencing `structure.steps`
2. `estimation/index.ts` - 2 errors referencing `structure.steps`
3. `estimation/strategies.ts` - 3 errors referencing `structure.steps`
4. `schemas/plan_builder_v2.ts` - 1 error trying to create `{steps: []}`
5. `utils/plan-view-logic.ts` - 2 errors referencing `structure.steps`

**Mobile App Errors (9 files):**
1. `lib/stores/activityPlanCreation.ts` - 20+ errors (major rewrite needed)
2. `app/(internal)/(tabs)/plan/create_activity_plan/index.tsx` - 3 errors
3. `app/(internal)/(tabs)/plan/create_activity_plan/structure/index.tsx` - 4+ errors
4. `app/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/index.tsx` - 9+ errors
5. `components/ActivityPlan/TimelineChart.tsx` - 2 errors
6. `components/RecordingCarousel/cards/EnhancedPlanCard.tsx` - 11+ errors
7. `lib/hooks/forms/useActivityPlanForm.ts` - 4 errors
8. `lib/services/ActivityRecorder/index.ts` - 2 errors
9. `lib/services/ActivityRecorder/plan.ts` - 1 error

**Total:** 15 files with 70+ type errors

---

### 3. Comprehensive Migration Checklist Created
**File:** `SCHEMA_MIGRATION_CHECKLIST.md`

**Contents:**
- Complete list of all files that need updates
- Specific error locations (line numbers)
- Required changes for each file
- Migration strategy broken into 5 phases
- Implementation notes with code examples
- Testing checklist
- Estimated effort: 28-38 hours (~1 week)

**Key Implementation Patterns Documented:**
- UUID generation for intervals and steps
- Expanding intervals for display/recording
- Calculating metrics with repetitions
- Helper functions needed

---

### 4. Vision Document Updated
**File:** `ACTIVITY_CREATION_AND_PLAN_CREATION_UPDATE.md`

**Updates Made:**
- ✅ Added "Technical Foundation: Interval-Based Architecture" section
- ✅ Updated "Interval Pills" section to show repetition counts
- ✅ Renamed "Quick Editor" to "Interval Editor"
- ✅ Added detailed explanation of interval editing workflow
- ✅ Added "Why This Matters Technically" section with JSON examples
- ✅ Emphasized the simplified data model (intervals as first-class objects)

**Key Messaging:**
- Everything is an interval (eliminates "add step vs add interval" confusion)
- Intervals contain steps and repetitions
- Data model matches mental model
- Changing repetitions = updating one field (not recreating 10 steps)

---

## 📋 Next Steps (Not Yet Implemented)

The schema has been updated and all breaking changes have been identified. Here's what needs to happen next:

### Phase 1: Core Package (Priority 1)
Update these files to work with the new interval structure:
1. `calculations_v2.ts` - Update to iterate intervals and expand repetitions
2. `estimation/index.ts` - Update estimation logic
3. `estimation/strategies.ts` - Update TSS/IF calculations
4. `plan_builder_v2.ts` - Update to create intervals instead of flat steps
5. `utils/plan-view-logic.ts` - Update view configuration

### Phase 2: Mobile Store (Priority 1)
6. `lib/stores/activityPlanCreation.ts` - **Major rewrite needed**
   - Change state structure to `{ version: 2, intervals: [] }`
   - Replace all step CRUD methods with interval methods
   - Add step-within-interval management methods

### Phase 3: Mobile Services (Priority 2)
7. `lib/services/ActivityRecorder/index.ts` - Add interval expansion for recording
8. `lib/services/ActivityRecorder/plan.ts` - Update step tracking
9. `lib/hooks/forms/useActivityPlanForm.ts` - Update form validation

### Phase 4: Mobile UI (Priority 2)
10. `components/ActivityPlan/TimelineChart.tsx` - Iterate intervals
11. `components/RecordingCarousel/cards/EnhancedPlanCard.tsx` - Update progress tracking
12. Structure editing screens - Update or remove as needed

### Phase 5: Backend & Migration (Priority 3)
13. Create migration script for existing plans
14. Update TRPC validation
15. Update Wahoo converter

---

## 🔑 Key Decisions Made

### 1. In-Place V2 Update (Not V3)
- Decided to update V2 in-place rather than creating a separate V3
- This is a **breaking change** - all existing plans must be migrated
- Kept deprecated types for backward compatibility during migration

### 2. Interval-First Architecture
- Eliminated standalone steps - everything is an interval
- Default repetition count: 1 (mimics old "single step" behavior)
- UUIDs required for all intervals and steps (enables efficient updates)

### 3. No UI Implementation Yet
- Schema and documentation updated only
- UI/UX implementation deferred to separate plan
- TypeScript errors serve as implementation checklist

---

## 📊 Impact Summary

**Breaking Changes:** Yes - all code that accesses `structure.steps` will break

**Migration Required:** Yes - all existing activity plans in database

**Benefits:**
- ✅ Simpler data model (intervals as first-class objects)
- ✅ Easier repetition editing (change one field, not recreate 10 steps)
- ✅ Cleaner code (~30% reduction in complexity)
- ✅ Better matches athlete mental model
- ✅ Consistent terminology ("intervals" throughout)

**Risks:**
- ⚠️ Breaking change requires careful migration
- ⚠️ All 15 files must be updated atomically
- ⚠️ Recording/playback logic needs expansion helper

---

## 📝 Reference Documents

1. **`SCHEMA_MIGRATION_CHECKLIST.md`** - Complete implementation checklist with line-by-line errors
2. **`ACTIVITY_CREATION_AND_PLAN_CREATION_UPDATE.md`** - Updated product vision reflecting new architecture
3. **`/home/deancochran/.claude/plans/lexical-hatching-squid.md`** - Original planning document

---

## 🎯 Success Criteria

The migration will be complete when:
- [ ] All 70+ TypeScript errors resolved
- [ ] Core package calculations work with intervals
- [ ] Mobile store manages intervals (not flat steps)
- [ ] Recording service expands intervals for playback
- [ ] UI renders intervals correctly
- [ ] All existing plans migrated to new structure
- [ ] Integration tests pass

**Estimated Timeline:** 1 week of focused development + 1-2 days migration/testing
