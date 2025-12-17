# Plan Navigation Improvements

## Issues Fixed

### 1. ✅ Tab Button Behavior - Return to Root
**Problem:** Tapping the Plan tab when already in a subpage didn't return to the root plan page.

**Solution:** Added custom `tabPress` listeners that detect if you're already in that tab and navigate to its root.

**Location:** `apps/mobile/app/(internal)/(tabs)/_layout.tsx`

**How it works:**
```typescript
const handleTabPress = (routeName: string) => {
  const currentTab = pathname.split('/')[1];
  
  if (currentTab === routeName) {
    // Already in this tab - navigate to its root
    router.push(`/${routeName}` as any);
  }
};
```

**Result:** 
- Tapping "Plan" tab from `/plan/training-plan/calendar` → navigates to `/plan`
- Tapping "Plan" tab from `/plan/create_activity_plan/structure` → navigates to `/plan`
- Works for all tabs (Home, Plan, Record, Trends, Settings)

---

### 2. ✅ Swipe Gestures Enabled
**Problem:** Some pages didn't support swipe-to-go-back gestures.

**Solution:** Ensured all Stack navigators have consistent gesture configuration.

**Layouts verified:**
- ✅ `plan/training-plan/_layout.tsx` - Gestures enabled
- ✅ `plan/create_activity_plan/_layout.tsx` - Gestures enabled
- ✅ `plan/create_planned_activity/_layout.tsx` - Gestures enabled
- ✅ `plan/library/_layout.tsx` - Gestures enabled
- ✅ `plan/planned_activities/_layout.tsx` - Gestures enabled
- ✅ `plan/scheduled/_layout.tsx` - Gestures enabled

**Configuration:**
```typescript
<Stack
  screenOptions={{
    gestureEnabled: true,
    gestureDirection: "horizontal",
    animation: "slide_from_right",
  }}
>
```

**Result:** All pages now support swipe-from-left-edge to go back.

---

### 3. ✅ Consistent Transitions
**Problem:** Inconsistent navigation animations across pages.

**Solution:** Standardized all Stack navigators to use `slide_from_right` animation.

**Configuration:**
```typescript
screenOptions={{
  animation: "slide_from_right",
  gestureEnabled: true,
  gestureDirection: "horizontal",
}}
```

**Result:** Smooth, consistent slide transitions throughout the Plan section.

---

## Navigation Structure

### Root Layout: `plan/_layout.tsx`
```
Uses: Slot (not Stack)
Why: No back button needed at root level
```

### Sub-sections with Stack Navigation:

#### Training Plan
```
/plan/training-plan/
├── index (main)
├── calendar
├── settings
└── create (modal)
```

#### Activity Plans
```
/plan/create_activity_plan/
├── index (create form)
├── structure/index (edit structure)
└── structure/repeat/index (edit repeat)
```

#### Library
```
/plan/library/
└── index
```

#### Scheduled Activities
```
/plan/scheduled/
└── index
```

#### Planned Activities
```
/plan/planned_activities/
├── index
└── [activity_uuid]/index
```

#### Create/Schedule Activity
```
/plan/create_planned_activity/
└── index
```

---

## User Experience Improvements

### Before
❌ Tapping Plan tab while in subpage → No action
❌ Some pages lacked swipe gestures
❌ Inconsistent animations
❌ Users felt "trapped" in subpages

### After
✅ Tapping Plan tab → Returns to root plan page
✅ All pages support swipe-to-go-back
✅ Consistent slide animations
✅ Easy navigation throughout

---

## Navigation Patterns

### To Return to Plan Root:
1. **Swipe from left edge** (works on all subpages)
2. **Tap Plan tab** (when already in plan section)
3. **Tap back button** in header (where available)

### To Navigate Between Sections:
1. **Use tab bar** for main sections
2. **Cards/buttons** within pages for deeper navigation
3. **Modals** for contextual actions (create training plan)

---

## Testing Checklist

- [x] Tap Plan tab from Plan root → Stays on Plan root
- [x] Tap Plan tab from `/plan/training-plan/calendar` → Returns to Plan root
- [x] Tap Plan tab from `/plan/create_activity_plan/structure` → Returns to Plan root
- [x] Swipe from Training Plan Calendar → Returns to Training Plan index
- [x] Swipe from Activity Plan Structure editor → Returns to Activity Plan form
- [x] Swipe from Repeat editor → Returns to Structure editor
- [x] All transitions use slide animation
- [x] No pages feel "trapped" without navigation options

---

## Technical Details

### Tab Press Handler
```typescript
// In _layout.tsx
const handleTabPress = (routeName: string) => {
  const currentTab = pathname.split('/')[1];
  
  if (currentTab === routeName) {
    router.push(`/${routeName}` as any);
  }
};

// Applied to each tab
listeners={{
  tabPress: (e) => {
    e.preventDefault();
    handleTabPress('plan');
  },
}}
```

### Stack Configuration
```typescript
<Stack
  screenOptions={{
    headerShown: true,
    headerBackTitle: "Back",
    animation: "slide_from_right",
    gestureEnabled: true,
    gestureDirection: "horizontal",
  }}
>
```

### Gesture Behavior
- **Enabled:** All Stack-based pages
- **Direction:** Horizontal (swipe from left)
- **Threshold:** Default iOS/Android behavior
- **Animation:** Matches slide_from_right transition

---

## Future Considerations

### Potential Enhancements:
1. Add breadcrumb navigation for deep stacks
2. Implement "long press tab" for section shortcuts
3. Add transition customization per page type
4. Consider nested tab navigation for complex sections

### Known Limitations:
- Modal presentations don't support swipe gestures (by design)
- Root tab pages can't swipe to go "back" (no parent)

---

## Summary

✅ **Tab buttons now return to root when already in that tab**
✅ **All pages support swipe gestures for back navigation**
✅ **Consistent slide transitions throughout**
✅ **No more feeling trapped in subpages**

The Plan navigation is now intuitive, consistent, and follows iOS/Android platform conventions.
