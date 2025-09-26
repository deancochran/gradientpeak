# Technical Handoff: Completing Mobile App Activity Recording Tasks

## 1. BLE Sensors: Real Device Scanning & Connection (sensors.ts)

**Current State:** The `SensorsManager` in `sensors.ts` uses `react-native-ble-plx` for scanning, connecting, and monitoring characteristics. It handles auto-reconnect and parsing via `@repo/core` utils. However, it might need real-device testing (simulators don't support BLE well), better error propagation to the hook, and filtering for known sensor types (e.g., heart rate monitors).

**Steps to Complete:**


- **Enhance Scanning in `sensors.ts`:**
   - Update `scan()` to filter for known services (e.g., Heart Rate Service UUID: `0x180D`). Modify the scan callback:
     ```ts
     this.bleManager.startDeviceScan(
       [KnownCharacteristics.HEART_RATE_SERVICE], // Filter by service UUIDs
       null,
       (error, device) => {
         if (error) { /* handle */ return; }
         if (device && device.name && !found.find(d => d.id === device.id)) {
           found.push(device);
         }
       }
     );
     ```
   - Add timeout and stop scan after 10s. Expose discovered devices with types (e.g., infer from services).

- **Improve Connection & Monitoring:**
   - In `connectSensor()`, after discovering services, validate against `KnownCharacteristics` from `@repo/core`. Only monitor if a match exists.
   - Fix the static methods issue: `disconnectSensor` and others are marked `static` – remove `static` to make them instance methods (matches the class pattern).
   - In `monitorKnownCharacteristics()`, use the correct service/char UUIDs. Handle errors in `characteristic.monitor()` with retries (up to 2 attempts).
   - Propagate connection state changes via callbacks (already partially there – ensure `dataCallbacks` fires on connect/disconnect).

- **Integrate with Hook (`useActivityRecorder.ts`):**
   - In `scanForDevices()`, map results to include sensor type (e.g., { id, name, type: 'heartRate' }).
   - Add real-time metric updates: In `handleSensorData()`, compute averages (e.g., via `@repo/core/calculations`) and push to `setMetrics()`.


**Estimated Effort:** 4-6 hours. **Risks:** BLE flakiness on iOS – test on real hardware.

## 2. GPS Tracking: Real Location Services (location.ts)

**Current State:** `LocationManager` in `location.ts` uses Expo Location for foreground/background tracking with `expo-task-manager`. It buffers locations, validates quality, and handles health checks. Background tasks are defined, but need real permission flow and integration with storage.

**Steps to Complete:**

1. **Verify Dependencies & Config:**
   - Ensure `expo-location` and `expo-task-manager` are installed: `bun add expo-location expo-task-manager`.
   - Update `app.json` for location perms (add to existing):
     ```json
     {
       "ios": {
         "infoPlist": {
           "NSLocationWhenInUseUsageDescription": "Track your route during activities.",
           "NSLocationAlwaysAndWhenInUseUsageDescription": "Continue tracking in background."
         }
       },
       "android": {
         "permissions": ["android.permission.FOREGROUND_SERVICE_LOCATION"]
       }
     }
     ```
   - For background location on iOS, enable in Expo dashboard or add to entitlements.

2. **Enhance Tracking in `location.ts`:**
   - In `startBackgroundTracking()`, use a unique task name per recording (e.g., `background-location-${recordingId}`) to avoid conflicts.
   - Improve validation in `isLocationValid()`: Add checks for `coords.speed > 0` and `coords.accuracy < 20m` for high-quality fixes.
   - Buffer integration: In `handleLocationUpdate()`, call `this.storageManager.addSensorReading()` directly (import `DataStorageManager`).
   - Health check: In `performHealthCheck()`, if stalled >30s, trigger a one-time location request via `Location.getCurrentPositionAsync()`.

3. **Integrate with Service & Hook:**
   - In `ActivityRecorderService` (`index.ts`), ensure `locationManager.addCallback()` feeds into `handleSensorData()` for lat/lng, speed, altitude.
   - In `startRecording()`, await `locationManager.startForegroundTracking()` and confirm permissions first.
   - Update `metrics` in hook: Compute distance on-the-fly using `@repo/core/calculations/calculateTotalDistance(allCoordinates)`.
   - Stop tracking: In `finishRecording()`, call `locationManager.stopAllTracking()` and flush buffer to storage.

4. **Testing & Edge Cases:**
   - Simulator: Use Expo's location simulation (shake device > "Location" > simulate path).
   - Real device: Walk/run outdoors; verify background continues (lock screen, switch apps).
   - Offline: Test buffering – locations should persist via AsyncStorage and sync on resume.
   - Complete when: GPS starts/stops reliably, metrics show real distance/speed, and background works for 5+ mins.

**Estimated Effort:** 3-5 hours. **Risks:** Battery drain – monitor with Expo's dev tools; iOS background limits.

## 3. Permissions: Real Permission Requests (permissions.ts)

**Current State:** `PermissionsManager` handles Expo Location perms and Android Bluetooth. It checks/requests and shows alerts, but needs full integration with all managers and UI flow.

**Steps to Complete:**

1. **Expand Permission Types:**
   - Add motion/activity recognition if needed (for step counting): Use `expo-sensors` and add perm.
   - In `ensure()`, chain requests: Location first, then background, then Bluetooth.

2. **Integrate with Service:**
   - In `ActivityRecorderService.init()`, call `permissionsManager.checkAll()` and block init if critical perms denied.
   - Before starting managers: In `startRecording()`, await `ensurePermission('location')` etc., and throw if denied.
   - Update `getPermissionState()` to reflect real Expo statuses (e.g., map 'granted' to true).

3. **UI Flow in Modals (`record/permissions.tsx`):**
   - Use the hook's `requestAllPermissions()` to trigger from modal.
   - Show progress: Loading spinner per perm, then success/error icons.
   - On denial: Route to settings via `Linking.openSettings()` and re-check on return.

4. **Testing & Edge Cases:**
   - Test denial flows: Deny perms, verify alerts and settings redirect.
   - iOS/Android diffs: Background location requires explicit user approval post-foreground grant.
   - Complete when: All perms request correctly, managers only start if granted, and UI reflects status.

**Estimated Effort:** 2-3 hours. **Risks:** User experience – make requests contextual (e.g., "Grant location to track runs").

## 4. TRPC Client: Remove Placeholders, Add Real API Calls

**Current State:** In `storage.ts` (via `uploadCompletedActivity` in service), there's a TODO for TRPC `api.activities.create.mutate()`. Hook has `uploadActivity()` calling service.

**Steps to Complete:**

1. **Setup TRPC Client:**
   - Install: `bun add @trpc/client @trpc/react-query` (assuming React Query integration).
   - Create `lib/trpc.ts`: Initialize client with Supabase URL from env (use `@repo/supabase` types).
     ```ts
     import { createTRPCReact } from '@trpc/react-query';
     import { httpBatchLink } from '@trpc/client';
     import type { AppRouter } from 'apps/web/src/server/trpc'; // From web app

     export const trpc = createTRPCReact<AppRouter>();
     export const trpcClient = trpc.createClient({
       links: [httpBatchLink({ url: 'http://localhost:3000/api/trpc' })], // Use real URL
     });
     ```

2. **Replace Placeholder in Service:**
   - In `uploadCompletedActivity()` (index.ts), replace TODO:
     ```ts
     import { trpc } from '@/lib/trpc'; // Adjust path
     // ...
     const result = await trpc.activities.create.mutate(submissionPayload);
     if (result.success) {
       await this.storageManager.markRecordingSynced(id);
       return true;
     }
     ```
   - Handle errors: Retry on network fail (use React Query's retry), fallback to local storage.

3. **Integrate with Hook & Modals:**
   - In `useActivityRecorder.uploadActivity()`, wrap in try/catch and update UI state.
   - In `activity-recording/[activityRecordingId].tsx` modal, call `uploadActivity()` on submit.
   - Use shared types: Ensure `submissionPayload` matches `core` schemas.

4. **Testing:**
   - Mock TRPC responses with MSW for offline testing.
   - Real: Point to dev web server; verify activity uploads to Supabase.
   - Complete when: Placeholder log gone, real mutations succeed, and synced flag updates.

**Estimated Effort:** 4-6 hours. **Risks:** TRPC schema mismatch – sync with web app's router.

## 5. Planned Activities: Backend Integration

**Current State:** In `record/activity.tsx`, mock workouts with TODO for backend fetch. Hook's `startRecording()` accepts `plannedActivity` but doesn't fetch.

**Steps to Complete:**

1. **Fetch from Backend via TRPC:**
   - Define query in web's TRPC: `plannedActivities.list` returning `PublicPlannedActivitiesRow[]`.
   - In hook/service: Add `fetchPlannedActivities(profileId: string)` using TRPC:
     ```ts
     const planned = await trpc.plannedActivities.list.query({ profileId });
     ```
   - Cache with React Query for offline (use `persistQueryClient`).

2. **Update UI (`record/activity.tsx`):**
   - Replace `MockPlannedWorkouts` with real fetch: Use `useQuery` from `@trpc/react-query`.
   - Filter by `activityType`; show loading/error states.
   - On select: Pass real `PublicPlannedActivitiesRow` to `startRecording(plannedActivity)`.

3. **Service Integration:**
   - In `startRecording()`, use `plannedActivity` to set targets (e.g., guide UI with steps from schema via `@repo/core/calculations/schema-navigation`).
   - On finish: Include `plannedActivityId` in upload payload for compliance scoring (`@repo/core/calculations/compliance-scoring`).

4. **Testing:**
   - Seed test data in Supabase.
   - Verify: Fetch lists correctly, starts recording with planned data, UI shows real workouts.
   - Complete when: Mocks removed, real data flows from backend to recording.

**Estimated Effort:** 5-7 hours. **Risks:** Schema sync – ensure `PublicPlannedActivitiesRow` matches DB.
