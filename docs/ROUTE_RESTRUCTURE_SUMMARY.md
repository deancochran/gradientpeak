# Route Restructure Summary

## Overview
Moved plan sub-pages from `(tabs)/plan/` to `(internal)/` root level for global accessibility throughout the app.

## Directory Changes

### Moved Directories
| Old Path | New Path | Purpose |
|----------|----------|---------|
| `(tabs)/plan/create_activity_plan/` | `(internal)/create-activity-plan/` | Activity plan builder workflow |
| `(tabs)/plan/create_planned_activity/` | `(internal)/schedule-activity/` | Schedule activity to calendar |
| `(tabs)/plan/library/` | `(internal)/plan-library/` | Browse and manage activity plans |
| `(tabs)/plan/training-plan/` | `(internal)/training-plan/` | Training plan overview & settings |
| `(tabs)/plan/planned_activities/` | `(internal)/scheduled-activities/` | View all scheduled activities |

### Unchanged
- `(tabs)/plan/index.tsx` - Main plan dashboard (calendar view)
- `(tabs)/plan/components/` - Shared components and modals
- `(tabs)/plan/utils/` - Utility functions

## Route Updates

### Updated in `lib/constants/routes.ts`
```typescript
PLAN: {
  INDEX: "/plan",
  CREATE: "/create-activity-plan",           // was: /plan/create_activity_plan
  LIBRARY: "/plan-library",                  // was: /plan/library
  SCHEDULED: "/scheduled-activities",        // was: /plan/planned_activities
  SCHEDULE_ACTIVITY: "/schedule-activity",   // was: /plan/create_planned_activity
  
  TRAINING_PLAN: {
    INDEX: "/training-plan",                 // was: /plan/training-plan
    CREATE: "/training-plan/create",
    SETTINGS: "/training-plan/settings",
  },
  
  CREATE_ACTIVITY_PLAN: {
    INDEX: "/create-activity-plan",
    STRUCTURE: "/create-activity-plan/structure",
    REPEAT: "/create-activity-plan/structure/repeat",
  },
}
```

## Files Modified

### Layout Files
1. **`(internal)/_layout.tsx`**
   - Added Stack.Screen entries for all moved pages
   - Updated documentation comments

2. **`(tabs)/plan/_layout.tsx`**
   - Removed Stack.Screen entries for moved pages
   - Simplified to only include index and modals

### Route References Updated
1. **`scheduled-activities/index.tsx`**
   - Updated: `/plan/library` → `/plan-library`
   - Fixed imports for ActivityList and PlannedActivityDetailModal

2. **`plan-library/index.tsx`**
   - Updated: `/plan/create_activity_plan` → `/create-activity-plan`
   - Fixed import for PlanDetailModal

3. **`schedule-activity/index.tsx`**
   - Updated: `/plan/create_activity_plan` → `/create-activity-plan`

## Benefits

✅ **Universal Access** - Pages can be opened from any tab or context
✅ **Cleaner URLs** - Simpler, more semantic paths
✅ **Better Navigation** - Stack-based navigation works naturally
✅ **Improved Deep Linking** - Easier to link from notifications/sharing
✅ **Consistent Patterns** - Matches other global pages like `/record`
✅ **Modal Behavior** - Full-screen card presentation for workflows

## Testing Checklist

- [x] TypeScript compilation passes
- [x] All route constants updated
- [x] All hardcoded route strings updated
- [x] Layout files properly configured
- [x] Import paths corrected for shared components
- [ ] Runtime navigation testing (manual)
- [ ] Deep link testing (manual)
- [ ] Back navigation flows (manual)

## Navigation Flow Examples

### Creating an Activity Plan
1. From any tab → `/create-activity-plan`
2. User builds plan structure
3. Back returns to previous screen (not locked to plan tab)

### Scheduling an Activity
1. From home/plan/discover → `/schedule-activity`
2. Select plan and date
3. Creates scheduled activity
4. Back returns to origin

### Browsing Library
1. From any context → `/plan-library`
2. Browse/filter plans
3. Tap plan → Modal opens
4. Schedule from modal → `/schedule-activity`

## Notes

- All shared components remain in `(tabs)/plan/components/`
- Modals are still part of plan tab for now
- Consider moving shared components to `@/components/` in future refactor
- Dynamic routes for activity details updated to use new paths
