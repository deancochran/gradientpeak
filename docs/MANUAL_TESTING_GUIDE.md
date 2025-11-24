# 📱 Manual Testing Guide - Mobile Activity Builder

**Version**: 1.0  
**Platform**: React Native (Expo)  
**Testing Requirements**: Physical iOS or Android device  
**Estimated Testing Time**: 30-45 minutes  

---

## 🎯 Testing Overview

This guide covers manual testing for the redesigned Activity Plan Builder. All features should be tested on physical devices only - simulators don't support haptic feedback and may have performance differences.

### ✅ Features to Test

1. **Smart Defaults** - Context-aware step creation
2. **Timeline Chart** - Visual activity representation  
3. **Activity Type Selection** - 6 different activity types
4. **Step Management** - CRUD operations with drag & drop
5. **Step Editor Dialog** - Comprehensive step editing
6. **TSS/IF Calculations** - Real-time training metrics
7. **Form Validation** - Error handling and data integrity
8. **Performance** - Smooth animations and interactions

---

## 📋 Pre-Testing Setup

### Device Requirements
- ✅ Physical iOS device (iOS 13+) OR Android device (API 21+)
- ✅ Expo Go app installed OR development build
- ✅ Network connection for initial app load
- ✅ Haptic feedback enabled in device settings

### App Setup
1. Launch the mobile app
2. Navigate to **Plan** tab
3. Tap **"Create Activity Plan"** or similar entry point
4. Confirm you see the new interface (not the old modal-heavy version)

---

## 🧪 Test Cases

### Test 1: Smart Defaults & Quick Actions

**Objective**: Verify smart defaults work correctly for different activity types

**Steps**:
1. **Test Activity Type Selection**:
   - Swipe through horizontal activity selector
   - Try each activity type: Run, Bike, Treadmill, Trainer, Strength, Swimming
   - Verify selection highlights and haptic feedback works

2. **Test Quick Add (3-step activity)**:
   - With "Outdoor Run" selected, tap "Quick Add"
   - Verify 3 steps appear: "Warm-up", "Interval 1", "Cool-down"
   - Check durations: 10min, 20min, 5min
   - Check targets: 60% MaxHR, 75% MaxHR, 55% MaxHR

3. **Test Different Activity Types**:
   - Clear steps (delete all)
   - Select "Outdoor Bike", tap "Quick Add"
   - Verify targets change to %FTP: 60%, 80%, 55%
   - Select "Swimming", tap "Quick Add"  
   - Verify distance-based: 200m, 400m, 100m with RPE targets

**Expected Results**:
- ✅ Each activity type has appropriate defaults
- ✅ Duration types match activity (time for run/bike, distance for swim)
- ✅ Intensity targets are activity-specific (%FTP, %MaxHR, RPE)
- ✅ Step names are contextual (Warm-up vs Easy Swim)
- ✅ Haptic feedback on all interactions

---

### Test 2: Timeline Chart Visualization

**Objective**: Test visual timeline representation and interactions

**Steps**:
1. **Basic Timeline Display**:
   - Create a activity with Quick Add
   - Verify timeline shows colored bars
   - Check proportional widths (warmup shorter than main work)
   - Verify colors represent intensity (blue=easy, green=moderate, etc.)

2. **Timeline Interactions**:
   - Tap different timeline bars
   - Verify corresponding step cards highlight
   - Check haptic feedback on timeline taps
   - Tap same bar again to deselect

3. **Dynamic Updates**:
   - Add a new step with "Add Step"
   - Verify timeline updates immediately
   - Delete a step, verify timeline adjusts
   - Change activity type, verify colors update

4. **Edge Cases**:
   - Create empty activity, verify "Tap + to add steps" message
   - Create activity with only "Until Finished" durations
   - Test very short steps vs very long steps

**Expected Results**:
- ✅ Timeline shows immediately after adding steps
- ✅ Bar widths are proportional to step durations
- ✅ Colors match intensity zones (blue=recovery, red=high intensity)
- ✅ Selection highlighting works with haptic feedback
- ✅ Timeline updates in real-time as structure changes
- ✅ Handles edge cases gracefully

---

### Test 3: Metrics Calculation (TSS/IF)

**Objective**: Verify real-time TSS and Intensity Factor calculations

**Steps**:
1. **Basic Calculation**:
   - Create "Outdoor Bike" activity with Quick Add
   - Note TSS and IF values in metrics cards
   - Expected: TSS ~45-65, IF ~0.7-0.8

2. **Dynamic Updates**:
   - Add another 20min step at 90% FTP
   - Watch TSS increase (should be +50-70 TSS)
   - Watch IF increase to ~0.8+

3. **Different Activity Types**:
   - Switch to "Outdoor Run", use Quick Add
   - Verify TSS calculation works with %MaxHR
   - Try Swimming with RPE targets
   - Try Strength training with RPE

4. **Edge Cases**:
   - Create steps with no targets, verify TSS = 0 for those steps
   - Create very high intensity (RPE 10), verify realistic TSS
   - Create very long duration (2 hours), verify scaling

**Expected Results**:
- ✅ TSS values are realistic (easy hour = 40-60 TSS, hard hour = 80-120 TSS)
- ✅ IF values range 0.0-2.0+ (typical activities 0.6-1.2)
- ✅ Calculations update in real-time
- ✅ Different intensity types (FTP, MaxHR, RPE) all contribute to TSS
- ✅ Zero intensity targets result in zero TSS contribution

---

### Test 4: Step Editor Dialog

**Objective**: Test comprehensive step editing functionality

**Steps**:
1. **Open Step Editor**:
   - Tap "Add Step" button
   - Verify dialog opens with form fields
   - Check all fields are present: Name, Duration Type, Value, Unit, Targets, Notes

2. **Duration Type Testing**:
   - Test "Time-based": Enter 15 minutes
   - Test "Distance-based": Enter 5 km  
   - Test "Repetitions": Enter 12 reps
   - Test "Until Finished": Verify no value/unit fields
   - Verify units change appropriately (seconds/minutes, meters/km, reps)

3. **Intensity Targets**:
   - Add first target: Select "%FTP", enter 85
   - Add second target: Select "RPE", enter 7
   - Try to add third target (should be disabled at 2 targets)
   - Delete targets with trash icon
   - Test all 8 intensity types: %FTP, %MaxHR, %ThresholdHR, watts, bpm, speed, cadence, RPE

4. **Form Validation**:
   - Leave name empty, try to save - should show error
   - Enter invalid numbers (negative, zero) - should show error
   - Enter very high values (1000% FTP) - should validate
   - Test with all fields filled correctly - should save

5. **Edit Existing Step**:
   - Create a step, then tap edit icon on step card
   - Verify form pre-populates with existing values
   - Modify values, save, verify changes appear

**Expected Results**:
- ✅ All form fields work correctly
- ✅ Duration type changes update available units
- ✅ Can add/remove up to 2 intensity targets
- ✅ Form validation prevents invalid data
- ✅ Editing existing steps pre-populates correctly
- ✅ Changes save and appear immediately
- ✅ Cancel button discards changes

---

### Test 5: Step Management (CRUD + Drag/Drop)

**Objective**: Test step creation, reading, updating, deletion, and reordering

**Steps**:
1. **Create Operations**:
   - Use "Add Step" button (opens editor)
   - Use "Quick Add" button (creates 3 steps)
   - Use "Repeat" button (creates interval block)

2. **Read Operations**:
   - Verify step cards show all information correctly
   - Check step names, durations, targets display properly
   - Verify timeline reflects step structure

3. **Update Operations**:
   - Tap edit icon on any step card
   - Modify name, duration, targets
   - Save and verify changes appear immediately
   - Check timeline updates with new information

4. **Delete Operations**:
   - Tap delete (trash) icon on step card
   - Verify confirmation dialog appears
   - Confirm deletion, verify step disappears
   - Cancel deletion, verify step remains
   - Test deleting all steps, verify empty state appears

5. **Reorder Operations**:
   - Long-press step card for 300ms
   - Feel haptic feedback (medium vibration)
   - Drag step up or down
   - Release in new position
   - Verify order changes and timeline updates

**Expected Results**:
- ✅ All CRUD operations work smoothly
- ✅ Changes reflect immediately in UI
- ✅ Drag & drop works with proper haptic feedback
- ✅ Confirmation dialogs prevent accidental deletion
- ✅ Empty state shows helpful message
- ✅ Timeline always matches step structure

---

### Test 6: Activity Type-Specific Behavior

**Objective**: Verify each activity type has correct defaults and behavior

**Steps**:
1. **Outdoor Run**:
   - Select activity type
   - Use Quick Add
   - Verify: Time-based durations, %MaxHR targets, "Warm-up/Cool-down" naming

2. **Outdoor Bike**:  
   - Select activity type
   - Use Quick Add
   - Verify: Time-based durations, %FTP targets, "Warm-up/Cool-down" naming

3. **Swimming**:
   - Select activity type
   - Use Quick Add  
   - Verify: Distance-based durations, RPE targets, "Easy Swim" naming

4. **Strength Training**:
   - Select activity type
   - Add individual steps
   - Verify: Repetition-based durations, RPE targets, "Exercise N" naming

5. **Indoor Activities** (Treadmill, Trainer):
   - Test both indoor variants
   - Verify they behave like their outdoor counterparts
   - Check TSS calculations work correctly

**Expected Results**:
- ✅ Each activity type has distinct, logical defaults
- ✅ Duration types match activity (swim=distance, strength=reps)  
- ✅ Intensity targets are appropriate (%FTP for bikes, RPE for swimming)
- ✅ Step naming follows conventions
- ✅ TSS calculations use correct assumptions for each type

---

### Test 7: Form Integration & Validation

**Objective**: Test React Hook Form integration and data validation

**Steps**:
1. **Activity Name**:
   - Tap activity name in header
   - Enter various names (short, long, special characters)
   - Verify name appears in header immediately

2. **Form Validation on Save**:
   - Create activity with empty name - should show error
   - Create activity with no steps - should show error  
   - Create valid activity - should save successfully
   - Check console for validation errors during testing

3. **Real-time Updates**:
   - Add/remove steps, watch duration metric update
   - Change intensity targets, watch TSS/IF update
   - Switch activity types, watch defaults change

4. **Persistence Testing**:
   - Create a complex activity
   - Try to navigate away (if navigation exists)
   - Return and verify data persistence
   - Test save functionality completely

**Expected Results**:
- ✅ Form validates correctly before saving
- ✅ Real-time updates work smoothly
- ✅ No console errors during normal usage
- ✅ Activity name updates immediately
- ✅ Metrics recalculate automatically

---

### Test 8: Performance & User Experience

**Objective**: Test performance, animations, and overall UX

**Steps**:
1. **Performance Testing**:
   - Create large activity (20+ steps)
   - Verify timeline renders smoothly
   - Test scrolling performance in step list
   - Check drag & drop performance with many steps

2. **Animation Testing**:
   - Test all transitions (dialog open/close, step selection)
   - Verify 60fps performance during animations
   - Check no dropped frames during intensive operations

3. **Haptic Feedback Testing**:
   - Test on physical device only
   - Verify different haptic types:
     - Light: Button taps, step selection
     - Medium: Long-press to drag
     - Success: Step added/deleted
     - Warning: Delete confirmation
   - Ensure haptics don't interfere with performance

4. **Responsiveness Testing**:
   - Test rapid tapping (shouldn't duplicate actions)
   - Test simultaneous gestures (shouldn't conflict)
   - Test during device rotation (if supported)

**Expected Results**:
- ✅ Smooth performance with large activities (20+ steps)
- ✅ All animations run at 60fps
- ✅ Haptic feedback enhances experience without lag
- ✅ No duplicate actions from rapid tapping
- ✅ Responsive to all user interactions

---

## 🚨 Common Issues to Watch For

### Critical Issues (Test Failed)
- ❌ App crashes when adding/deleting steps
- ❌ Data loss when switching screens
- ❌ Form validation allows invalid data to be saved
- ❌ Timeline completely out of sync with step data
- ❌ Haptic feedback not working on physical device

### Performance Issues
- ⚠️ Noticeable lag when adding steps to large activities
- ⚠️ Timeline animation stuttering or dropped frames
- ⚠️ Scroll performance issues with 10+ steps
- ⚠️ Dialog open/close animations not smooth

### UX Issues
- ⚠️ Confusing or incorrect smart defaults
- ⚠️ TSS/IF calculations seem unrealistic
- ⚠️ Difficult to edit existing steps
- ⚠️ Timeline colors don't match expected intensity
- ⚠️ Drag & drop difficult to initiate or control

### Minor Issues
- ⚪ Small visual glitches in UI
- ⚪ Inconsistent spacing or alignment
- ⚪ Minor haptic feedback inconsistencies
- ⚪ Occasional TypeScript warnings in console

---

## 📊 Testing Checklist

### Core Functionality
- [ ] Smart defaults work for all 6 activity types
- [ ] Timeline chart displays and updates correctly  
- [ ] Step editor dialog has all required fields
- [ ] TSS/IF calculations are realistic
- [ ] Drag & drop reordering works smoothly
- [ ] Delete confirmation prevents accidents
- [ ] Form validation prevents bad data

### User Experience
- [ ] Quick Add creates complete 3-step activity in <5 seconds
- [ ] Single step creation takes <30 seconds
- [ ] All interactions provide haptic feedback
- [ ] Visual feedback is immediate and clear
- [ ] Error messages are helpful and actionable

### Edge Cases
- [ ] Empty activity state handled gracefully
- [ ] Very large activities (20+ steps) perform well
- [ ] All duration types work (time/distance/reps/open)
- [ ] All intensity types calculate TSS correctly
- [ ] Maximum targets per step (2) enforced

### Device Compatibility
- [ ] iOS: Haptics, gestures, performance all good
- [ ] Android: Haptics, gestures, performance all good  
- [ ] Different screen sizes handled properly
- [ ] Works in both portrait orientations

---

## 🎯 Success Criteria

**Green Light** (Ready for Production):
- ✅ All core functionality works without crashes
- ✅ Performance is smooth (60fps) on target devices  
- ✅ User can create complete activity in <60 seconds
- ✅ TSS/IF calculations are within reasonable ranges
- ✅ All data validates and saves correctly

**Yellow Light** (Minor Issues):
- ⚠️ Minor visual inconsistencies that don't affect functionality
- ⚠️ Occasional performance hiccups under stress
- ⚠️ Non-critical haptic feedback inconsistencies

**Red Light** (Needs Fixes):
- ❌ Any crashes or data loss
- ❌ Major performance issues (lag, stuttering)
- ❌ Broken core workflows (can't create/edit/save)
- ❌ Validation allows bad data through

---

## 📝 Reporting Issues

When reporting issues, please include:

1. **Device Info**: iOS/Android version, device model
2. **Steps to Reproduce**: Exact sequence that causes issue  
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Screenshots/Videos**: If visual issue
6. **Frequency**: Does it happen every time or occasionally?

### Example Issue Report:
```
**Issue**: Timeline colors don't update when changing activity type
**Device**: iPhone 14 Pro, iOS 17.1
**Steps**: 
1. Create activity with Outdoor Run (Quick Add)
2. Change activity type to Swimming  
3. Timeline bars remain blue/green instead of changing
**Expected**: Timeline should update to reflect new intensity mappings
**Actual**: Timeline colors stay the same as original activity type
**Frequency**: Every time
```

---

## 🚀 Final Validation

Before marking testing complete:

1. **Create 3 Different Activities**:
   - Easy 45-min bike ride (TSS ~40-60)
   - Hard 1-hour run with intervals (TSS ~70-100)  
   - 30-min swim activity (distance-based)

2. **Verify All Calculations Make Sense**:
   - TSS values realistic for effort/duration
   - IF values in reasonable range (0.6-1.2 typical)
   - Duration calculations accurate

3. **Test Complete User Journey**:
   - Open app → Create activity → Add steps → Edit step → Save
   - Should take <2 minutes for experienced user
   - Should feel natural and intuitive

4. **Performance Under Load**:
   - Create 15-step activity with multiple repetitions
   - Verify smooth performance throughout

---

**Testing Complete**: ✅ Ready for production deployment  
**Testing Issues**: ⚠️ Minor issues found, see reports  
**Testing Failed**: ❌ Critical issues found, needs development fixes

---

**Version**: 1.0  
**Last Updated**: 2024  
**Total Test Time**: ~30-45 minutes per platform
