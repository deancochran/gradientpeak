# Record Page Update Plan - Stepper Flow Implementation

## 🎯 Goal
Transform the current record page into a **SELECTION-ONLY** clean, stepper-based configuration flow that guides users through activity selection, permissions, and Bluetooth setup before navigating to a fault-tolerant recording screen.

## 📊 Current State Analysis

### What's Working
- ✅ State management for activity selection already exists
- ✅ Permission and Bluetooth integration working
- ✅ Navigation to recording screen implemented
- ✅ State reset on tab focus working
- ✅ Planned activity service integration

### Major Issues with Current Implementation
- ❌ **RecordingBodySection does EVERYTHING** - selection, recording display, metrics, charts
- ❌ **RecordingHeader** is used on selection page (wrong context)
- ❌ **Mixed concerns** - recording logic mixed with selection logic
- ❌ **No clear stepper progression** for selection flow
- ❌ **Complex component** - 400+ lines handling multiple responsibilities

### Key Insight from RecordingBodySection Analysis
The `RecordingBodySection` contains:
- ✅ **Selection UI** (what we need on record page)
- ❌ **Recording metrics display** (belongs on recording page)
- ❌ **Live session charts** (belongs on recording page)
- ❌ **Activity progress** (belongs on recording page)

## 🏗 Proposed Architecture - SELECTION ONLY

### NEW: Clean Record Page Structure
```
/(internal)/(tabs)/record.tsx (Selection Container Only)
├── components/record-selection/
│   ├── RecordingStepper.tsx (Main stepper component)
│   ├── StepIndicator.tsx (Visual progress bar)
│   ├── steps/
│   │   ├── ActivityModeStep.tsx (Planned vs Unplanned)
│   │   ├── PlannedActivityStep.tsx (Activity list)
│   │   ├── UnplannedActivityStep.tsx (Activity types)
│   │   ├── PermissionsStep.tsx (Required permissions)
│   │   ├── BluetoothStep.tsx (Device pairing)
│   │   └── ReadyStep.tsx (Final confirmation)
│   └── hooks/
│       └── useRecordSelection.tsx (Selection state management)
```

### REMOVE from Record Page
- ❌ `RecordingHeader` (only needed on recording screen)
- ❌ `RecordingBodySection` (too complex, split into focused components)
- ❌ Recording metrics logic
- ❌ Live session display
- ❌ Activity progress charts

### EXTRACT from RecordingBodySection
**Keep for Record Page:**
- ✅ Activity mode selection UI (Planned vs Unplanned cards)
- ✅ Planned activity list
- ✅ Activity type grid
- ✅ Requirements checking logic
- ✅ Navigation between selection states

**Move to Recording Page:**
- ❌ `PlannedActivityDisplay` with live session data
- ❌ `UnplannedActivityDisplay` with metrics
- ❌ `MetricsGrid`, `ActivityProgressChart`, etc.
- ❌ Real-time sensor value displays
```

## 🔄 Step Flow Design

### Step 1: Activity Mode Selection
- **Purpose**: Choose between planned or unplanned activity
- **UI**: Two large cards with icons
- **Next**: Navigate to Step 2 based on selection

### Step 2: Activity Selection
- **Planned Path**: List of available planned activities
- **Unplanned Path**: Activity type selector (Running, Cycling, etc.)
- **Next**: Check if permissions needed → Step 3 or Step 4

### Step 3: Permissions Setup (Conditional)
- **Purpose**: Request required permissions based on activity type
- **UI**: Permission cards with explanations
- **Logic**: Auto-detect missing permissions
- **Next**: Bluetooth step or Ready step

### Step 4: Bluetooth Setup (Conditional)
- **Purpose**: Connect compatible devices
- **UI**: Available device list with connection status
- **Logic**: Show only if activity benefits from sensors
- **Next**: Ready to record

### Step 5: Ready to Record
- **Purpose**: Final confirmation and start button
- **UI**: Activity summary, connected devices, start button
- **Action**: Navigate to recording screen with configuration

## 🔧 Implementation Plan

### Phase 1: Clean Extraction (1-2 days)

#### 1.1 Extract Selection Components from RecordingBodySection
```typescript
// NEW: ActivityTypeStep.tsx - Extract the two cards
export const ActivityTypeStep = ({ onSelection }) => (
  <View className="flex-1 justify-center px-6 py-8">
    <Text className="mb-12 text-center text-xl font-medium">
      Start Activity
    </Text>
    <View className="space-y-4">
      <Button onPress={() => onSelection('planned')}>
        <Icon as={Calendar} className="mr-4 h-6 w-6" />
        <View>
          <Text className="text-base font-medium">Planned Activity</Text>
          <Text className="text-sm text-muted-foreground">Follow structured training</Text>
        </View>
      </Button>

      <Button onPress={() => onSelection('unplanned')}>
        <Icon as={Dumbbell} className="mr-4 h-6 w-6" />
        <View>
          <Text className="text-base font-medium">Free Activity</Text>
          <Text className="text-sm text-muted-foreground">Record any activity</Text>
        </View>
      </Button>
    </View>
  </View>
);
```

#### 1.2 Build Stepper State Management
```typescript
// NEW: useRecordSelection.tsx
interface SelectionState {
  currentStep: SelectionStep;
  activityMode: 'planned' | 'unplanned' | null;
  selectedActivityType: ActivityType | null;
  selectedPlannedActivity: string | null;
  permissionsGranted: boolean;
  bluetoothConnected: boolean;
}

const useRecordSelection = () => {
  const [state, setState] = useState<SelectionState>({
    currentStep: 'activity-type',
    activityMode: null,
    selectedActivityType: null,
    selectedPlannedActivity: null,
    permissionsGranted: false,
    bluetoothConnected: false
  });

  // Reset on tab focus
  useFocusEffect(
    useCallback(() => {
      setState(initialState);
    }, [])
  );

  return { state, setState, ...stepNavigation };
};
```

#### 1.3 Create Simple Stepper Container
```typescript
// NEW: RecordingStepper.tsx
export const RecordingStepper = () => {
  const { state, nextStep, previousStep } = useRecordSelection();

  const renderCurrentStep = () => {
    switch (state.currentStep) {
      case 'activity-type':
        return <ActivityTypeStep onSelection={handleActivityModeSelection} />;
      case 'activity-selection':
        return state.activityMode === 'planned'
          ? <PlannedActivityStep />
          : <UnplannedActivityStep />;
      case 'permissions-check':
        return <PermissionsStep />;
      case 'bluetooth-setup':
        return <BluetoothStep />;
      case 'ready-to-start':
        return <ReadyStep />;
    }
  };

  return (
    <View className="flex-1">
      <StepIndicator currentStep={state.currentStep} />
      {renderCurrentStep()}
    </View>
  );
};
```

### Phase 2: Smart Step Logic (1-2 days)

#### 2.1 Conditional Step Flow
```typescript
const getRequiredSteps = (
  activityMode: 'planned' | 'unplanned' | null,
  activityType: ActivityType | null,
  hasPermissions: boolean
): SelectionStep[] => {
  const steps: SelectionStep[] = ['activity-type', 'activity-selection'];

  // Check if permissions are needed
  if (!hasPermissions || needsSpecificPermissions(activityType)) {
    steps.push('permissions-check');
  }

  // Check if bluetooth is beneficial
  if (activityType && supportsBluetooth(activityType)) {
    steps.push('bluetooth-setup');
  }

  steps.push('ready-to-start');
  return steps;
};
```

#### 2.2 Auto-Advance Logic
```typescript
const handlePermissionsGranted = useCallback(() => {
  // Auto-advance when permissions are granted
  if (needsBluetoothStep()) {
    setCurrentStep('bluetooth-setup');
  } else {
    setCurrentStep('ready-to-start');
  }
}, []);
```

### Phase 3: Recording Screen Enhancement (1-2 days)

#### 3.1 Move Recording Components
- Move `RecordingHeader` to recording screen only
- Move `PlannedActivityDisplay`, `UnplannedActivityDisplay` to recording screen
- Move `MetricsGrid`, `ActivityProgressChart` to recording screen
- Keep recording screen focused on actual recording

#### 3.2 Fault-Tolerant Navigation
```typescript
// ENHANCED: recording.tsx
export default function RecordingScreen() {
  const { params } = useLocalSearchParams();

  useEffect(() => {
    const validateSetup = async () => {
      // Validate all required parameters
      const validation = await validateRecordingRequirements({
        activityType: params.activityType,
        plannedActivityId: params.plannedActivityId,
        permissionsStatus: params.permissionsStatus,
        bluetoothStatus: params.bluetoothStatus
      });

      if (!validation.valid) {
        // Show error and navigation back to record page
        showSetupError(validation.errors);
        return;
      }

      // Start recording automatically
      startRecording();
    };

    validateSetup();
  }, []);

  return (
    <View className="flex-1 bg-background">
      <RecordingHeader /* recording-specific props */ />
      <RecordingBody /* recording-specific metrics */ />
    </View>
  );
}
```

### Phase 4: Polish & Integration (1 day)

#### 4.1 Update Main Record Page
```typescript
// SIMPLIFIED: record.tsx
export default function RecordScreen() {
  return (
    <View className="flex-1 bg-background">
      <RecordingStepper />
    </View>
  );
}
```

#### 4.2 Clean Parameter Passing
```typescript
const handleStartRecording = () => {
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
};
```

## 🎨 UI/UX Improvements

### Visual Design
- **Step Indicators**: Clean progress bar at top
- **Card-based Steps**: Large, touch-friendly selections
- **Contextual Help**: Inline explanations for each step
- **Smooth Transitions**: Slide animations between steps

### Accessibility
- Screen reader support for step navigation
- Keyboard navigation compatibility
- High contrast mode support
- Clear focus indicators

## 📱 Mobile-First Considerations

### Touch Interactions
- Large touch targets (minimum 44pt)
- Swipe gestures for step navigation
- Pull-to-refresh on activity lists
- Haptic feedback for selections

### Performance
- Lazy load step components
- Optimize re-renders with React.memo
- Efficient state updates
- Background permission checking

## 🧪 Testing Strategy

### Unit Tests
- Step validation logic
- State management functions
- Navigation flow correctness
- Permission checking accuracy

### Integration Tests
- End-to-end step flow
- Modal interactions
- Recording screen navigation
- Error handling scenarios

### User Testing
- Flow comprehension
- Step completion rates
- Error recovery success
- Overall satisfaction

## 📈 Success Metrics

### User Experience
- Reduced time to start recording
- Decreased support tickets about setup
- Higher recording completion rates
- Improved user onboarding scores

### Technical
- Reduced component complexity
- Better test coverage
- Fewer navigation bugs
- Cleaner code organization

## 🚀 Migration Strategy

### Phase 1: Parallel Implementation
- Build new components alongside existing
- Feature flag for new flow
- A/B testing capability

### Phase 2: Gradual Rollout
- Beta users first
- Monitor metrics and feedback
- Quick rollback capability

### Phase 3: Full Migration
- Remove old components
- Clean up unused code
- Update documentation

## 📋 Immediate Action Items

### 🚀 Quick Win: Start with Phase 1

**Priority 1: Extract and Simplify (This Week)**

1. **Create new components** from RecordingBodySection selections:
   - `ActivityModeStep.tsx` - The two cards (Planned vs Free Activity)
   - `PlannedActivityStep.tsx` - The FlatList of planned activities
   - `UnplannedActivityStep.tsx` - The activity type grid
   - `BackButton.tsx` - Reusable back navigation

2. **Build simple RecordingStepper.tsx**:
   ```typescript
   const steps = [
     { key: 'mode', component: ActivityModeStep },
     { key: 'selection', component: selectedMode === 'planned' ? PlannedActivityStep : UnplannedActivityStep },
     { key: 'permissions', component: PermissionsStep, conditional: true },
     { key: 'bluetooth', component: BluetoothStep, conditional: true },
     { key: 'ready', component: ReadyStep }
   ];
   ```

3. **Replace record.tsx completely**:
   - Remove RecordingHeader
   - Remove RecordingBodySection
   - Add only RecordingStepper
   - Keep existing state management hooks temporarily

**Priority 2: Move Recording Logic (Next Week)**

4. **Enhance recording.tsx**:
   - Add RecordingHeader (moved from record page)
   - Add recording-specific body with metrics
   - Handle configuration from navigation params

5. **Clean up unused components**:
   - Remove recording logic from RecordingBodySection
   - Keep only what's needed for each context

### 🎯 Success Criteria

**After Phase 1:**
- Record page shows only selection steps
- Clean navigation between steps
- No recording/metrics UI on record page
- Configuration passed cleanly to recording screen

**After Phase 2:**
- Visual step indicator working
- Smart conditional steps (skip unnecessary ones)
- Smooth UX with proper validation
- Recording screen handles all recording logic

### 📝 Code Changes Summary

**Files to CREATE:**
- `components/record-selection/RecordingStepper.tsx`
- `components/record-selection/steps/ActivityModeStep.tsx`
- `components/record-selection/steps/PlannedActivityStep.tsx`
- `components/record-selection/steps/UnplannedActivityStep.tsx`
- `components/record-selection/steps/PermissionsStep.tsx`
- `components/record-selection/steps/BluetoothStep.tsx`
- `components/record-selection/steps/ReadyStep.tsx`

**Files to MODIFY:**
- `/(internal)/(tabs)/record.tsx` - Simplify to stepper only
- `/(internal)/recording.tsx` - Add recording UI components

**Files to DEPRECATE:**
- `components/activity/RecordingBodySection.tsx` - Split into focused components
