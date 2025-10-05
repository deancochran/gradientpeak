# Singleton Service Fix - Summary

## Problem
After selecting a template in the activity selection modal, the plan card was not appearing in the recording modal's carousel. User could not swipe to see their plan before starting the recording.

## Root Cause
**Multiple Service Instances**: Each component calling `useActivityRecorderInit()` was creating its own separate `ActivityRecorderService` instance. When the activity selection modal updated its service instance with the selected plan, the recording modal's service instance never received that update.

```
Recording Modal    →  ServiceA (no plan selected)
Activity Modal     →  ServiceB (plan selected here)
                      ❌ Changes don't propagate!
```

## Solution
Implemented a **Singleton Service Manager** to ensure all components share the same service instance.

```
Recording Modal    →  \
Activity Modal     →   → ServiceManager → Single Service Instance ✅
Any Other Modal    →  /
```

## Implementation

### New Files
- `apps/mobile/src/lib/services/ActivityRecorderServiceManager.ts`
  - Singleton pattern implementation
  - Manages single shared service instance
  - Provides subscription mechanism for React components

### Modified Files
- `apps/mobile/src/lib/hooks/useActivityRecorderInit.ts`
  - Uses singleton manager instead of local state
  - Uses React 18's `useSyncExternalStore` for subscriptions
  
- `apps/mobile/src/lib/hooks/useActivityRecorderEvents.ts`
  - Added `planProgressUpdate` event listener to `useActivityPlan` hook

## How It Works

1. **Singleton Manager**: One global instance manages the service
2. **Shared Service**: All components get the same service instance
3. **Reactive Updates**: Components subscribe and re-render on changes
4. **Event Propagation**: Changes in one component visible to all

## Result
✅ Plan card now appears in carousel after template selection
✅ User can swipe to see plan before starting recording
✅ All components stay in sync with shared service state

## Technical Details

### Singleton Pattern
```typescript
class ActivityRecorderServiceManager {
  private static instance: ActivityRecorderServiceManager;
  private currentService: ActivityRecorderService | null = null;
  
  static getInstance() { /* returns shared instance */ }
  getService() { /* returns shared service */ }
  subscribe(listener) { /* notifies on changes */ }
}
```

### React Integration
```typescript
// Components subscribe to singleton
const service = useSyncExternalStore(
  (callback) => serviceManager.subscribe(callback),
  () => serviceManager.getService(),
  () => serviceManager.getService(),
);
```

## Benefits
- ✅ Single source of truth
- ✅ Reduced memory usage (one instance vs many)
- ✅ Proper React 18 integration
- ✅ Backward compatible API
- ✅ Maintains lifecycle management

## Testing
Test by:
1. Open recording modal
2. Tap activity type selector
3. Select a template from "My Plans" tab
4. Verify plan card appears in carousel
5. Verify you can swipe to plan card
6. Start recording and verify plan works correctly