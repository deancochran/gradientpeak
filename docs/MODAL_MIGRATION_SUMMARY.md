# Modal Migration Summary

## Overview
Successfully migrated all modals from the tabs router to dedicated pages outside the tabs group, improving navigation consistency and removing modal dependencies.

## Modals Migrated

### 1. PlanDetailModal → /activity-plan-detail
- **Location**: `apps/mobile/app/(internal)/activity-plan-detail.tsx`
- **Features**: 
  - Fetches plan from database using planId
  - Shows activity plan structure, stats (duration, TSS, IF)
  - Actions: Follow Along, Record, Schedule, Duplicate, Share
  - Uses v2 schema with intervals

### 2. PlannedActivityDetailModal → /scheduled-activities/[activity_uuid]
- **Location**: `apps/mobile/app/(internal)/scheduled-activities/[activity_uuid]/index.tsx`
- **Features**:
  - Shows scheduled activity details
  - Activity type badge, schedule info, plan details
  - Actions: Start Activity, Reschedule, Delete
  - Shows completion status

### 3. ScheduleActivityModal → /schedule-activity
- **Location**: `apps/mobile/app/(internal)/schedule-activity/index.tsx`
- **Features**:
  - Form to schedule activities to calendar
  - Plan selector, date picker, notes field
  - Supports preselectedDate and preselectedPlanId params
  - Edit mode for rescheduling

### 4. PlanDetailsModal → /training-plan
- **Location**: `apps/mobile/app/(internal)/training-plan/index.tsx`
- **Features**:
  - Training plan overview with CTL/ATL/TSB metrics
  - Weekly progress card
  - Upcoming activities
  - Plan progress tracker
  - Links to calendar and trends

### 5. AllActivitiesCalendarModal → /scheduled-activities
- **Location**: `apps/mobile/app/(internal)/scheduled-activities/index.tsx`
- **Features**:
  - List all scheduled activities
  - Activity count display
  - Empty state with action to browse library
  - Grouped by date

## Pages Updated

### 1. plan/index.tsx
- **Changes**:
  - Removed modal state management
  - Replaced modal triggers with `router.push()`
  - Navigates to `/scheduled-activities/[id]` for activity details
  - Navigates to `/schedule-activity` with preselected date

### 2. plan-library/index.tsx
- **Changes**:
  - Removed PlanDetailModal import and state
  - Replaced modal trigger with navigation to `/activity-plan-detail`
  - Passes planId as param

### 3. scheduled-activities/index.tsx
- **Changes**:
  - Removed PlannedActivityDetailModal usage
  - Navigates to `/scheduled-activities/[id]` instead

## Files Deleted
- `apps/mobile/app/(internal)/(tabs)/plan/components/modals/PlanDetailModal.tsx`
- `apps/mobile/app/(internal)/(tabs)/plan/components/modals/PlannedActivityDetailModal.tsx`
- `apps/mobile/app/(internal)/(tabs)/plan/components/modals/ScheduleActivityModal.tsx`
- `apps/mobile/app/(internal)/(tabs)/plan/components/modals/PlanDetailsModal.tsx`
- `apps/mobile/app/(internal)/(tabs)/plan/components/modals/AllActivitiesCalendarModal.tsx`
- Directory: `apps/mobile/app/(internal)/(tabs)/plan/components/modals/`

## Layout Fixes

### Fixed Double Header Issue
Updated `(internal)/_layout.tsx` to set `headerShown: false` for all sections with their own Stack layouts:
- activities
- routes  
- create-activity-plan
- plan-library
- schedule-activity
- scheduled-activities
- training-plan
- settings

This prevents double headers when navigating from one section to another (e.g., settings → activities).

### Updated plan/_layout.tsx
- Removed Stack.Screen definitions for deleted modal files
- Updated documentation to reflect new page-based architecture

## Benefits
1. **Better UX**: Consistent navigation with browser-like back button behavior
2. **Deep Linking**: All content is now URL-addressable
3. **Cleaner Code**: No modal state management needed
4. **Single Headers**: Fixed double header stacking issue
5. **Better Performance**: Pages can be cached and preloaded
6. **SEO Ready**: All pages have proper URLs (if web support is added)

## Testing Checklist
- [ ] Navigate from plan page to activity details
- [ ] Schedule activity from plan page with date pre-selected
- [ ] View activity plan details from library
- [ ] Navigate from settings to activities (verify single header)
- [ ] Navigate from settings sub-page back to settings, then to activities
- [ ] Delete scheduled activity from detail page
- [ ] Reschedule activity from detail page
- [ ] View training plan overview
- [ ] Navigate between all sections and verify no double headers
