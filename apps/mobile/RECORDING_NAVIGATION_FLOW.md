# Recording Navigation Flow - Complete User Journey

## Overview

This document outlines the complete navigation flow for the activity recording workflow in the GradientPeak mobile application, from initial recording setup through final submission or deletion.

## Navigation Flow Diagram

```
Home Screen
    ↓
Recording Modal (/modals/record)
    ↓ (on finish recording)
Submit Recording Modal (/modals/submit-recording?recording_id={id})
    ↓ (on submit OR delete)
Home Screen
```

## Detailed Flow Steps

### 1. **Starting a Recording**
- **From**: Home screen `/(internal)/(tabs)/`
- **To**: Recording modal `/modals/record`
- **Trigger**: User taps "Start Recording" or similar action
- **Parameters**: None
- **Modal Type**: Full-screen modal with gesture disabled

### 2. **Recording Process**
- **Location**: Recording modal `/modals/record/index`
- **Sub-screens available**:
  - Activity selection (`/modals/record/activity`)
  - Sensor management (`/modals/record/sensors`) 
  - Permissions (`/modals/record/permissions`)
- **Flow**: User can navigate between sub-screens while recording
- **End condition**: User taps "Finish" button when recording is complete

### 3. **Finishing Recording**
- **From**: Recording modal (any sub-screen)
- **To**: Submit recording modal `/modals/submit-recording`
- **Parameters**: `recording_id={id}` (extracted from service)
- **Navigation method**: `router.push()`
- **Data passed**: Recording ID via URL parameter

### 4. **Submit Recording Screen**
- **Location**: `/modals/submit-recording/index`
- **Purpose**: Review and submit or delete recorded activity
- **Layout**: Header with 3 buttons + scrollable body (no footer)
- **User options**: 
  - Submit activity (header right button)
  - Delete activity (header left button)
  - Edit activity name and notes (body content)

### 5. **Completion - Submit Path**
- **From**: Submit recording modal
- **To**: Home screen `/(internal)/(tabs)/`
- **Trigger**: Successful activity submission
- **Flow**:
  1. User taps submit button in header
  2. Form validates and submits via tRPC
  3. Success message displays for 2 seconds
  4. Automatic navigation to home screen
- **Navigation method**: `router.push("/(internal)/(tabs)/")`

### 6. **Completion - Delete Path**
- **From**: Submit recording modal  
- **To**: Home screen `/(internal)/(tabs)/`
- **Trigger**: User confirms activity deletion
- **Flow**:
  1. User taps delete button in header
  2. Confirmation dialog appears
  3. User confirms deletion
  4. Immediate navigation to home screen
- **Navigation method**: `router.push("/(internal)/(tabs)/")`

## Navigation Implementation Details

### **Recording Modal Navigation**
```typescript
// apps/mobile/src/app/modals/record/index.tsx
const handleFinishRecording = useCallback(async () => {
  const recordingId = service?.recording?.id;
  if (recordingId) {
    router.push(`/modals/submit-recording?recording_id=${recordingId}`);
  }
}, [router, service]);
```

### **Submit Recording Navigation**
```typescript
// apps/mobile/src/app/modals/submit-recording/index.tsx
const navigateToHome = useCallback(() => {
  router.push("/(internal)/(tabs)/");
}, [router]);

// Success navigation (auto after 2 seconds)
useEffect(() => {
  if (isSuccess) {
    const timer = setTimeout(() => {
      navigateToHome();
    }, 2000);
    return () => clearTimeout(timer);
  }
}, [isSuccess, navigateToHome]);

// Delete navigation (immediate after confirmation)
const handleDiscard = () => {
  Alert.alert(
    "Discard Activity",
    "Are you sure you want to delete this activity? This action cannot be undone and you'll return to the home screen.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: navigateToHome },
    ]
  );
};
```

## User Experience Considerations

### **Navigation Stack Management**
- Uses `router.push()` instead of `router.replace()` or `router.dismiss()`
- Ensures proper navigation history
- Allows natural back navigation if needed

### **User Feedback**
- Success submission shows 2-second confirmation before navigation
- Delete action shows clear warning about returning to home
- Loading states prevent accidental navigation during processing

### **Error Handling**
- Missing recording ID triggers immediate navigation back
- Network errors allow retry without losing navigation context
- Form validation prevents submission until data is valid

## State Management During Navigation

### **Recording State**
- Recording service maintains state during modal navigation
- Service instance persists across screen changes
- EventEmitter pattern ensures real-time updates

### **Form State**
- Submit form auto-populates from recording data
- User edits preserved during submission process
- Form validation prevents invalid submissions

### **Navigation State**
- Each screen maintains its own local state
- Navigation parameters passed via URL for reliability
- No shared navigation state between screens

## Edge Cases Handled

### **Missing Recording ID**
- Immediate alert and navigation back to previous screen
- Prevents user from being stuck on empty submit screen

### **Network Failures**
- Retry functionality maintains current screen
- User can fix network issues without restarting process

### **Service Errors**
- Graceful error messages with option to retry
- Fallback navigation if service becomes unavailable

### **Rapid Navigation**
- Debounced navigation prevents double-navigation
- Loading states prevent multiple submissions

## Testing Scenarios

### **Happy Path**
1. Start recording from home
2. Record activity with sensors/GPS
3. Finish recording → navigates to submit screen
4. Review and submit → returns to home after 2 seconds

### **Delete Path**
1. Start recording from home
2. Record activity
3. Finish recording → navigates to submit screen  
4. Delete activity → confirms and returns to home immediately

### **Error Scenarios**
1. Network failure during submission → retry without losing progress
2. Missing recording ID → immediate feedback and safe navigation
3. Service unavailable → graceful error handling with fallback options

## Benefits of This Flow

1. **Clear User Journey**: Logical progression from recording to completion
2. **Consistent Return Path**: Both success and delete return to home
3. **No Dead Ends**: User always has clear path forward
4. **Proper Cleanup**: Navigation ensures proper state cleanup
5. **User Control**: Clear actions available at each step
6. **Feedback**: User always knows what will happen next

This navigation flow provides a smooth, predictable user experience while handling edge cases gracefully and maintaining proper application state throughout the recording workflow.