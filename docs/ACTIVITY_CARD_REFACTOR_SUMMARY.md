# Activity Plan Card Refactor - Complete ✅

## Overview
Successfully created a unified `ActivityPlanCard` component that replaces all activity/plan card variations across the mobile app, providing a consistent, feature-rich display for activity plans throughout the application.

## What Was Built

### New Unified Component
**Location:** `apps/mobile/components/shared/ActivityPlanCard.tsx`

**Features:**
- ✅ **Intensity Profile Chart** - Displays activity structure using TimelineChart component
- ✅ **Route Support** - Shows route badge with name and distance when route is attached
- ✅ **Comprehensive Metadata** - Duration, TSS, distance (if route provided)
- ✅ **Schedule Info Badge** - Small date/time indicator for scheduled activities
- ✅ **Completion Status** - Visual indicator for completed activities
- ✅ **Three Variants:**
  - `hero` - Full-featured card with border emphasis (plan index primary)
  - `default` - Standard card (discover, lists)
  - `compact` - Minimal card (dense layouts)
- ✅ **Minimalistic Design** - Clean, professional appearance
- ✅ **Flexible & Reusable** - Works everywhere in the app

### Card Data Interface
```typescript
export interface ActivityPlanCardData {
  id: string;
  name: string;
  activityType: string;
  structure?: ActivityPlanStructureV2;
  estimatedDuration?: number; // in minutes
  estimatedTss?: number;
  estimatedDistance?: number; // in km
  routeId?: string;
  routeName?: string;
  notes?: string;
  scheduledDate?: string; // ISO date string
  isCompleted?: boolean;
}
```

## Files Updated

### Pages Using New Card
1. **`apps/mobile/app/(internal)/(tabs)/plan.tsx`**
   - Replaced `HeroCard` and `StackedHeroCards` with unified component
   - Added separate "Start Activity" buttons outside card
   - Better separation of concerns (display vs actions)

2. **`apps/mobile/app/(internal)/(tabs)/discover.tsx`**
   - Replaced `TemplateCard` and `HorizontalTemplateCard` 
   - Removed custom `MiniIntensityChart` (now uses TimelineChart)
   - Cleaner template display in category rows and filtered lists

3. **`apps/mobile/components/plan/calendar/ActivityList.tsx`**
   - Replaced `PlannedActivityCard` with unified component
   - Consistent scheduled activity display across grouped lists
   - Shows schedule info badge for all activities

4. **`apps/mobile/components/PlannedActivitiesList.tsx`**
   - Replaced inline `PlannedActivityCard` component
   - External action buttons for "Follow Along" and "Record"
   - Better component composition

### Components Removed (Old/Unused)
- ❌ `apps/mobile/components/plan/calendar/PlannedActivityCard.tsx`
- ❌ `apps/mobile/components/plan/ActivityCard.tsx`
- ❌ `apps/mobile/components/plan/HeroCard.tsx`

### Exports Updated
- `apps/mobile/components/shared/index.ts` - Added ActivityPlanCard export
- `apps/mobile/components/plan/index.ts` - Removed old card exports

## Key Design Decisions

### 1. Schedule Info Placement
The date/time badge is now a small, unobtrusive indicator within the card rather than dominating the header. This aligns with your insight that **people care more about what the activity is than when it's scheduled**.

### 2. External Action Buttons
"Start Activity" and other action buttons are placed outside the card component. This:
- Keeps the card focused on display/presentation
- Allows different contexts to provide different actions
- Makes the card more reusable across contexts

### 3. Route Integration
Routes are shown as a distinctive badge with:
- Blue color scheme (different from other badges)
- Route name if available
- Distance prominently displayed
- MapPin icon for recognition

### 4. Chart Display Strategy
- Uses existing `TimelineChart` component (not custom implementation)
- Shows for activities with structure/intervals
- Hidden for compact variant and completed activities
- Configurable height based on variant

## Benefits

### For Users
1. **Consistent Experience** - Same card appearance everywhere
2. **Rich Information** - All important details at a glance
3. **Visual Clarity** - Intensity profiles help understand workouts
4. **Route Awareness** - Clear indication of route-based activities

### For Development
1. **Single Source of Truth** - One component to maintain
2. **Type Safety** - Consistent data interface
3. **Easy to Extend** - Centralized component for new features
4. **Reduced Code** - Eliminated ~500+ lines of duplicate card code

## Future Considerations

Based on your note about the schedule activity page potentially becoming a dialog/popup:

### Opportunity: Simplified Scheduling Flow
The unified card makes it easy to:
1. Show activity preview in a modal/dialog
2. Add simple date/time picker below
3. Submit to schedule
4. No full-page navigation needed

### Example Flow:
```
User taps "Schedule" → Modal opens with:
  - ActivityPlanCard (preview)
  - DateTimePicker (compact)
  - "Schedule Activity" button
  - "Cancel" button
```

This reinforces your insight that the activity itself is the hero, not the scheduling metadata.

## Testing Recommendations

1. ✅ Verify all pages compile without TypeScript errors (complete - only pre-existing errors remain)
2. ⚠️ Test plan index page with single and multiple activities
3. ⚠️ Test discover page category rows and filtered lists
4. ⚠️ Test activity lists in different grouping modes
5. ⚠️ Verify route badge displays correctly when route is attached
6. ⚠️ Check schedule info badge formatting across different dates/times
7. ⚠️ Verify completion status styling
8. ⚠️ Test all three variants (hero, default, compact) in various contexts

## Summary

This refactor successfully unified all activity plan card representations into a single, powerful, reusable component. The new card is more feature-rich than any of the old variants while maintaining a clean, minimalistic design. The architecture supports your vision of simplifying the scheduling flow and keeping focus on the activity content rather than metadata.

The component is now ready for use throughout the application and provides a solid foundation for future enhancements to activity display and scheduling workflows.
