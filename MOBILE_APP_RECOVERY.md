# TurboFit Mobile App Recovery Documentation

## 📱 Mobile Application Overview

TurboFit is a React Native + Expo fitness tracking application with offline-first capabilities and comprehensive activity recording features.

## 🏗️ Project Structure

```
apps/mobile/
├── src/
│   ├── components/
│   │   ├── activity/                 # Activity-related components
│   │   │   ├── ActivityProgressChart.tsx
│   │   │   ├── ActivitySelection.tsx
│   │   │   ├── CurrentStepGuide.tsx
│   │   │   ├── MetricsGrid.tsx
│   │   │   ├── RecordingBodySection.tsx
│   │   │   ├── RecordingControls.tsx
│   │   │   └── RecordingHeader.tsx
│   │   ├── modals/                   # Modal components
│   │   │   ├── EnhancedBluetoothModal.tsx
│   │   │   └── PermissionsModal.tsx
│   │   ├── record-selection/         # Stepper-based selection flow
│   │   │   ├── RecordingStepper.tsx
│   │   │   ├── StepIndicator.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useRecordSelection.tsx
│   │   │   └── steps/
│   │   │       ├── ActivityModeStep.tsx
│   │   │       ├── BluetoothStep.tsx
│   │   │       ├── PermissionsStep.tsx
│   │   │       ├── PlannedActivityStep.tsx
│   │   │       ├── ReadyStep.tsx
│   │   │       └── UnplannedActivityStep.tsx
│   │   └── ui/                       # UI components
│   │       ├── alert.tsx
│   │       ├── avatar.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── icon.tsx
│   │       ├── index.ts
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── switch.tsx
│   │       └── text.tsx
│   ├── lib/
│   │   ├── contexts/                 # React contexts
│   │   │   └── PermissionsContext.tsx
│   │   ├── hooks/                    # Custom hooks
│   │   │   ├── api/
│   │   │   │   └── profiles.ts
│   │   │   ├── useAdvancedBluetooth.ts
│   │   │   └── usePermissions.ts
│   │   ├── services/                 # Business logic services
│   │   │   ├── ActivityRecorder.ts
│   │   │   ├── ActivityService.ts
│   │   │   ├── PlannedActivityService.ts
│   │   │   └── TrendsService.ts
│   │   └── stores/                   # State stores
│   │       └── live-session-store.ts
│   └── routes/                       # Navigation routes
│       ├── (internal)/               # Authenticated routes
│       │   ├── (tabs)/               # Tab navigation
│       │   │   ├── record.tsx        # Main record screen
│       │   │   ├── activities.tsx
│       │   │   ├── planned_activities.tsx
│       │   │   ├── trends.tsx
│       │   │   └── profile.tsx
│       │   ├── recording.tsx         # Active recording screen
│       │   ├── activity-recording-summary.tsx
│       │   ├── activity-result.tsx
│       │   └── planned_activity-detail.tsx
│       └── _layout.tsx               # Root layout
├── app.config.ts
├── app-env.d.ts
├── babel.config.js
├── components.json
├── drizzle.config.ts
├── eslint.config.js
├── global.css
├── metro.config.js
├── nativewind-env.d.ts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## 🔄 Core Navigation Flow

### Record → Recording Flow
1. **Record Screen** (`record.tsx`): Stepper-based activity selection
2. **Recording Screen** (`recording.tsx`): Active recording with real-time metrics
3. **Summary Screen**: Post-activity analysis
4. **Return to Tabs**: Navigation completion

### Stepper Implementation
The record screen uses a 5-step guided flow:

```typescript
type SelectionStep = 
  | 'activity-mode' 
  | 'activity-selection' 
  | 'permissions' 
  | 'bluetooth' 
  | 'ready';
```

## 🎯 Key Components to Recreate

### 1. Record Screen (`record.tsx`)
```typescript
// Simplified structure
export default function RecordScreen() {
  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();
  
  useFocusEffect(useCallback(() => {
    // Reset state on tab focus
  }, []));

  return (
    <View className="flex-1 bg-background">
      <RecordingStepper />
      {/* Global modals available but controlled by stepper */}
    </View>
  );
}
```

### 2. RecordingStepper Component
```typescript
export const RecordingStepper: React.FC = () => {
  const { state, goToNextStep, goToPreviousStep, startRecording } = useRecordSelection();

  const renderCurrentStep = () => {
    switch (state.currentStep) {
      case 'activity-mode':
        return <ActivityModeStep onSelection={handleModeSelection} />;
      // ... other steps
      case 'ready':
        return <ReadyStep onStartRecording={startRecording} onBack={goToPreviousStep} />;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StepIndicator currentStep={state.currentStep} />
      {renderCurrentStep()}
    </View>
  );
};
```

### 3. useRecordSelection Hook
```typescript
interface SelectionState {
  currentStep: SelectionStep;
  activityMode: 'planned' | 'unplanned' | null;
  selectedActivityType: ActivityType | null;
  selectedPlannedActivity: string | null;
  permissionsGranted: boolean;
  bluetoothConnected: boolean;
  plannedActivities: PlannedActivity[];
}

export const useRecordSelection = () => {
  const [state, setState] = useState<SelectionState>(initialState);
  const router = useRouter();
  
  // Navigation logic with conditional step skipping
  const goToNextStep = useCallback(() => {
    // Skip permissions if already granted
    // Skip bluetooth if not needed
  }, []);

  // State management functions
  const startRecording = useCallback(async () => {
    // Validate and navigate to recording screen
    router.push({
      pathname: '/(internal)/recording',
      params: {
        profileId: profile.id,
        activityType: state.selectedActivityType?.id,
        plannedActivityId: state.selectedPlannedActivity,
        permissionsStatus: state.permissionsGranted ? 'granted' : 'unknown',
        bluetoothStatus: state.bluetoothConnected ? 'connected' : 'disconnected'
      }
    });
  }, [state, profile?.id, router]);

  return { state, goToNextStep, goToPreviousStep, startRecording, /* ... */ };
};
```

### 4. Recording Screen (`recording.tsx`)
```typescript
export default function RecordingScreen() {
  const params = useLocalSearchParams<{
    profileId: string;
    activityType?: string;
    plannedActivityId?: string;
    permissionsStatus?: string;
    bluetoothStatus?: string;
  }>();

  // Navigation guards
  useEffect(() => {
    // Validate permissions, activity selection, profile
    // Auto-start recording when valid
  }, []);

  // Recording state management
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [metrics, setMetrics] = useState(initialMetrics);

  return (
    <View className="flex-1 bg-background">
      <RecordingHeader {/* ... */} />
      <RecordingBodySection {/* ... */} />
      <RecordingControls {/* ... */} />
    </View>
  );
}
```

## 🎨 UI Component Structure

### RecordingHeader
- Status indicators (GPS, Bluetooth, Permissions)
- Activity type display
- Recording state indicators

### RecordingBodySection
- Activity selection UI (for record screen)
- Real-time metrics display (for recording screen)
- Progress charts and guidance

### RecordingControls
- Start/Pause/Resume/Stop recording buttons
- Discard/Finish actions
- Loading states

## 🔧 Core Services

### ActivityRecorder Service
```typescript
class ActivityRecorder {
  static async startRecording(profileId: string): Promise<string | null>;
  static async pauseRecording(): Promise<void>;
  static async resumeRecording(): Promise<void>;
  static async stopRecording(): Promise<void>;
  static getCurrentSession(): ActivitySession | null;
}
```

### ActivityService
```typescript
class ActivityService {
  static async createActivity(activityData: CreateActivityData): Promise<string>;
  static async getActivity(activityId: string): Promise<Activity>;
  static async getActivities(profileId: string): Promise<Activity[]>;
}
```

### PlannedActivityService
```typescript
class PlannedActivityService {
  static async getAllPlannedActivities(): Promise<PlannedActivity[]>;
  static async getPlannedActivity(id: string): Promise<PlannedActivity>;
  static async abandonSession(): Promise<void>;
}
```

## 📊 State Management

### useRecordSelection Hook
Manages the stepper state with:
- Step navigation with conditional skipping
- Activity selection state
- Permission and Bluetooth status
- Auto-reset on tab focus

### PermissionsContext
```typescript
const PermissionsContext = createContext<{
  hasAllRequiredPermissions: boolean;
  permissions: Record<string, PermissionState>;
  requestAllRequiredPermissions: () => Promise<boolean>;
}>();
```

### useAdvancedBluetooth Hook
```typescript
export const useAdvancedBluetooth = () => {
  const [allDevices, setAllDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);

  return {
    allDevices,
    connectedDevices,
    isScanning,
    isBluetoothEnabled,
    scanForDevices,
    connectDevice,
    disconnectDevice,
    stopScan
  };
};
```

## 🎯 Key Features to Reimplement

### 1. Stepper-Based Activity Selection
- 5-step guided flow
- Conditional step skipping
- Visual progress indicators
- State persistence and reset

### 2. Real-time Activity Recording
- GPS tracking with signal strength
- Bluetooth sensor integration (HR, power, cadence)
- Live metrics updating
- Navigation guards

### 3. Permission Management
- Comprehensive permission checking
- Graceful request flow
- Status indicators

### 4. Bluetooth Integration
- Device scanning and connection
- Sensor data processing
- Connection state management

### 5. Navigation System
- Tab-based navigation
- Protected routes
- Deep linking support
- Navigation guards

## 🔄 Data Flow

1. **User selects activity** → Stepper state updates
2. **Permissions validated** → Auto-advance or request
3. **Bluetooth configured** → Optional step with device management
4. **Recording started** → Navigation to recording screen with params
5. **Real-time tracking** → Metrics updated via ActivityRecorder
6. **Activity completed** → Summary screen navigation

## 🛠️ Technical Stack

- **Framework**: React Native + Expo SDK 53
- **Navigation**: Expo Router
- **Styling**: NativeWind (Tailwind CSS)
- **State**: React Context + useState/useEffect
- **Database**: SQLite (offline) + Web API (cloud)
- **Bluetooth**: react-native-ble-plx
- **Permissions**: Expo permissions system
- **Build**: Turborepo + Bun

## 📋 Recovery Checklist

1. [ ] Recreate basic project structure
2. [ ] Implement core navigation routes
3. [ ] Rebuild stepper components and hooks
4. [ ] Recreate recording screen with navigation guards
5. [ ] Implement ActivityRecorder service
6. [ ] Rebuild permission and Bluetooth systems
7. [ ] Recreate UI components (Header, Body, Controls)
8. [ ] Implement state management contexts
9. [ ] Add real-time metrics and sensor integration
10. [ ] Test navigation flows and error handling

## 🚀 Quick Start Commands

```bash
# Install dependencies
bun install

# Start development
bun run dev

# Build for production
bun run build

# Run tests
bun run test
```

This documentation provides a comprehensive overview of the TurboFit mobile application structure and implementation details to facilitate recovery and reconstruction of the codebase.