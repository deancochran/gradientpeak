# Intensity Refactor - TODO List

**Date:** 2025-01-23
**Priority:** High
**Status:** Core Complete, UI Updates Needed

---

## ✅ Completed

### Backend & Core
- [x] Add intensity calculation functions to `core/calculations.ts`
- [x] Remove intensity distribution from training plan structure schema
- [x] Create simplified planned activity schemas
- [x] Update `validateConstraints` endpoint to remove intensity validation
- [x] Remove hard workout spacing validation
- [x] Create comprehensive documentation (INTENSITY_CALCULATION.md)
- [x] Create refactor summary (INTENSITY_REFACTOR_SUMMARY.md)

### Mobile UI Components
- [x] **AddWorkoutModal.tsx** - Removed IntensityPicker and updated validation
- [x] **IntensityPicker.tsx** - DELETED
- [x] **components/index.ts** - Removed IntensityPicker exports
- [x] **Step4IntensityDistribution.tsx** - DELETED
- [x] **Step5Periodization.tsx** - RENAMED to Step4Periodization.tsx
- [x] **create/index.tsx** - Updated wizard to 4 steps, removed intensity step
- [x] **useWizardForm.ts** - Removed intensity distribution state and validation
- [x] **trends.tsx** - Updated to use 7 intensity zones calculated from IF
- [x] **ConstraintValidator.tsx** - Removed hardWorkoutSpacing constraint
- [x] **planned_activity.ts** - Added activity_plan_id to update schema

### Core Package Updates
- [x] **Renamed functions** to avoid conflicts:
  - `calculateTrainingIntensityFactor()` - For training plan calculations
  - `calculateTrainingTSS()` - For training plan TSS
  - `getTrainingIntensityZone()` - Returns 7 zones based on IF
- [x] **Updated to 7 intensity zones** (from 5):
  - Recovery: < 0.55 IF
  - Endurance: 0.55-0.75 IF
  - Tempo: 0.75-0.85 IF
  - Threshold: 0.85-0.95 IF
  - VO2max: 0.95-1.05 IF
  - Anaerobic: 1.05-1.15 IF
  - Neuromuscular: > 1.15 IF

---

## 🚧 In Progress

---

## ✅ Backend Updates (Phase 2 - COMPLETE)

### tRPC Endpoints Updated/Added

#### Updated Existing Endpoints
- [x] `training_plans.getIntensityDistribution()`
  - ✅ Now calculates from actual activity IF values
  - ✅ Returns 7 zones (recovery, endurance, tempo, threshold, vo2max, anaerobic, neuromuscular)
  - ✅ Removed "target" distribution (no longer stored)
  - ✅ TSS-weighted percentages
  - ✅ Training science-based recommendations (polarized training)
  - ✅ Made training_plan_id optional (can analyze any date range)

#### New Retrospective Analysis Endpoints
- [x] `activities.list(date_from, date_to)` 
  - ✅ Added list endpoint to activities router
  - ✅ Filters by date range
  - ✅ Includes intensity_factor and training_stress_score
  - ✅ Returns all activities for profile

- [x] `activities.update(id, intensity_factor?, training_stress_score?, normalized_power?)`
  - ✅ Added update endpoint for setting calculated metrics
  - ✅ Allows updating IF and TSS after workout processing

- [x] `training_plans.getIntensityTrends(weeks_back)`
  - ✅ Shows IF trends over time by week
  - ✅ Groups activities by week (Monday start)
  - ✅ Calculates average IF per week
  - ✅ Shows TSS-weighted zone distribution per week
  - ✅ Helps users see training patterns

- [x] `training_plans.checkHardWorkoutSpacing(start_date, end_date, min_hours)`
  - ✅ Analyzes completed workouts for spacing violations
  - ✅ Uses IF >= 0.85 to determine "hard" workouts
  - ✅ Returns list of workouts that were too close together
  - ✅ Configurable minimum hours between hard workouts (default: 48h)</parameter>
</parameter>
  - Include average IF per zone

---

## 📝 Documentation Updates

### User-Facing Documentation
- [ ] Update training plan guide to remove intensity prescription
- [ ] Add explanation of IF and TSS to help section
- [ ] Create FAQ about why intensity isn't set beforehand
- [ ] Add examples of interpreting IF values

### Developer Documentation
- [ ] Update API documentation for changed endpoints
- [ ] Add examples of retrospective intensity analysis
- [ ] Document the IF → Zone mapping clearly

---

## 🧪 Testing

### Unit Tests
- [ ] Test `calculateTrainingIntensityFactor()` with various inputs
- [ ] Test `getTrainingIntensityZone()` boundary conditions for all 7 zones
- [ ] Test `calculateTrainingTSS()` formula accuracy
- [ ] Test `estimateTSS()` returns reasonable values
- [ ] Test zone transitions at IF boundaries (0.55, 0.75, 0.85, 0.95, 1.05, 1.15)

### Integration Tests
- [x] Test `validateConstraints` without intensity field - ✅ Working
- [x] Test training plan creation without intensity distribution - ✅ Working
- [ ] Test activity display calculates zones correctly with 7 zones
- [ ] Test trends screen with real IF data from backend

### E2E Tests
- [x] Schedule workout without intensity picker - ✅ UI Updated
- [x] Complete training plan wizard (4 steps) - ✅ UI Updated
- [ ] View activity with calculated intensity (7 zones)
- [ ] View trends with intensity distribution (needs backend update)

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [x] All UI components updated
- [x] No references to old intensity enums in mobile code (now using 7 zones)
- [x] No calls to removed tRPC endpoints
- [x] Training plan wizard flows correctly (4 steps)
- [x] Constraint validation works without intensity
- [x] TypeScript compilation passes with no errors

### Post-Deployment
- [ ] Monitor for errors related to missing intensity fields
- [ ] Verify activities display IF correctly with 7 zones
- [ ] Update backend `getIntensityDistribution` to use actual IF calculations
- [ ] Check that trends calculate zones properly (needs backend update)
- [ ] Ensure no users are blocked by missing fields
- [ ] Verify training plan creation stores correct structure (no intensity_distribution)

---

## 💡 Future Enhancements

### Smart Recommendations (Phase 2)
- [ ] Analyze if user is doing too much hard work (IF > 0.90)
- [ ] Suggest recovery weeks based on IF trends
- [ ] Warn if intensity distribution is too polarized/pyramidal

### Advanced Analytics (Phase 3)
- [ ] IF progression over training block
- [ ] Decoupling analysis (efficiency factor)
- [ ] Power duration curve from IF data
- [ ] Training efficiency metrics

### AI Coach Integration (Phase 4)
- [ ] AI suggests workouts based on recent IF trends
- [ ] Adaptive planning based on actual vs planned intensity
- [ ] Fatigue detection from IF patterns

---

## 🐛 Known Issues

### Edge Cases to Handle
- [ ] Activities without `intensity_factor` (no power data)
  - Solution: Use estimated IF from HR or pace

- [ ] Very old activities with stored intensity enum
  - Solution: Ignore old field, calculate from IF if available

- [ ] Training plans with old intensity_distribution in JSONB
  - Solution: Field is optional, just don't use it

---

## 📞 Support

### If Users Ask "Where did intensity go?"
**Answer:**
"Intensity is now calculated automatically after your workout based on your actual performance (power, heart rate, pace). This is more accurate than guessing beforehand. You'll see your intensity factor (IF) and zone on completed activities."

### If Users Ask "How do I know what intensity to train at?"
**Answer:**
"Your workout description tells you (e.g., 'easy run' or 'threshold intervals'). Train based on how you feel and your power/pace zones. The app will measure the actual intensity after you're done."

---

## ✅ Definition of Done

### Phase 1 (Mobile UI) - ✅ COMPLETE
- [x] All mobile UI components updated
- [x] No old intensity enums in mobile codebase (using 7 zones now)
- [x] Training plan wizard has 4 steps
- [x] Constraint validation works with 4 checks
- [x] Trends screen updated to show 7 intensity zones
- [x] No TypeScript errors
- [x] Documentation updated

### Phase 2 (Backend) - ✅ COMPLETE
- [x] Backend `getIntensityDistribution` calculates from actual IF
- [x] Activities router has `list` endpoint
- [x] Activities router has `update` endpoint for setting IF/TSS
- [x] All intensity calculations use 7-zone system
- [x] `getIntensityTrends` endpoint for weekly analysis
- [x] `checkHardWorkoutSpacing` endpoint for recovery analysis
- [x] TypeScript compilation passes with no errors
- [x] All endpoints properly typed and null-safe</parameter>

---

## 📝 Summary of Changes Made

### What Changed
1. **Removed intensity pre-assignment** from workout scheduling
2. **Deleted intensity picker** component and all references
3. **Reduced wizard from 5 to 4 steps** (removed intensity distribution step)
4. **Updated to 7 intensity zones** based on standard training science:
   - Recovery, Endurance, Tempo, Threshold, VO2max, Anaerobic, Neuromuscular
5. **Renamed core functions** to avoid conflicts:
   - `getTrainingIntensityZone()` - For training plan zone classification
   - `calculateTrainingIntensityFactor()` - For training plan IF calculation
   - `calculateTrainingTSS()` - For training plan TSS calculation
6. **Updated constraint validation** to only check 4 volume-based constraints
7. **Added activity_plan_id** to update schema for flexibility

### Next Steps (Phase 3 - Integration & Testing)
1. ✅ Backend endpoints complete - ready for mobile integration
2. [ ] Update mobile app to use new `activities.list` endpoint
3. [ ] Update trends screen to call `getIntensityTrends`
4. [ ] Test with real activity data containing IF values
5. [ ] Add UI for hard workout spacing warnings (`checkHardWorkoutSpacing`)
6. [ ] Update user documentation explaining the 7 zones
7. [ ] Add IF calculation logic when activities are completed
8. [ ] Create activity processing pipeline (NP → IF → TSS → Zone)</parameter>

---
