# Plan Tab - Next Steps Guide

## What We've Completed ✅

### Phase 1: Foundation & Critical Fixes (DONE)

1. **Created Shared Utilities**
   - `lib/constants/activities.ts` - Activity type configurations
   - `lib/utils/dates.ts` - Date formatting utilities
   - Both eliminate duplicate code across 5+ files

2. **Created Reusable Components**
   - `components/plan/ActivityCard.tsx` - For activities
   - `components/plan/PlanCard.tsx` - For plans
   - Both reduce rendering logic duplication by ~70%

3. **Created Form Management Hook**
   - `lib/hooks/forms/useActivityPlanForm.ts` - Manages plan creation/editing
   - Integrates validation, mutations, error handling
   - Reduces form code by ~60%

4. **Fixed Critical Bugs**
   - ✅ "Create Plan" button now goes to correct route
   - ✅ Plans are now saved to database (was only console.log before)
   - ✅ Created plans now appear in library
   - ✅ Proper error handling and user feedback

## What's Broken / Needs Fixing 🔴

### Issue 1: Scheduled Activities Not Showing in Calendar
**Problem**: When you schedule an activity from the library, it doesn't appear in the training plan calendar.

**Root Cause**: 
- The calendar queries `plannedActivities.listByWeek`
- The scheduled screen uses `plannedActivities.list`
- These might not be properly syncing or the calendar isn't refetching after scheduling

**Files Involved**:
- `plan/training-plan/calendar.tsx` - Lines 40-50 (query)
- `plan/scheduled/index.tsx` - Scheduling logic
- `plan/create_planned_activity/index.tsx` - Form submission

**Fix Steps**:
1. Check if `createMutation` in `create_planned_activity/index.tsx` invalidates the calendar queries
2. Add `await utils.plannedActivities.listByWeek.invalidate()` after successful creation
3. Verify the calendar refetches when navigating back to it
4. Add proper date filtering in the calendar query

### Issue 2: Router Pathnames Not Configured Correctly
**Problem**: Several navigation paths are incorrect or use modals when they should be regular screens.

**Broken Paths**:
```typescript
// In scheduled/index.tsx line 61
router.push("/plan/create/planned-activity"); // ❌ Wrong path

// Should be:
router.push("/(internal)/(tabs)/plan/create_planned_activity");
```

**Modal Overuse**:
```typescript
// In plan/_layout.tsx
<Stack.Screen name="library/index" options={{ presentation: "modal" }} />
<Stack.Screen name="planned_activities/index" options={{ presentation: "modal" }} />
<Stack.Screen name="create_planned_activity/index" options={{ presentation: "modal" }} />
```

**Fix Steps**:
1. Update all `router.push()` calls to use correct full paths
2. Search for `router.push` in plan directory: `grep -r "router.push" plan/`
3. Change modal presentations to regular screens in `_layout.tsx`
4. Test all navigation flows

### Issue 3: Modals vs. Proper Routing
**Problem**: Detail views use custom modal components instead of proper routes.

**Files Using Custom Modals**:
- `plan/components/modals/PlanDetailModal.tsx` - Should be route `plan/[plan_id].tsx`
- `plan/components/modals/PlannedActivityDetailModal.tsx` - Should be route `plan/scheduled/[activity_id].tsx`

**Impact**: 
- No deep linking support
- Broken back button behavior
- Can't share direct links to plans/activities
- Complex state management

## Immediate Action Items 🎯

### Priority 1: Fix Scheduling → Calendar Flow (2-3 hours)

**Goal**: Make scheduled activities appear in the training plan calendar

**Tasks**:
1. Create `usePlannedActivityForm.ts` hook (similar to `useActivityPlanForm.ts`)
   ```typescript
   export function usePlannedActivityForm(options: {
     activityId?: string;
     planId?: string;
     onSuccess?: (activityId: string) => void;
     onError?: (error: Error) => void;
   }) {
     // Handle form state
     // Validate constraints
     // Handle create/update mutations
     // Invalidate calendar queries
   }
   ```

2. Update `plan/create_planned_activity/index.tsx`:
   ```typescript
   const { form, submit, constraints } = usePlannedActivityForm({
     planId: params.planId,
     onSuccess: (activityId) => {
       Alert.alert("Success", "Activity scheduled!");
       router.back();
     }
   });
   ```

3. Ensure mutation invalidates calendar queries:
   ```typescript
   const createMutation = trpc.plannedActivities.create.useMutation({
     onSuccess: async (data) => {
       await utils.plannedActivities.list.invalidate();
       await utils.plannedActivities.listByWeek.invalidate(); // ← Add this
       await utils.trainingPlans.getCurrentStatus.invalidate(); // ← And this
       onSuccess?.(data.id);
     }
   });
   ```

4. Test flow:
   - Create a plan
   - Schedule it for tomorrow
   - Navigate to training plan calendar
   - Verify it appears on the correct day

### Priority 2: Fix All Router Paths (1-2 hours)

**Goal**: All navigation uses correct, consistent paths

**Tasks**:
1. Create a constants file for routes:
   ```typescript
   // lib/constants/routes.ts
   export const ROUTES = {
     PLAN: {
       INDEX: "/(internal)/(tabs)/plan",
       CREATE: "/(internal)/(tabs)/plan/create_activity_plan",
       LIBRARY: "/(internal)/(tabs)/plan/library",
       SCHEDULED: "/(internal)/(tabs)/plan/planned_activities",
       SCHEDULE_ACTIVITY: "/(internal)/(tabs)/plan/create_planned_activity",
       TRAINING_PLAN: "/(internal)/(tabs)/plan/training-plan",
       CALENDAR: "/(internal)/(tabs)/plan/training-plan/calendar",
     }
   } as const;
   ```

2. Find all `router.push()` calls:
   ```bash
   cd apps/mobile/app/(internal)/(tabs)/plan
   grep -r "router.push" .
   ```

3. Update each one to use the constant:
   ```typescript
   // Before
   router.push("/plan/create/planned-activity");
   
   // After
   import { ROUTES } from "@/lib/constants/routes";
   router.push(ROUTES.PLAN.SCHEDULE_ACTIVITY);
   ```

4. Test each navigation:
   - Plan index → Create plan
   - Plan index → Library
   - Plan index → Scheduled
   - Plan index → Training plan
   - Library → Schedule activity
   - Scheduled → Activity details

### Priority 3: Convert Library to Use Shared Components (1 hour)

**Goal**: Use `PlanCard` component instead of inline rendering

**File**: `plan/library/index.tsx`

**Current**: Lines 182-265 have inline card rendering

**Replace with**:
```typescript
import { PlanCard } from "@/components/plan";

// In render function:
{plans.map((plan) => (
  <PlanCard
    key={plan.id}
    plan={{
      id: plan.id,
      name: plan.name,
      description: plan.description,
      activityType: plan.activity_type,
      estimatedDuration: plan.estimated_duration,
      estimatedTss: plan.estimated_tss,
      stepCount: plan.structure?.steps?.length || 0,
      isOwned: !!plan.profile_id,
    }}
    onPress={handlePlanTap}
    onSchedule={scheduleIntent ? handleSchedulePlan : undefined}
    showScheduleButton={scheduleIntent}
  />
))}
```

**Benefits**:
- Removes ~80 lines of code
- Consistent styling
- Easier to maintain

### Priority 4: Convert Scheduled Screen to Use Shared Components (1 hour)

**Goal**: Use `ActivityCard` component instead of inline rendering

**File**: `plan/scheduled/index.tsx`

**Current**: Lines 95-175 have inline card rendering

**Replace with**:
```typescript
import { ActivityCard } from "@/components/plan";

const renderActivityCard = (activity: any) => {
  return (
    <ActivityCard
      key={activity.id}
      activity={{
        id: activity.id,
        name: activity.activity_plan?.name || "Unnamed Activity",
        activityType: activity.activity_plan?.activity_type || "other",
        duration: activity.activity_plan?.estimated_duration || 0,
        tss: activity.activity_plan?.estimated_tss || 0,
        scheduledDate: activity.scheduled_date,
        notes: activity.notes,
        status: "scheduled",
      }}
      onPress={handleActivityTap}
      showDate={true}
    />
  );
};
```

## Medium-Term Goals (Next Week) 📅

### Phase 2: Complete Routing Refactor (4-6 hours)

1. **Remove Modal Presentations** (1 hour)
   - Update `plan/_layout.tsx` to remove `presentation: "modal"`
   - Test navigation flow still works
   - Verify back button behavior

2. **Create Plan Detail Screen** (2 hours)
   - Create `plan/[plan_id].tsx` for plan details
   - Replace `PlanDetailModal` usage with route navigation
   - Add deep linking support
   - Test: Can navigate to plan from library, scheduled, etc.

3. **Create Activity Detail Screen** (1 hour)
   - Create `plan/scheduled/[activity_id].tsx` for activity details
   - Replace `PlannedActivityDetailModal` usage
   - Test: Can navigate to activity from calendar, scheduled list

4. **Cleanup** (1 hour)
   - Delete `plan/components/modals/PlanDetailModal.tsx`
   - Delete `plan/components/modals/PlannedActivityDetailModal.tsx`
   - Verify nothing else uses these files
   - Test entire flow end-to-end

### Phase 3: Training Plan Integration (3-4 hours)

1. **Update Calendar to Use ActivityCard** (1 hour)
   - Replace custom activity rendering in calendar
   - Use shared `ActivityCard` component
   - Test: Activities render correctly in calendar view

2. **Fix Constraint Validation** (2 hours)
   - Ensure `validateConstraints` is called before scheduling
   - Show warnings/violations in UI
   - Prevent scheduling if violations exist
   - Test: Can't schedule activities that violate training plan rules

3. **Add Activity Status Indicators** (1 hour)
   - Show warnings/violations in calendar
   - Use status colors from `ActivityCard`
   - Test: Visual feedback for constraint issues

## Long-Term Improvements (Later) 🔮

### Better Form State Management
- Consider using React Hook Form for complex forms
- Add field-level validation feedback
- Implement auto-save drafts

### Offline Support
- Cache plans/activities locally
- Queue mutations when offline
- Sync when back online

### Enhanced UX
- Add loading skeletons instead of spinners
- Implement optimistic updates
- Add pull-to-refresh on all lists

### Testing
- Add unit tests for form hooks
- Add integration tests for navigation flows
- Add E2E tests for critical paths

## Quick Reference: Where Everything Is

```
apps/mobile/
├── lib/
│   ├── constants/
│   │   ├── activities.ts         ← Activity configs (USE THIS)
│   │   └── routes.ts             ← TODO: Create route constants
│   ├── utils/
│   │   └── dates.ts              ← Date formatting (USE THIS)
│   └── hooks/
│       ├── forms/
│       │   ├── useActivityPlanForm.ts      ← Plan creation (DONE)
│       │   └── usePlannedActivityForm.ts   ← TODO: Scheduling
│       └── mutations/
│           ├── useSaveActivityPlan.ts      ← TODO: Extract from hook
│           └── useScheduleActivity.ts      ← TODO: Create this
├── components/
│   └── plan/
│       ├── ActivityCard.tsx      ← Reusable activity card (USE THIS)
│       ├── PlanCard.tsx          ← Reusable plan card (USE THIS)
│       └── index.ts              ← Barrel exports
└── app/(internal)/(tabs)/plan/
    ├── index.tsx                 ← Main hub (FIXED ✅)
    ├── _layout.tsx               ← Stack config (NEEDS UPDATE)
    ├── library/
    │   └── index.tsx             ← Browse plans (USE PlanCard)
    ├── scheduled/
    │   └── index.tsx             ← Scheduled activities (USE ActivityCard)
    ├── create_activity_plan/
    │   └── index.tsx             ← Create plan (FIXED ✅)
    ├── create_planned_activity/
    │   └── index.tsx             ← Schedule activity (NEEDS UPDATE)
    └── training-plan/
        ├── index.tsx             ← Training plan overview
        └── calendar.tsx          ← Weekly calendar (NEEDS UPDATE)
```

## Testing Checklist

After each change, test these flows:

### Flow 1: Create → Library → Schedule → Calendar
1. ✅ Click "Create Activity Plan" from main screen
2. ✅ Fill in details and save
3. ✅ Verify plan appears in library
4. ⚠️ Click plan in library → modal appears (should be route)
5. ⚠️ Click "Schedule" → form opens
6. ⚠️ Fill in date and save
7. ❌ Go to training plan calendar
8. ❌ Verify activity appears on correct day ← **BROKEN**

### Flow 2: Schedule Directly
1. ✅ Click "Schedule from Library" on main screen
2. ⚠️ Library opens in schedule mode (modal)
3. ⚠️ Select a plan
4. ⚠️ Fill in schedule details
5. ⚠️ Save
6. ❌ Verify appears in calendar ← **BROKEN**

### Flow 3: View Scheduled Activities
1. ⚠️ Click "View All Scheduled" on main screen
2. ⚠️ See list of scheduled activities
3. ⚠️ Click an activity → modal appears (should be route)
4. ⚠️ Can reschedule or delete
5. ⚠️ Changes reflect in calendar

Legend:
- ✅ Working correctly
- ⚠️ Works but needs improvement (modal vs route)
- ❌ Broken / not working

## Getting Help

### Common Issues

**Issue**: "Module not found: @/lib/constants/activities"
**Fix**: Make sure you're importing from the correct path. Try rebuilding: `pnpm clean && pnpm dev`

**Issue**: "Type error in PlanCard props"
**Fix**: Check that you're passing all required props. See TypeScript definition in component file.

**Issue**: "Plans not saving to database"
**Fix**: Ensure `submit()` from `useActivityPlanForm` is called, not a custom handler.

**Issue**: "Navigation doesn't work after changes"
**Fix**: Check that path starts with `/(internal)/(tabs)/plan/`. Use route constants.

### Where to Look for Answers

1. **Routing issues**: Check `PLAN_TAB_REFACTOR.md` section on routing
2. **Component props**: Look at component file JSDoc comments
3. **Form handling**: Check `useActivityPlanForm.ts` implementation
4. **Date formatting**: See examples in `lib/utils/dates.ts`

## Summary

**You've completed**: Foundation work (shared utilities, components, form hooks)

**You need to do**:
1. Fix scheduling → calendar flow (add query invalidation)
2. Fix all router paths (use correct full paths)
3. Convert screens to use shared components (PlanCard, ActivityCard)
4. Create route constants for consistency

**Estimated time**: 6-8 hours for immediate priorities

**The app is much better now**! The hardest part (form handling and database saving) is done. The remaining work is mostly connecting things together and cleaning up navigation.

Start with Priority 1 (scheduling → calendar) as that's the most user-visible issue. Then tackle the routing fixes. The component conversion is nice-to-have and can be done incrementally.

Good luck! 🚀