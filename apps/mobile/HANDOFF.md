Technical Implementation Plan: Activity Recording Consolidation

## Executive Summary

This document outlines the technical implementation for consolidating TurboFit's mobile app activity recording system. The goal is to enhance the existing `ActivityRecorderService` as the unified service that manages the complete activity lifecycle, while streamlining hooks and updating existing UI components. This will reduce codebase complexity by ~7% (from current ~3,050 lines across multiple services, hooks, and UI to ~2,700 lines through deduplication and refactoring) and establish a single source of truth for all recording operations within existing files. All changes will be made in-place: merging logic into primary existing files (e.g., `ActivityRecorderService.ts`, `useEnhancedActivityRecording.ts`, and current UI in `apps/mobile/src/app/modals/record/` and `apps/mobile/src/components/`), without creating new files or components.

## Current State Analysis

### Existing Architecture Assessment

**Current Service Layer (To Be Consolidated):**
- `ActivityRecorderService` (650 lines) - Primary recording logic with GPS, sensors, recovery (enhance as unified service)
- `ActivityService` (thin orchestrator) - Basic CRUD operations (merge into `ActivityRecorderService`)
- `ActivitySaveService` - Activity persistence logic (merge into `ActivityRecorderService`)
- `ActivityCompletionService` - Post-recording processing (merge into `ActivityRecorderService`)
- `ActivitySyncService` - Background sync operations (keep separate, integrate calls)
- `LocalActivityDatabaseService` - Database operations (merge into `ActivityRecorderService`)

**Current Hook Layer (To Be Simplified):**
- `useEnhancedActivityRecording` (550 lines) - Complex hook with recovery, checkpointing, error handling (refactor to wrap enhanced service)
- `useActivityManager` - Activity lifecycle management (merge logic into `useEnhancedActivityRecording`)
- `useAdvancedBluetooth` - BLE device management (merge into `useEnhancedActivityRecording` or keep and simplify)
- `useRecordSelection` - Activity type selection logic (merge into `useEnhancedActivityRecording`)

**Current UI Components (To Be Updated):**
- `MetricsGrid.tsx` - Unified metrics display (enhance for live updates)
- `RecordingControls.tsx` - Pause/Resume/Stop buttons (integrate service state)
- `RecordingHeader.tsx` - Activity status display (add service reactivity)
- `RecordingBodySection.tsx` - Main recording interface (consolidate flows)
- `ActivityRecordingErrorBoundary.tsx` - Error handling wrapper (extend for new error logging)

**Current Database Schema (SQLite + Drizzle):**
```typescript
// apps/mobile/src/lib/db/schemas/activities.ts
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  name: text("name").notNull(),
  localFilePath: text("local_file_path").notNull(), // JSON file path
  syncStatus: text("sync_status").notNull().default("local_only"),
  activityType: text("activity_type").notNull().default("other"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  totalTime: integer("total_time").notNull().default(0),
  movingTime: integer("moving_time").notNull().default(0),
  // ... comprehensive metrics fields
});

export const activityStreams = sqliteTable("activity_streams", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").references(() => activities.id),
  type: text("type").notNull(), // 'gps', 'heartrate', 'power', etc.
  data: text("data").notNull(), // JSON stringified stream data
  chunkIndex: integer("chunk_index").notNull().default(0),
  syncStatus: text("sync_status").notNull().default("local_only"),
});
```

### Complexity Analysis

**Current Pain Points:**
- many service files with overlapping responsibilities
- AsyncStorage checkpoints scattered across multiple files
- GPS error handling duplicated between service and hook
- Sensor data buffering logic in both service and hook layers
- Recovery mechanisms split between `ActivityRecorderService` and `useEnhancedActivityRecording`

## Architecture Overview

### Consolidation Strategy

**Ground Truth Service:** Enhance the existing `ActivityRecorderService` to become the single source of truth by merging ALL recording logic from other services while preserving robust recovery mechanisms. Add consolidated state management, lifecycle methods, and data handling directly to this file.

```typescript
// apps/mobile/src/lib/services/activity-recorder.ts (enhance existing file)
class ActivityRecorderService {
  // ===== ENHANCED CONSOLIDATED STATE MANAGEMENT =====
  private static currentSession: RecordingSession | null = null
  private static state: RecordingState = 'idle' // idle | selecting | recording | paused | finished
  private static locationSubscription: Location.LocationSubscription | null = null
  private static recordingTimer: NodeJS.Timeout | null = null

  // ===== PRESERVED & ENHANCED ROBUST FEATURES =====
  private static sensorDataBuffer: SensorDataPoint[] = []
  private static gpsDataBuffer: GpsDataPoint[] = []
  private static startTime: Date | null
  private static lastResumeTime: Date | null = null

  // ===== ENHANCED RECOVERY LOGIC (merge from hook) =====
  private static recoveryData: RecoveryData = {
    lastSavedTimestamp: 0,
    checkpoints: [],
    errorLog: [],
    connectionAttempts: 0
  }
  private static checkpointInterval: NodeJS.Timeout | null = null

  // ===== ENHANCED LIFECYCLE METHODS (merge from other services) =====
  static async startActivity(type: ActivityType, plannedId?: string): Promise<string | null>
  static async pauseActivity(): Promise<boolean>
  static async resumeActivity(): Promise<boolean>
  static async finishActivity(): Promise<ActivityResult>
  static async discardActivity(): Promise<void>

  // ===== ENHANCED DATA MANAGEMENT (merge persistence & completion) =====
  private static async recordSensorData(data: SensorDataPoint): Promise<void>
  private static async generateActivityJSON(): Promise<ActivityJSON>
  private static async saveToLocalDB(json: ActivityJSON): Promise<string>
  private static async queueForSync(activityId: string): Promise<void>

  // ===== PRESERVED GPS & SENSOR LOGIC =====
  private static async startLocationTracking(): Promise<void>
  private static async stopLocationTracking(): Promise<void>
  private static async connectBluetooth(deviceId: string): Promise<boolean>

  // ===== ENHANCED RECOVERY MECHANISMS (merge from hook) =====
  private static async createCheckpoint(): Promise<void>
  private static async recoverFromInterruption(): Promise<boolean>
  private static async saveSessionToStorage(): Promise<void>
  private static async clearRecoveryData(): Promise<void>

  // ===== ENHANCED METRICS CALCULATION =====
  private static updateLiveMetrics(dataPoint: SensorDataPoint): void
  private static calculateFinalMetrics(): ActivityMetrics
}
```

### Feature Preservation Matrix

| Current Feature | Source File | Status | New Location | Implementation Notes |
|----------------|-------------|--------|-------------|---------------------|
| GPS timeout handling | ActivityRecorderService | **PRESERVE** | ActivityRecorderService.startLocationTracking() | Critical for reliability - maintain 15s timeout |
| Background location tracking | ActivityRecorderService | **PRESERVE** | ActivityRecorderService.setupBackgroundTask() | Required for mobile - use TaskManager |
| Checkpoint system | useEnhancedActivityRecording | **PRESERVE** | ActivityRecorderService.createCheckpoint() | Essential for recovery - 30s intervals |
| Error logging | useEnhancedActivityRecording | **PRESERVE** | ActivityRecorderService.logError() | Production necessity - max 50 entries |
| Sensor data buffering | ActivityRecorderService | **PRESERVE** | ActivityRecorderService.sensorDataBuffer | Prevent data loss - flush every 10 entries |
| AsyncStorage checkpoints | useEnhancedActivityRecording | **PRESERVE** | ActivityRecorderService.saveSessionToStorage() | Critical for crash recovery |
| Live metrics calculation | ActivityRecorderService | **PRESERVE** | ActivityRecorderService.updateLiveMetrics() | Real-time UI updates |
| Distance calculation | ActivityRecorderService | **PRESERVE** | ActivityRecorderService.calculateDistance() | Haversine formula |
| Timer duration tracking | ActivityRecorderService | **PRESERVE** | ActivityRecorderService timing logic | Separate elapsed vs active time |

### State Machine

```
idle → selecting → recording → paused → finished
                      ↓          ↓         ↓
                  discarded  discarded  summary → idle
```

## Concrete File Operations

### Files to DELETE (After Migration Complete)

**Service Layer Consolidation:**
```bash
# Remove these files - logic merged into ActivityRecorderService
rm apps/mobile/src/lib/services/activity-service.ts            # ~100 lines (CRUD merged)
rm apps/mobile/src/lib/services/activity-save.ts               # ~150 lines (persistence merged)
rm apps/mobile/src/lib/services/activity-completion-service.ts # ~200 lines (completion merged)
rm apps/mobile/src/lib/services/local-activity-database.ts     # ~300 lines (DB ops merged)

# Total removed: ~750 lines
```

**Hook Layer Simplification:**
```bash
# Remove these hooks - logic merged into useEnhancedActivityRecording
rm apps/mobile/src/lib/hooks/useActivityManager.ts              # ~200 lines
rm apps/mobile/src/lib/hooks/useRecordSelection.ts              # ~100 lines

# Total removed: ~300 lines
```

**UI Component Cleanup:**
```bash
# Remove old stepper components (logic integrated into existing modals/screens)
rm apps/mobile/src/app/modals/record/old_components/ActivityModeStep.tsx
rm apps/mobile/src/app/modals/record/old_components/BluetoothStep.tsx
rm apps/mobile/src/app/modals/record/old_components/PermissionsStep.tsx
rm apps/mobile/src/app/modals/record/old_components/PlannedActivityStep.tsx
rm apps/mobile/src/app/modals/record/old_components/ReadyStep.tsx

# Remove duplicate error boundary (if global exists)
rm apps/mobile/src/components/activity/ActivityRecordingErrorBoundary.tsx
```

### Files to MODIFY

**Primary Service Enhancements:**
```bash
# File: apps/mobile/src/lib/services/activity-recorder.ts
# Changes: +300 lines (merge state, recovery, lifecycle, data mgmt from other services/hooks)
```

**Hook Simplification:**
```bash
# File: apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts
# Changes: -200 lines (simplify by delegating to enhanced service; merge manager/selection logic; +100 lines for wrappers)
# File: apps/mobile/src/lib/hooks/useAdvancedBluetooth.ts (if kept)
# Changes: -100 lines (simplify BLE calls to service)
```

**Database Schema Updates:**
```bash
# File: apps/mobile/src/lib/db/schemas/activities.ts
# Changes: +50 lines (add recovery fields inline; update relations without new tables if possible)
```

**Service Index Updates:**
```bash
# File: apps/mobile/src/lib/services/index.ts
# Changes: -4 old exports (keep ActivityRecorderService as primary; retain ActivitySyncService), + enhanced exports
```

**Hook Index Updates:**
```bash
# File: apps/mobile/src/lib/hooks/index.ts (if exists)
# Changes: -2 old exports, + simplified useEnhancedActivityRecording export
```

**UI Component Updates:**
```bash
# File: apps/mobile/src/app/modals/record/index.tsx
# Changes: +200 lines (integrate unified flow, lock behavior, reactivity to service)

# File: apps/mobile/src/components/MetricsGrid.tsx
# Changes: +50 lines (enhance for live service metrics)

# File: apps/mobile/src/components/RecordingControls.tsx
# Changes: +30 lines (wire to service pause/resume/finish)

# File: apps/mobile/src/app/(internal)/(tabs)/record.tsx
# Changes: +100 lines (update placeholder to full recording interface using existing components)

# File: apps/mobile/src/app/modals/record/activity_selection.tsx (if exists, or integrate into index.tsx)
# Changes: +150 lines (merge selection logic)

# File: apps/mobile/src/app/modals/record/bluetooth.tsx (if exists, or integrate)
# Changes: +100 lines (simplify device mgmt)

# File: apps/mobile/src/app/modals/record/permissions.tsx (if exists, or integrate)
# Changes: +80 lines (unified permissions)
```

### Migration Impact Analysis

**Before Migration:**
- Services: ~1,400 lines across 6 files
- Hooks: ~850 lines across 4 files
- UI: ~800 lines across various components
- **Total: ~3,050 lines**

**After Migration:**
- Services: ~950 lines in 2 files (enhanced ActivityRecorderService + ActivitySyncService)
- Hooks: ~650 lines across 2 files (simplified useEnhancedActivityRecording + useAdvancedBluetooth if kept)
- UI: ~950 lines (updated existing components)
- **Total: ~2,550 lines**

**Net Reduction: ~500 lines (16%)** through deduplication, with improved maintainability via centralized logic in existing files.

## Record Modal System Specifications

Based on the existing modal structure in `apps/mobile/src/app/modals/record/`, enhance the components for a cohesive recording experience integrated with the refactored `ActivityRecorderService`. All updates will add reactivity, state locking, and consolidated flows directly to `index.tsx` and referenced components.

### **1. Index Modal (`index.tsx`) - Main Recording Interface**

**Purpose**: Primary recording control interface that's reactive to `ActivityRecorderService` state. Enhance with modal lock to prevent dismissal during active recording.

```typescript
// Enhance existing index.tsx
const IndexModal = () => {
  const { state, canDismissModal } = useEnhancedActivityRecording() // Simplified hook

  return (
    <Modal
      presentationStyle="fullScreen"
      onRequestClose={() => canDismissModal && onClose()}
    >
      <RecordingHeader />
      <MetricsGrid /> {/* Existing, enhanced */}
      <RecordingBodySection /> {/* Consolidate flows here */}
      <RecordingControls /> {/* Existing, wired to service */}
    </Modal>
  )
}
```

### **2. Activity Selection (Integrate into `index.tsx` or existing selection file)**

**Purpose**: Allows users to switch between planned/unplanned activities and select type. Merge `useRecordSelection` logic here.

### **3. Bluetooth Management (Integrate into `index.tsx` or existing BLE file)**

**Purpose**: BLE device scanning, pairing, and management. Simplify `useAdvancedBluetooth` and call service methods.

### **4. Permissions Management (Integrate into `index.tsx` or existing permissions file)**

**Purpose**: Location permission status and management. Consolidate requests via service.

**Updated Modal Layout Configuration**: Enhance existing modals to integrate directly with the service, providing immediate feedback on recording status. Use existing components like `MetricsGrid` and `RecordingControls` for the unified interface.

## Implementation Sequence

### Step 1: Enhance Core Service Foundation

**Objective**: Establish central logic in existing `ActivityRecorderService` and update modal behavior.

Enhance `ActivityRecorderService` with consolidated state management by merging from other services.

```typescript
// apps/mobile/src/lib/services/activity-recorder.ts (add to existing)
const RecordingContext = createContext({
  isRecording: false,
  canDismissModal: true,
  activityState: 'idle'
})
```

Update existing `apps/mobile/src/app/modals/record/index.tsx` with controlled dismissal:

```typescript
// Enhance existing RecordModal/index.tsx
const { canDismissModal } = useEnhancedActivityRecording()

return (
  <Modal
    presentationStyle="fullScreen"
    onRequestClose={() => canDismissModal && onClose()}
  >
```

**Key Files to Modify:**
- `apps/mobile/src/lib/services/activity-recorder.ts` (add state/recovery)
- `apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts` (simplify wrapper)
- `apps/mobile/src/app/modals/record/index.tsx` (add lock behavior)

### Step 2: Integrate Permissions and Sensor Handling

**Objective**: Unify permission and sensor logic in service and hook.

Enhance centralized permissions in `ActivityRecorderService`:

```typescript
// Add to apps/mobile/src/lib/services/activity-recorder.ts
private async checkAllPermissions() {
  const location = await Location.getForegroundPermissionsAsync()
  const bluetooth = await ExpoDevice.isBluetoothAvailableAsync()
  return { location, bluetooth }
}

private async requestAllPermissions() {
  // Request all needed permissions
}
```

Integrate Expo modules into service methods (enhance existing):

```typescript
// Enhance existing startLocationTracking in service
private async startLocationTracking() {
  await this.requestAllPermissions()
  this.locationSubscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation },
    (location) => this.updateMetrics(location)
  )
}

private async connectBluetooth(deviceId: string) {
  // Enhance existing BLE logic
  this.bleSubscription = device.onValueChange((data) => {
    this.updateHeartRate(data)
  })
}
```

**Key Files to Modify:**
- `apps/mobile/src/lib/services/activity-recorder.ts` (add permissions/sensors)
- `apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts` (delegate to service)
- `apps/mobile/src/app/modals/record/index.tsx` (integrate permission checks)

### Step 3: Enhance Live Metrics Display

**Objective**: Update existing metrics UI to receive data from service.

Enhance `MetricsGrid.tsx` for service integration:

```typescript
// apps/mobile/src/components/MetricsGrid.tsx (enhance existing)
const MetricsGrid = () => {
  const { metrics } = useEnhancedActivityRecording() // From simplified hook

  return (
    <Grid>
      <MetricCard label="Time" value={metrics.elapsed} />
      <MetricCard label="Distance" value={metrics.distance} />
      <MetricCard label="Heart Rate" value={metrics.heartRate} />
      <MetricCard label="Pace" value={metrics.pace} />
    </Grid>
  )
}
```

**Files to Modify:**
- `apps/mobile/src/components/MetricsGrid.tsx` (add service metrics)
- `apps/mobile/src/components/RecordingControls.tsx` (wire actions)
- `apps/mobile/src/components/RecordingHeader.tsx` (add status)

### Step 4: Integrate Activity Selection Flow

**Objective**: Merge selection logic into existing hook and modal.

Enhance `useEnhancedActivityRecording` with selection:

```typescript
// apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts (add to existing)
const [mode, setMode] = useState<'planned' | 'unplanned'>('unplanned')
const [activityType, setActivityType] = useState<ActivityType>('run')

const handleStart = () => {
  if (mode === 'planned') {
    ActivityRecorderService.startActivity(activityType, plannedWorkoutId)
  } else {
    ActivityRecorderService.startActivity(activityType)
  }
}
```

Integrate planned workout overlay into `RecordingBodySection.tsx` or `index.tsx`.

**Files to Modify:**
- `apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts` (add selection)
- `apps/mobile/src/app/modals/record/index.tsx` (integrate selector UI)

### Step 5: Enhance Activity Completion and Storage

**Objective**: Merge completion and persistence into service.

Enhance `finishActivity` in service:

```typescript
// apps/mobile/src/lib/services/activity-recorder.ts (enhance existing)
async finishActivity(): Promise<ActivityResult> {
  // Stop all sensors
  this.stopSensors()

  // Calculate final metrics
  const result = this.calculateSummary()

  // Generate JSON
  const activityJSON = this.generateActivityJSON()

  // Save locally (merged logic)
  await this.saveToLocalDB(activityJSON)

  // Queue for sync
  this.queueForSync(activityJSON.id)

  return result
}
```

Update schema inline:

```typescript
// apps/mobile/src/lib/db/schemas/activities.ts (add fields)
export const activities = sqliteTable('activities', {
  // ... existing
  recoveryCheckpoint: text('recovery_checkpoint'), // New inline field
});
```

Enhance existing summary display in `RecordingBodySection.tsx` or `index.tsx`.

**Files to Modify:**
- `apps/mobile/src/lib/services/activity-recorder.ts` (enhance completion)
- `apps/mobile/src/lib/db/schemas/activities.ts` (add recovery fields)
- `apps/mobile/src/app/modals/record/index.tsx` (add summary view)

### Step 6: Integrate Background Sync

**Objective**: Enhance sync calls in existing `ActivitySyncService`.

Update queue processing to use enhanced service data:

```typescript
// apps/mobile/src/lib/services/activity-sync-service.ts (enhance existing)
private async processQueue() {
  const pending = await db.select()
    .from(activities)
    .where(eq(activities.syncStatus, 'pending'))

  for (const activity of pending) {
    try {
      // Upload using service-generated JSON
      const jsonUrl = await this.uploadJSON(activity.json)

      // Sync metadata
      await trpc.activities.sync.mutate({
        ...activity,
        jsonUrl
      })

      // Update status
      await db.update(activities)
        .set({ syncStatus: 'synced' })
        .where(eq(activities.id, activity.id))
    } catch (error) {
      await this.scheduleRetry(activity.id)
    }
  }
}
```

Add network monitoring to existing service.

**Files to Modify:**
- `apps/mobile/src/lib/services/activity-sync-service.ts` (enhance queue)
- `apps/mobile/src/lib/services/activity-recorder.ts` (add sync calls)

### Step 7: Consolidate Recording Screen

**Objective**: Unify UI in existing screen and modal files.

Enhance `apps/mobile/src/app/(internal)/(tabs)/record.tsx` and modal index:

```typescript
// apps/mobile/src/app/(internal)/(tabs)/record.tsx (enhance existing)
const RecordingScreen = () => {
  const {
    state,
    metrics,
    isPlanned,
    pauseActivity,
    resumeActivity,
    finishActivity,
    discardActivity
  } = useEnhancedActivityRecording()

  return (
    <Screen>
      <RecordingHeader /> {/* Existing */}

      <MetricsGrid metrics={metrics} /> {/* Existing */}

      {isPlanned && (
        // Integrate planned overlay into existing body
        <PlannedWorkoutOverlay />
      )}

      <RecordingControls
        state={state}
        onPause={pauseActivity}
        onResume={resumeActivity}
        onFinish={finishActivity}
        onDiscard={discardActivity}
      /> {/* Existing */}

      {state === 'paused' && (
        <PausedOverlay
          onResume={resumeActivity}
          onDiscard={discardActivity}
          onFinish={finishActivity}
        />
      )}
    </Screen>
  )
}
```

**Files to Modify:**
- `apps/mobile/src/app/(internal)/(tabs)/record.tsx` (unify interface)
- `apps/mobile/src/app/modals/record/index.tsx` (add paused overlay)

### Step 8: Remove Legacy Code and Update Imports

**Objective**: Clean up deprecated files and update references after merging.

**CRITICAL: Data Migration Safety**
Before removing, migrate sessions:

```typescript
// Add migration helper to existing service (run once)
const migrateActiveSession = async () => {
  const activeSession = await AsyncStorage.getItem('active_recording_session')
  if (activeSession) {
    console.warn('⚠️ Active recording session detected - migration required')
    // Migrate to enhanced format
  }
}
```

**Service Layer Cleanup:**
```bash
# Phase 1: Deprecate (add warnings)
# Phase 2: Remove after no usage
rm apps/mobile/src/lib/services/activity-service.ts            # Merged
rm apps/mobile/src/lib/services/activity-save.ts               # Merged
rm apps/mobile/src/lib/services/activity-completion-service.ts # Merged
rm apps/mobile/src/lib/services/local-activity-database.ts     # Merged
```

**Hook Layer Cleanup:**
```bash
rm apps/mobile/src/lib/hooks/useActivityManager.ts              # Merged
rm apps/mobile/src/lib/hooks/useRecordSelection.ts              # Merged
```

**Import Updates (Manual or codemod):**
```typescript
// Before
import { useEnhancedActivityRecording } from '@/lib/hooks/useEnhancedActivityRecording'
import { ActivityRecorderService } from '@/lib/services/activity-recorder'
import { ActivityService } from '@/lib/services/activity-service'

// After
import { useEnhancedActivityRecording } from '@/lib/hooks/useEnhancedActivityRecording' // Simplified
import { ActivityRecorderService } from '@/lib/services/activity-recorder' // Enhanced primary
// Remove ActivityService - use service directly
```

**Index File Updates:**
```typescript
// apps/mobile/src/lib/services/index.ts
// Remove merged exports
// export { ActivityService } from "./activity-service"; // REMOVED
// export { ActivitySaveService } from "./activity-save"; // REMOVED
// etc.

// Keep/enhance
export { ActivityRecorderService } from "./activity-recorder"; // ENHANCED SINGLE SOURCE
export { ActivitySyncService } from "./activity-sync-service"; // Keep
```

### Step 9: Add Comprehensive Testing

**Objective**: Enhance existing tests or add to current test files.

Enhance unit tests in existing `__tests__`:

```typescript
// apps/mobile/src/lib/services/activity-recorder.test.ts (enhance existing)
describe('ActivityRecorderService', () => {
  it('transitions states correctly', () => {
    ActivityRecorderService.startActivity('run')
    expect(ActivityRecorderService.state).toBe('recording')

    ActivityRecorderService.pauseActivity()
    expect(ActivityRecorderService.state).toBe('paused')
  })

  it('generates valid JSON', () => {
    // Test enhanced JSON generation
  })

  it('calculates metrics correctly', () => {
    // Test merged calculations
  })
})
```

Add integration/E2E to existing test suites:

```typescript
// apps/mobile/src/lib/hooks/useEnhancedActivityRecording.test.ts (enhance)
it('completes full recording flow', async () => {
  // Start -> simulate data -> pause/resume -> finish -> verify DB
})
```

**Testing Coverage:**
- Unit tests for enhanced service methods
- Integration for data flow
- E2E for workflows
- Edge cases

### Step 10: Update Documentation

**Objective**: Document enhancements in existing docs.

Enhance `README.md` in `apps/mobile/src/lib/services/` and hooks:

```markdown
## Activity Recording Architecture

Enhanced for consolidation:

### Service Layer
- `ActivityRecorderService`: Enhanced core with merged logic and state
- `ActivitySyncService`: Background sync (integrated calls)

### Hook Layer
- `useEnhancedActivityRecording`: Simplified primary hook delegating to service
- `useAdvancedBluetooth`: Simplified BLE (if kept)

### UI Layer
- Existing modals/screens: Enhanced with service reactivity and unified flows
```

Add usage examples to existing READMEs:

```markdown
## Usage Examples

### Starting an Activity
```typescript
const { startActivity } = useEnhancedActivityRecording()
startActivity('run', plannedId?)
```

### Accessing Metrics
```typescript
const { metrics } = useEnhancedActivityRecording()
// metrics.distance, etc.
```
```

Update root `CHANGELOG.md`:

```markdown
## [Version] - Activity Recording Consolidation

### Added
- Enhanced state/recovery in ActivityRecorderService
- Unified permission/sensor handling in service
- Modal lock behavior in existing modals

### Changed
- Merged hooks (from 4 to 2)
- Consolidated UI flows in existing components
- Integrated AsyncStorage/SQLite checkpoints

### Removed
- Deprecated services (merged, ~750 lines reduction)
- Redundant hooks (~300 lines)
```
## Key Recommendations (Production Requirements)

### 1. **Phase 0: Architecture Analysis (CRITICAL - Do First)**
Before edits, analyze:

```bash
# Inventory existing
node scripts/analyze-current-state.js  # If exists, or manual review

# Document:
# - Line counts for files to modify
# - Import usage
# - AsyncStorage keys
# - DB queries
# - GPS/sensor points
```

### 2. **Mobile-Specific Implementation Requirements**

**Background Processing Constraints:**
```typescript
// Enhance existing in ActivityRecorderService
private static setupBackgroundLocationTask(): void {
  // PRESERVE: Maintain TaskManager for iOS/Android
  TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
    // Existing structure
  })
}
```

**Platform Permission Differences:**
```typescript
// Enhance existing request in service
const requestPermissions = async () => {
  if (Platform.OS === 'ios') {
    // Preserve iOS logic
  } else {
    // Preserve Android logic
  }
}
```

### 3. **Data Loss Prevention (MANDATORY)**

**Pre-Migration Backup:**
```typescript
// Add to existing service
const backupCurrentData = async () => {
  const keys = ['active_recording_session', 'activity_recovery_data']
  const backup = {}
  for (const key of keys) {
    backup[key] = await AsyncStorage.getItem(key)
  }
  await AsyncStorage.setItem('pre_migration_backup', JSON.stringify(backup))
}
```

**Rollback Strategy:**
```typescript
// Add rollback helper
const rollbackMigration = async () => {
  const backup = await AsyncStorage.getItem('pre_migration_backup')
  if (backup) {
    const data = JSON.parse(backup)
    for (const [key, value] of Object.entries(data)) {
      if (value) await AsyncStorage.setItem(key, value)
    }
  }
}
```

### 4. **Performance Validation Requirements**

**Baseline Measurements:**
```bash
npx react-native-performance-monitor --duration=300 --activity=recording
# Maintain: GPS <5s, UI <100ms, memory <50MB/hr, battery <10%/hr
```

**Enhance Monitoring:**
```typescript
// Add to ActivityRecorderService
private static performanceMetrics = { gpsLockTime: 0, uiResponseTimes: [] }

private static trackPerformance(operation: string, duration: number) {
  console.log(`📊 ${operation}: ${duration}ms`)
}
```

### 5. **Testing Strategy (Production Readiness)**

**Critical Test Scenarios (Enhance Existing):**
```typescript
describe('Activity Recording - Critical Paths', () => {
  it('survives app backgrounding', async () => {
    // Test continuity
  })
  it('recovers from termination', async () => {
    // Verify prompt
  })
  it('handles GPS loss', async () => {
    // Fallback
  })
  it('manages storage full', async () => {
    // Degradation
  })
  it('works offline', async () => {
    // Offline recording
  })
})
```

### 6. **Deployment Safety (Production Checklist)**

**Feature Flag (Add to Existing Config):**
```typescript
// In apps/mobile/src/config or service
const useConsolidatedRecording = () => {
  const isEnabled = FeatureFlags.get('consolidated-recording-service')
  if (isEnabled) {
    // Use enhanced methods
  } else {
    // Fallback to legacy sections (temporarily keep)
  }
}
```

**Gradual Rollout Plan:**
```bash
# Week 1: Internal (flag off)
# Week 2: 10% (flag 0.1)
# Week 3: 50% (flag 0.5)
# Week 4: 100% (flag 1.0)
# Week 5: Cleanup legacy
```

**Monitoring:**
```typescript
// Add to service
private static logCriticalEvent(event: string, data: any) {
  Analytics.track('activity_recording_event', { event, data })
  if (event === 'recovery_failed') {
    CrashReporting.recordError(new Error(`Critical: ${event}`), data)
  }
}
```

## Migration Checklist

**Phase 0: Pre-Migration (CRITICAL)**
- [ ] Backup AsyncStorage (`active_recording_session`, recovery keys)
- [ ] Establish baselines (GPS, memory)
- [ ] Document integration points
- [ ] Map AsyncStorage/DB usage
- [ ] Identify importing components

**Phase 1: Foundation**
- [ ] Enhance `ActivityRecorderService` with merged recovery/checkpoints
- [ ] Add recovery fields to schema
- [ ] Consolidate permissions in service
- [ ] Preserve GPS/background logic

**Phase 2: Core Implementation**
- [ ] Merge sensor integrations
- [ ] Add modal locking to `index.tsx`
- [ ] Enhance live metrics in service/UI
- [ ] Merge activity selection into hook/modal
- [ ] Enhance completion/storage

**Phase 3: UI Consolidation**
- [ ] Simplify `useEnhancedActivityRecording` hook
- [ ] Update recording screen/modal with existing components
- [ ] Integrate permissions/BLE into modal

**Phase 4: Migration & Cleanup**
- [ ] Update imports (codemod if possible)
- [ ] Remove legacy services/hooks
- [ ] Update indices/exports
- [ ] Run tests, validate performance
