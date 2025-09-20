# TurboFit Mobile App — Record Page Stepper Flow Implementation

## 🎯 Purpose

The **Record** page provides a guided **stepper flow** to prepare users for both **planned** and **unplanned** workouts. The stepper ensures all required context, permissions, and device connections are established before transitioning to the actual recording screen.

---

## 🏗️ Implementation Requirements

### Navigation Behavior
- **Reset on Tab Focus**: The record selection process must restart every time the user navigates to the `/(internal)/(tabs)/record` tab
- **Post-Completion Navigation**: After clicking "Begin Activity", the user must be navigated to `/(internal)/recording` page
- **State Isolation**: Selection state must be separate from recording state to allow clean restarts

### UI/UX Standards
- **Minimal Design**: Follow React Native Reusables style guide and README best practices
- **Consistent Components**: Use existing `@/components/ui` components for all UI elements
- **NativeWind Styling**: Apply Tailwind CSS classes following established patterns
- **Accessibility**: Ensure proper contrast, focus states, and screen reader support

### Stepper Component Architecture
- **Component Location**: Create `@/components/Stepper.tsx` with compound component pattern
- **API Design**: Support declarative step declaration:
  ```tsx
  <Stepper>
    <Stepper.Step title="Activity Type">
      {/* Step content */}
    </Stepper.Step>
    <Stepper.Step title="Permissions">
      {/* Step content */}
    </Stepper.Step>
  </Stepper>
  ```
- **Sub-Components**: Include `Stepper.Step`, `Stepper.Indicator`, `Stepper.Controls`

### Modal Redesign Requirements
- **Bluetooth Modal**: Complete redesign using React Native Reusables components
- **Permissions Modal**: Redesign following style guide patterns
- **Consistent Patterns**: Use existing modal components from `@/components/ui`

---

## 🪜 Stepper Flow Implementation

### Step 1: Activity Mode Selection
```tsx
<Stepper.Step title="Activity Type">
  <View className="p-6">
    <Text className="text-lg font-semibold mb-4">Choose Activity Type</Text>
    <Button variant="outline" onPress={() => setMode('planned')}>
      Planned Workout
    </Button>
    <Button variant="outline" onPress={() => setMode('unplanned')}>
      Unplanned Workout
    </Button>
  </View>
</Stepper.Step>
```

### Step 2: Activity Selection (Conditional)
- **Planned**: Browse training plans and scheduled activities
- **Unplanned**: Direct activity type picker using `@repo/core` types

### Step 3: Permission Enablement
```tsx
<Stepper.Step title="Permissions" condition={requiresPermissions}>
  <PermissionsStep 
    onComplete={handlePermissionsComplete}
    activityType={selectedActivityType}
  />
</Stepper.Step>
```

### Step 4: Bluetooth Pairing (Conditional)
```tsx
<Stepper.Step title="Connect Devices" condition={requiresBluetooth}>
  <BluetoothStep 
    onDeviceConnected={handleDeviceConnected}
    onSkip={handleBluetoothSkip}
  />
</Stepper.Step>
```

### Step 5: Ready Confirmation
```tsx
<Stepper.Step title="Ready">
  <ReadyStep 
    activityType={selectedActivityType}
    devices={connectedDevices}
    onBegin={handleBeginActivity}
  />
</Stepper.Step>
```

---

## 🔧 Stepper Component Implementation

### File: `@/components/Stepper.tsx`
```tsx
interface StepperProps {
  children: React.ReactNode;
  initialStep?: number;
  onComplete?: () => void;
}

interface StepProps {
  title: string;
  children: React.ReactNode;
  condition?: boolean;
}

const Stepper = ({ children, initialStep = 0, onComplete }: StepperProps) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  
  // Navigation logic with validation
  const nextStep = () => { /* ... */ };
  const prevStep = () => { /* ... */ };
  
  return (
    <View className="flex-1">
      <Stepper.Indicator currentStep={currentStep} totalSteps={React.Children.count(children)} />
      {React.Children.toArray(children)[currentStep]}
      <Stepper.Controls 
        currentStep={currentStep}
        onNext={nextStep}
        onPrev={prevStep}
        onComplete={onComplete}
      />
    </View>
  );
};

Stepper.Step = ({ children, condition = true }: StepProps) => {
  if (!condition) return null;
  return <>{children}</>;
};

Stepper.Indicator = ({ currentStep, totalSteps }) => {
  return (
    <View className="flex-row justify-center p-4">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          className={`w-3 h-3 rounded-full mx-1 ${
            index === currentStep ? 'bg-primary' : 'bg-muted'
          }`}
        />
      ))}
    </View>
  );
};

Stepper.Controls = ({ currentStep, totalSteps, onNext, onPrev, onComplete }) => {
  return (
    <View className="p-6 border-t border-border">
      <View className="flex-row justify-between">
        {currentStep > 0 && (
          <Button variant="outline" onPress={onPrev}>
            Back
          </Button>
        )}
        {currentStep < totalSteps - 1 ? (
          <Button onPress={onNext}>Next</Button>
        ) : (
          <Button onPress={onComplete}>Begin Activity</Button>
        )}
      </View>
    </View>
  );
};
```

---

## 🗄️ State Management Implementation

### File: `@/lib/hooks/useRecordSelection.ts`
```tsx
interface RecordSelectionState {
  currentStep: number;
  mode: 'planned' | 'unplanned' | null;
  selectedActivityType: string | null;
  plannedActivityId: string | null;
  permissions: {
    location: boolean;
    backgroundLocation: boolean;
    bluetooth: boolean;
  };
  connectedDevices: string[];
  setupComplete: boolean;
}

export const useRecordSelection = () => {
  const [state, setState] = useState<RecordSelectionState>({
    currentStep: 0,
    mode: null,
    selectedActivityType: null,
    plannedActivityId: null,
    permissions: {
      location: false,
      backgroundLocation: false,
      bluetooth: false,
    },
    connectedDevices: [],
    setupComplete: false,
  });

  // Reset state when hook is initialized (on tab focus)
  useEffect(() => {
    setState(prev => ({
      ...initialState,
      currentStep: 0,
    }));
  }, []);

  const updateStep = (step: number) => {
    setState(prev => ({ ...prev, currentStep: step }));
  };

  const setActivityMode = (mode: 'planned' | 'unplanned') => {
    setState(prev => ({ ...prev, mode, currentStep: 1 }));
  };

  const completeSelection = () => {
    setState(prev => ({ ...prev, setupComplete: true }));
  };

  return {
    ...state,
    updateStep,
    setActivityMode,
    completeSelection,
  };
};
```

---

## 🎬 Navigation Integration

### File: `apps/mobile/src/app/(internal)/(tabs)/record.tsx`
```tsx
export default function RecordScreen() {
  const selection = useRecordSelection();
  const router = useRouter();

  const handleComplete = async () => {
    // Prepare workout data for recording
    const workoutData = {
      type: selection.selectedActivityType,
      plannedActivityId: selection.plannedActivityId,
      devices: selection.connectedDevices,
    };

    // Navigate to recording screen with prepared data
    router.push({
      pathname: '/(internal)/recording',
      params: { workoutData: JSON.stringify(workoutData) },
    });

    // Reset selection state for next visit
    selection.reset();
  };

  return (
    <View className="flex-1 bg-background">
      <Stepper 
        initialStep={selection.currentStep}
        onComplete={handleComplete}
      >
        <Stepper.Step title="Activity Type">
          <ActivityModeStep onSelectMode={selection.setActivityMode} />
        </Stepper.Step>

        <Stepper.Step 
          title="Select Activity" 
          condition={selection.mode !== null}
        >
          {selection.mode === 'planned' ? (
            <PlannedActivityStep onSelectActivity={handleActivitySelect} />
          ) : (
            <UnplannedActivityStep onSelectActivity={handleActivitySelect} />
          )}
        </Stepper.Step>

        <Stepper.Step 
          title="Permissions" 
          condition={selection.selectedActivityType !== null}
        >
          <PermissionsStep 
            activityType={selection.selectedActivityType}
            onPermissionsComplete={handlePermissionsComplete}
          />
        </Stepper.Step>

        <Stepper.Step 
          title="Connect Devices" 
          condition={requiresBluetooth(selection.selectedActivityType)}
        >
          <BluetoothStep 
            onDevicesConnected={handleDevicesConnected}
            onSkip={handleBluetoothSkip}
          />
        </Stepper.Step>

        <Stepper.Step title="Ready">
          <ReadyStep 
            activityType={selection.selectedActivityType}
            devices={selection.connectedDevices}
            permissions={selection.permissions}
          />
        </Stepper.Step>
      </Stepper>
    </View>
  );
}
```

---

## 🎨 Modal Redesign Specifications

### Bluetooth Modal Redesign
```tsx
const BluetoothModal = ({ visible, onClose, onDeviceConnected }) => {
  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <Dialog.Content className="w-full max-w-md">
        <Dialog.Header>
          <Dialog.Title>Connect Bluetooth Devices</Dialog.Title>
          <Dialog.Description>
            Pair your heart rate monitor, cycling sensors, or other fitness devices
          </Dialog.Description>
        </Dialog.Header>
        
        <View className="p-6">
          <Button 
            variant="outline" 
            onPress={startScanning}
            className="mb-4"
          >
            <BluetoothIcon className="mr-2" />
            Scan for Devices
          </Button>
          
          {devices.map(device => (
            <Card key={device.id} className="mb-2">
              <Card.Content className="p-4">
                <Text className="font-medium">{device.name}</Text>
                <Text className="text-muted-foreground">{device.id}</Text>
                <Button 
                  size="sm" 
                  onPress={() => connectDevice(device)}
                >
                  Connect
                </Button>
              </Card.Content>
            </Card>
          ))}
        </View>
        
        <Dialog.Footer>
          <Button variant="outline" onPress={onClose}>
            Cancel
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};
```

### Permissions Modal Redesign
```tsx
const PermissionsModal = ({ visible, onClose, onPermissionsGranted }) => {
  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <Dialog.Content className="w-full max-w-md">
        <Dialog.Header>
          <Dialog.Title>App Permissions</Dialog.Title>
          <Dialog.Description>
            TurboFit needs these permissions to track your activities accurately
          </Dialog.Description>
        </Dialog.Header>
        
        <View className="p-6 space-y-4">
          <View className="flex-row items-center">
            <MapPinIcon className="mr-3 text-primary" />
            <View className="flex-1">
              <Text className="font-medium">Location Access</Text>
              <Text className="text-muted-foreground">
                For GPS tracking and route mapping
              </Text>
            </View>
            <Switch 
              value={locationGranted}
              onValueChange={requestLocationPermission}
            />
          </View>
          
          <View className="flex-row items-center">
            <BluetoothIcon className="mr-3 text-primary" />
            <View className="flex-1">
              <Text className="font-medium">Bluetooth</Text>
              <Text className="text-muted-foreground">
                For heart rate monitors and sensors
              </Text>
            </View>
            <Switch 
              value={bluetoothGranted}
              onValueChange={requestBluetoothPermission}
            />
          </View>
        </View>
        
        <Dialog.Footer>
          <Button onPress={handleAllPermissionsGranted}>
            Continue
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};
```

---

## 🔄 Integration with Existing Stores

### Permission Store Integration
```tsx
const usePermissions = () => {
  const { checkPermission, requestPermission } = usePermissionsStore();
  
  const checkLocation = async () => {
    return await checkPermission('location');
  };
  
  const requestLocation = async () => {
    return await requestPermission('location');
  };
  
  return { checkLocation, requestLocation };
};
```

### Activity Store Integration
```tsx
const useActivitySetup = () => {
  const { startWorkout } = useWorkoutStore();
  
  const prepareWorkout = async (activityType, plannedActivityId) => {
    await startWorkout(activityType, plannedActivityId);
  };
  
  return { prepareWorkout };
};
```

---

## ✅ Validation & Error Handling

### Step Validation
```tsx
const validateStep = (step: number, state: RecordSelectionState): boolean => {
  switch (step) {
    case 0: // Activity Type
      return state.mode !== null;
    case 1: // Activity Selection
      return state.selectedActivityType !== null;
    case 2: // Permissions
      return hasRequiredPermissions(state);
    case 3: // Bluetooth
      return !requiresBluetooth(state.selectedActivityType) || 
             state.connectedDevices.length > 0;
    case 4: // Ready
      return state.setupComplete;
    default:
      return false;
  }
};
```

### Error States
```tsx
<Stepper.Step title="Permissions">
  {permissionsError ? (
    <Alert variant="destructive" className="mb-4">
      <Alert.Title>Permission Required</Alert.Title>
      <Alert.Description>
        Please enable {missingPermission} to continue
      </Alert.Description>
    </Alert>
  ) : null}
  
  <PermissionsContent />
</Stepper.Step>
```

---

## 📋 Implementation Checklist

- [ ] Create `@/components/Stepper.tsx` with compound component pattern
- [ ] Implement `useRecordSelection` hook with reset-on-focus behavior
- [ ] Redesign Bluetooth modal using React Native Reusables components
- [ ] Redesign Permissions modal following style guide patterns
- [ ] Update `record.tsx` to use stepper component
- [ ] Implement navigation to `/(internal)/recording` on completion
- [ ] Add proper error handling and validation
- [ ] Test tab focus reset behavior
- [ ] Validate UI consistency with existing components
- [ ] Ensure accessibility compliance
- [ ] Add comprehensive logging and analytics

This implementation will provide a seamless, user-friendly record selection flow that resets on each tab visit and cleanly transitions to the recording screen, all while maintaining consistency with the established React Native Reusables design system.