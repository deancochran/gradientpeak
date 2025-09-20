# TurboFit Mobile App — Record Page Stepper Flow Implementation

## 🎯 Purpose

The **Record** page provides a guided **stepper flow** to prepare users for both **planned** and **unplanned** workouts. The stepper ensures all required context, permissions, and device connections are established before transitioning to the actual recording screen.

---

## 🏗️ Current Implementation Status

**Planned Feature** - This document describes the intended implementation based on current architecture patterns and existing infrastructure.

### Existing Infrastructure
- **Activity Store**: `useWorkoutStore` with comprehensive activity state management
- **Permissions Store**: `usePermissionsStore` with Bluetooth and location permission handling
- **Core Types**: Shared activity types and constraints from `@repo/core`
- **Navigation**: Expo Router with file-based routing

---

## 🪜 Stepper Flow Design

### **Step 1: Activity Mode Selection**
* **Planned Activity**
  * Select from user's training plans and scheduled activities
  * Each planned activity has associated activity type, duration, and intensity targets
* **Unplanned Activity**
  * Direct activity type selection without plan requirements
  * Supports all activity types defined in `@repo/core/types/activity-types`

### **Step 2: Activity Type Confirmation**
* Display activity-specific requirements and constraints
* Show estimated duration and metrics based on activity type
* Provide option to customize activity settings

### **Step 3: Permission Enablement (Conditional)**
* **Location Permissions**: Required for GPS-based activities (running, cycling, hiking)
* **Background Location**: Required for continuous outdoor tracking
* **Bluetooth Permissions**: Required for external sensors (HR monitors, power meters, cadence sensors)
* Smart skipping of already-granted permissions

### **Step 4: Bluetooth Device Pairing (Conditional)**
* Scan for and connect to Bluetooth fitness devices
* Support for heart rate monitors, cycling sensors, power meters
* Device validation and connection status monitoring
* Skip step if no Bluetooth devices required for selected activity

### **Step 5: Ready Confirmation**
* **Summary Display**: Activity type, connected devices, permission status
* **Navigation Options**: Back to previous steps for adjustments
* **Final Action**: "Begin Recording" button to transition to recording screen

---

## 🎬 Navigation Flow

```
Record (Stepper) → Recording (Active) → Summary → Back to Tabs
                               ↘ Discard → Cleanup → Back to Tabs
```

### Transition to Recording
When user presses **"Begin Recording"**:
1. `useWorkoutStore` state is initialized with selected activity
2. Navigation to `/recording` screen with setup parameters
3. Recording screen handles actual metrics capture and timing
4. Navigation guards prevent accidental exit during active recording

---

## 🗄️ State Management Integration

### Activity Store State (`useWorkoutStore`)
```ts
interface ActiveWorkout {
  id: string;
  type: WorkoutType; // From @repo/core types
  status: "idle" | "recording" | "paused" | "completed" | "stopped";
  plannedActivityId?: string;
  settings: WorkoutSettings;
  // ... additional metrics and timing
}
```

### Stepper State (`useRecordSelection`)
```ts
interface RecordSelectionState {
  currentStep: number;
  mode: "planned" | "unplanned";
  selectedActivityType?: string;
  plannedActivityId?: string;
  permissions: {
    location: boolean;
    backgroundLocation: boolean;
    bluetooth: boolean;
  };
  connectedDevices: string[];
  setupComplete: boolean;
}
```

### Permission Integration
Leverages existing `usePermissionsStore` with:
- `checkPermission()` and `requestPermission()` methods
- Support for Bluetooth, location, and background location
- Platform-specific permission handling (Android vs iOS)

---

## 🎨 UI Component Structure

### Stepper Components
- **`RecordingStepper`**: Main container with step navigation logic
- **`StepIndicator`**: Visual progress bar with step labels
- **Step Components**: Individual step screens with focused responsibilities
  - `ActivityModeStep`: Planned vs unplanned selection
  - `PlannedActivityStep`: Training plan browsing and selection
  - `UnplannedActivityStep`: Activity type picker
  - `PermissionsStep`: Permission request and status
  - `BluetoothStep`: Device scanning and pairing
  - `ReadyStep`: Final confirmation and navigation

### Integration Points
- **Activity Types**: Uses `ACTIVITY_TYPES` from `@repo/core/types/activity-types`
- **Permission Checks**: Uses `permissionStrategies` from permissions store
- **Bluetooth**: Integrates with React Native BLE PLX for device communication
- **Navigation**: Expo Router with type-safe route parameters

---

## 🔄 Conditional Logic & Smart Skipping

### Permission Skipping
- Skip permission steps if already granted
- Conditional requirement based on activity type:
  - GPS activities require location permissions
  - Sensor-based activities require Bluetooth permissions

### Bluetooth Requirements
Based on `@repo/core` activity type constraints:
- **Requires Bluetooth**: Cycling (power/cadence), Running (HR), Strength (HR)
- **Optional Bluetooth**: Most other activities
- **No Bluetooth**: Yoga, Meditation, etc.

### Step Validation
- Each step validates its requirements before allowing progression
- Invalid steps show appropriate error states and guidance
- Back navigation allows correction of previous choices

---

## 🛡️ Error Handling & Recovery

### Permission Denials
- Graceful handling of permission rejections
- Guidance for enabling permissions in system settings
- Alternative workflows when permissions unavailable

### Bluetooth Issues
- Device connection failures handled gracefully
- Retry mechanisms and connection status monitoring
- Fallback to manual metric entry when sensors unavailable

### Navigation Interruptions
- State preservation during app backgrounding
- Recovery of in-progress selections
- Clean reset on explicit cancellation

---

## ✅ Benefits & Value Proposition

### User Experience
- **Guided Onboarding**: Step-by-step setup reduces user confusion
- **Context Awareness**: Smart step skipping based on current state
- **Final Confirmation**: Reduces errors with comprehensive summary
- **Seamless Transition**: Clean handoff to recording interface

### Technical Advantages
- **Modular Design**: Individual step components with single responsibilities
- **State Isolation**: Separation of selection state from recording state
- **Reusability**: Step components usable in other contexts (settings, onboarding)
- **Testability**: Isolated step logic enables comprehensive testing

### Architecture Alignment
- **Shared Types**: Leverages `@repo/core` for activity definitions
- **Existing Infrastructure**: Builds on current Zustand stores and permission system
- **Consistent Patterns**: Follows established React Native Reusables styling
- **Type Safety**: End-to-end TypeScript integration

---

## 🔧 Implementation Priorities

1. **Core Stepper Infrastructure**: Basic step navigation and state management
2. **Activity Selection**: Planned and unplanned activity type selection
3. **Permission Integration**: Hook into existing permission system
4. **Bluetooth Integration**: Device scanning and connection management
5. **Navigation Flow**: Clean transition to recording screen
6. **Error Handling**: Comprehensive error states and recovery
7. **Polish & Animation**: Smooth transitions and visual feedback

---

## 📋 Integration Checklist

- [ ] Create stepper component structure
- [ ] Implement `useRecordSelection` state management
- [ ] Integrate with existing permission system
- [ ] Add Bluetooth device scanning and pairing
- [ ] Connect to core activity types and constraints
- [ ] Implement navigation to recording screen
- [ ] Add comprehensive error handling
- [ ] Test across various permission scenarios
- [ ] Validate with different activity types
- [ ] Performance optimization and memory management

This implementation will transform the Record tab into a comprehensive, user-friendly preparation flow that ensures successful activity recording experiences.
