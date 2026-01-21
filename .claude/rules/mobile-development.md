# Mobile Development Rules for GradientPeak

## Styling with NativeWind v4

### Critical Styling Rules
- **EVERY Text component must be styled directly** - No style inheritance in React Native
- Use semantic colors: `bg-background`, `text-foreground`, `text-muted-foreground`
- Platform-specific variants: `ios:pt-12`, `android:pt-6`
- Dark mode via React Navigation theme integration (`NAV_THEME` in `lib/theme.ts`)

### NativeWind Best Practices
```tsx
// ❌ BAD - Text won't inherit styles
<View className="text-foreground">
  <Text>This text has no color!</Text>
</View>

// ✅ GOOD - Direct styling
<View>
  <Text className="text-foreground">This text has color!</Text>
</View>

// ✅ GOOD - Semantic colors
<View className="bg-background border-border">
  <Text className="text-foreground font-semibold">Title</Text>
  <Text className="text-muted-foreground">Subtitle</Text>
</View>

// ✅ GOOD - Platform-specific
<View className="ios:pt-12 android:pt-6">
  <Text className="text-foreground">Platform-aware padding</Text>
</View>
```

## Component Patterns

### Component Organization
- **Smart components** in domain folders: `components/activity/`, `components/recording/`, `components/training-plan/`
- **Presentational components** in `components/ui/` (React Native Reusables)
- **Shared logic** in `components/shared/`
- **One component per file** (exceptions: small sub-components)

### React Native Reusables Components
- Import from `@/components/ui/*`
- Use `PortalHost` in root layout for modals/dialogs
- Icons: Use `<Icon as={LucideIcon} />` pattern (not `<LucideIcon />`)
- No data attributes - use props/state for variants

```tsx
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Home } from 'lucide-react-native';

// ✅ GOOD
<Button variant="default" size="lg">
  <Icon as={Home} className="text-foreground" />
  <Text className="text-foreground">Home</Text>
</Button>
```

### Component Structure
```tsx
// Standard component structure
import React from 'react';
import { View, Text } from 'react-native';

interface ComponentProps {
  // Props definition
}

export function Component({ prop }: ComponentProps) {
  // Hooks at top
  // Event handlers
  // Render logic

  return (
    <View className="...">
      <Text className="...">Content</Text>
    </View>
  );
}
```

## State Management

### Activity Selection Pattern (CRITICAL)
```tsx
// ✅ GOOD - Use activitySelectionStore for cross-screen navigation
import { activitySelectionStore } from '@/lib/stores/activitySelectionStore';

// In list component
const handleActivityPress = (activityId: string) => {
  activitySelectionStore.getState().select(activityId);
  router.push('/(internal)/(standard)/activity-detail');
};

// In detail screen
useEffect(() => {
  const activityId = activitySelectionStore.getState().selected?.id;
  if (!activityId) {
    router.back();
    return;
  }

  // Fetch activity data
  // Reset selection on unmount
  return () => activitySelectionStore.getState().reset();
}, []);
```

### State Management Guidelines
- **Zustand** for global state (user preferences, activity selection)
- **React Context** for provider-based state (auth, theme)
- **React Query** for server state (activities, profiles)
- **Local useState** for component-specific state

## Recording Service Architecture

### Service Lifecycle (CRITICAL)
- Service created only when navigating to `/record` screen
- Service automatically cleaned up when leaving recording screen
- Each recording session gets fresh service instance
- Never create multiple service instances

### Recording Hooks (Use Specific Hooks)
```tsx
import {
  useActivityRecorder,      // Creates service (only in /record screen)
  useRecordingState,         // Subscribe to state changes
  useCurrentReadings,        // Live metrics (1-4Hz updates)
  useSessionStats,           // Aggregated stats
  useSensors,                // Bluetooth sensor management
  usePlan,                   // Activity plan progress
  useRecorderActions,        // Actions (start, pause, resume, finish)
} from '@/lib/hooks/useActivityRecorder';

// ✅ GOOD - Use specific hooks
function RecordingScreen() {
  const profile = useProfile();
  const service = useActivityRecorder(profile);
  const state = useRecordingState(service);
  const readings = useCurrentReadings(service);
  // Component only re-renders when these specific values change
}

// ❌ BAD - Don't subscribe to everything
function RecordingScreen() {
  const service = useActivityRecorder(profile);
  // Subscribing to all events causes unnecessary re-renders
}
```

### Recording Service Best Practices
- Use **event-driven subscriptions** for surgical re-renders
- Clean up subscriptions in `useEffect` cleanup
- Optimize for 1-4Hz sensor updates without UI lag
- Test with real Bluetooth sensors

## Form Patterns

### Form Libraries
- **Simple forms**: `useState` + uncontrolled inputs
- **Complex forms**: React Hook Form + Zod validation
- **Mutations**: `useReliableMutation` or `useFormMutation`

### Form Mutation Pattern
```tsx
import { useReliableMutation } from '@/lib/hooks/useReliableMutation';
import { trpc } from '@/lib/trpc';

function CreateActivityForm() {
  const utils = trpc.useUtils();

  const mutation = useReliableMutation(
    trpc.activities.create.useMutation({
      onSuccess: () => {
        utils.activities.list.invalidate();
        toast.success('Activity created');
        router.back();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const handleSubmit = async (data: ActivityInput) => {
    await mutation.mutateAsync(data);
  };

  return (
    <Form onSubmit={handleSubmit}>
      {/* Form fields */}
      <Button
        disabled={mutation.isPending}
        className="..."
      >
        <Text className="text-foreground">
          {mutation.isPending ? 'Creating...' : 'Create'}
        </Text>
      </Button>
    </Form>
  );
}
```

### Form Validation
- Use Zod schemas from `@repo/core/schemas`
- Show validation errors inline or via toast
- Disable submit button during mutation
- Show loading state on submit button

## Navigation

### Expo Router v6 Patterns
```tsx
import { router } from 'expo-router';

// Navigate forward
router.push('/(internal)/(tabs)/discover');

// Navigate back
router.back();

// Replace current route
router.replace('/login');

// Navigate with params (avoid for complex objects)
router.push(`/activity-detail?id=${activityId}`);

// ✅ PREFERRED - Use selection store instead
activitySelectionStore.getState().select(activityId);
router.push('/activity-detail');
```

### Layout Patterns
- Use `_layout.tsx` for nested navigation
- Use `(groups)` for route grouping without affecting URL
- Use `[id]` for dynamic routes (but prefer selection store)

## Performance Optimization

### Optimize List Rendering
```tsx
import { FlashList } from '@shopify/flash-list';

// ✅ GOOD - Use FlashList for better performance
<FlashList
  data={activities}
  renderItem={({ item }) => <ActivityCard activity={item} />}
  estimatedItemSize={100}
  keyExtractor={(item) => item.id}
/>

// Use React.memo for list items
export const ActivityCard = React.memo(({ activity }: Props) => {
  return <View>...</View>;
});
```

### Avoid Unnecessary Re-renders
- Use `React.memo` for expensive components
- Use `useMemo` for expensive calculations
- Use `useCallback` for stable function references
- Use specific recording hooks (not all events)

## Background Tasks

### Location Tracking
- Use `expo-location` with background permissions
- Configure task in `expo-task-manager`
- Request permissions properly (iOS/Android)
- Handle permission denial gracefully

### Background Processing
- Keep background tasks lightweight
- Update UI via state/events when app resumes
- Store data locally if needed (SQLite)

## Local Data Storage

### File System (Expo FileSystem)
```tsx
import * as FileSystem from 'expo-file-system';

// Store JSON activity locally
const activityPath = `${FileSystem.documentDirectory}activities/${activityId}.json`;
await FileSystem.writeAsStringAsync(
  activityPath,
  JSON.stringify(activityData)
);
```

### SQLite (Local Database)
- Use for activities recorded offline
- Sync to cloud when network available
- Use transactions for multiple operations

## Platform-Specific Code

### Platform Checks
```tsx
import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
  // iOS-specific code
} else if (Platform.OS === 'android') {
  // Android-specific code
}

// Style variants
<View className="ios:pt-12 android:pt-6">
```

### Safe Area Handling
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function Screen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Content */}
    </View>
  );
}
```

## Error Handling

### Error Boundaries
```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

<ErrorBoundary fallback={<ErrorScreen />}>
  <Screen />
</ErrorBoundary>
```

### Network Error Handling
- Show toast for failed mutations
- Retry failed requests (React Query)
- Store data locally if offline
- Sync when connection restored

## Testing

### Component Testing
```tsx
import { render, fireEvent } from '@testing-library/react-native';

describe('ActivityCard', () => {
  it('should render activity name', () => {
    const { getByText } = render(<ActivityCard activity={mockActivity} />);
    expect(getByText('Morning Run')).toBeTruthy();
  });
});
```

### Hook Testing
```tsx
import { renderHook, waitFor } from '@testing-library/react-native';

describe('useActivityRecorder', () => {
  it('should initialize service', () => {
    const { result } = renderHook(() => useActivityRecorder(mockProfile));
    expect(result.current).toBeDefined();
  });
});
```

## Critical Don'ts

- ❌ Don't assume Text inherits styles - style every Text component
- ❌ Don't create multiple ActivityRecorder instances
- ❌ Don't use URL params for complex objects - use selection store
- ❌ Don't subscribe to all recording events - use specific hooks
- ❌ Don't forget to clean up subscriptions in useEffect
- ❌ Don't use default exports (except for screens)
- ❌ Don't import from React Native Reusables without ui/ folder
- ❌ Don't forget PortalHost in root layout for modals
