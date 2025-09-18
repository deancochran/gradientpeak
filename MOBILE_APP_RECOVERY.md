# TurboFit Mobile App Recovery Documentation

## 📋 Version Information
- **Expo SDK**: 54.0.0
- **React Native**: 0.81.4
- **Expo Router**: 6.0.6
- **Navigation**: Expo Router with file-based routing
- **State Management**: Zustand + React Context + Custom Hooks
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Database**: SQLite (offline) + Supabase (cloud sync)
- **Bluetooth**: react-native-ble-plx with advanced device management
- **Build System**: Turborepo + Bun

## 📱 Current State Assessment

### ✅ What's Still Intact
- **Monorepo Structure**: Core packages (`core`, , `supabase`) are preserved
- **Web App**: Next.js dashboard remains functional
- **Authentication**: External routes (sign-in, sign-up, etc.) are preserved
- **UI Components**: Basic UI components are available in OLD_components
- **Configuration**: All build/config files are intact

### ❌ What Needs Recreation
- **Main Tab Navigation**: Home, Record, Activities, Trends, Settings screens
- **Activity Recording System**: Stepper flow, recording screen, real-time metrics
- **Navigation Guards**: Session recovery and recording protection
- **Bluetooth Integration**: Device management and sensor data processing
- **State Management**: Zustand stores and React contexts

### 📁 Current Directory Structure
```
apps/mobile/src/
├── OLD_app/                 # Previous app structure (reference only)
├── OLD_components/          # Previous components (reference)
├── OLD_lib/                 # Previous lib files (reference)
├── components/              # Current UI components (incomplete)
├── routes/                  # Current routes (incomplete)
│   ├── (external)/          # ✅ Authentication flows (intact)
│   └── (internal)/          # ❌ Main app (needs recreation)
└── lib/                     # Current lib files (incomplete)
```

## 🏗️ Reconstruction Priorities

### 🚨 Phase 1: Critical Foundation (Week 1)
1. **Recreate Main Tab Structure**
   - [ ] Home screen with quick actions
   - [ ] Record screen with stepper navigation
   - [ ] Activities list screen
   - [ ] Trends dashboard
   - [ ] Settings screen

2. **Restore Navigation System**
   - [ ] Tab navigation layout
   - [ ] Protected route structure
   - [ ] Deep linking support
   - [ ] Navigation state management

3. **Rebuild Core UI Components**
   - [ ] Button variants system (recently refactored)
   - [ ] Card components
   - [ ] Form elements
   - [ ] Modal system

### ⚡ Phase 2: Core Functionality (Week 2)
4. **Activity Recording Flow**
   - [ ] Stepper-based selection (5-step flow)
   - [ ] Permission management system
   - [ ] Bluetooth device scanning/connection
   - [ ] Real-time recording screen

5. **State Management**
   - [ ] Zustand stores for global state
   - [ ] React contexts for UI state
   - [ ] Session persistence system
   - [ ] Navigation guards

6. **Data Services**
   - [ ] ActivityRecorder service
   - [ ] ActivityService for CRUD operations
   - [ ] Bluetooth service integration
   - [ ] Location tracking service

### 🎯 Phase 3: Advanced Features (Week 3)
7. **Real-time Metrics System**
   - [ ] GPS data processing
   - [ ] Bluetooth sensor integration
   - [ ] Live metrics display
   - [ ] Background location tracking

8. **Error Handling & Resilience**
   - [ ] Offline mode support
   - [ ] Permission fallbacks
   - [ ] Bluetooth reconnection logic
   - [ ] Network status monitoring

9. **Performance Optimization**
   - [ ] Memoization strategies
   - [ ] FlatList virtualization
   - [ ] Image optimization
   - [ ] Memory management

## 🔄 Key Components to Recreate

### 1. Tab Navigation Structure
```typescript
// routes/(internal)/(tabs)/_layout.tsx
export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="record" options={{ title: 'Record' }} />
      <Tabs.Screen name="activities" options={{ title: 'Activities' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

### 2. Record Screen with Stepper
```typescript
// routes/(internal)/(tabs)/record.tsx
export default function RecordScreen() {
  const { state, goToNextStep, goToPreviousStep } = useRecordSelection();

  return (
    <View className="flex-1 bg-background">
      <StepIndicator currentStep={state.currentStep} />
      {renderCurrentStep()}
    </View>
  );
}
```

### 3. Recording Screen with Navigation Guards
```typescript
// routes/(internal)/recording.tsx
export default function RecordingScreen() {
  const params = useLocalSearchParams();
  const [isRecording, setIsRecording] = useState(false);

  // Navigation guard - prevent back navigation during recording
  useFocusEffect(useCallback(() => {
    const beforeRemove = (e: any) => {
      if (isRecording) {
        e.preventDefault();
        Alert.alert('Recording in progress', 'Please stop recording first');
      }
    };

    router.addListener('beforeRemove', beforeRemove);
    return () => router.removeListener('beforeRemove', beforeRemove);
  }, [isRecording]));
}
```

### 4. ActivityRecorder Service
```typescript
class ActivityRecorder {
  private static currentSession: ActivitySession | null = null;

  static async startRecording(profileId: string): Promise<string> {
    // Initialize session with background location tracking
    // Start Bluetooth device monitoring
    // Begin real-time metrics collection
  }

  static async processLocationUpdates(locations: LocationObject[]) {
    // Update distance, speed, elevation metrics
    // Calculate training load metrics
    // Store session data
  }
}
```

## 🎨 UI Component Reference (From OLD_components)

### Available Components for Reference:
- **Button**: Variant system with `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
- **Text**: Proper text styling with context-based variants
- **Card**: Container components with consistent styling
- **Input**: Form inputs with validation states
- **Modal**: Modal system for permissions and device management

### Recent Button Refactoring:
All Button components have been updated to use the variant system instead of manual className styling:
- `variant="default"` - Primary actions
- `variant="outline"` - Secondary actions
- `variant="ghost"` - Subtle interactive elements
- `variant="destructive"` - Delete/discard actions
- Proper size props: `sm`, `default`, `lg`, `icon`

## 🔧 Technical Implementation Strategy

### 1. Incremental Recreation
Start with the basic tab structure and gradually add complexity:
1. Static screens → Interactive components → Real-time features
2. Basic navigation → Advanced routing → Navigation guards
3. Mock data → Local storage → Cloud sync

### 2. Leverage Existing Code
Use OLD_ directories as reference but rebuild with modern patterns:
- Copy component structures but update with current best practices
- Extract business logic into dedicated services
- Implement proper TypeScript typing from core package

### 3. Test-Driven Approach
Build with testing in mind from the start:
- Unit tests for services and utilities
- Integration tests for navigation flows
- E2E tests for critical user journeys

## 📋 Recovery Checklist

### Phase 1: Foundation (Current Priority)
- [ ] Recreate tab navigation structure
- [ ] Build basic Home screen with quick actions
- [ ] Implement Record screen skeleton
- [ ] Create Activities list screen
- [ ] Build Trends dashboard framework
- [ ] Implement Settings screen structure

### Phase 2: Core Features
- [ ] Implement stepper-based activity selection
- [ ] Build recording screen with real-time metrics
- [ ] Add navigation guards and session recovery
- [ ] Integrate Bluetooth device management
- [ ] Implement permission system

### Phase 3: Advanced Functionality
- [ ] Add background location tracking
- [ ] Implement real-time sensor data processing
- [ ] Build training load analytics
- [ ] Add offline mode support
- [ ] Implement comprehensive error handling

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

## 📞 Support Resources

### Reference Files Available:
- `OLD_app/` - Previous app structure reference
- `OLD_components/` - Component implementation examples
- `OLD_lib/` - Service and hook patterns
- `packages/core/` - Shared types and schemas

### Key Files to Examine:
- `OLD_app/(internal)/*.tsx` - Main screen implementations
- `OLD_components/activity/` - Recording components
- `OLD_components/modals/` - Modal implementations
- `OLD_lib/services/` - Business logic services

This recovery plan provides a structured approach to rebuilding your mobile application while leveraging the existing codebase and infrastructure. Focus on Phase 1 first to reestablish the basic navigation and UI structure before moving to more complex features.


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

This documentation provides a comprehensive overview of the TurboFit mobile application structure and implementation details to facilitate recovery and reconstruction of the codebase
