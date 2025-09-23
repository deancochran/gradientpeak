# Updated Analysis and Action Plan: Activity Recorder Service

### Document Purpose
This document provides a technical analysis of the activity recording service located in `apps/mobile/src/lib/services/activity-recorder.ts` and outlines a concrete, phased plan to make it production-ready. It incorporates feedback to sharpen objectives and add architectural specificity.

---

### 1. Current State Breakdown (Fact-Checked)

The initial analysis is confirmed to be accurate. The service is a strong architectural skeleton but requires significant implementation work to be functional and robust.

**Overall Strengths**:
- **Schema Awareness**: The service correctly imports and utilizes core data schemas from the `@repo/core` package, aligning with the project's single source of truth principle.
- **Service Design**: The static class structure provides a clean, state-agnostic interface (`startActivity`, `finishActivity`, etc.). The use of a `streamBuffer` is a memory-efficient approach for handling sensor data.
- **UI Flow**: The recording modals in `apps/mobile/src/app/modals/record/` are well-structured, with clear separation of concerns for permissions (`permissions.tsx`), device connection (`bluetooth.tsx`), and activity selection (`activity_selection.tsx`).
- **Fault Tolerance Seeds**: The code contains stubs and types (`RecoveryData`, `ActivityCheckpoint`) that hint at a planned recovery system, providing a good starting point.

**Key Gaps (Why Not Production-Ready Yet)**:
- **Reliance on Local Types**: The service currently uses numerous local, non-schema types (e.g., `RecordingSession`, `LiveMetrics`), creating a risk of data inconsistency with the core schemas in `packages/core/schemas/`.
- **Incomplete Implementation**: Core methods are stubs. There is no actual integration with device sensors (GPS, BLE), local database storage (via Drizzle), or the tRPC API for syncing.
- **Decoupled UI and Logic**: The UI modals are not yet driven by the service. For example, the BLE scanning in `bluetooth.tsx` is a mock and does not communicate with the service.
- **Missing Lifecycle Management**: Critical features like background recording, session recovery after a crash, and a robust data sync mechanism with offline support are not implemented.

---

### 2. Revised and Actionable Phased Plan

This revised plan integrates specific architectural and implementation decisions to make each step clearer and more objective.

**Phase 1: Type Cleanup & Core Alignment (~2 hours)**:
- [ ] **Refactor `apps/mobile/src/lib/services/activity-recorder.ts`**:
  - **Replace Local Types**:
    - `RecordingSession`: Replace with a combination of `PublicActivitiesInsert` and a minimal state object.
    - `LiveMetrics`: Redefine this type for internal use with `Pick` to ensure it is a strict subset of `PublicActivitiesRow` fields for type safety. Example: `type LiveMetrics = Pick<PublicActivitiesRow, 'avg_speed' | 'distance'>;`
    - `StreamDataPoint`, `GpsDataPoint`, `SensorDataPoint`: Eliminate these in favor of using `PublicActivityStreamsInsert` directly.
  - **Add Zod Validation**: In `finishActivity`, validate the final activity object against `publicActivitiesInsertSchema` from `@repo/core/schemas` before returning.
  - **Enforce Enum Mapping**: Ensure `ActivityType` from the UI is explicitly mapped to the `PublicActivityType` enum from the database schema.

**Phase 2: State Management & Dependency Injection (~3 hours)**:
- [ ] **Define State Management Stores**: Create a new directory `apps/mobile/src/lib/stores/`. Inside, review the `permissions-store.ts` and create a `bluetooth-store.ts` using Zustand. These will manage permissions state and BLE device status/connection across the app.
- [ ] **Make Service Injectable**: Update the `ActivityRecorderService` constructor to initialize a new activity recorder service: `new ActivityRecorderService()`.
- [ ] **Integrate Permissions**: In `startActivity`, call `await permissionsStore.ensureForActivity(activityType)` to guarantee necessary permissions before starting.
- [ ] **Implement Real BLE Logic**: Replace the mock scanning in `apps/mobile/src/app/modals/record/bluetooth.tsx` with a real implementation using `react-native-ble-plx`, driven by the new `bluetooth-store.ts`. The service will subscribe to this store for connection status.

**Phase 3: Implement Core Recording Methods (~4-5 hours)**:
- [ ] **Implement Sensor Data Collection**:
  - In `startActivity`, initialize and start listening to Expo APIs (`Location`, etc.) and BLE device characteristics.
- [ ] **Centralize Metric Calculations**: Create use core package calculationsfor reusable calculations (speed, distance, etc... Foound in @repo/core). The service’s `updateLiveMetrics` method will call these functions.
- [ ] **Implement Background Execution**: This is a critical task.
    1.  **Define Task**: Use `TaskManager.defineTask` in `apps/mobile/src/lib/tasks/location-task.ts` to define a background-safe task.
    2.  **Register/Unregister**: Start the task via `Location.startLocationUpdatesAsync` when recording begins and stop it with `Location.stopLocationUpdatesAsync` on pause/finish.
    3.  **Data Handling**: The background task must push location data directly to the local SQLite database.
- [ ] **Implement Local Storage**:
  - `flushStreamBuffer`: Implement this to insert buffered stream data into the `public_activity_streams` table in SQLite with a `sync_status` of `'local_only'`.
  - `finishActivity`: Stop all sensors, perform final calculations, and insert the completed activity record into the `public_activities` table.

**Phase 4: Fault Tolerance & Recovery (~3 hours)**:
- [ ] **Implement Checkpoints**: In `addStreamData`, periodically save a snapshot of the current `LiveMetrics` and session timestamp to a dedicated `activity_checkpoints` table in SQLite. **Decision: Use SQLite exclusively for recovery data to ensure transactional integrity.**
- [ ] **Implement App Initialization Recovery**: In `apps/mobile/src/app/(internal)/_layout.tsx`, add a `useEffect` hook that calls a static `ActivityRecorderService.checkForUnfinishedSessions()` on app load to handle recovery from a crash.
- [ ] **Build Recovery Method**: Implement `static recoverSession(id: string)`, which will reconstruct the recording state from data in the `public_activities`, `public_activity_streams`, and `activity_checkpoints` tables.

**Phase 5: Summaries & Lifecycle Completion (~3 hours)**:
- [ ] **Fetch Real Planned Activities**: In `apps/mobile/src/app/modals/record/activity_selection.tsx`, replace the mock data by fetching real planned activities using a tRPC query.
- [ ] **Centralize Summary Calculations**: In `packages/core/`, create or update `activityUtils.ts` to include functions for complex summary calculations (e.g., `calculateTSS`). The `finishActivity` method will call these.

**Phase 6: tRPC Sync & Polish (~3 hours)**:
- [ ] **Implement Sync Logic**: Create a `static async syncActivity(id: string)` method that fetches local data and uses tRPC mutations (`router.activities.create`, `router.activityStreams.upsert`) to send it to the backend.
- [ ] **Implement Offline Queue**: Create a `SyncManager` (as a hook or service, initialized at app root) that manages a queue of activities needing to be synced. It should listen to network status changes (`@react-native-community/netinfo`) to trigger sync retries with exponential backoff.
- [ ] **Address Platform Specifics**: For Android, implement a **Foreground Service** to ensure long recordings are not terminated by the OS. Note: This is a significant task and should be tracked separately.
