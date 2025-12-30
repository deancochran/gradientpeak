# Header Configuration Summary

## Architecture
The app uses a two-level Stack layout system to prevent double headers:

1. **Parent Layout** `(internal)/_layout.tsx` - Sets `headerShown: false` for all sections
2. **Child Layouts** - Each section manages its own headers with `headerShown: true`

## Pages with Headers (Outside Tabs)

### Activities
- `/activities/index` - "Activities" header with back button ✓
- `/activities/[activityId]` - "Activity Details" header with back button ✓

### Routes  
- `/routes/index` - "Routes" header with back button ✓
- `/routes/upload` - "Upload Route" header with back button (modal) ✓
- `/routes/[id]` - "Route Details" header with back button ✓

### Settings
- `/settings/index` - "Settings" header with back button ✓
- `/settings/integrations` - "Integrations" header with back button ✓
- `/settings/permissions` - "Permissions" header with back button ✓
- `/settings/profile-edit` - "Edit Profile" header with back button ✓

### Create Activity Plan
- `/create-activity-plan/index` - "Create Activity Plan" header with back button ✓
- `/create-activity-plan/structure/index` - "Edit Structure" header with back button ✓
- `/create-activity-plan/structure/repeat/index` - "Edit Repeat" header with back button ✓

### Plan Library
- `/plan-library/index` - "Activity Library" header with back button ✓

### Schedule Activity
- `/schedule-activity/index` - "Schedule Activity" header with back button ✓

### Scheduled Activities
- `/scheduled-activities/index` - "Scheduled Activities" header with back button ✓
- `/scheduled-activities/[activity_uuid]` - "Activity Details" header with back button ✓

### Training Plan
- `/training-plan/index` - "Training Plan" header with back button ✓
- `/training-plan/calendar` - "Calendar" header with back button ✓
- `/training-plan/settings` - "Training Plan Settings" header with back button ✓
- `/training-plan/create` - "Create Training Plan" header with back button (modal) ✓

### Activity Plan Detail
- `/activity-plan-detail` - "Activity Plan" header with back button ✓
  - Note: Defined in parent layout with `headerShown: true`

### Follow Along
- `/follow` - "Follow Along" header with back button ✓
  - Note: Defined in parent layout with `headerShown: true`

### Record
- `/record/index` - No header (recording screen) ✓
- `/record/sensors` - "Sensors" header with back button ✓
- `/record/submit` - No header (submission screen) ✓

## Result
✅ All pages outside tabs have proper headers with back buttons
✅ No double header stacking when navigating between sections
✅ Consistent navigation experience throughout the app
