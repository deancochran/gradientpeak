# Plan Tab Refactoring - Analysis & Implementation Plan

## Executive Summary

The plan tab has grown organically and now suffers from:
1. Overuse of modals where nested screens should be used
2. Inconsistent routing patterns and broken navigation paths
3. Duplicate code and scattered validation logic
4. Poor integration between plan creation, scheduling, and calendar views
5. Created plans not appearing in the scheduling/calendar views

This document outlines a systematic refactoring to simplify routing, consolidate form logic, and ensure proper data flow throughout the plan management workflow.

---

## Current Issues

### 1. Routing Problems

**Issue**: Overuse of `presentation: "modal"`
- `library/index` - Should be a regular screen, not modal
- `planned_activities/index` - Should be a regular screen, not modal  
- `create_planned_activity/index` - Should be a regular screen or use route params

**Issue**: Incorrect/inconsistent paths
```typescript
// In plan/index.tsx - line 44
handleCreatePlan = () => {
  router.push("/"); // ❌ Goes to root instead of create screen
}

// In scheduled/index.tsx - line 61
handleScheduleNew = () => {
  router.push("/plan/create/planned-activity"); // ❌ Wrong path
}
```

**Issue**: No proper detail screens
- Plan details shown in custom modal component instead of routed screen
- Activity details shown in custom modal instead of routed screen
- Makes deep linking and navigation history broken

### 2. Form Submission Complexity

**Issue**: Inconsistent state management
- Activity plan creation uses Zustand store (global state)
- Planned activity scheduling uses local useState (component state)
- No unified validation approach

**Issue**: Direct mutation calls without abstraction
```typescript
// Repeated pattern in multiple components
const createMutation = trpc.plannedActivities.create.useMutation({
  onSuccess: () => { /* inline handler */ },
  onError: (error) => { /* inline error handling */ }
});
```

**Issue**: Form validation scattered
- Zod schemas defined inline in components
- Validation logic duplicated
- Error state management inconsistent

### 3. Code Duplication

**Issue**: ACTIVITY_CONFIGS repeated in 4+ files
```typescript
// Found in: library/index.tsx, scheduled/index.tsx, create_planned_activity/index.tsx
const ACTIVITY_CONFIGS = {
  outdoor_run: { name: "Outdoor Run", icon: Footprints, color: "text-blue-600" },
  // ... repeated everywhere
}
```

**Issue**: Similar card rendering across screens
- PlanCard logic duplicated in library and other screens
- ActivityCard logic duplicated in scheduled and calendar views
- No shared components for common UI patterns

**Issue**: Date formatting utilities duplicated
```typescript
// Different implementations in scheduled/index.tsx and calendar.tsx
const formatDate = (dateString: string) => { /* ... */ }
const formatTime = (dateString: string) => { /* ... */ }
```

### 4. Data Flow & Integration Issues

**Issue**: Created plans don't appear in scheduling flow
- Activity plan creation doesn't properly save to database
- No mutation return value handling
- No cache invalidation after creation
- Navigation doesn't pass created plan ID

**Issue**: Disconnected training plan calendar
- Calendar shows planned activities but not from plan library
- No clear flow: create plan → schedule activity → view in calendar
- Training plan constraints validation not integrated

**Issue**: Modal-based detail views break flow
- User clicks plan → modal opens
- User wants to schedule → modal closes, new modal opens
- Loses context and navigation history

---

## Proposed Solution

### Phase 1: Fix Routing Structure

#### New Route Structure
```
(tabs)/plan/
├── _layout.tsx                    # Stack navigator
├── index.tsx                      # Hub screen
├── library.tsx                    # Browse plans (regular screen)
├── scheduled.tsx                  # View scheduled activities (regular screen)
├── create.tsx                     # Create activity plan (regular screen)
├── [plan_id].tsx                  # Plan detail view (regular screen)
├── schedule.tsx                   # Schedule activity form (regular screen)
└── training-plan/
    ├── _layout.tsx                # Nested stack
    ├── index.tsx                  # Training plan overview
    ├── calendar.tsx               # Weekly calendar view
    ├── create.tsx                 # Training plan wizard
    └── settings.tsx               # Training plan settings
```

#### Benefits
- Proper navigation stack and back button behavior
- Deep linking support (e.g., `/plan/abc-123` for plan details)
- Browser history works correctly
- No more modal state management complexity
- Easier to implement page transitions

#### Migration Strategy
```typescript
// OLD: Modal-based
<Stack.Screen name="library/index" options={{ presentation: "modal" }} />

// NEW: Regular screen
<Stack.Screen name="library" options={{ title: "Activity Library" }} />

// OLD: Custom modal component
<PlanDetailModal planId={id} isVisible={visible} onClose={onClose} />

// NEW: Route-based
router.push(`/plan/${planId}`)
```

### Phase 2: Simplify Form Handling

#### Create Unified Form Hooks

**1. useActivityPlanForm**
```typescript
// File: lib/hooks/forms/useActivityPlanForm.ts
export function useActivityPlanForm(planId?: string) {
  // Handles form state, validation, submission
  // Integrates with tRPC mutations
  // Returns: { form, submit, isSubmitting, errors }
}
```

**2. usePlannedActivityForm**
```typescript
// File: lib/hooks/forms/usePlannedActivityForm.ts
export function usePlannedActivityForm(activityId?: string) {
  // Handles scheduling form state
  // Integrates constraint validation
  // Returns: { form, submit, validate, isSubmitting, errors, constraints }
}
```

#### Abstract Mutation Logic

**1. useSaveActivityPlan**
```typescript
// File: lib/hooks/mutations/useSaveActivityPlan.ts
export function useSaveActivityPlan() {
  // Wraps create/update mutations
  // Handles success/error states
  // Invalidates relevant queries
  // Returns: { save, isLoading, error }
}
```

**2. useScheduleActivity**
```typescript
// File: lib/hooks/mutations/useScheduleActivity.ts
export function useScheduleActivity() {
  // Wraps schedule/reschedule mutations
  // Handles constraint validation
  // Invalidates calendar queries
  // Returns: { schedule, isLoading, error, constraints }
}
```

### Phase 3: Create Shared Components

#### Component Library
```
components/plan/
├── ActivityCard.tsx               # Reusable activity card
├── PlanCard.tsx                   # Reusable plan card
├── ActivityTypeIcon.tsx           # Activity type with icon
├── DateTimeSelector.tsx           # Date/time picker
├── PlanSelector.tsx               # Plan selection dropdown
├── ConstraintIndicator.tsx        # TSS/constraint warnings
└── index.ts                       # Barrel export
```

#### Shared Constants
```typescript
// File: lib/constants/activities.ts
export const ACTIVITY_CONFIGS = { /* ... */ }
export const ACTIVITY_TYPE_OPTIONS = [ /* ... */ ]

// File: lib/utils/dates.ts
export function formatDate(date: Date | string): string { /* ... */ }
export function formatTime(date: Date | string): string { /* ... */ }
export function formatDuration(minutes: number): string { /* ... */ }
```

### Phase 4: Fix Data Flow

#### Ensure Plan Creation Works
```typescript
// In create.tsx (new file)
const { save, isLoading } = useSaveActivityPlan();

const handleSubmit = async () => {
  const result = await save(planData);
  if (result) {
    // Navigate to the created plan
    router.push(`/plan/${result.id}`);
  }
};
```

#### Connect to Scheduling Flow
```typescript
// In [plan_id].tsx (new detail screen)
const handleSchedule = () => {
  router.push({
    pathname: '/plan/schedule',
    params: { planId: plan.id }
  });
};

// In schedule.tsx
const params = useLocalSearchParams();
const { planId } = params;
const { data: plan } = trpc.activityPlans.getById.useQuery({ id: planId });
```

#### Integrate with Calendar
```typescript
// In training-plan/calendar.tsx
const { data: activities } = trpc.plannedActivities.listByWeek.useQuery({
  weekStart,
  weekEnd
});

// Activities now include the full activity_plan relationship
{activities.map(activity => (
  <ActivityCard 
    key={activity.id}
    activity={activity}
    onPress={() => router.push(`/plan/scheduled/${activity.id}`)}
  />
))}
```

---

## Implementation Checklist

### Step 1: Routing Refactor
- [ ] Create new flat route files (library.tsx, scheduled.tsx, create.tsx)
- [ ] Create [plan_id].tsx for plan details
- [ ] Create schedule.tsx for scheduling form
- [ ] Update _layout.tsx to remove modal presentations
- [ ] Remove custom modal components (PlanDetailModal, PlannedActivityDetailModal)
- [ ] Update all router.push calls to use new paths
- [ ] Test navigation flow end-to-end

### Step 2: Form Abstraction
- [ ] Create lib/hooks/forms/ directory
- [ ] Implement useActivityPlanForm hook
- [ ] Implement usePlannedActivityForm hook
- [ ] Create lib/hooks/mutations/ directory
- [ ] Implement useSaveActivityPlan hook
- [ ] Implement useScheduleActivity hook
- [ ] Update create.tsx to use new hooks
- [ ] Update schedule.tsx to use new hooks

### Step 3: Component Consolidation
- [ ] Create components/plan/ directory
- [ ] Extract ActivityCard component
- [ ] Extract PlanCard component
- [ ] Extract ActivityTypeIcon component
- [ ] Extract DateTimeSelector component
- [ ] Extract PlanSelector component
- [ ] Create lib/constants/activities.ts
- [ ] Create lib/utils/dates.ts
- [ ] Update all screens to use shared components

### Step 4: Database & API Fixes
- [ ] Verify activityPlans.create returns created plan
- [ ] Verify plannedActivities.create returns created activity
- [ ] Add proper query invalidation after mutations
- [ ] Test plan creation → scheduling → calendar flow
- [ ] Verify constraints validation works
- [ ] Add error logging and user feedback

### Step 5: Testing & Polish
- [ ] Test complete flow: create plan → view in library → schedule → view in calendar
- [ ] Test edit flow for existing plans
- [ ] Test rescheduling activities
- [ ] Test training plan integration
- [ ] Verify deep linking works
- [ ] Check error handling and loading states
- [ ] Test on iOS and Android
- [ ] Update any related documentation

---

## Key Files to Modify

### High Priority (Core Routing)
1. `plan/_layout.tsx` - Remove modal presentations
2. `plan/index.tsx` - Fix handleCreatePlan path
3. Create `plan/library.tsx` - Move from library/index.tsx
4. Create `plan/scheduled.tsx` - Move from scheduled/index.tsx
5. Create `plan/create.tsx` - Move from create_activity_plan/index.tsx
6. Create `plan/[plan_id].tsx` - New detail screen
7. Create `plan/schedule.tsx` - Move from create_planned_activity/index.tsx

### Medium Priority (Form Logic)
8. Create `lib/hooks/forms/useActivityPlanForm.ts`
9. Create `lib/hooks/forms/usePlannedActivityForm.ts`
10. Create `lib/hooks/mutations/useSaveActivityPlan.ts`
11. Create `lib/hooks/mutations/useScheduleActivity.ts`

### Lower Priority (Shared Code)
12. Create `lib/constants/activities.ts`
13. Create `lib/utils/dates.ts`
14. Create `components/plan/ActivityCard.tsx`
15. Create `components/plan/PlanCard.tsx`

### Cleanup
16. Delete `plan/components/modals/PlanDetailModal.tsx`
17. Delete `plan/components/modals/PlannedActivityDetailModal.tsx`
18. Delete `plan/library/` directory (after moving to library.tsx)
19. Delete `plan/scheduled/` directory (after moving to scheduled.tsx)
20. Delete `plan/create_activity_plan/` directory (after moving to create.tsx)
21. Delete `plan/create_planned_activity/` directory (after moving to schedule.tsx)

---

## Expected Outcomes

### User Experience Improvements
✅ Clear navigation with proper back button behavior
✅ Deep linking support for sharing plans
✅ Consistent UI patterns across all screens
✅ Faster screen transitions (no modal animations)
✅ Better error handling and user feedback

### Developer Experience Improvements
✅ Easier to understand routing structure
✅ Reusable form validation logic
✅ Shared components reduce duplication
✅ Consistent mutation patterns
✅ Better TypeScript types and inference
✅ Easier to test individual screens

### Technical Improvements
✅ Reduced bundle size (less duplicate code)
✅ Better code organization
✅ Proper separation of concerns
✅ Easier to maintain and extend
✅ Better performance (fewer re-renders)

---

## Migration Notes

### Breaking Changes
- Modal-based navigation will be replaced with stack navigation
- Custom modal components will be removed
- Some route paths will change

### Backward Compatibility
- No database schema changes required
- tRPC API remains unchanged
- Existing data fully compatible

### Rollout Strategy
1. Implement new routing alongside old (use feature flags if needed)
2. Test new flow thoroughly
3. Update all navigation calls atomically
4. Remove old modal components
5. Deploy and monitor for issues

---

## Questions to Resolve

1. **Training Plan Creation**: Should this also move away from modal-based wizard?
   - **Recommendation**: Yes, but keep wizard pattern with proper routes for each step
   
2. **Quick Actions**: Some actions (reschedule, delete) work well as dialogs/sheets
   - **Recommendation**: Use Dialog for confirmations, Sheet for quick forms
   
3. **Activity Recording**: How does "Start Now" integrate?
   - **Recommendation**: Keep as separate flow, passes plan data via params

4. **Library Intent**: Should library screen behave differently when in "schedule mode"?
   - **Recommendation**: Yes, but use query param `?mode=schedule` instead of separate modal

---

## Success Metrics

After refactoring, we should be able to:
- [ ] Create a plan and immediately see it in library
- [ ] Schedule a plan and see it in calendar
- [ ] Navigate back/forward through all screens naturally
- [ ] Deep link to any plan or scheduled activity
- [ ] Have <50% of current code duplication
- [ ] Reduce form-related code by ~40%
- [ ] All routing tests pass
- [ ] Zero broken navigation paths

---

## Timeline Estimate

- **Phase 1 (Routing)**: 4-6 hours
- **Phase 2 (Forms)**: 3-4 hours  
- **Phase 3 (Components)**: 2-3 hours
- **Phase 4 (Data Flow)**: 2-3 hours
- **Phase 5 (Testing)**: 2-3 hours

**Total**: 13-19 hours of focused development work

---

## Notes

This refactor prioritizes simplicity and maintainability over feature additions. The goal is to establish solid patterns that make future development easier and faster. Each phase can be completed and tested independently, allowing for incremental progress.