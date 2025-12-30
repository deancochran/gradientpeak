# QA Testing Fixes Summary

## Test Scenario
**Activity:** Sweet Spot Intervals indoor training ride  
**Trainer:** KICKR CORE  
**Platform:** Expo React Native (iOS)

---

## Issues Fixed

### 🔴 Issue #1: Target Power Mismatch Between Cards

**Problem:**
When starting a workout with a plan, the trainer control card displayed a different target power than the plan card. The two cards were not synchronized.

**Root Cause:**
The `TrainerControlCard` maintained its own local `targetValue` state and never read from the active plan. While the service correctly applied plan targets to the trainer via `applyStepTargets()`, the UI displayed the local state instead of the plan's target.

**Solution:**
1. **Added plan target power calculation** (`planTargetPower` memo) that:
   - Reads the current step's power target from the plan
   - Resolves `%FTP` to absolute watts using the user's profile FTP
   - Returns `null` if no power target exists

2. **Synchronized local state with plan** (new `useEffect`):
   - When in auto mode with a planned workout
   - Automatically updates `targetValue` to match `planTargetPower`
   - Logs synchronization for debugging

3. **Added visual "Plan" badge**:
   - Shows in the Target Power display when auto mode is active
   - Provides clear visual feedback that target is from the plan

**Files Modified:**
- `apps/mobile/components/RecordingCarousel/cards/TrainerControlCard.tsx`

**Impact:**
- Both cards now show identical power targets during planned workouts
- Users can clearly see when the trainer is following the plan
- Auto mode properly synchronizes with plan progression

---

### 🔴 Issue #2: Dashboard Metrics Not Displaying

**Problem:**
The dashboard card showed only the elapsed time at the top, with no other metrics visible. The live metrics section (power, HR, cadence, speed, distance, calories) did not render.

**Root Causes:**

1. **Data Flow Issue:**
   - `handleSensorData()` in the service only forwarded sensor readings to LiveMetricsManager when `state === "recording"`
   - Before recording started, sensors were connected and sending data but it wasn't being displayed
   - Users couldn't verify sensors were working before hitting record

2. **Layout/Rendering Issues:**
   - Used `contentContainerClassName` on ScrollView (invalid React Native prop - should be `contentContainerStyle`)
   - ScrollView's `contentContainerStyle` doesn't support `gap` property
   - Complex flex layout with ScrollView was causing rendering problems

**Solutions:**

1. **Fixed data flow** (`index.ts`):
   ```typescript
   private handleSensorData(reading: SensorReading) {
     // Always ingest sensor data for real-time display (even before recording starts)
     // The LiveMetricsManager will only persist data when recording is active
     this.liveMetricsManager.ingestSensorData(reading);
     
     // Only update notifications when actually recording
     if (this.state !== "recording") return;
     // ... rest of recording-specific logic
   }
   ```

2. **Complete dashboard redesign** with clean 3-row layout:
   - **Row 1:** Large elapsed time display (56pt font, centered)
   - **Row 2:** 4 equal-width cards (Power, HR, Cadence, Speed)
   - **Row 3:** 2 equal-width cards (Distance, Calories)

3. **Removed problematic elements:**
   - Removed ScrollView (not needed with fixed layout)
   - Used inline styles instead of className where needed
   - Simplified structure for reliable rendering

**Files Modified:**
- `apps/mobile/lib/services/ActivityRecorder/index.ts`
- `apps/mobile/components/RecordingCarousel/cards/DashboardCard.tsx`

**Impact:**
- Dashboard now displays all metrics reliably
- Users can see live sensor data before starting recording
- Clean, easy-to-read 3-row layout
- Better pre-ride sensor verification UX

---

## Technical Details

### Data Flow Architecture

**Sensor Data Path:**
```
KICKR CORE Sensor
  ↓ (Bluetooth)
SensorsManager
  ↓ (subscribe callback)
ActivityRecorderService.handleSensorData()
  ↓ (always forward)
LiveMetricsManager.ingestSensorData()
  ↓ (batched at 10Hz)
LiveMetricsManager emits "sensorUpdate" event
  ↓
useCurrentReadings() hook
  ↓
DashboardCard displays metrics
```

**Plan Target Flow:**
```
Plan Structure (V2 Schema)
  ↓
ActivityRecorderService.currentStep
  ↓
TrainerControlCard reads targets
  ↓
Resolves %FTP → watts using profile
  ↓
Updates targetValue state
  ↓
Both cards show same value
```

### LiveMetricsManager Design

The LiveMetricsManager is already architected correctly to support pre-recording display:
- Always adds data to buffer for real-time calculations
- Only persists to StreamBuffer when `isActive` (recording)
- Only updates max values when recording

This allows us to show live metrics before recording without corrupting the session data.

---

## Testing Recommendations

### Test Scenario 1: Target Power Sync
1. Connect KICKR CORE trainer
2. Navigate to Discover → Select "Sweet Spot Intervals"
3. Start the ride
4. **Verify:** 
   - Trainer control card shows "Plan" badge on target
   - Target power matches the plan card exactly
   - When step changes, both cards update together

### Test Scenario 2: Dashboard Metrics
1. Connect KICKR CORE and HR monitor
2. Start pedaling (before hitting record)
3. **Verify:**
   - Dashboard shows live power, cadence, HR, speed
   - All values update in real-time
4. Hit record button
5. **Verify:**
   - Metrics continue updating
   - Distance and calories start accumulating
   - Layout remains clean and readable

### Test Scenario 3: Complete Workout
1. Ride for 10-15 minutes through 2+ intervals
2. **Verify:**
   - Power targets update correctly on interval transitions
   - Dashboard metrics remain stable and accurate
   - No layout glitches or missing data

---

## Files Changed Summary

1. **TrainerControlCard.tsx**
   - Added `planTargetPower` calculation with `useMemo`
   - Added `useEffect` to sync `targetValue` with plan
   - Added "Plan" badge in target display
   - Total: ~40 lines added

2. **index.ts (ActivityRecorderService)**
   - Modified `handleSensorData()` to always forward data to LiveMetricsManager
   - Moved recording state check after ingestion
   - Total: ~5 lines modified

3. **DashboardCard.tsx**
   - Complete redesign with 3-row layout
   - Removed ScrollView, simplified structure
   - Used inline styles for reliability
   - Total: Complete rewrite (~170 lines)

---

## Notes

- All fixes maintain backward compatibility
- No breaking changes to the service API
- LiveMetricsManager persistence logic unchanged
- Plan validation and FTP error handling remain intact

---

## Related Documentation

- See `docs/V2_MIGRATION_SUMMARY.md` for plan structure schema
- See `ACTIVITY_CREATION_AND_PLAN_CREATION_UPDATE.md` for activity flow
- Service architecture documented in previous summary
