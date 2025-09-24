# App Update: Data Flow for Activity Recording

### **Data Flow** (Current Implementation Status)

1. **Session Creation** ✅ *Implemented*

   * User initiates an activity in the app.
   * `ActivityRecorderService.createActivityRecording()` in `apps/mobile/src/lib/services/activity-recorder.ts:95` inserts a new row into the local SQLite `activity_recordings` table.
   * Session state held in memory using `RecordingSession` type from `apps/mobile/src/lib/services/activity-recorder.ts:14`.
   * Database schema defined in `apps/mobile/src/lib/db/schemas/activity_recordings.ts:15`.

2. **Live Metrics Collection** ⚠️ *Partial - needs BLE integration*

   * Current: Basic in-memory `LiveMetrics` structure exists.
   * **Missing**: Real BLE sensor integration with `react-native-ble-plx`.
   * **Missing**: GPS integration with `expo-location` services.
   * Permissions store implemented in `apps/mobile/src/lib/stores/permissions-store.ts`.

3. **Chunked Stream Storage** ✅ *Implemented*

   * Periodic chunking via `ActivityRecorderService.createActivityRecordingStream()` at `apps/mobile/src/lib/services/activity-recorder.ts:156`.
   * Data stored in `activity_recording_streams` table (schema: `apps/mobile/src/lib/db/schemas/activity_recordings.ts:41`).
   * Uses `synced` boolean flag instead of `sync_status` enum.

4. **Activity Completion** ✅ *Core structure implemented*

   * `ActivityRecorderService.finishActivityRecording()` at `apps/mobile/src/lib/services/activity-recorder.ts:132`.
   * **Missing**: Actual aggregate calculations (needs `@repo/core` implementation).
   * Updates local `activity_recordings` with final state.

5. **Backend Sync** ✅ *tRPC endpoints ready*

   * Upload method `ActivityRecorderService.uploadCompletedActivity()` at `apps/mobile/src/lib/services/activity-recorder.ts:184`.
   * tRPC endpoints implemented:
     * `packages/trpc/src/routers/activities.ts:44` - `activities.create` mutation
     * `packages/trpc/src/routers/activity_streams.ts:42` - `activityStreams.batchCreate` mutation
   * **Missing**: Actual compression implementation.
   * Post-sync cleanup implemented (deletes local recording data).

---

## 4. tRPC Local → Supabase Sync Workflow ✅ *Architecture ready*

1. **Local Activity Recording**

   * Metrics stored in `activity_recording_streams` table (`apps/mobile/src/lib/db/schemas/activity_recordings.ts:41`).
   * All metric types (heart rate, power, GPS, altitude) use same unified schema.
   * Chunks flagged with `synced: boolean` field (default `false`).

2. **Finish Recording**

   * Aggregate calculations planned for `@repo/core/calculations/activity-summary.ts` (**to be created**).
   * Updates `activity_recordings` table with computed summary metrics.

3. **tRPC Upload**

   * Method: `ActivityRecorderService.uploadCompletedActivity()` at `apps/mobile/src/lib/services/activity-recorder.ts:184`.
   * Process:
     1. Fetch chunks via `listActivityRecordingStreams()` (line 179)
     2. Group by metric using `groupBy()` utility
     3. Compression implementation needed
     4. `trpc.activities.create()` - implemented at `packages/trpc/src/routers/activities.ts:44`
     5. `trpc.activityStreams.batchCreate()` - implemented at `packages/trpc/src/routers/activity_streams.ts:42`
   * Mark local chunks as `synced: true`

4. **Recovery**

   * **Missing**: Dedicated `SyncManager` service for retry logic

---

## 🎯 **Priority Implementation Tasks**

### **High Priority** (Core Recording Functionality)
1. **BLE Sensor Integration**
   - Implement real BLE device scanning/connection in sensor service
   - Integrate with existing permissions store (`apps/mobile/src/lib/stores/permissions-store.ts`)
   - Parse standard GATT characteristics (HR, power, cadence)

2. **GPS Location Services**
   - Integrate `expo-location` with recording service
   - Background location tracking for route recording
   - Coordinate with existing permissions system

3. **Activity Summary Calculations**
   - Create `@repo/core/calculations/activity-summary.ts` with pure functions
   - Implement distance, moving time, elevation, calorie calculations
   - Unit test in core package (`cd packages/core && bun test`)

### **Medium Priority** (Sync & Recovery)
4. **Data Compression Implementation**
   - Add compression library (pako/gzip) to `apps/mobile/package.json`
   - Implement in `uploadCompletedActivity()` method

5. **Sync Recovery Manager**
   - Create dedicated `SyncManager` service
   - Network reconnection retry logic
   - Unfinished session recovery on app restart

### **Low Priority** (Polish & Background)
6. **Background Task Management**
   - `expo-task-manager` integration for GPS continuity
   - Foreground service for BLE connections
---

# 📋 Implementation Plan

This plan is updated to reflect the current codebase structure and avoids creating unnecessary files. Focus is on enhancing existing implementations rather than duplicating effort.

---

## Task 1: Enhance Existing Activity Recorder Service ✅ *Already Exists*

**File**: `apps/mobile/src/lib/services/activity-recorder.ts`

**Current Status**: Core service structure implemented with:
- `createActivityRecording()` method (line 95)
- `RecordingSession` type definition (line 14)
- Database integration with SQLite schemas
- React hook integration via `useEnhancedActivityRecording` (already exists)

**Required Updates**: None - structure is complete and follows project patterns.

---

## Task 2: Enhance Sensor Integration (BLE & GPS) ⚠️ *Needs Implementation*

**Current**: Permissions store exists at `apps/mobile/src/lib/stores/permissions-store.ts` with full BLE/GPS permission handling.

**Required Work**:
1. **Create new file**: `apps/mobile/src/lib/services/SensorManager.ts`
2. **Dependencies needed**: Verify `react-native-ble-plx` and `expo-location` are in `apps/mobile/package.json`
3. **GPS Integration**:
   - Subscribe to location updates via existing permission system
   - Calculate speed, distance, elevation from coordinates
   - Feed data to `ActivityRecorderService.onSensorData()` method (to be added)
4. **BLE Integration**:
   - Device scanning/connection using permission store
   - Standard GATT service parsing (HR: `0x180D`, Power: `0x1818`, CSC: `0x1816`)
   - **Create pure parsers in**: `@repo/core/calculations/sensor-parsing.ts`
5. **Service Integration**:
   - Add `onSensorData(metric, value, timestamp)` to existing `ActivityRecorderService`
   - Update `LiveMetrics` in-memory state
   - Proper cleanup on activity stop/discard

---

## Task 3: Chunked Stream Storage ✅ *Already Implemented*

**File**: `apps/mobile/src/lib/services/activity-recorder.ts:156`

**Current Status**:
- `createActivityRecordingStream()` method implemented
- Proper database schema in `apps/mobile/src/lib/db/schemas/activity_recordings.ts:41`
- Includes all required fields: `activityRecordingId`, `metric`, `dataType`, `chunkIndex`, `startTime`, `endTime`, `data`, `timestamps`
- `synced` boolean flag (defaults to `false`)

**Required Updates**:
- Add periodic timer logic to call chunking method every 5-10 seconds
- Integrate with sensor data collection (once Task 2 is complete)

---

## Task 4: Final Aggregation and Activity Completion ⚠️ *Needs Core Package Implementation*

**Current**: `finishActivityRecording()` method exists at `apps/mobile/src/lib/services/activity-recorder.ts:132` but lacks actual calculations.

**Required Work**:
1. **Create**: `@repo/core/calculations/activity-summary.ts` with pure functions:
   - `calculateTotalDistance(gpsPoints)`
   - `calculateMovingTime(speedData, timestamps)`
   - `calculateElevationGain(altitudeData)`
   - `calculateAverageMetrics(heartRateData, powerData, etc.)`
   - `calculateCalories(profile, duration, avgPower, avgHR)`

2. **Database Schema**: Verify summary columns exist in `apps/mobile/src/lib/db/schemas/activity_recordings.ts`

3. **Update Existing Method**: Enhance `finishActivityRecording()` to:
   - Fetch all chunks via existing `listActivityRecordingStreams()` (line 179)
   - Call core calculation functions
   - Update activity record with computed aggregates

4. **Testing**: Add unit tests to `packages/core/` (`bun test`)

---

## Task 5: tRPC Sync and Data Compression ⚠️ *Needs Compression Implementation*

**Current**: Method structure exists at `apps/mobile/src/lib/services/activity-recorder.ts:184` and tRPC endpoints are ready:
- `packages/trpc/src/routers/activities.ts:44` (`activities.create`)
- `packages/trpc/src/routers/activity_streams.ts:42` (`activityStreams.batchCreate`)

**Required Work**:
1. **Add Compression Library**: Add `pako` to `apps/mobile/package.json`
2. **Implement Compression**: In existing `uploadCompletedActivity()` method:
   - Use existing `listActivityRecordingStreams()` and `groupBy()` logic
   - Add gzip compression before tRPC calls
   - Handle base64 encoding for tRPC transport
3. **Error Handling**: Robust retry logic for failed uploads
4. **Cleanup**: Mark local chunks as `synced: true` and delete after successful upload

**No New Files Required**: All infrastructure exists, just needs compression implementation.

---

## Task 6: Background Task Management and Sync Recovery ⚠️ *New Implementation Needed*

**Current**: React hook integration exists at `apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts` with basic recovery methods.

**Required Work**:
1. **Background GPS**:
   - Integrate `expo-task-manager` with existing location permission system
   - Background location task definition and registration

2. **Sync Recovery Manager**:
   - **Create**: `apps/mobile/src/lib/services/SyncManager.ts`
   - Network status detection with `@react-native-community/netinfo`
   - Query for `activityRecordings` where `state = 'finished'` AND `synced = false`
   - Call existing `uploadCompletedActivity()` for each unsynced activity
   - Implement sync locking mechanism (prevent duplicates)

3. **Integration**:
   - Initialize SyncManager on app startup
   - Hook into network reconnection events
   - Coordinate with existing recovery methods in hook

**Note**: BLE background handling is complex and platform-specific - recommend implementing GPS background support first.
