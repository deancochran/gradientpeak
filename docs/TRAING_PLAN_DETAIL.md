# Training Plan Feature

## Overview

The Training Plan feature provides comprehensive training load management using Performance Management Chart (PMC) principles. This implementation follows a **UI-first approach** with well-organized, maintainable components.

## Architecture

### Directory Structure

```
training-plan/
├── README.md                          # This file
├── index.tsx                          # Training Plan Overview (Phase 1)
├── calendar.tsx                       # Weekly Calendar View (Phase 2)
├── settings.tsx                       # Plan settings (future)
├── components/
│   ├── CurrentStatusCard.tsx          # CTL/ATL/TSB display
│   ├── WeeklyProgressCard.tsx         # Week progress metrics
│   ├── UpcomingWorkoutsCard.tsx       # Upcoming workouts list
│   └── calendar/                      # Calendar-specific components
│       ├── WeekNavigator.tsx          # Week navigation controls
│       ├── WeeklySummaryBar.tsx       # Week summary metrics
│       ├── DayCard.tsx                # Single day display
│       ├── WorkoutCard.tsx            # Individual workout card
│       ├── AddWorkoutButton.tsx       # Floating action button
│       └── hooks/
│           └── useWeekNavigation.ts   # Week state management
└── create/
    ├── index.tsx                      # Training Plan Creation Wizard
    └── components/
        ├── WizardProgress.tsx         # Progress indicator
        ├── WizardNavigation.tsx       # Navigation buttons
        ├── hooks/
        │   └── useWizardForm.ts       # Form state & validation
        └── steps/
            ├── Step1BasicInfo.tsx     # Name & description
            ├── Step2WeeklyTargets.tsx # TSS targets
            ├── Step3RecoveryRules.tsx # Recovery constraints
            ├── Step4IntensityDistribution.tsx # Zone distribution
            └── Step5Periodization.tsx # Optional periodization
```

## Implementation Status

### ✅ Phase 1: Training Plan Overview (COMPLETE)

**Location:** `index.tsx`

**Features:**
- Empty state with "Create Training Plan" CTA
- Training plan dashboard with current metrics
- CTL/ATL/TSB display with form status
- Weekly progress tracking
- Upcoming workouts preview
- Quick stats and plan details

**Components:**
- `CurrentStatusCard` - Displays fitness metrics with color-coded form status
- `WeeklyProgressCard` - Shows TSS and workout completion progress
- `UpcomingWorkoutsCard` - Lists next scheduled workouts

**Lines of Code:** ~265 (well under 500 line limit)

### ✅ Phase 2: Training Plan Calendar (COMPLETE - UI Only)

**Location:** `calendar.tsx`

**Features:**
- Week-by-week navigation with date range display
- Weekly summary bar with TSS and workout progress
- 7-day calendar grid (Sunday - Saturday)
- Workout cards with status indicators (completed, scheduled, warning, violation)
- Add workout functionality (per day and floating button)
- Swipe navigation between weeks
- "Jump to current week" quick action

**Components:**
- `WeekNavigator` - Week selection with prev/next arrows (88 lines)
- `WeeklySummaryBar` - Aggregate metrics display (154 lines)
- `DayCard` - Individual day with workouts (114 lines)
- `WorkoutCard` - Single workout display with status (132 lines)
- `AddWorkoutButton` - Floating action button (54 lines)

**Hooks:**
- `useWeekNavigation` - Week state management (115 lines)

**Status:** UI complete, awaiting backend tRPC endpoints:
- `trpc.plannedActivities.listByWeek` - Get week's scheduled workouts
- `trpc.activities.list` - Get completed activities with date filtering

**Lines of Code:** Main page ~345, Components ~657 total

### ✅ Phase 3: Create Training Plan Wizard (COMPLETE)

**Location:** `create/index.tsx`

**Features:**
- 5-step wizard with progress indicator
- Real-time form validation
- Step-by-step navigation (back/next)
- Optional periodization step with skip functionality
- Form state persistence across steps
- Loading states during submission

**Steps:**
1. **Basic Info** - Plan name (required) and description (optional)
2. **Weekly Targets** - TSS range and activities per week
3. **Recovery Rules** - Max consecutive days, rest days, recovery time
4. **Intensity Distribution** - Zone percentages (must sum to 100%)
5. **Periodization** - Optional CTL progression settings

**Components:**
- `WizardProgress` - Step indicator with progress bar (93 lines)
- `WizardNavigation` - Back/Next/Submit buttons (119 lines)
- `Step1BasicInfo` - Name and description inputs (97 lines)
- `Step2WeeklyTargets` - TSS and activity settings (180 lines)
- `Step3RecoveryRules` - Recovery constraints (194 lines)
- `Step4IntensityDistribution` - Zone percentages (230 lines)
- `Step5Periodization` - Optional periodization (302 lines)

**Hooks:**
- `useWizardForm` - Complete form state management with validation (387 lines)

**Lines of Code:** Main wizard ~296, Components ~1,602 total

## Key Concepts

### Training Load Metrics

**CTL (Chronic Training Load):**
- 42-day exponential moving average of TSS
- Represents long-term fitness
- Higher = more fit

**ATL (Acute Training Load):**
- 7-day exponential moving average of TSS
- Represents recent fatigue
- Higher = more tired

**TSB (Training Stress Balance):**
- Formula: `TSB = CTL - ATL`
- Represents current form/freshness
- Positive = fresh, Negative = tired

**Form Status:**
- `fresh` (TSB > 10): Well rested, ready for hard training
- `optimal` (TSB 5-10): Good balance
- `neutral` (TSB -10 to 5): Moderate stress
- `tired` (TSB -20 to -10): Accumulated fatigue
- `overreaching` (TSB < -20): High fatigue, recovery needed

### Training Intensity Zones

1. **Recovery** (Zone 1) - Very easy, active recovery
2. **Easy** (Zone 2) - Comfortable, conversational pace
3. **Moderate** (Zone 3) - Steady, sustainable effort
4. **Hard** (Zone 4) - Challenging, focused effort
5. **Race** (Zone 5) - Maximum effort, race intensity

**Recommended Distributions:**
- 80/20 Polarized: 80% easy/recovery, 20% hard/race
- Pyramidal: Progressive decrease from easy to race
- Base Building: Heavy emphasis on easy/recovery

## Developer Guidelines

### Code Organization

1. **Component Size:** Keep files under 300 lines where possible
2. **Separation of Concerns:**
   - UI components in `components/`
   - Business logic in `hooks/`
   - Page orchestration in index files
3. **File Naming:** Use PascalCase for components, camelCase for hooks

### Adding New Features

**Calendar Enhancements:**
1. Add new calendar components to `components/calendar/`
2. Extend `useWeekNavigation` hook for additional state
3. Keep main `calendar.tsx` focused on orchestration

**Wizard Steps:**
1. Create new step component in `create/components/steps/`
2. Add validation logic to `useWizardForm.ts`
3. Register step in wizard's `renderStepContent()` switch
4. Update `STEP_TITLES` array

### State Management

- **Form State:** Managed by `useWizardForm` hook
- **Week Navigation:** Managed by `useWeekNavigation` hook
- **Server State:** Managed by tRPC queries/mutations
- **UI State:** Local component state for modals, loading, etc.

### Validation

All validation is centralized in `useWizardForm`:
- `validateStep1()` - Basic info validation
- `validateStep2()` - TSS range validation
- `validateStep3()` - Recovery rules validation
- `validateStep4()` - Intensity distribution (must sum to 100%)
- `validateStep5()` - Optional periodization validation

## Pending Backend Work

### Required tRPC Endpoints

**For Calendar (Phase 2):**
```typescript
// Get planned activities for a week
trpc.plannedActivities.listByWeek.useQuery({
  week_start: Date,
  week_end: Date,
  training_plan_id?: string
})

// Get completed activities with date filtering
trpc.activities.list.useQuery({
  date_from: Date,
  date_to: Date
})
```

**For Constraint Validation (Phase 4):**
```typescript
// Validate workout scheduling against constraints
trpc.trainingPlans.validateWorkout.useQuery({
  training_plan_id: string,
  scheduled_date: Date,
  activity_plan_id: string
})
```

**For Trends (Phase 5):**
```typescript
// Get historical CTL/ATL/TSB data
trpc.trainingPlans.getHistoricalMetrics.useQuery({
  training_plan_id: string,
  from_date: Date,
  to_date: Date
})

// Get ideal vs actual curves
trpc.trainingPlans.getProgressionCurves.useQuery({
  training_plan_id: string
})
```

## Future Phases

### Phase 4: Workout Scheduling with Constraints
- Add workout modal with library selection
- Real-time constraint validation
- Warning/error indicators
- Reschedule and delete actions

### Phase 5: Trends & Analytics
- CTL/ATL/TSB charts over time
- Ideal vs actual progression curves
- Form status timeline
- Weekly TSS trends

### Phase 6: Weekly Summary View
- Detailed week performance analysis
- Day-by-day breakdown
- Variance from targets
- Achievement badges

### Phase 7: Intensity Distribution Analysis
- Actual vs planned distribution
- Zone-specific analytics
- Recommendations for adjustments

## Testing

### Manual Testing Checklist

**Overview Screen:**
- [ ] Empty state displays correctly
- [ ] Create plan navigation works
- [ ] Dashboard shows with plan data
- [ ] CTL/ATL/TSB values display correctly
- [ ] Form status color-coded properly
- [ ] Weekly progress bars accurate
- [ ] Upcoming workouts list renders

**Calendar:**
- [ ] Week navigation (prev/next) works
- [ ] Current week indicator shows
- [ ] Jump to current week works
- [ ] Day cards render for all 7 days
- [ ] Today highlighting works
- [ ] Add workout buttons functional
- [ ] Weekly summary calculates correctly

**Create Wizard:**
- [ ] All 5 steps accessible
- [ ] Progress indicator updates
- [ ] Validation blocks invalid next
- [ ] Back button works
- [ ] Skip works on step 5
- [ ] Form submission creates plan
- [ ] Success redirects to overview
- [ ] Cancel confirms before exit

### Edge Cases

- Plan with no scheduled workouts
- Week with all rest days
- 100% TSS target completion
- Intensity distribution not summing to 100%
- Invalid TSS ranges
- Overlapping recovery constraints

## Performance Considerations

- Calendar uses horizontal `ScrollView` for week days
- Workout lists are virtualized where possible
- Form validation is debounced to prevent excessive re-renders
- tRPC queries use proper `enabled` flags for conditional fetching
- Week calculations use `useMemo` for performance

## Accessibility

- All inputs have proper `aria-labelledby` attributes
- Labels use native `Label` component with `nativeID`
- Touch targets meet minimum size requirements (44x44)
- Color is not the only indicator (icons + text)
- Error messages are clearly associated with fields

## Related Documentation

- [Training Plans UI-First Roadmap](../../docs/training-plans-ui-first-roadmap.md)
- [Core Package - Training Load Calculations](../../../../../packages/core/README.md)
- [Mobile App Architecture](../../../README.md)

## Changelog

### 2024-01-XX - Initial Implementation
- ✅ Phase 1: Training Plan Overview
- ✅ Phase 2: Weekly Calendar (UI complete)
- ✅ Phase 3: Create Training Plan Wizard
- 🚧 Phase 4: Workout Scheduling (pending)
- 🚧 Phase 5: Trends & Analytics (pending)

---

**Maintainers:** Development team  
**Last Updated:** 2024-01-XX  
**Status:** Active Development