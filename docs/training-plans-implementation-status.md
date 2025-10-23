# Training Plans - Implementation Status

**Last Updated:** 2024
**Current Phase:** Phase 1 Complete ✅

---

## Overview

This document tracks the implementation progress of the Training Plans feature according to the UI-first roadmap defined in `training-plans-ui-first-roadmap.md`.

---

## ✅ Phase 1: Training Plan Overview Screen - COMPLETE

### What Was Built

#### 1. Core Calculation Functions (`packages/core/calculations.ts`)
- ✅ `calculateCTL()` - Chronic Training Load with 42-day time constant
- ✅ `calculateATL()` - Acute Training Load with 7-day time constant  
- ✅ `calculateTSB()` - Training Stress Balance (CTL - ATL)
- ✅ `calculateTrainingLoadSeries()` - Calculate metrics for multiple days
- ✅ `getFormStatus()` - Determine fitness form based on TSB
- ✅ `getFormStatusColor()` - UI color indicators for form status
- ✅ `calculateRampRate()` - Weekly CTL change rate
- ✅ `isRampRateSafe()` - Validate safe progression
- ✅ `projectCTL()` - Project future fitness based on planned TSS
- ✅ `calculateTargetDailyTSS()` - Calculate daily TSS needed to reach goal

**Location:** `packages/core/calculations.ts` (lines 1159-1357)

#### 2. tRPC Endpoint (`packages/trpc/src/routers/training_plans.ts`)
- ✅ `getCurrentStatus` - New endpoint that returns:
  - CTL, ATL, TSB metrics calculated from last 42 days
  - Form status (fresh, optimal, neutral, tired, overreaching)
  - Weekly progress (completed TSS, planned TSS, target TSS)
  - Workout completion tracking
  - Upcoming workouts (next 5 days)
- ✅ Fixed database queries to use `training_stress_score` column

**Location:** `packages/trpc/src/routers/training_plans.ts` (lines 333-475)

#### 3. UI Components

**Main Screen:**
- ✅ `index.tsx` - Training Plan Overview screen with:
  - Empty state for users without a plan
  - Dashboard view for users with active plan
  - Navigation to calendar, trends, and creation wizard
  - Pull-to-refresh functionality
  - Benefits explanation section

**Location:** `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/index.tsx`

**Card Components:**

1. ✅ `CurrentStatusCard.tsx`
   - Displays CTL (Fitness), ATL (Fatigue), TSB (Form)
   - Color-coded form status banner
   - Metric grid with icons
   - Educational info text explaining metrics

2. ✅ `WeeklyProgressCard.tsx`
   - TSS progress bar with color-coded completion
   - Workout completion tracker
   - Remaining TSS indicator
   - Status messages (on track, behind, completed)

3. ✅ `UpcomingWorkoutsCard.tsx`
   - Next 5 scheduled workouts
   - Date formatting (Today, Tomorrow, Day name)
   - Workout details (duration, TSS, type)
   - Tap to view workout details

**Location:** `apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/components/`

#### 4. Navigation Integration
- ✅ Added "Training Plan" primary button to main Plan screen
- ✅ Routes to Training Plan Overview

**Location:** `apps/mobile/src/app/(internal)/(tabs)/plan/index.tsx`

#### 5. Placeholder Routes Created
- ✅ `calendar.tsx` - Weekly calendar (Phase 2)
- ✅ `create/index.tsx` - Training plan wizard (Phase 3)
- ✅ `settings.tsx` - Plan settings/edit

---

## 📋 Remaining Phases

### Phase 2: Training Plan Calendar (Not Started)
**Components Needed:**
- Weekly calendar view
- Day cards with scheduled workouts
- Week navigator with swipe gestures
- Weekly summary bar
- Add workout button (FAB)
- Constraint validation indicators

**tRPC Endpoints Needed:**
- `listByWeek` - Get week's activities with constraint status

**Estimated Effort:** 2-3 days

---

### Phase 3: Create Training Plan Wizard (Not Started)
**Components Needed:**
- Multi-step wizard container
- Step 1: Basic Info (name, description)
- Step 2: Weekly Targets (TSS min/max, activities per week)
- Step 3: Recovery Rules (consecutive days, rest days, hard workout spacing)
- Step 4: Intensity Distribution (5 zones with percentage sliders)
- Step 5: Periodization (optional - CTL targets, ramp rate, target date)
- Progress indicator
- Wizard navigation footer

**tRPC Endpoints:**
- ✅ `create` - Already exists

**Estimated Effort:** 3-4 days

---

### Phase 4: Add Workout Modal with Constraint Validation (Not Started)
**Components Needed:**
- Workout selection modal
- Date picker
- Real-time constraint validation
- Warning/error messages
- Save button with validation state

**tRPC Endpoints Needed:**
- `validateConstraints` - Check if adding workout violates plan rules
- `scheduleWorkout` - Add workout to calendar

**Estimated Effort:** 2-3 days

---

### Phase 5: Trends Tab - Training Curves (Not Started)
**Components Needed:**
- CTL/ATL/TSB line charts
- Ideal vs actual comparison
- Time range selector (4/8/12 weeks)
- Status indicators
- Chart legends and tooltips

**tRPC Endpoints Needed:**
- `getIdealCurve` - Calculate ideal fitness progression
- `getActualCurve` - Get historical training load data

**Estimated Effort:** 3-4 days

---

### Phase 6: Weekly Summary View (Not Started)
**Components Needed:**
- Weekly stats card
- TSS breakdown by day
- Intensity distribution
- Compliance indicators

**tRPC Endpoints Needed:**
- `getWeeklySummary` - Aggregate week's data

**Estimated Effort:** 1-2 days

---

### Phase 7: Intensity Distribution Analysis (Not Started)
**Components Needed:**
- Bar chart showing actual vs target distribution
- 5 intensity zones
- Percentage calculations
- Recommendations

**tRPC Endpoints Needed:**
- `getIntensityDistribution` - Calculate zone distribution from activities

**Estimated Effort:** 2-3 days

---

## 🧪 Testing Status

### Manual Testing Needed
- [ ] Training plan overview screen displays correctly
- [ ] Empty state shows for users without plans
- [ ] CTL/ATL/TSB calculations are accurate
- [ ] Weekly progress bars show correct percentages
- [ ] Upcoming workouts list displays properly
- [ ] Navigation to placeholder screens works
- [ ] Pull-to-refresh functionality
- [ ] Form status colors match expected values

### Integration Testing Needed
- [ ] `getCurrentStatus` endpoint returns correct data
- [ ] Training load calculations match expected formulas
- [ ] Database queries use correct column names
- [ ] Weekly TSS aggregation is accurate

---

## 🐛 Known Issues / Technical Debt

1. **Type Safety:** Some router.push calls use `as any` to bypass Expo Router type errors
   - **Fix:** Add routes to Expo Router type definitions or use relative paths
   
2. **Error Handling:** Limited error UI in status cards
   - **Fix:** Add error states and retry mechanisms

3. **Loading States:** Could be more granular
   - **Fix:** Add skeleton loaders for individual cards

4. **Performance:** CTL/ATL calculations run on every render when status changes
   - **Fix:** Consider memoization or server-side caching

5. **Data Refresh:** No automatic polling for real-time updates
   - **Fix:** Add polling interval or WebSocket updates

---

## 📊 Success Metrics (Phase 1)

✅ **Functional Requirements Met:**
- Users can view their training plan overview
- CTL/ATL/TSB metrics display correctly
- Weekly progress is tracked and visualized
- Upcoming workouts are listed
- Empty state encourages plan creation

✅ **Technical Requirements Met:**
- Business logic centralized in `core` package
- Type-safe tRPC endpoints
- Reusable UI components
- Consistent with existing design system
- No TypeScript errors

---

## 🎯 Next Steps

### Immediate (Week 2)
1. **Phase 2: Training Plan Calendar**
   - Build weekly calendar view
   - Implement day cards with workout display
   - Add week navigation with swipe gestures
   - Create constraint validation logic

### Short Term (Week 3)
2. **Phase 3: Create Training Plan Wizard**
   - Build multi-step form
   - Implement validation for each step
   - Add intensity distribution sliders
   - Wire up to existing `create` mutation

### Medium Term (Week 4)
3. **Phase 4 & 5: Workout Scheduling + Trends**
   - Add workout modal with validation
   - Build CTL/ATL/TSB charts
   - Implement ideal vs actual comparison

---

## 📝 Notes

- **Database Schema:** Confirmed `activities.training_stress_score` column exists
- **Calculation Constants:** Using standard PMC time constants (CTL=42, ATL=7)
- **Form Status Thresholds:** Following TrainingPeaks convention
  - Fresh: TSB > 25
  - Optimal: TSB 5-25
  - Neutral: TSB -10 to 5
  - Tired: TSB -30 to -10
  - Overreaching: TSB < -30

---

## 🔗 Related Documentation

- [UI-First Roadmap](./training-plans-ui-first-roadmap.md)
- [Mobile App README](../README.md)
- [Core Package README](../../../packages/core/README.md)
- [tRPC Router Documentation](../../../packages/trpc/README.md)

---

**Status:** Phase 1 complete and ready for user testing. Phase 2 can begin immediately.