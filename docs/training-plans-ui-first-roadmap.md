# Training Plans - UI-First Implementation Roadmap

**Philosophy:** Build the UI/UX first, then create tRPC endpoints that serve exactly what the UI needs.

---

## Current State Analysis

### Existing Structure
- **Plan Tab** (`/plan/index.tsx`) - Currently shows workout library and scheduling
- **Trends Tab** (`/trends.tsx`) - Empty placeholder
- Existing modals and components for activity plans (not training plans)

### What Needs to Be Built
According to HANDOFF.md, we need:
1. **Training Plan Management** - Separate from workout library
2. **Training Plan Calendar** - Weekly view with constraint validation
3. **Training Plan Wizard** - Multi-step plan creation
4. **Trends/Analytics** - CTL/ATL/TSB charts with ideal vs actual
---
### Core Technologies
- **Form Management**: React Hook Form with Zod validation
- **Validation Schemas**: Zod schemas in `@repo/core` package
- **UI Components**: Reusable React Native components from `components/ui/` directory
- **Calendar Library**: `react-native-calendars` for calendar views
- **Charts**: `react-native-chart-kit` or `victory-native` for training curves
- **Type Safety**: TypeScript strict mode throughout
---

## Phase 1: Training Plan Overview Screen

### Goal
Create a new screen that shows the user's training plan (if they have one) with key metrics and quick actions.

### Location
`/app/(internal)/(tabs)/plan/training-plan/index.tsx`

### UI Components Needed

#### If User Has No Training Plan:
Display an empty state card with:
- Large icon or illustration centered
- Heading: "No Training Plan"
- Description text explaining benefits of creating a training plan
- Primary call-to-action button: "Create Training Plan"

#### If User Has Training Plan:
Display a comprehensive dashboard with:

**Header Section:**
- Training plan name (e.g., "Marathon Training Plan")
- Current progress indicator (e.g., "Week 4 of 12")
- Options menu (three-dot menu for edit/delete actions)

**Current Status Card:**
- Display three key fitness metrics: CTL (Chronic Training Load), ATL (Acute Training Load), TSB (Training Stress Balance)
- Show current form assessment (e.g., "Good", "Fresh", "Tired")
- Use color coding to indicate status (green for good, yellow for caution, red for overreaching)

**This Week Progress Card:**
- Progress bar showing weekly TSS completion (e.g., "320 / 450 TSS")
- Workout completion counter (e.g., "3 of 5 workouts completed")
- Alerts for upcoming hard workouts or constraint warnings

**Upcoming Workouts List:**
- Show next 3-5 scheduled workouts with:
  - Day name (e.g., "Tomorrow", "Thursday")
  - Workout name and type
  - Estimated duration
  - TSS value

**Action Buttons:**
- "View Calendar" - Navigate to weekly calendar view
- "View Trends" - Navigate to analytics/trends screen

### Data Required from tRPC:
```typescript
// 1. Get training plan
const { data: plan } = trpc.trainingPlans.get.useQuery();

// 2. Get current status (NEW ENDPOINT)
const { data: status } = trpc.trainingPlans.getCurrentStatus.useQuery();
// Returns: { ctl, atl, tsb, form, weekProgress, upcomingWorkouts }

// 3. This week's planned activities (EXISTING)
const { data: thisWeek } = trpc.plannedActivities.list.useQuery({
  date_from: startOfWeek,
  date_to: endOfWeek,
});
```

### Component Structure:
- `TrainingPlanOverview.tsx` - Main container component
- `TrainingPlanHeader.tsx` - Plan name, progress, and menu
- `CurrentStatusCard.tsx` - CTL/ATL/TSB metrics display
- `WeeklyProgressCard.tsx` - TSS progress and workout completion
- `UpcomingWorkoutsCard.tsx` - List of next workouts
- `CreateTrainingPlanCTA.tsx` - Empty state component

---

## Phase 2: Training Plan Calendar

### Goal
Weekly calendar view showing scheduled workouts with constraint validation indicators.

### Location
`/app/(internal)/(tabs)/plan/training-plan/calendar.tsx`

### UI Layout:

**Week Navigator:**
- Previous/Next week arrows
- Current week display with date range (e.g., "Week 4: Jan 15-21")

**Weekly Summary Bar:**
- Sticky header showing week-level metrics
- Total TSS progress vs target with percentage
- Workout completion count vs planned
- Overall status indicator (on track, behind, ahead)

**Calendar Grid:**
- Seven day columns (Sunday through Saturday)
- Each day card displays:
  - Day name
  - Any scheduled workouts for that day
  - Workout status icon (completed checkmark, scheduled clock, warning triangle, error X)
  - Workout name and type
  - Duration
  - TSS value
  - If rest day, show "Rest" label

**Status Indicators:**
- Checkmark: Workout completed
- Clock icon: Workout scheduled but not completed
- Warning triangle: Constraint warning (approaching limits)
- X mark: Constraint violation
- Different background colors for different statuses

**Add Workout Button:**
- Floating action button at bottom of screen
- Opens workout selection modal when tapped

### Interactions:
1. **Swipe gestures** - Navigate between weeks (left/right swipe)
2. **Tap day** - Open modal to add workout to that specific day
3. **Tap workout** - Open details sheet to view or edit workout
4. **Long press workout** - Quick actions menu (reschedule, delete)

### Data Required from tRPC:
```typescript
// 1. Get week's planned activities with training plan info (UPDATE EXISTING)
const { data: weekData } = trpc.plannedActivities.listByWeek.useQuery({
  training_plan_id: planId,
  week_start: weekStart,
});
// Returns: activities[], weeklyTSS, constraints status

// 2. Get week's completed activities (EXISTING)
const { data: completed } = trpc.activities.list.useQuery({
  date_from: weekStart,
  date_to: weekEnd,
});
```

### Component Structure:
- `TrainingPlanCalendar.tsx` - Main container with state management
- `WeekNavigator.tsx` - Week selector with arrow buttons and swipe handling
- `WeeklySummaryBar.tsx` - Sticky header with weekly stats
- `DayCard.tsx` - Individual day column component
- `WorkoutCard.tsx` - Individual workout display (scheduled or completed)
- `AddWorkoutButton.tsx` - Floating action button

---

## Phase 3: Create Training Plan Wizard

### Goal
Multi-step form to create a new training plan with guided setup.

### Location
`/app/(internal)/(tabs)/plan/training-plan/create/index.tsx`

### Steps:

#### Step 1: Basic Info
Form fields:
- Plan name input (required)
- Description textarea (optional, multi-line)
- Navigation: Cancel button (exits wizard), Next button (validates and continues)

#### Step 2: Weekly Targets
Form fields:
- Weekly TSS range inputs:
  - Minimum TSS input
  - Maximum TSS input
  - Visual slider showing range
- Activities per week input (number)
- Helper text explaining typical ranges for different training levels
- Navigation: Back button, Next button

#### Step 3: Recovery Rules
Form fields:
- Maximum consecutive training days (number input with stepper)
- Minimum rest days per week (number input with stepper)
- Minimum hours between hard workouts (number input)
- Helper text explaining importance of recovery
- Navigation: Back button, Next button

#### Step 4: Intensity Distribution
Form display:
- Five intensity levels with percentage sliders:
  - Recovery (visual bar showing percentage)
  - Easy (visual bar showing percentage)
  - Moderate (visual bar showing percentage)
  - Hard (visual bar showing percentage)
  - Race (visual bar showing percentage)
- Total percentage validation (must equal 100%)
- Visual indicator when total equals 100%
- Helper text with recommended distributions
- Navigation: Back button, Next button

#### Step 5: Periodization (Optional)
Form fields:
- Starting CTL input (current fitness level)
- Target CTL input (goal fitness level)
- Ramp rate percentage (how fast to build fitness)
- Target date picker (goal race or event date)
- Option to skip this step for simple plans
- Navigation: Skip button, Back button, Create Plan button

**Progress Indicator:**
- Step numbers displayed at top (1/5, 2/5, etc.)
- Visual progress bar showing completion percentage
- Step titles for context

### Data Required from tRPC:
```typescript
// Create the plan (EXISTING)
const createPlan = trpc.trainingPlans.create.useMutation();

await createPlan.mutateAsync({
  name: formData.name,
  description: formData.description,
  structure: {
    target_weekly_tss_min: formData.tssMin,
    target_weekly_tss_max: formData.tssMax,
    target_activities_per_week: formData.activitiesPerWeek,
    max_consecutive_training_days: formData.maxConsecutiveDays,
    min_rest_days_per_week: formData.minRestDays,
    min_hours_between_hard_workouts: formData.minHoursBetweenHard,
    intensity_distribution: formData.intensityDistribution,
    periodization: formData.periodization,
  },
});
```

### Component Structure:
- `CreateTrainingPlanWizard.tsx` - Main wizard container with step state management
- `Step1BasicInfo.tsx` - Basic information form
- `Step2WeeklyTargets.tsx` - TSS and activity targets form
- `Step3RecoveryRules.tsx` - Recovery constraint inputs
- `Step4IntensityDistribution.tsx` - Intensity percentage sliders
- `Step5Periodization.tsx` - Optional periodization setup
- `WizardProgress.tsx` - Step indicator component
- `WizardNavigation.tsx` - Reusable back/next button footer

---

## Phase 4: Add Workout Modal with Constraint Validation

### Goal
Select and schedule a workout with real-time constraint validation feedback.

### Location
`/app/(internal)/(tabs)/plan/training-plan/modals/AddWorkoutModal.tsx`

### UI Layout:

**Header:**
- Modal title: "Schedule Workout"
- Selected date display prominently
- Close button (X icon)

**Workout Selection Section:**
- Search input for filtering workouts
- Scrollable list of available workouts from activity plans
- Each workout item shows:
  - Workout name
  - Activity type icon
  - Duration
  - Estimated TSS
- Selection indicator (radio button or highlight)

**Intensity Level Picker:**
- Five radio button options:
  - Recovery
  - Easy
  - Moderate
  - Hard
  - Race
- Single selection required
- Visual indication of selected intensity

**Constraint Validation Display:**
- Live validation panel showing:
  - Weekly TSS check (current + new workout vs max)
  - Workouts per week check (current count + 1 vs target)
  - Consecutive training days check (if scheduling creates long streak)
  - Rest days minimum check (if scheduling reduces rest days below minimum)
  - Hours between hard workouts check (if scheduling a hard workout too soon)
- Each constraint shows:
  - Checkmark for satisfied
  - Warning icon for at risk
  - X icon for violated
  - Current value vs limit
- Color coding (green, yellow, red)

**Footer Actions:**
- Cancel button (dismisses modal without changes)
- Schedule button (primary action, creates planned activity)
- Schedule button may be disabled or show warning if constraints violated

### Validation Behavior:
- Real-time validation as user selects workout and intensity
- Calculations update immediately on any change
- Clear visual feedback for each constraint status
- Optional: Allow scheduling despite violations with confirmation warning

### Data Required from tRPC:
```typescript
// 1. List activity plans (EXISTING)
const { data: workouts } = trpc.activityPlans.list.useQuery();

// 2. Validate constraints before scheduling (NEW ENDPOINT)
const { data: validation } = trpc.plannedActivities.validateConstraints.useQuery({
  training_plan_id: planId,
  scheduled_date: selectedDate,
  activity: {
    estimated_tss: selectedWorkout.estimated_tss,
    intensity: selectedIntensity,
  },
}, { enabled: !!selectedWorkout });

// 3. Schedule the workout (UPDATE EXISTING)
const scheduleMutation = trpc.plannedActivities.create.useMutation();
await scheduleMutation.mutateAsync({
  activity_plan_id: workoutId,
  scheduled_date: date,
  training_plan_id: planId,
  activity_intensity: intensity,
});
```

### Component Structure:
- `AddWorkoutModal.tsx` - Main modal container with form state
- `WorkoutSelector.tsx` - Searchable workout list
- `IntensityPicker.tsx` - Radio button group for intensity selection
- `ConstraintValidator.tsx` - Real-time validation panel
- `ConstraintIndicator.tsx` - Individual constraint status row

---

## Phase 5: Trends Tab - Training Curves

### Goal
Visualize CTL/ATL/TSB over time with ideal vs actual comparison.

### Location
`/app/(internal)/(tabs)/trends.tsx` (replace existing placeholder)

### UI Layout:

**Header Section:**
- Screen title: "Training Trends"
- Time range selector with buttons:
  - 3 Months
  - 6 Months
  - 12 Months
  - All Time
- Active button highlighted

**Main Chart:**
- Multi-line chart showing training load over time
- Lines displayed:
  - Actual CTL (solid line)
  - Ideal CTL (dashed line)
  - Actual ATL (solid line)
  - Ideal ATL (dashed line)
  - TSB (solid line, different color)
- X-axis shows time (dates or weeks)
- Y-axis shows load values (0-100+)
- Interactive: tap to see specific values at a point in time
- Legend below chart explaining each line

**Current Status Card:**
Display current fitness metrics:
- CTL value with target in parentheses
- ATL value with target in parentheses
- TSB value with form description (e.g., "Fresh", "Optimal", "Tired")
- Form interpretation text (e.g., "Good for race in 2 weeks")
- Color coding based on values

**Additional Views Tabs:**
- "Weekly Summary" tab button
- "Intensity Analysis" tab button
- Switches between different analytical views

### Chart Interpretation:
- CTL (Chronic Training Load): Long-term fitness trend
- ATL (Acute Training Load): Recent fatigue level
- TSB (Training Stress Balance): CTL minus ATL, indicates form
- Ideal lines show what was planned
- Actual lines show what was completed
- Divergence between ideal and actual indicates plan adherence

### Data Required from tRPC:
```typescript
// 1. Get ideal training curve (NEW ENDPOINT)
const { data: idealCurve } = trpc.trainingPlans.getIdealCurve.useQuery({
  id: planId,
  start_date: startDate,
  end_date: endDate,
});

// 2. Get actual training curve (NEW ENDPOINT)
const { data: actualCurve } = trpc.analytics.calculateActualCurve.useQuery({
  start_date: startDate,
  end_date: endDate,
});

// 3. Get current status (NEW ENDPOINT)
const { data: status } = trpc.analytics.getCurrentStatus.useQuery();
```

### Component Structure:
- `TrendsScreen.tsx` - Main container with tab state
- `TimeRangeSelector.tsx` - Button group for time range selection
- `TrainingCurveChart.tsx` - Line chart component with dual datasets
- `CurrentStatusCard.tsx` - Metrics display card
- `ChartLegend.tsx` - Line legend with color indicators

---

## Phase 6: Weekly Summary View

### Goal
Week-by-week breakdown of planned vs actual performance.

### Location
`/app/(internal)/(tabs)/trends/weekly-summary.tsx`

### UI Layout:

**Screen Structure:**
Scrollable list of week summary cards, newest first.

**Each Week Card Contains:**
- Week identifier (e.g., "Week 4 (Jan 15-21)")
- Overall status icon (checkmark for good, warning for behind schedule, X for major issues)
- TSS completion: actual vs planned with percentage
- Workout completion: completed count vs planned count with percentage
- CTL change indicator (positive/negative change from previous week)
- Optional: expandable section showing individual missed workouts
- Different background colors or borders based on performance

**Status Indicators:**
- Green checkmark: Met or exceeded targets
- Yellow warning: Slightly behind (70-90% completion)
- Red X: Significantly behind (below 70% completion)

**Missed Workouts Detail:**
When expanded, show:
- List of planned but not completed workouts
- Workout name and intended day
- TSS value of missed workout

**Pagination:**
- Load 12 weeks initially
- "Load More" button at bottom to fetch older weeks
- Scroll to top button after scrolling down

### Data Required from tRPC:
```typescript
// Get weekly summary (NEW ENDPOINT)
const { data: summary } = trpc.analytics.getWeeklySummary.useQuery({
  training_plan_id: planId,
  weeks_back: 12,
});
// Returns: Array of week summaries with planned vs actual data
```

### Component Structure:
- `WeeklySummaryScreen.tsx` - Main scrollable container
- `WeekCard.tsx` - Individual week summary card
- `WeekDetails.tsx` - Expandable detail section for missed workouts
- `StatusBadge.tsx` - Week performance indicator

---

## Phase 7: Intensity Distribution Analysis

### Goal
Compare target vs actual intensity distribution to identify training imbalances.

### Location
`/app/(internal)/(tabs)/trends/intensity-distribution.tsx`

### UI Layout:

**Header Section:**
- Screen title: "Intensity Distribution"
- Time range selector (same as trends screen: 3M, 6M, 12M, All)

**Visual Comparison:**
Two pie or donut charts displayed side by side:
- Left chart: Target distribution (from training plan)
- Right chart: Actual distribution (from completed activities)
- Charts labeled "Target" and "Actual"
- Color coded by intensity level:
  - Recovery: light blue
  - Easy: green
  - Moderate: yellow
  - Hard: orange
  - Race: red

**Detailed Breakdown Table:**
Table showing intensity comparison:
- Column 1: Intensity level name
- Column 2: Target percentage
- Column 3: Actual percentage
- Column 4: Status indicator (checkmark if close, warning if off by 5-10%, X if off by more than 10%)
- Rows for each intensity level (Recovery, Easy, Moderate, Hard, Race)

**Recommendations Card:**
Display AI-generated or rule-based suggestions:
- Title: "Recommendations" with lightbulb icon
- 2-3 specific action items based on discrepancies
- Example: "Add more hard workouts to meet your intensity targets"
- Example: "Reduce easy workouts to match your target distribution"
- Color coded based on importance

### Analysis Logic:
- Compare actual vs target for each intensity level
- Flag discrepancies larger than 5% as warnings
- Flag discrepancies larger than 10% as significant issues
- Generate actionable recommendations
- Prioritize largest discrepancies

### Data Required from tRPC:
```typescript
// Get intensity distribution (NEW ENDPOINT)
const { data: distribution } = trpc.analytics.getIntensityDistribution.useQuery({
  training_plan_id: planId,
  start_date: startDate,
  end_date: endDate,
});
// Returns: {
//   target: { recovery: 25, easy: 50, moderate: 15, hard: 8, race: 2 },
//   actual: { recovery: 30, easy: 45, moderate: 18, hard: 5, race: 2 },
//   recommendations: string[]
// }
```

### Component Structure:
- `IntensityDistributionScreen.tsx` - Main container with time range state
- `IntensityPieCharts.tsx` - Side-by-side chart comparison
- `IntensityTable.tsx` - Detailed percentage breakdown table
- `RecommendationsCard.tsx` - Action suggestions based on analysis

---

## Implementation Order

### Week 1: Core Training Plan Management
**Deliverables:**
1. Training Plan Overview Screen (Phase 1)
2. Create Training Plan Wizard (Phase 3)
3. Navigation between screens

**Required tRPC endpoints:**
- `trainingPlans.getCurrentStatus()` - NEW, returns current CTL/ATL/TSB and upcoming workouts
- Update `plannedActivities.create()` to accept and link training_plan_id
- Update `trainingPlans.create()` to accept full structure object

**Success Criteria:**
- User can create a training plan through wizard
- User can view their plan overview with current status
- All five wizard steps function correctly
- Data persists to database

### Week 2: Calendar & Scheduling
**Deliverables:**
1. Training Plan Calendar View (Phase 2)
2. Add Workout Modal with Validation (Phase 4)
3. Swipe navigation between weeks

**Required tRPC endpoints:**
- `plannedActivities.listByWeek()` - NEW, returns week's activities with constraint status
- `plannedActivities.validateConstraints()` - NEW, real-time validation for scheduling
- `plannedActivities.reschedule()` - NEW (optional), if time allows for drag-and-drop

**Success Criteria:**
- User can view weekly calendar of scheduled workouts
- User can add workouts with real-time constraint validation
- Constraint warnings display correctly
- Week navigation works smoothly

### Week 3: Analytics Foundation
**Deliverables:**
1. Core calculation functions in `packages/core/calculations.ts`
2. Unit tests for all calculation functions
3. Documentation for calculation algorithms

**Required functions:**
- `calculateCTL(activities, timeConstant)` - Chronic Training Load calculation
- `calculateATL(activities, timeConstant)` - Acute Training Load calculation
- `calculateTSB(ctl, atl)` - Training Stress Balance calculation
- `validateConstraints(plan, activities, newActivity)` - Constraint checking
- `calculateIdealCurve(plan, startDate, endDate)` - Generate planned progression

**Success Criteria:**
- All functions have comprehensive unit tests
- Calculations match industry standards
- Functions are pure and reusable
- TypeScript types are complete

### Week 4: Trends Visualization
**Deliverables:**
1. Trends Tab with Training Curves (Phase 5)
2. Weekly Summary View (Phase 6)
3. Intensity Distribution View (Phase 7)

**Required tRPC endpoints:**
- `trainingPlans.getIdealCurve()` - NEW, returns planned CTL/ATL progression
- `analytics.calculateActualCurve()` - NEW, returns actual CTL/ATL/TSB from completed activities
- `analytics.getWeeklySummary()` - NEW, returns week-by-week performance data
- `analytics.getIntensityDistribution()` - NEW, returns target vs actual intensity breakdown

**Success Criteria:**
- User can view CTL/ATL/TSB charts with ideal vs actual
- User can review weekly summary performance
- User can analyze intensity distribution
- All charts render correctly and are interactive

---

## Success Criteria

### User Can:
1. Create a training plan with custom constraints through guided wizard
2. View their plan overview with current CTL/ATL/TSB status and upcoming workouts
3. Navigate a weekly calendar of scheduled workouts with swipe gestures
4. Schedule workouts with real-time constraint validation and warnings
5. See clear visual warnings when constraints are at risk of being violated
6. View CTL/ATL/TSB trends over time on interactive charts
7. Compare actual performance to ideal plan progression
8. Analyze weekly progress with planned vs actual breakdown
9. Review intensity distribution and receive recommendations

### Technical Requirements:
1. All UI components built with existing design system for consistency
2. tRPC endpoints return exactly the data UI needs (no over-fetching)
3. Calculations happen in core package for reusability and testing
4. Proper loading states shown during data fetching
5. Error handling with user-friendly messages
6. Optimistic updates for immediate UI feedback on mutations
7. Type-safe data flow throughout application (TypeScript strict mode)
8. Responsive design works on various screen sizes
9. Accessible components following WCAG guidelines
10. Performant rendering with proper memoization

---

## Next Steps

1. **Review this roadmap** with stakeholders and gather feedback
2. **Start with Phase 1** - Build Training Plan Overview screen first
3. **Create UI mockups** in Figma (optional but highly recommended for alignment)
4. **Build components incrementally** - Complete and test each component before moving to next
5. **Add tRPC endpoints as needed** - Only create endpoints when UI requires them
6. **Iterate based on user feedback** - Collect feedback after each phase
7. **Document as you build** - Keep README files updated with usage examples
8. **Write tests** - Unit tests for calculations, integration tests for critical flows

**Key Principle:** UI drives API design, not the other way around. Build what users need, when they need it.
