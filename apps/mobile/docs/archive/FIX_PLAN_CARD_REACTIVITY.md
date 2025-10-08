# Fix: Plan Card Not Appearing in Carousel After Template Selection

## Issue
When selecting a template in the activity selection modal, the plan card was not appearing in the recording modal's carousel. The carousel card listing was not reactive to activity plan selection changes.

## Root Cause
The real issue was that **each component calling `useActivityRecorderInit()` was getting its own separate service instance**. This meant:

1. The recording modal (`apps/mobile/src/app/record/index.tsx`) had one service instance
2. The activity selection modal (`apps/mobile/src/app/record/activity.tsx`) had a different service instance
3. When selecting a template, the selection was applied to the activity modal's service
4. The recording modal's service never received the update
5. Therefore, the plan card never appeared in the carousel

### The Original Problem
```typescript
// useActivityRecorderInit.ts - BEFORE (each component got separate state)
export function useActivityRecorderInit() {
  const [currentService, setCurrentService] = useState<ActivityRecorderService | null>(null);
  // ❌ Each hook call creates its own local state!

  const createNewService = useCallback(async (profile) => {
    const newService = new ActivityRecorderService(profile);
    setCurrentService(newService); // Only this component knows about it
    return newService;
  }, []);

  return { service: currentService, ... };
}
```

When two components both called `useActivityRecorderInit()`:
- Recording modal: `service: ServiceA`
- Activity modal: `service: ServiceB`

Selecting a template updated `ServiceB`, but the recording modal was watching `ServiceA`!

## Solution
Created a **singleton service manager** that ensures all components share the same service instance.

### Implementation

#### 1. Created `ActivityRecorderServiceManager` (Singleton Pattern)
**File**: `apps/mobile/src/lib/services/ActivityRecorderServiceManager.ts`

```typescript
class ActivityRecorderServiceManager {
  private static instance: ActivityRecorderServiceManager;
  private currentService: ActivityRecorderService | null = null;
  private listeners: Set<() => void> = new Set();

  // Singleton pattern ensures one shared instance
  static getInstance(): ActivityRecorderServiceManager {
    if (!ActivityRecorderServiceManager.instance) {
      ActivityRecorderServiceManager.instance = new ActivityRecorderServiceManager();
    }
    return ActivityRecorderServiceManager.instance;
  }

  // Get the shared service
  getService(): ActivityRecorderService | null {
    return this.currentService;
  }

  // Create service (replaces any existing)
  async createService(profile: PublicProfilesRow): Promise<ActivityRecorderService> {
    if (this.currentService) {
      await this.cleanup();
    }
    this.currentService = new ActivityRecorderService(profile);
    this.notifyListeners(); // ✅ Notify all components
    return this.currentService;
  }

  // Subscribe to changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const serviceManager = ActivityRecorderServiceManager.getInstance();
```

#### 2. Updated `useActivityRecorderInit` to Use Singleton
**File**: `apps/mobile/src/lib/hooks/useActivityRecorderInit.ts`

```typescript
export function useActivityRecorderInit() {
  const { profile } = useAuth();

  // ✅ Subscribe to the shared singleton service
  const service = useSyncExternalStore(
    (callback) => serviceManager.subscribe(callback),
    () => serviceManager.getService(),
    () => serviceManager.getService(),
  );

  const serviceState = useSyncExternalStore(
    (callback) => serviceManager.subscribe(callback),
    () => serviceManager.getState(),
    () => serviceManager.getState(),
  );

  const createNewService = useCallback(
    async (profileData: PublicProfilesRow) => {
      // ✅ Uses singleton manager - all components will see this service
      return await serviceManager.createService(profileData);
    },
    [],
  );

  return {
    service, // ✅ Same service instance for all components
    serviceState,
    createNewService,
    isReady: serviceManager.isReady(),
    ...
  };
}
```

#### 3. Also Fixed `useActivityPlan` Hook (Secondary Fix)
**File**: `apps/mobile/src/lib/hooks/useActivityRecorderEvents.ts`

Added `planProgressUpdate` event listener in addition to `activityTypeChange`:

```typescript
export function useActivityPlan(service: ActivityRecorderService | null) {
  const [plan, setPlan] = useState<RecordingServiceActivityPlan | undefined>(undefined);

  useEffect(() => {
    if (!service) return;
    setPlan(service.planManager?.selectedActivityPlan);

    const handler = () => {
      setPlan(service.planManager?.selectedActivityPlan);
    };

    service.on("activityTypeChange", handler);
    service.on("planProgressUpdate", handler); // ✅ Added for better reactivity

    return () => {
      service.off("activityTypeChange", handler);
      service.off("planProgressUpdate", handler);
    };
  }, [service]);

  return plan;
}
```

## Event Flow (After Fix)

```
1. User opens record modal
   → Recording modal calls useActivityRecorderInit()
   → Gets service from serviceManager
   → service = ServiceA (singleton)

2. User taps activity type button
   → Opens activity selection modal
   → Activity modal calls useActivityRecorderInit()
   → Gets service from serviceManager
   → service = ServiceA (SAME singleton instance! ✅)

3. User selects template
   → activity.tsx: selectPlannedActivity(plan)
   → Modifies ServiceA.planManager
   → ServiceA emits "planProgressUpdate" event
   → serviceManager notifies all subscribers

4. Recording modal receives update
   → useActivityPlan hook gets event
   → Updates plan state
   → cards useMemo detects activityPlan change
   → FlatList re-renders with plan card ✅

5. User can now swipe to plan card ✅
```

## Key Benefits

### 1. Single Source of Truth
- One service instance shared across all components
- Changes in any component immediately visible to all others

### 2. Uses React 18's useSyncExternalStore
- Proper subscription pattern for external stores
- Handles concurrent rendering correctly
- Automatically re-renders on changes

### 3. Maintains Lifecycle Management
- Service creation, cleanup, and state transitions still work
- All components see the same lifecycle state

### 4. Backward Compatible
- API of `useActivityRecorderInit()` unchanged
- Existing code continues to work without modifications

## Files Modified

1. **NEW**: `apps/mobile/src/lib/services/ActivityRecorderServiceManager.ts`
   - Singleton service manager implementation

2. **UPDATED**: `apps/mobile/src/lib/hooks/useActivityRecorderInit.ts`
   - Now uses singleton manager instead of local state
   - Uses `useSyncExternalStore` for reactive subscriptions

3. **UPDATED**: `apps/mobile/src/lib/hooks/useActivityRecorderEvents.ts`
   - Added `planProgressUpdate` event listener to `useActivityPlan` hook

## Testing Checklist

- [x] Recording modal and activity modal share same service instance
- [x] Selecting a template updates the shared service
- [x] Plan card appears in carousel immediately after template selection
- [x] Can swipe to plan card before starting recording
- [x] Plan card displays correct template information
- [x] Service cleanup still works correctly
- [x] Multiple navigation between modals doesn't break state

## Related Issues Fixed

- Plan card not showing when selecting trainer template activities ✅
- Map card not showing when selecting outdoor activity types (already working, unrelated)
- Carousel not reactive to activity plan changes ✅

## Performance Impact

- **Minimal**: One singleton instance vs multiple instances actually reduces memory usage
- **Positive**: Fewer service instances means less overhead
- **Subscriptions**: Uses efficient `useSyncExternalStore` pattern

## Architecture Notes

This fix aligns with React's recommended patterns for external state:
- External store (singleton manager)
- Subscription mechanism (listeners)
- `useSyncExternalStore` for React integration

This is the same pattern used by Redux, Zustand, and other state management libraries.
