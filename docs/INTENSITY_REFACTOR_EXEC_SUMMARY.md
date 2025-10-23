# Intensity Calculation Refactor - Executive Summary

**Date:** January 23, 2025  
**Status:** ✅ Core Implementation Complete | 🚧 UI Updates Pending  
**Impact:** High - Changes core training plan philosophy

---

## What Changed

We refactored how GradientPeak handles workout intensity to align with training science best practices.

### Before (Incorrect)
- Intensity was **pre-assigned** during planning (recovery/easy/moderate/hard/race)
- Users had to guess intensity before the workout
- Training plans prescribed specific intensity distributions
- Constraints validated based on planned intensity

### After (Correct)
- Intensity is **calculated** from workout data after completion
- Intensity Factor (IF) = Normalized Power / FTP
- Training Stress Score (TSS) = (duration × IF² × 100) / 3600
- Intensity zones derived from IF at display time
- Constraints validate volume only (TSS, frequency, rest)

---

## Why This Matters

### Training Science Accuracy
✅ Measures actual effort, not predicted effort  
✅ Accounts for fatigue, weather, terrain, equipment  
✅ Reflects real athlete performance  
✅ Enables meaningful trend analysis

### User Experience
✅ Simpler planning - no guessing intensity beforehand  
✅ Flexible execution - train based on how you feel  
✅ Accurate feedback - see real intensity afterward  
✅ Better insights - analyze what actually happened

---

## Technical Changes

### Core Package (`packages/core/`)
- ✅ Added `calculateIntensityFactor(NP, FTP)` 
- ✅ Added `getIntensityZone(IF)` - derives zone from IF
- ✅ Added `calculateTSS(duration, IF)` - TSS calculation
- ✅ Added `estimateTSS(duration, effort)` - for planning
- ✅ Removed intensity distribution schema
- ✅ Removed hard workout spacing constraints

### tRPC API (`packages/trpc/`)
- ✅ Updated `validateConstraints` to remove intensity field
- ✅ Removed hard workout spacing validation
- ✅ Changed to use `activity_plan_id` instead of intensity enum
- ✅ Validates only volume-based constraints (TSS, frequency, rest)

### Database Schema
- ✅ **No migration required!** Existing schema already has what we need:
  - `activities.intensity_factor` (0-100) stores IF
  - `activities.training_stress_score` stores TSS
  - `activity_plans.estimated_tss` for planning
- ❌ No new columns added
- ❌ No intensity enums stored

### Mobile UI (Pending Updates)
- 🚧 Remove intensity picker from workout scheduling
- 🚧 Remove Step 4 (Intensity Distribution) from training plan wizard
- 🚧 Update trends screen to calculate zones from IF
- 🚧 Update constraint validation UI (remove hard workout spacing)

---

## Data Flow

### Planning Phase
```
User schedules workout
  ↓
Links to activity_plan (has estimated_tss)
  ↓
System validates volume constraints
  ↓
NO intensity assigned
```

### Recording Phase
```
User completes workout
  ↓
Power/HR/Pace data recorded
  ↓
Calculate Normalized Power
  ↓
Calculate IF = NP / FTP
  ↓
Calculate TSS = (duration × IF²) / 3600
  ↓
Store IF and TSS in activities table
```

### Display Phase
```
Load activity.intensity_factor (e.g., 82 = 0.82)
  ↓
Derive zone: getIntensityZone(0.82) → "moderate"
  ↓
Display: "Moderate (IF 0.82) - 56 TSS"
```

---

## Constraints: What Changed

### Can Validate Proactively ✅
- Weekly TSS limits (use estimated_tss)
- Workout frequency per week
- Consecutive training days
- Minimum rest days per week

### Cannot Validate Proactively ❌
- Hard workout spacing (need actual IF)
- Intensity distribution (need actual IF)
- Effort balance (need actual IF)

### Can Analyze Retrospectively ✅
After workouts are completed:
- Calculate actual intensity distribution
- Check hard workout spacing violations
- Identify training imbalances
- Generate recommendations

---

## Breaking Changes

### API Changes
```typescript
// ❌ OLD
validateConstraints({
  training_plan_id,
  scheduled_date,
  activity: {
    estimated_tss: 60,
    intensity: "moderate"  // Removed
  }
})

// ✅ NEW
validateConstraints({
  training_plan_id,
  scheduled_date,
  activity_plan_id  // Gets estimated_tss from activity_plans
})
```

### Training Plan Structure
```json
// ❌ Removed from JSONB structure
{
  "intensity_distribution": { ... },
  "min_hours_between_hard": 48,
  "max_hard_activities_per_week": 2
}

// ✅ These remain
{
  "target_weekly_tss_min": 200,
  "target_weekly_tss_max": 400,
  "target_activities_per_week": 5,
  "max_consecutive_days": 3,
  "min_rest_days_per_week": 1
}
```

---

## Migration Guide

### For Existing Data
- **Activities**: If they have `intensity_factor`, you're good. Zones derived on the fly.
- **Planned Activities**: Any old intensity fields are ignored.
- **Training Plans**: Old intensity_distribution in JSONB is optional, won't break anything.

### For Developers
1. Remove any UI components for intensity selection
2. Use `getIntensityZone(IF)` to display zones
3. Don't query or store intensity enums
4. Use `activity_plans.estimated_tss` for planning

### For Users
- **No action required** - The system handles everything automatically
- Intensity now appears on completed workouts, not planned ones
- More accurate, less guessing

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Accuracy** | Guessed | Measured from actual data |
| **Flexibility** | Rigid pre-assignment | Adapt to how you feel |
| **Complexity** | 5 intensity levels | Just IF value |
| **Planning** | Must predict intensity | Just link to workout |
| **Analysis** | Based on plans | Based on reality |
| **Database** | Store enums | Calculate from IF |

---

## Next Steps

### Immediate (Week 1)
1. Update mobile UI components
2. Remove intensity pickers
3. Simplify training plan wizard
4. Update trends calculations

### Short-term (Week 2-3)
1. Add retrospective analysis features
2. Show intensity trends over time
3. Warn about training imbalances
4. Educational content about IF

### Long-term (Month 2+)
1. AI recommendations based on IF patterns
2. Adaptive training plans
3. Fatigue detection from IF trends
4. Advanced analytics (decoupling, efficiency factor)

---

## Documentation

### Created
- ✅ `INTENSITY_CALCULATION.md` - Complete technical guide (352 lines)
- ✅ `INTENSITY_REFACTOR_SUMMARY.md` - Detailed change log (486 lines)
- ✅ `INTENSITY_REFACTOR_TODO.md` - Action items (230 lines)
- ✅ `INTENSITY_REFACTOR_EXEC_SUMMARY.md` - This document

### To Update
- User guide (explain IF and TSS)
- API documentation (updated endpoints)
- Training plan documentation (remove intensity prescription)

---

## Risk Assessment

### Low Risk ✅
- No database migrations needed
- Backward compatible (old fields ignored)
- Core calculations well-tested
- Existing data not affected

### Moderate Risk ⚠️
- UI updates across multiple components
- User education needed
- Some features temporarily unavailable (intensity target)

### Mitigation
- Comprehensive documentation
- Gradual rollout of UI changes
- Clear user communication
- Monitoring for errors

---

## Success Metrics

### Technical
- [ ] No errors related to missing intensity fields
- [ ] All activities display calculated zones
- [ ] Trends screen shows IF distribution
- [ ] Constraint validation works without intensity

### User Experience
- [ ] Users understand IF values
- [ ] Users appreciate flexibility
- [ ] Training compliance improves
- [ ] Users find insights valuable

### Business
- [ ] Feature adoption rate
- [ ] User satisfaction scores
- [ ] Support ticket reduction
- [ ] Training plan completion rates

---

## Conclusion

This refactor fundamentally improves GradientPeak's approach to training intensity:

✅ **Scientifically sound** - Measures actual effort  
✅ **User-friendly** - Less input required  
✅ **Technically simpler** - Fewer fields, cleaner code  
✅ **More accurate** - Real data, not predictions  
✅ **Future-proof** - Enables advanced analytics  

The core implementation is complete. Focus now shifts to updating the UI to match the new paradigm.

---

**Approved By:** Development Team  
**Implementation Status:** 60% Complete (Core done, UI pending)  
**Target Completion:** Week of January 27, 2025