# Prepared State Implementation

## Overview

This document outlines the implementation of proactive permission checking and "prepared state" UI improvements in the GradientPeak mobile app. These changes ensure that:

1. **Permissions are proactively checked** when the permissions modal opens
2. **All cards are displayed before recording starts** (in pending/ready state)
3. **Sensors only stream values after recording begins**
4. **Metrics show "prepared" state** with placeholder values before recording
5. **Live readings indicate readiness** before actual data flows

## Changes Summary

### 1. Proactive Permission Management

#### File: `apps/mobile/src/app/modals/record/permissions.tsx`

**Changes:**
- Added proactive permission check on modal mount
- Implemented 2-second polling interval to detect permission changes
- Ensures permissions are checked when modal is visible

**Benefits:**
- Real-time permission state updates
- Detects when users enable permissions in system settings
- No need to manually refresh

```typescript
// Proactively check permissions when modal mounts
useEffect(() => {
  if (service) {
    check();
  }
}, [service, check]);

// Subscribe to permission changes - poll every 2 seconds
useEffect(() => {
  if (!service) return;

  const intervalId = setInterval(() => {
    check();
  }, 2000);

  return () => clearInterval(intervalId);
}, [service, check]);
```

---

### 2. ActivityRecorderService Permission Updates

#### File: `apps/mobile/src/lib/services/ActivityRecorder/index.ts`

**Changes:**
- Added `checkPermissions()` method that emits permission updates
- Ensures all permission state changes are broadcast via events

**Implementation:**
```typescript
async checkPermissions(): Promise<void> {
  await this.permissionsManager.checkAll();
  // Emit updates for all permissions
  const types: PermissionType[] = [
    "bluetooth",
    "location",
    "location-background",
  ];
  types.forEach((type) => {
    this.emitPermissionUpdate(type);
  });
  this.notify();
}
```

---

### 3. Updated Permission Action Hooks

#### File: `apps/mobile/src/lib/hooks/useActivityRecorderEvents.ts`

**Changes:**
- Updated `usePermissionActions` to use new `checkPermissions()` method
- Ensures hook consumers receive permission update events

---

### 4. Card Visibility Logic

#### File: `apps/mobile/src/app/modals/record/index.tsx`

**Before:**
- Cards only shown during `recording` or `paused` states
- Users couldn't see what metrics would be tracked

**After:**
- All cards (power, heart rate, analysis, elevation) shown when `state !== "finished"`
- Cards display in "prepared state" before recording starts

**Changes:**
```typescript
// Show all cards before recording starts (prepared state) and during recording
// Power card - always show when not finished
if (state !== "finished") {
  cardList.push("power");
}

// Heart rate card - always show when not finished
if (state !== "finished") {
  cardList.push("heartrate");
}

// Analysis card - always show when not finished
if (state !== "finished") {
  cardList.push("analysis");
}

// Elevation card - show for outdoor activities or when not finished
if (isOutdoorActivity(activityType) || state !== "finished") {
  cardList.push("elevation");
}
```

---

### 5. Dashboard Card Prepared State

#### File: `apps/mobile/src/app/modals/record/index.tsx`

**Changes:**
- Added prepared state UI for pending/ready states
- Shows placeholder metrics (`--`) with muted styling
- Displays "Ready to start recording" message
- Shows all metric categories with placeholder values

**Benefits:**
- Users see what metrics will be tracked
- Clear indication that system is ready
- Better user experience and expectations

---

### 6. PowerCard Prepared State

#### File: `apps/mobile/src/components/dashboard/PowerCard.tsx`

**Changes:**
- Added `useRecordingState` hook to detect prepared state
- Shows "READY" indicator instead of "LIVE"
- Displays placeholder values with reduced opacity
- Shows "Power Metrics Ready" message

**UI Elements:**
- Large `---` placeholder for current power
- Placeholder values for Avg, Max, and NP
- Green checkmark "READY" indicator
- Informational message about connecting power meter

---

### 7. HeartRateCard Prepared State

#### File: `apps/mobile/src/components/dashboard/HeartRateCard.tsx`

**Changes:**
- Added prepared state check with `useRecordingState`
- Shows "READY" indicator before recording
- Displays placeholder heart rate and statistics
- Clear messaging about monitor connection

**UI Elements:**
- `---` placeholder for current heart rate
- Placeholder values for Avg, Max, and threshold percentage
- Green checkmark "READY" indicator
- "Heart Rate Monitoring Ready" message

---

### 8. AnalysisCard Prepared State

#### File: `apps/mobile/src/components/dashboard/AnalysisCard.tsx`

**Changes:**
- Added prepared state for advanced metrics
- Shows placeholder TSS and power analysis metrics
- Displays "Analysis Engine Ready" message

**UI Elements:**
- `---` placeholder for TSS (Training Stress Score)
- Placeholder Intensity Factor and Variability Index
- Green checkmark "READY" indicator
- Message about metrics being calculated after recording starts

---

### 9. ElevationCard Prepared State

#### File: `apps/mobile/src/components/dashboard/ElevationCard.tsx`

**Changes:**
- Added prepared state for elevation tracking
- Shows placeholder elevation and ascent/descent values
- Displays "Elevation Tracking Ready" message

**UI Elements:**
- `---` placeholder for current elevation
- Placeholder ascent and descent values
- Green checkmark "READY" indicator
- Message about GPS elevation tracking

---

## Architecture Pattern

### Prepared State Detection

All cards use a consistent pattern to detect prepared state:

```typescript
const recordingState = useRecordingState(service);
const isPrepared = recordingState === "pending" || recordingState === "ready";

if (isPrepared) {
  return <PreparedStateUI />;
}
```

### Visual Indicators

**Prepared State:**
- Green checkmark icon with "READY" label
- Muted colors (`text-muted-foreground/30`)
- Placeholder values (`---` or `--`)
- Informational messages

**Active State:**
- Live indicator (pulsing dot)
- Full color metrics
- Real-time values
- "LIVE" or "GPS" labels

---

## Sensor Streaming Control

### Current Implementation

Sensors are managed by the `ActivityRecorderService`:
- Sensor data is processed through `handleSensorData()`
- Location data is processed through `handleLocationData()`
- `LiveMetricsManager` calculates metrics

### Recording State Gates

The `LiveMetricsManager` starts recording when:
```typescript
this.liveMetricsManager.startRecording(recording.id);
```

This ensures:
- Metrics are only calculated during active recording
- No metric persistence before recording starts
- Clean separation between prepared and active states

---

## User Experience Flow

### Before Recording (Prepared State)

1. **Modal Opens**: All cards are visible with "READY" indicators
2. **Permissions Check**: System proactively checks permissions
3. **Placeholder Metrics**: All metrics show `---` or `--` values
4. **Clear Messaging**: Each card explains what data will be tracked
5. **Visual Consistency**: All cards use muted colors and checkmarks

### During Recording (Active State)

1. **Start Button Pressed**: Recording state changes to "recording"
2. **Cards Update**: All prepared states switch to active states
3. **Live Indicators**: "READY" badges change to "LIVE" with pulsing dots
4. **Real Data Flows**: Sensors stream data, metrics calculate in real-time
5. **Full Color UI**: Metrics display with full color and emphasis

### Benefits

- **Transparency**: Users see exactly what will be tracked
- **Confidence**: Clear indication that system is ready
- **Expectation Setting**: Users know what sensors/data are available
- **Reduced Confusion**: No surprise when cards "appear" after starting
- **Better Onboarding**: New users understand the tracking system

---

## Testing Checklist

### Prepared State Display

- [ ] All cards visible in pending state
- [ ] Placeholder values show correctly
- [ ] "READY" indicators display with green checkmarks
- [ ] Informational messages are clear and helpful

### Permission Checking

- [ ] Permissions checked when modal opens
- [ ] Permission changes detected via polling
- [ ] UI updates when permissions change
- [ ] No errors in permission checking flow

### State Transitions

- [ ] Smooth transition from prepared to active state
- [ ] "READY" changes to "LIVE" when recording starts
- [ ] Placeholder values replaced with real data
- [ ] Colors change from muted to full brightness

### Recording Flow

- [ ] Metrics only calculated during recording
- [ ] Sensors only stream to UI after start
- [ ] No data persisted before recording starts
- [ ] Clean state reset between recordings

---

## Future Enhancements

### Potential Improvements

1. **Sensor Connection Status**: Show which sensors are connected in prepared state
2. **Permission Warnings**: Display warnings if permissions are missing
3. **GPS Signal Strength**: Show GPS signal quality before starting
4. **Battery Estimates**: Show estimated battery usage before recording
5. **Pre-flight Checklist**: Interactive checklist for optimal recording setup

### Advanced Features

1. **Sensor Preview**: Show live sensor readings without starting recording
2. **Connection Testing**: Test sensor connections before starting
3. **Route Preview**: Show route on map before recording (for planned activities)
4. **Target Validation**: Validate FTP/threshold values before starting

---

## Related Documentation

- `HANDOFF_IMPLEMENTATION.md` - Event-based hooks and service architecture
- `RECORDING_SERVICE_RESET.md` - Service lifecycle and reset functionality
- `RECORDING_NAVIGATION_FLOW.md` - Modal navigation and flow

---

## Conclusion

The prepared state implementation significantly improves the user experience by:

1. **Proactively managing permissions** with real-time updates
2. **Displaying all tracking cards before recording** with clear placeholder states
3. **Setting clear expectations** about what data will be tracked
4. **Providing visual feedback** about system readiness
5. **Maintaining clean separation** between prepared and active states

This creates a more transparent, confident, and user-friendly recording experience that helps users understand the tracking system before they begin their activity.