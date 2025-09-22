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

### Modal Redesign Requirements
- **Bluetooth Modal**: Complete redesign using React Native Reusables components
- **Permissions Modal**: Redesign following style guide patterns
- **Consistent Patterns**: Use existing modal components from `@/components/ui`

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

### File: `apps/mobile/src/app/(internal)/(tabs)/record/index.tsx`
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

  // REST OF FILE
}
```
