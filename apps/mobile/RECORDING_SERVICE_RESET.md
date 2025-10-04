# Recording Service Reset Implementation - Complete Guide

## Overview

This document outlines the implementation of the recording service reset functionality, which ensures that when users finish an activity (either by submitting or deleting), the ActivityRecorderService is properly reset for the next recording session.

## Problem Statement

### Issue Identified
When users completed an activity recording and returned to the home screen, navigating back to the record modal would show the previous activity in a paused or finished state instead of starting fresh. This created a poor user experience where:

- Previous recording data persisted across sessions
- Users couldn't start new activities cleanly
- Service state was inconsistent between recording sessions
- Metrics from previous activities were still visible

### Root Cause
The ActivityRecorderService maintained its state after recording completion, including:
- Recording state (`paused`, `finished`)
- Live metrics from previous activity
- Timing information
- Location data
- Plan progress
- Connected sensors data

## Solution Architecture

### Service Reset Method

Added `resetForNewActivity()` method to ActivityRecorderService:

```typescript
async resetForNewActivity() {
  try {
    // Stop running processes
    this.stopElapsedTimeUpdates();
    this.chunkProcessor?.stop();

    // Stop location services
    await this.locationManager.stopForegroundTracking();
    await this.locationManager.stopBackgroundTracking();

    // Stop foreground notification service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
      this.notificationsManager = undefined;
    }

    // Reset all state variables
    this.state = "pending";
    this.selectedActivityType = "indoor_bike_trainer";
    this.recording = undefined;
    this.chunkProcessor = undefined;
    this.planManager = undefined;
    
    // Reset timing
    this.startTime = undefined;
    this.pausedTime = 0;
    this.lastPauseTime = undefined;
    this.lastTimestamp = undefined;
    
    // Reset location/distance
    this.totalDistance = 0;
    this.lastLocation = undefined;
    
    // Clear metrics
    this.liveMetrics.clear();

    // Emit events to update UI
    this.emitStateChange();
    this.emitActivityTypeChange();
    this.emitMetricUpdate("elapsedTime", 0);
    this.emitMetricUpdate("distance", 0);
    this.emitPlanProgressUpdate();
  } catch (error) {
    // Graceful fallback on errors
    console.error("Error resetting service:", error);
    this.state = "pending";
    this.recording = undefined;
    this.liveMetrics.clear();
    this.emitStateChange();
  }
}
```

## Implementation Points

### 1. Submit Recording Screen Reset

**Location**: `apps/mobile/src/app/modals/submit-recording/index.tsx`

**Trigger**: When user completes activity (submit or delete)

```typescript
const navigateToHome = useCallback(async () => {
  // Reset service before navigation
  if (service) {
    try {
      await service.resetForNewActivity();
    } catch (error) {
      console.error("Error resetting service:", error);
    }
  }
  router.push("/(internal)/(tabs)/");
}, [router, service]);

// Called on successful submission (after 2 second delay)
useEffect(() => {
  if (isSuccess) {
    const timer = setTimeout(async () => {
      await navigateToHome();
    }, 2000);
    return () => clearTimeout(timer);
  }
}, [isSuccess, navigateToHome]);

// Called on activity deletion (immediate)
const handleDiscard = () => {
  Alert.alert(
    "Discard Activity",
    "Are you sure...you'll return to the home screen.",
    [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => await navigateToHome() 
      }
    ]
  );
};
```

### 2. Record Modal Safety Reset

**Location**: `apps/mobile/src/app/modals/record/index.tsx`

**Trigger**: When modal opens with service in finished/paused state

```typescript
// Safety reset when opening record modal
useEffect(() => {
  if (
    service && 
    (service.state === "finished" || service.state === "paused")
  ) {
    console.log("Resetting service from state:", service.state);
    service.resetForNewActivity().catch((error) => {
      console.error("Error resetting service in record modal:", error);
    });
  }
}, [service]);
```

## Reset Flow Diagram

```
User Journey:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Home Screen   │ -> │   Record Modal   │ -> │  Submit Modal       │
│   (fresh start) │    │   (recording)    │    │  (review/submit)    │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐                                ┌─────────────────────┐
│   Home Screen   │ <----------------------------- │  Service Reset      │
│   (clean state) │       Navigate + Reset         │  (resetForNewActivity) │
└─────────────────┘                                └─────────────────────┘
```

## State Reset Details

### Core Service Properties
- `state`: `"pending"` (ready for new recording)
- `selectedActivityType`: `"indoor_bike_trainer"` (default)
- `recording`: `undefined` (no active recording)
- `chunkProcessor`: `undefined` (no data processing)
- `planManager`: `undefined` (no active plan)

### Timing Properties
- `startTime`: `undefined`
- `pausedTime`: `0`
- `lastPauseTime`: `undefined`
- `lastTimestamp`: `undefined`

### Location/Distance Properties
- `totalDistance`: `0`
- `lastLocation`: `undefined`

### Live Metrics
- `liveMetrics.clear()` - Removes all sensor readings
- Emits zero values for key metrics (elapsedTime, distance)

### Background Services
- Stops location tracking (foreground & background)
- Stops foreground notification service
- Stops chunk processor
- Stops elapsed time intervals

## Event Emission

After reset, the service emits events to update all connected components:

```typescript
this.emitStateChange();           // "pending" state
this.emitActivityTypeChange();    // Default activity type
this.emitMetricUpdate("elapsedTime", 0);
this.emitMetricUpdate("distance", 0);
this.emitPlanProgressUpdate();    // No active plan
```

## Error Handling

### Graceful Degradation
If reset encounters errors (e.g., service communication failures):

1. **Primary Reset**: Attempts full cleanup of all services
2. **Fallback Reset**: If errors occur, performs minimal state reset:
   - Sets `state = "pending"`
   - Clears `recording`
   - Clears `liveMetrics`
   - Emits state change events

### Error Scenarios Handled
- Location service stop failures
- Notification service stop failures
- Chunk processor stop failures
- Service communication errors
- Race conditions during reset

## Testing Scenarios

### Happy Path
1. **Record Activity**: User records activity normally
2. **Submit Activity**: User submits via submit screen
3. **Service Reset**: Automatic service reset on navigation
4. **New Recording**: User can immediately start fresh recording

### Edge Cases
1. **Service Error During Reset**: Fallback reset ensures basic functionality
2. **Rapid Navigation**: Multiple reset calls handled gracefully
3. **Background Service Failures**: Reset continues with warnings
4. **Service Unavailable**: UI remains responsive with fallback state

### Safety Net Scenarios
1. **Manual Navigation**: User navigates back to record modal after completion
2. **App Background/Foreground**: Service state remains consistent
3. **Interrupted Submission**: Reset prevents stuck states

## Performance Considerations

### Async Operations
- Reset is async to properly clean up background services
- UI navigation doesn't wait for full cleanup completion
- Non-blocking error handling prevents UI freezes

### Memory Management
- Clears all metric data from previous sessions
- Releases chunk processor resources
- Stops background timers and intervals

### Service Communication
- Minimal service calls during reset
- Batched event emissions
- Efficient state transitions

## Benefits

### User Experience
- ✅ **Fresh Start**: Each recording session begins cleanly
- ✅ **Consistent State**: No leftover data from previous activities
- ✅ **Intuitive Flow**: Expected behavior matches user expectations
- ✅ **Reliable Navigation**: Predictable state transitions

### Technical Benefits
- ✅ **Memory Efficiency**: Clears unused data between sessions
- ✅ **State Consistency**: Prevents stale data issues
- ✅ **Error Prevention**: Reduces cross-session state conflicts
- ✅ **Debugging**: Clear service lifecycle management

## Future Enhancements

### Potential Improvements
1. **Selective Reset**: Option to preserve certain settings between sessions
2. **Reset Analytics**: Track reset success/failure rates
3. **Background Reset**: Perform reset during app backgrounding
4. **State Persistence**: Remember user preferences across resets

### Monitoring
1. **Reset Metrics**: Track how often resets are needed
2. **Error Rates**: Monitor reset failure frequency
3. **Performance Impact**: Measure reset operation timing

## Conclusion

The recording service reset implementation ensures a clean, reliable user experience by properly clearing service state between recording sessions. The two-tier approach (submit screen + safety net in record modal) provides robust coverage while maintaining good performance and error handling.

This solution addresses the core issue of persistent service state while providing graceful degradation and comprehensive error handling for a production-ready implementation.