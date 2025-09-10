# TurboFit Mobile App - Zustand State Management

This directory contains the Zustand-based state management stores for the TurboFit mobile application. Each store is designed to handle specific domains of application state with persistence and type safety.

## Store Architecture

The state management system is built using [Zustand](https://zustand-demo.pmnd.rs/) with the following features:

- **Type Safety**: Full TypeScript support with strict typing
- **Persistence**: Automatic state persistence using AsyncStorage
- **Domain Separation**: Each store handles a specific domain of functionality
- **Performance**: Selective subscriptions to prevent unnecessary re-renders
- **Developer Experience**: Convenient hooks for easy component integration

## Available Stores

### 🔐 Auth Store (`auth-store.ts`)

Manages user authentication state and actions.

**Key Features:**
- Session management with Supabase
- Authentication state persistence
- Automatic navigation based on auth status
- Sign in/out/up functionality

**Usage:**
```typescript
import { useAuth, useIsAuthenticated, useUser } from '@/lib/stores';

const { signIn, signOut, loading } = useAuth();
const isAuthenticated = useIsAuthenticated();
const user = useUser();
```

### 🏃 Workout Store (`workout-store.ts`)

Handles active workout recording state and metrics.

**Key Features:**
- Real-time workout tracking
- Workout metrics and settings
- Integration with ActivityRecorderService
- Pause/resume functionality
- Session recovery

**Usage:**
```typescript
import { 
  useActiveWorkout, 
  useIsRecording, 
  useWorkoutMetrics,
  useWorkoutStore 
} from '@/lib/stores';

const activeWorkout = useActiveWorkout();
const isRecording = useIsRecording();
const { startWorkout, pauseWorkout, stopWorkout } = useWorkoutStore();
```

### ⚙️ Settings Store (`settings-store.ts`)

Manages user preferences and app configuration.

**Key Features:**
- Display preferences (theme, units, language)
- Notification settings
- Privacy controls
- Workout preferences
- Data sync settings
- Import/export functionality

**Usage:**
```typescript
import { 
  useTheme, 
  useUnits, 
  useNotificationSettings,
  useSettingsStore 
} from '@/lib/stores';

const theme = useTheme();
const units = useUnits();
const { updateDisplaySettings } = useSettingsStore();
```

### 🎨 UI Store (`ui-store.ts`)

Controls UI state including modals, alerts, and navigation.

**Key Features:**
- Modal management
- Alert/toast system
- Loading states
- Bottom sheet control
- Keyboard state tracking
- Screen orientation handling

**Usage:**
```typescript
import { 
  useActiveModal, 
  useLoading, 
  useAlerts,
  useUIStore 
} from '@/lib/stores';

const activeModal = useActiveModal();
const loading = useLoading();
const { openModal, showAlert } = useUIStore();
```

## Store Initialization

The stores are automatically initialized when the app starts using the `StoreProvider` component:

```typescript
import { StoreProvider } from '@/lib/stores/StoreProvider';

export default function App() {
  return (
    <StoreProvider>
      {/* Your app content */}
    </StoreProvider>
  );
}
```

### Manual Initialization

For manual store initialization (useful in testing or special cases):

```typescript
import { initializeStores, cleanupStores } from '@/lib/stores';

// Initialize all stores
await initializeStores();

// Cleanup stores (reset to default state)
await cleanupStores();
```

## Persistence

All stores use Zustand's persistence middleware with AsyncStorage:

- **Auth Store**: Only persists non-sensitive initialization state
- **Workout Store**: Persists settings and session indicators
- **Settings Store**: Persists all user preferences with migration support
- **UI Store**: Persists UI preferences like tab history and filters

## Best Practices

### 1. Use Specific Hooks

Prefer specific hooks over the main store hook to optimize performance:

```typescript
// ✅ Good - only subscribes to authentication status
const isAuthenticated = useIsAuthenticated();

// ❌ Less optimal - subscribes to entire auth store
const { isAuthenticated } = useAuth();
```

### 2. Destructure Actions Outside Components

Actions don't change, so they can be destructured outside components:

```typescript
const { startWorkout } = useWorkoutStore.getState();

function WorkoutButton() {
  // Use startWorkout directly without subscribing to store changes
  return <Button onPress={() => startWorkout('running')} />;
}
```

### 3. Conditional Store Access

For stores that might not be needed immediately, use lazy imports:

```typescript
const handleEmergencyCleanup = async () => {
  const { cleanupStores } = await import('@/lib/stores');
  await cleanupStores();
};
```

### 4. Type Safety

Always use the provided TypeScript types:

```typescript
import type { WorkoutType, AlertType } from '@/lib/stores';

const workoutType: WorkoutType = 'running';
const alertType: AlertType = 'success';
```

## Store Communication

Stores can communicate with each other through actions:

```typescript
// In workout store - notify UI store of workout completion
const { showAlert } = useUIStore.getState();
showAlert({
  type: 'success',
  title: 'Workout Complete!',
  message: 'Great job on your workout!',
});
```

## Testing

For testing components that use stores:

```typescript
import { act, renderHook } from '@testing-library/react-native';
import { useWorkoutStore } from '@/lib/stores';

test('should start workout correctly', async () => {
  const { result } = renderHook(() => useWorkoutStore());
  
  await act(async () => {
    await result.current.startWorkout('running');
  });
  
  expect(result.current.isRecording).toBe(true);
});
```

## Migration

The settings store includes version-based migration:

```typescript
// In settings-store.ts
migrate: (persistedState: unknown, version: number) => {
  if (version === 0) {
    // Migration logic for version 0 to 1
    return {
      ...(persistedState as Record<string, unknown>),
      // Add new fields or transform existing ones
    };
  }
  return persistedState;
}
```

## Debugging

Enable Zustand devtools for debugging:

```typescript
// In development, you can access store state directly
console.log('Auth State:', useAuthStore.getState());
console.log('Workout State:', useWorkoutStore.getState());
```

## Performance Considerations

1. **Selective Subscriptions**: Use specific hooks to avoid unnecessary re-renders
2. **Action Memoization**: Actions are stable and don't need to be dependencies
3. **State Normalization**: Large datasets should be normalized (consider using additional stores)
4. **Persistence Partitioning**: Only persist necessary state to optimize storage

## Error Handling

All stores include comprehensive error handling:

- Async actions return error states
- Console logging for debugging
- Graceful fallbacks for missing data
- Recovery mechanisms for interrupted sessions

For more details on individual stores, see the inline documentation in each store file.