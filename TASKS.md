# GradientPeak Task List

---

## 🔴 In Progress

### Plan Tab Refactoring (2-3 Sprints)
**Status:** In Review  
**Priority:** HIGH - Blocks Production  
**Documentation:** `PLAN_UI_REVIEW.md`, `PLAN_REFACTOR_MIGRATION.md`, `PLAN_REVIEW_SUMMARY.md`, `PLAN_QUICK_REF.md`

#### Phase 1: Foundation (Week 1) - CRITICAL
- [ ] **Convert `planned_activities/index.tsx` to NativeWind**
  - Remove 180+ lines of StyleSheet
  - Use consistent className approach
  - Estimated: 2-3 hours
  
- [x] **Extract `ACTIVITY_TYPE_CONFIG` to core package**
  - Added to `packages/core/constants.ts` ✅
  - Includes 7 activity types with icons, colors, descriptions
  - Added `INTENSITY_ZONES` with 7-zone classification
  - Added `getIntensityZone()` helper function
  
- [ ] **Migrate all files to use shared `ACTIVITY_TYPE_CONFIG`**
  - Update `library/index.tsx`
  - Update `planned_activities/index.tsx`
  - Update any other files using duplicate configs
  - Estimated: 2 hours
  
- [ ] **Complete Calendar tRPC Endpoints**
  - Implement `plannedActivities.listByWeek` endpoint
  - Implement `activities.listByDateRange` endpoint
  - Wire up calendar data in `calendar.tsx`
  - Estimated: 4-5 hours
  
- [ ] **Add Proper TypeScript Types**
  - Create `packages/core/src/types/training-plan.ts`
  - Create `packages/core/src/types/activity-plan.ts`
  - Create `packages/core/src/types/planned-activity.ts`
  - Replace all `any` types in plan tab files
  - Estimated: 4 hours

#### Phase 2: Intensity Factor Integration (Week 2)
- [ ] **Display Intensity Factor on Activity Cards**
  - Create `ActivityMetrics` component
  - Create `IntensityBadge` component
  - Add IF display to all activity cards
  - Estimated: 4 hours
  
- [ ] **Add Intensity Distribution to Weekly Summary**
  - Create `IntensityDistribution` component (zone bar chart)
  - Integrate into `WeeklyProgressCard`
  - Show TSS-weighted zone breakdown
  - Estimated: 5 hours
  
- [ ] **Add Recovery Insights**
  - Create `RecoveryInsight` component
  - Calculate days since last hard workout (IF > 0.85)
  - Show recovery recommendations
  - Estimated: 3 hours

#### Phase 3: Component Standardization (Week 3)
- [ ] **Create Shared ActivityCard Component**
  - Unified card design for all pages
  - Replace cards in library, scheduled, training plan
  - Estimated: 6 hours
  
- [ ] **Simplify Main Plan Index**
  - Reduce from 5 actions to 2 primary CTAs
  - Add contextual weekly progress
  - Estimated: 3 hours
  
- [ ] **Enhanced Library Filtering**
  - Add duration filters (< 30min, 30-60min, > 60min)
  - Add TSS filters (Low, Medium, High)
  - Add zone focus filters
  - Estimated: 4 hours
  
- [ ] **Extract Calculation Utilities**
  - Create `packages/core/utils/date-grouping.ts`
  - Create `packages/core/utils/training-calendar.ts`
  - Move inline calculations to utilities
  - Estimated: 4 hours

#### Phase 4: Testing & Documentation (Week 4)
- [ ] **Unit Tests**
  - Test date grouping utility
  - Test training calendar calculations
  - Test intensity zone classification
  - Estimated: 6 hours
  
- [ ] **Integration Tests**
  - Test library filtering flows
  - Test calendar navigation
  - Test plan scheduling flows
  - Estimated: 4 hours
  
- [ ] **Documentation Updates**
  - Update component README files
  - Create user guide for training plan features
  - Document intensity factor system
  - Estimated: 2 hours

**Success Criteria:**
- ✅ Zero StyleSheet usage (NativeWind only)
- ✅ Zero duplicate `ACTIVITY_CONFIGS` 
- ✅ Zero `any` types in plan pages
- ✅ Calendar shows real data (no TODOs)
- ✅ Intensity Factor visible on 100% of activities
- ✅ All cards use consistent design
- ✅ Test coverage > 80%
- ✅ No console errors/warnings

---

##  High Priority




---

##  High Priority

### Recently Completed

- ✅ **Activity Database Schema Adherence Cleanup**: Successfully removed premature adherence implementation and fixed core database issues
  - ✅ **Database Function Parameter Fix**: Corrected SQL function `create_activity` parameter naming mismatch (`activity_payload` → `activity`, `streams_payload` → `activity_streams`)
  - ✅ **Adherence Implementation Removal**: Removed incomplete adherence scoring system due to complexity with mixed intensity types (RPE, etc.)
    - ✅ Removed `adherence_score` column from activities table schema
    - ✅ Removed `calculateAdherenceScore` function from core package
    - ✅ Removed adherence calculation from activity submission process
    - ✅ Cleaned up adherence-related imports and type references
  - ✅ **TypeScript Compilation Fixes**: Resolved all null safety and type assertion issues
    - ✅ Fixed undefined object access errors in calculations functions
    - ✅ Fixed Zod schema type issues in Supabase package
    - ✅ Added proper null assertions for array access in zone calculations
  - ✅ **Activity Plan Type Consistency**: Fixed missing `estimated_duration` property in ActivityRecorder service
  - ✅ All compilation errors resolved - core package and mobile app now build cleanly
  - ✅ Maintained existing activity recording functionality while removing incomplete features
  - ✅ Database schema cleaned up and ready for future adherence implementation when requirements are clearer

- ✅ **ActivityRecorder Performance Optimization**: Successfully refactored recording modals to use optimized Zustand store
  - ✅ Removed ActivityRecorderProvider entirely (~200 lines deleted)
  - ✅ Added granular Zustand selectors for specific metrics (useHeartRate, usePower, useGPSMetrics, etc.)
  - ✅ Updated all recording modal files (index.tsx, activity.tsx, permissions.tsx, sensors.tsx) to use efficient selectors
  - ✅ Optimized for realtime metric updates with surgical re-renders (1-4Hz sensor data)
  - ✅ Added useActivityRecorderInit hook for service initialization with proper async handling
  - ✅ Fixed React state update warnings by preventing render-time side effects
  - ✅ Fixed property reference errors by removing old liveMetrics/connectedSensors parameters
  - ✅ Added initialization guards to prevent component render before service is ready
  - ✅ Fixed background location task cleanup errors with proper TaskManager error handling
  - ✅ Improved location service error handling for task registration/cleanup edge cases
  - ✅ **Service-Based Timing**: Moved elapsed time calculation from UI to ActivityRecorder service for background accuracy
  - ✅ **Live Metrics Enhancement**: Added elapsedTime, distance, latitude/longitude to live metrics with proper updates
  - ✅ **GPS Distance Tracking**: Implemented Haversine formula for accurate distance calculation from GPS coordinates
  - ✅ **Background-Safe Operations**: Timing and metrics continue accurately when app is backgrounded
  - ✅ **Dashboard Metrics Display**: Dashboard now shows real-time service metrics instead of placeholder content
  - ✅ **Fixed Elapsed Time Display**: Corrected elapsed time formatting issue (removed incorrect millisecond conversion)
  - ✅ **Improved Timer Logic**: Simplified elapsed time calculation with proper pause/resume handling
  - ✅ All runtime errors resolved - recording modals now work correctly with full metrics and optimized performance
  - ✅ Maintained all existing functionality while improving performance, accuracy, and reliability

---

##  Medium Priority

---

##  Low Priority
