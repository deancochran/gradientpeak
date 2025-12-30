# Settings & Library Tab Restructure Summary

## Overview
Moved settings page out of tabs to (internal) root for global access, replaced the settings tab with the plan-library, and created an application-wide header component with user avatar and contextual greetings.

## Key Changes

### 1. Settings Page Migration
**Moved:** `(tabs)/settings/` → `(internal)/settings/`

**Purpose:** Settings should be accessible from anywhere in the app, not just from a tab.

**Benefits:**
- ✅ Settings accessible via AppHeader user avatar
- ✅ Can be opened from any context in the app
- ✅ Frees up tab bar space for more important features
- ✅ Consistent with other global pages like `/record`, `/training-plan`

### 2. Tab Bar Restructure
**Before:**
```
Home | Discover | Record | Plan | Settings (Avatar)
```

**After:**
```
Home | Discover | Record | Plan | Library (Avatar)
```

**Rationale:**
- Library becomes the hub for activity plans, routes, and future content
- User avatar in Library tab provides visual continuity
- Settings moved to be accessed via avatar tap in AppHeader

### 3. New Application-Wide Header Component

**Created:** `components/shared/AppHeader.tsx`

**Features:**
- User avatar (clickable → navigates to settings)
- Contextual greeting based on time of day:
  - Morning (< 12pm): "Good morning, {username}"
  - Afternoon (12pm - 6pm): "Good afternoon, {username}"
  - Evening (> 6pm): "Good evening, {username}"
- Optional title override for specific screens
- Minimal, clean design
- Consistent across app (future-ready for other screens)

**Props:**
```typescript
interface AppHeaderProps {
  showGreeting?: boolean;  // Default: true
  title?: string;          // Optional override
}
```

**Usage:**
```tsx
// Home screen with greeting
<AppHeader showGreeting={true} />

// Other screens with custom title
<AppHeader title="Training Plan" />
```

## Files Modified

### Layout Files
1. **`(internal)/_layout.tsx`**
   - Added Stack.Screen for settings
   - Updated documentation

2. **`(tabs)/_layout.tsx`**
   - Replaced `settings` tab with `library` tab
   - Kept avatar icon with profile photo
   - Changed tab title from "Settings" to "Library"

3. **`(tabs)/library/index.tsx`** (new)
   - Re-export from `plan-library/index.tsx`
   - Allows tab routing to access global page

### Component Files
1. **`components/shared/AppHeader.tsx`** (new)
   - Reusable header with avatar and greeting
   - Time-based greeting logic
   - Settings navigation on avatar tap

2. **`components/shared/index.ts`**
   - Added AppHeader export

3. **`(tabs)/index.tsx`** (Home screen)
   - Removed inline header implementation
   - Uses new AppHeader component
   - Removed local getGreeting() function
   - Cleaner, more maintainable code

### Route References Updated
1. **`settings/index.tsx`**
   - Updated: `/(internal)/(tabs)/settings/integrations` → `/settings/integrations`
   - Updated: `/(internal)/(tabs)/settings/permissions` → `/settings/permissions`

2. **`record/index.tsx`**
   - Updated: `/(internal)/(tabs)/settings/permissions` → `/settings/permissions`

3. **`lib/constants/routes.ts`**
   - Added: `SETTINGS: "/settings"`
   - Added: `LIBRARY: "/(internal)/(tabs)/library"`

## Directory Structure

```
app/
  (internal)/
    (tabs)/
      index.tsx              # Home - uses AppHeader
      discover.tsx
      record-launcher.tsx
      plan/
        index.tsx            # Calendar view
      library/               # New tab (re-exports plan-library)
        index.tsx
    
    # Global pages
    settings/                # Moved here
      index.tsx
      integrations.tsx
      permissions.tsx
      profile-edit.tsx
      _layout.tsx
    
    plan-library/            # Global library page
    create-activity-plan/
    schedule-activity/
    training-plan/
    scheduled-activities/
```

## Navigation Flow

### Accessing Settings
1. **From Home:** Tap avatar in AppHeader → Opens settings
2. **From Library Tab:** Tap avatar in tab bar → Shows library content
3. **From any screen with AppHeader:** Tap avatar → Opens settings

### Library Tab Experience
1. User taps Library tab (shows their avatar)
2. Opens plan-library with full functionality:
   - Browse activity plans
   - Filter by type
   - View samples
   - Create new plans
   - Schedule activities

## Benefits

### User Experience
✅ **Cleaner Navigation** - Settings accessible from consistent location (avatar)
✅ **Contextual Greeting** - Personalized experience with time-based greetings
✅ **Library as Hub** - Future-ready for routes, activities, and more content
✅ **Visual Continuity** - Avatar appears in both AppHeader and Library tab

### Technical
✅ **Reusable Components** - AppHeader can be used across multiple screens
✅ **Better Architecture** - Settings not locked to tab navigation
✅ **Maintainable Code** - Greeting logic centralized in one component
✅ **Type Safety** - All TypeScript checks pass

## Future Enhancements

### Library Tab Evolution
The library tab is positioned to become the central hub for:
- 📋 Activity plans (current)
- 🗺️ Routes (planned)
- 🏃 Past activities history
- 📅 Events and races
- 🎯 Goals and targets
- 📊 Templates and presets

### AppHeader Extensions
The AppHeader component can be extended with:
- Notification bell icon
- Quick action buttons
- Status indicators (training readiness)
- Search functionality
- Dynamic content based on context

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Settings page moved successfully
- [x] Library tab displays plan-library content
- [x] AppHeader component created
- [x] Home screen uses AppHeader
- [x] Avatar click navigates to settings
- [x] All route references updated
- [ ] Runtime navigation testing (manual)
- [ ] Avatar image updates properly (manual)
- [ ] Greeting changes based on time (manual)

## Notes

- AppHeader currently only used in Home screen
- Can be added to other screens (discover, plan, library) as needed
- Settings sub-pages (integrations, permissions, profile-edit) remain in settings directory
- Library tab uses re-export pattern to access global plan-library page
