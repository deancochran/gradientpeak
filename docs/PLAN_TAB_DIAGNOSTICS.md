# Plan Tab Diagnostics & Troubleshooting Guide

## Quick Diagnosis: What's Actually Broken? 🔍

Run through this checklist to understand the current state of your plan tab.

---

## Test 1: Can You Create a Plan?

### Steps:
1. Open app → Go to Plan tab
2. Click "Create Activity Plan" button
3. Fill in name: "Test Run"
4. Select activity type: "Outdoor Run"
5. Click "Save" (without adding structure)

### Expected Results:
- ✅ Should show "Success" alert
- ✅ Should navigate back to Plan tab
- ✅ Plan should appear in library when you click "Browse Activity Library"

### If It Fails:
- Check console for errors
- Verify tRPC connection is working
- Check that `useActivityPlanForm` hook is imported correctly
- Look at network tab - is the mutation being called?

### Status: **SHOULD BE WORKING** ✅

---

## Test 2: Does the Created Plan Appear in Library?

### Steps:
1. After creating a plan (Test 1)
2. Click "Browse Activity Library"
3. Look in "My Plans" tab

### Expected Results:
- ✅ Your newly created plan should be visible
- ✅ Should show correct name and activity type
- ✅ Should show as "Yours" badge

### If It Fails:
- Check if mutation is invalidating queries
- Look in `useActivityPlanForm.ts` line 67-70
- Should call `await utils.activityPlans.list.invalidate()`
- Try manually refreshing the library screen

### Status: **SHOULD BE WORKING** ✅

---

## Test 3: Can You Schedule a Plan?

### Steps:
1. From Plan tab, click "Schedule from Library"
2. Click on any plan
3. Modal appears with plan details
4. Click "Schedule This Activity"
5. Select tomorrow's date
6. Click "Schedule" or "Create"

### Expected Results:
- ⚠️ Should schedule the activity
- ⚠️ Should show in "View All Scheduled"
- ❌ Should appear in training plan calendar

### If It Fails:
- Check `create_planned_activity/index.tsx`
- Verify mutation is being called
- Check network tab for API errors
- Look for console errors

### Known Issues:
- **Path might be wrong**: Line 61 in `scheduled/index.tsx` has wrong path
- **Query not invalidating**: Calendar queries aren't being refreshed
- **Modal instead of screen**: Using modal presentation breaks flow

### Status: **PARTIALLY WORKING** ⚠️

---

## Test 4: Do Scheduled Activities Show in Calendar?

### Steps:
1. Schedule an activity (Test 3)
2. Go back to Plan tab
3. Click "Training Plan"
4. Click "View Calendar"
5. Look for your scheduled activity

### Expected Results:
- ❌ Activity should appear on the scheduled day
- ❌ Should show activity name and details
- ❌ Should be able to click it for more info

### If It Fails (IT WILL):
**Root Cause**: Calendar queries aren't being invalidated after scheduling

**Fix Location**: `create_planned_activity/index.tsx` lines 106-113

**Current Code**:
```typescript
const createMutation = trpc.plannedActivities.create.useMutation({
  onSuccess: () => {
    Alert.alert("Success", "Activity scheduled!");
    router.back();
  },
  onError: (error) => {
    Alert.alert("Error", error.message || "Failed to schedule activity");
  },
});
```

**Should Be**:
```typescript
const createMutation = trpc.plannedActivities.create.useMutation({
  onSuccess: async () => {
    // Invalidate ALL related queries
    await utils.plannedActivities.list.invalidate();
    await utils.plannedActivities.listByWeek.invalidate();
    await utils.plannedActivities.getToday.invalidate();
    await utils.plannedActivities.getWeekCount.invalidate();
    await utils.trainingPlans.getCurrentStatus.invalidate();
    
    Alert.alert("Success", "Activity scheduled!");
    router.back();
  },
  onError: (error) => {
    Alert.alert("Error", error.message || "Failed to schedule activity");
  },
});
```

### Status: **BROKEN** ❌

---

## Test 5: Routing Paths

### Test 5a: Create Plan Button
**File**: `plan/index.tsx` line 48

**Test**: Click "Create Activity Plan" from main screen

**Expected**: Opens create plan form
**Actual**: Should work now (was going to "/" before)

**Status**: **FIXED** ✅

---

### Test 5b: Schedule New Button
**File**: `plan/scheduled/index.tsx` line 61

**Current Code**:
```typescript
const handleScheduleNew = () => {
  router.push("/plan/create/planned-activity"); // ❌ WRONG
};
```

**Should Be**:
```typescript
const handleScheduleNew = () => {
  router.push("/(internal)/(tabs)/plan/create_planned_activity"); // ✅ CORRECT
};
```

**Test**: From scheduled screen, click FAB button

**Status**: **BROKEN** ❌

---

### Test 5c: Browse Library
**File**: `plan/index.tsx` line 52

**Current Code**:
```typescript
router.push("/(internal)/(tabs)/plan/library");
```

**Test**: Click "Browse Activity Library"

**Expected**: Opens library
**Actual**: Should work but opens as modal (not ideal)

**Status**: **WORKS BUT MODAL** ⚠️

---

## Test 6: Modal vs. Routes

### Current Setup (NOT IDEAL):
```typescript
// In plan/_layout.tsx
<Stack.Screen name="library/index" options={{ presentation: "modal" }} />
<Stack.Screen name="planned_activities/index" options={{ presentation: "modal" }} />
<Stack.Screen name="create_planned_activity/index" options={{ presentation: "modal" }} />
```

### Problems:
- ❌ No back button (dismisses instead)
- ❌ Can't deep link to these screens
- ❌ Browser back button doesn't work
- ❌ Harder to track navigation history

### Better Approach:
```typescript
// Remove presentation: "modal" from all three
<Stack.Screen name="library/index" options={{ title: "Activity Library" }} />
<Stack.Screen name="planned_activities/index" options={{ title: "Scheduled" }} />
<Stack.Screen name="create_planned_activity/index" options={{ title: "Schedule Activity" }} />
```

### Status: **NEEDS IMPROVEMENT** ⚠️

---

## Test 7: Shared Components

### Test 7a: Are PlanCards Being Used?

**File to Check**: `plan/library/index.tsx` line 182-265

**Current**: Custom inline rendering (lots of code)
**Should**: Import and use `<PlanCard>` component

**How to Test**:
1. Search file for "import { PlanCard }" - if not found, needs update
2. Look for ~80 lines of card rendering code - if present, needs refactor

**Status**: **NOT USING SHARED COMPONENT** ❌

---

### Test 7b: Are ActivityCards Being Used?

**Files to Check**:
- `plan/scheduled/index.tsx`
- `plan/training-plan/calendar.tsx`

**Current**: Custom inline rendering in both
**Should**: Import and use `<ActivityCard>` component

**Status**: **NOT USING SHARED COMPONENT** ❌

---

## Test 8: Date Formatting Consistency

### Test:
1. Look at scheduled activities list
2. Look at calendar view
3. Look at plan details

**Expected**: Same date format everywhere
**Reality**: Might have inconsistent formats

**Check For**:
- Some show "Tomorrow", others show "Tue, Jan 16"
- Time formats differ (12hr vs 24hr)
- Duration formats inconsistent

**How to Fix**: Use utilities from `lib/utils/dates.ts` everywhere

**Files That Need Updates**:
- `plan/scheduled/index.tsx` - has custom `formatDate` function (lines 61-125)
- `plan/training-plan/calendar.tsx` - might have custom formatting
- `plan/create_planned_activity/index.tsx` - has custom formatting (lines 228-245)

**Status**: **INCONSISTENT** ⚠️

---

## Quick Fix Priority List

### 🔴 CRITICAL (Do First)
1. **Fix calendar not showing scheduled activities**
   - File: `plan/create_planned_activity/index.tsx`
   - Add query invalidation to mutation
   - Estimated time: 15 minutes

2. **Fix schedule button path**
   - File: `plan/scheduled/index.tsx` line 61
   - Change path to correct one
   - Estimated time: 5 minutes

### 🟡 IMPORTANT (Do Soon)
3. **Use PlanCard in library**
   - File: `plan/library/index.tsx`
   - Replace lines 182-265 with `<PlanCard>`
   - Estimated time: 30 minutes

4. **Use ActivityCard in scheduled**
   - File: `plan/scheduled/index.tsx`
   - Replace custom rendering with `<ActivityCard>`
   - Estimated time: 30 minutes

5. **Create route constants**
   - Create: `lib/constants/routes.ts`
   - Update all `router.push()` calls
   - Estimated time: 1 hour

### 🟢 NICE TO HAVE (Do Later)
6. **Remove modal presentations**
   - File: `plan/_layout.tsx`
   - Remove `presentation: "modal"` from screens
   - Test navigation still works
   - Estimated time: 30 minutes

7. **Create plan detail route**
   - Create: `plan/[plan_id].tsx`
   - Replace `PlanDetailModal` component
   - Estimated time: 2 hours

8. **Use shared date utilities everywhere**
   - Search for custom date formatting
   - Replace with `lib/utils/dates.ts` functions
   - Estimated time: 1 hour

---

## Verification Commands

### Check What Files Import What:

```bash
# See which files use PlanCard
cd apps/mobile/app/(internal)/(tabs)/plan
grep -r "PlanCard" .

# See which files use ActivityCard  
grep -r "ActivityCard" .

# See which files import shared utilities
grep -r "@/lib/constants/activities" .
grep -r "@/lib/utils/dates" .

# Find all router.push calls
grep -r "router.push" .

# Find custom date formatting
grep -r "formatDate\|formatTime" .
```

### Check Database State:

```sql
-- See if plans are being created
SELECT id, name, activity_type, created_at 
FROM activity_plans 
ORDER BY created_at DESC 
LIMIT 10;

-- See if activities are being scheduled
SELECT id, scheduled_date, created_at
FROM planned_activities
ORDER BY created_at DESC
LIMIT 10;
```

---

## Common Error Messages & Fixes

### "Cannot find module '@/lib/constants/activities'"
**Cause**: Import path is wrong or file doesn't exist
**Fix**: Verify file exists at `apps/mobile/lib/constants/activities.ts`

### "Type 'X' is not assignable to type 'PlanCardData'"
**Cause**: Missing or wrong props passed to PlanCard
**Fix**: Check component file for required props, add missing ones

### "Cannot read property 'steps' of undefined"
**Cause**: Plan structure is null/undefined
**Fix**: Add optional chaining: `plan.structure?.steps?.length || 0`

### "Navigation action failed: Cannot navigate to route X"
**Cause**: Route doesn't exist in Stack navigator
**Fix**: Check `_layout.tsx` has Stack.Screen for that route

### "Mutation error: duplicate key value"
**Cause**: Trying to create duplicate record
**Fix**: Check if record already exists before creating

---

## Environment Check

Before starting fixes, verify:

- [ ] Node version 18+ (`node --version`)
- [ ] pnpm installed (`pnpm --version`)
- [ ] Dependencies installed (`pnpm install`)
- [ ] Supabase running (check .env variables)
- [ ] tRPC server responding (check network tab)
- [ ] No TypeScript errors (`pnpm typecheck`)

---

## Success Criteria

When everything is working, you should be able to:

1. ✅ Create a plan and see it in library immediately
2. ✅ Schedule a plan from library
3. ✅ See scheduled activity in "View All Scheduled"
4. ✅ See scheduled activity in training plan calendar
5. ✅ Click activity in calendar to see details
6. ✅ Reschedule or delete activity
7. ✅ Changes reflect immediately everywhere
8. ✅ All dates formatted consistently
9. ✅ Navigation works with back button
10. ✅ No broken paths or 404 errors

---

## Getting Unstuck

If you're stuck on any of these issues:

1. **Check the console** - Most errors are logged there
2. **Check the network tab** - See if API calls are failing
3. **Read the file comments** - Code has helpful JSDoc comments
4. **Check this diagnostic** - Use as a troubleshooting guide
5. **Start fresh** - Sometimes a restart helps: `pnpm clean && pnpm dev`

Remember: The foundation is solid now. Most remaining issues are just connecting things together and using the shared components/utilities we've created.

Good luck! 🚀