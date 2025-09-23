# Technical Implementation Plan: Activity Recording Consolidation

## Executive Summary

This document outlines the technical implementation for consolidating TurboFit's mobile app activity recording system. The goal is to create a unified `ActivityRecordingService` that manages the complete activity lifecycle while streamlining UI components and hooks. This will reduce codebase complexity by ~40-50% (from current 1,200+ lines across multiple services to ~800 lines in consolidated service) and establish a single source of truth for all recording operations.

## Current State Analysis

### Existing Architecture Assessment

**Current Service Layer (To Be Consolidated):**
- `ActivityRecorderService` (650 lines) - Primary recording logic with GPS, sensors, recovery
- `ActivityService` (thin orchestrator) - Basic CRUD operations
- `ActivitySaveService` - Activity persistence logic
- `ActivityCompletionService` - Post-recording processing
- `ActivitySyncService` - Background sync operations
- `LocalActivityDatabaseService` - Database operations

**Current Hook Layer (To Be Simplified):**
- `useEnhancedActivityRecording` (550 lines) - Complex hook with recovery, checkpointing, error handling
- `useActivityManager` - Activity lifecycle management
- `useAdvancedBluetooth` - BLE device management
- `useRecordSelection` - Activity type selection logic

**Current UI Components (To Be Preserved/Referenced):**
- `MetricsGrid.tsx` - Unified metrics display (KEEP for reference)
- `RecordingControls.tsx` - Pause/Resume/Stop buttons (KEEP for reference) 
- `RecordingHeader.tsx` - Activity status display
- `RecordingBodySection.tsx` - Main recording interface
- `ActivityRecordingErrorBoundary.tsx` - Error handling wrapper

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
- 5+ service files with overlapping responsibilities
- AsyncStorage checkpoints scattered across multiple files
- GPS error handling duplicated between service and hook
- Sensor data buffering logic in both service and hook layers
- Recovery mechanisms split between `ActivityRecorderService` and `useEnhancedActivityRecording`

## Architecture Overview

### Consolidation Strategy

**Ground Truth Service:** The new `ActivityRecordingService` will become the single source of truth by consolidating ALL recording logic from existing services while preserving robust recovery mechanisms.

```typescript
// apps/mobile/src/lib/services/activity-recording-service.ts
class ActivityRecordingService {
  // ===== CONSOLIDATED STATE MANAGEMENT =====
  private static currentSession: RecordingSession | null = null
  private static state: RecordingState = 'idle' // idle | selecting | recording | paused | finished
  private static locationSubscription: Location.LocationSubscription | null = null
  private static recordingTimer: NodeJS.Timeout | null = null
  
  // ===== PRESERVED ROBUST FEATURES FROM ActivityRecorderService =====
  private static sensorDataBuffer: SensorDataPoint[] = []
  private static gpsDataBuffer: GpsDataPoint[] = []
  private static totalTimerTime: number = 0 // Active recording time (excludes pauses)
  private static lastResumeTime: Date | null = null
  
  // ===== PRESERVED RECOVERY LOGIC FROM useEnhancedActivityRecording =====
  private static recoveryData: RecoveryData = {
    lastSavedTimestamp: 0,
    checkpoints: [],
    errorLog: [],
    connectionAttempts: 0
  }
  private static checkpointInterval: NodeJS.Timeout | null = null
  
  // ===== CONSOLIDATED LIFECYCLE METHODS =====
  static async startActivity(type: ActivityType, plannedId?: string): Promise<string | null>
  static async pauseActivity(): Promise<boolean>
  static async resumeActivity(): Promise<boolean>
  static async finishActivity(): Promise<ActivityResult>
  static async discardActivity(): Promise<void>
  
  // ===== CONSOLIDATED DATA MANAGEMENT =====
  private static async recordSensorData(data: SensorDataPoint): Promise<void>
  private static async generateActivityJSON(): Promise<ActivityJSON>
  private static async saveToLocalDB(json: ActivityJSON): Promise<string>
  private static async queueForSync(activityId: string): Promise<void>
  
  // ===== PRESERVED GPS & SENSOR LOGIC =====
  private static async startLocationTracking(): Promise<void>
  private static async stopLocationTracking(): Promise<void>
  private static async connectBluetooth(deviceId: string): Promise<boolean>
  
  // ===== PRESERVED RECOVERY MECHANISMS =====
  private static async createCheckpoint(): Promise<void>
  private static async recoverFromInterruption(): Promise<boolean>
  private static async saveSessionToStorage(): Promise<void>
  private static async clearRecoveryData(): Promise<void>
  
  // ===== CONSOLIDATED METRICS CALCULATION =====
  private static updateLiveMetrics(dataPoint: SensorDataPoint): void
  private static calculateFinalMetrics(): ActivityMetrics
}
```

### Feature Preservation Matrix

| Current Feature | Source File | Status | New Location | Implementation Notes |
|----------------|-------------|--------|-------------|---------------------|
| GPS timeout handling | ActivityRecorderService | **PRESERVE** | ActivityRecordingService.startLocationTracking() | Critical for reliability - maintain 15s timeout |
| Background location tracking | ActivityRecorderService | **PRESERVE** | ActivityRecordingService.setupBackgroundTask() | Required for mobile - use TaskManager |
| Checkpoint system | useEnhancedActivityRecording | **PRESERVE** | ActivityRecordingService.createCheckpoint() | Essential for recovery - 30s intervals |
| Error logging | useEnhancedActivityRecording | **PRESERVE** | ActivityRecordingService.logError() | Production necessity - max 50 entries |
| Sensor data buffering | ActivityRecorderService | **PRESERVE** | ActivityRecordingService.sensorDataBuffer | Prevent data loss - flush every 10 entries |
| Recovery from interruption | Both files | **CONSOLIDATE** | ActivityRecordingService.recoverFromInterruption() | Merge both approaches |
| AsyncStorage checkpoints | useEnhancedActivityRecording | **PRESERVE** | ActivityRecordingService.saveSessionToStorage() | Critical for crash recovery |
| Live metrics calculation | ActivityRecorderService | **PRESERVE** | ActivityRecordingService.updateLiveMetrics() | Real-time UI updates |
| Distance calculation | ActivityRecorderService | **PRESERVE** | ActivityRecordingService.calculateDistance() | Haversine formula |
| Timer duration tracking | ActivityRecorderService | **PRESERVE** | ActivityRecordingService timing logic | Separate elapsed vs active time |

### State Machine

```
idle → selecting → recording → paused → finished
                      ↓          ↓         ↓
                  discarded  discarded  summary → idle
```

## Detailed Recovery & Checkpoint Logic Preservation

### Current Recovery Mechanisms Analysis

**From `ActivityRecorderService` (Ground Truth Approach):**
```typescript
// Current checkpoint approach - save to AsyncStorage every interval
private static async saveSessionToStorage(): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_RECORDING_KEY, JSON.stringify(this.currentSession))
}

// Recovery on app restart
private static async recoverFromInterruption(): Promise<void> {
  const sessionData = await AsyncStorage.getItem(ACTIVE_RECORDING_KEY)
  if (sessionData) {
    this.currentSession = JSON.parse(sessionData)
    // Show user dialog to continue or discard
  }
}
```

**From `useEnhancedActivityRecording` (Enhanced Approach):**
```typescript
// More sophisticated checkpoint system with metadata
interface ActivityCheckpoint {
  timestamp: number
  metrics: ActivityMetrics
  locationCount: number
  sensorDataCount: number
}

// Enhanced error logging
interface ErrorLogEntry {
  timestamp: number
  error: string
  context: string
  recovered: boolean
}
```

### Consolidated Recovery Strategy

The new `ActivityRecordingService` will merge both approaches:

```typescript
class ActivityRecordingService {
  // Enhanced recovery data structure (from useEnhancedActivityRecording)
  private static recoveryData: RecoveryData = {
    lastSavedTimestamp: 0,
    checkpoints: [], // Keep last 10 checkpoints
    errorLog: [], // Keep last 50 errors
    connectionAttempts: 0
  }
  
  // Preserve robust checkpoint creation (merge both approaches)
  private static async createCheckpoint(): Promise<void> {
    const checkpoint = {
      timestamp: Date.now(),
      sessionData: { ...this.currentSession }, // Full session backup
      metrics: this.currentSession.liveMetrics,
      locationCount: this.currentSession.recordMessages.filter(r => r.positionLat).length,
      sensorDataCount: this.sensorDataBuffer.length,
      gpsDataCount: this.gpsDataBuffer.length
    }
    
    this.recoveryData.checkpoints.push(checkpoint)
    this.recoveryData.lastSavedTimestamp = checkpoint.timestamp
    
    // Save both to AsyncStorage (immediate) and SQLite (persistent)
    await Promise.all([
      AsyncStorage.setItem(ACTIVE_RECORDING_KEY, JSON.stringify(checkpoint)),
      this.saveRecoveryToDatabase(checkpoint)
    ])
  }
  
  // Enhanced recovery with multiple fallback levels
  private static async recoverFromInterruption(): Promise<boolean> {
    try {
      // Level 1: AsyncStorage (fastest)
      const asyncData = await AsyncStorage.getItem(ACTIVE_RECORDING_KEY)
      if (asyncData) {
        return this.restoreFromCheckpoint(JSON.parse(asyncData))
      }
      
      // Level 2: SQLite recovery table (more persistent)
      const dbRecovery = await this.getLatestRecoveryFromDatabase()
      if (dbRecovery) {
        return this.restoreFromCheckpoint(dbRecovery)
      }
      
      return false
    } catch (error) {
      this.logError(`Recovery failed: ${error}`, 'recovery')
      return false
    }
  }
}
```

### Database Schema Updates

Add recovery table to existing schema:

```typescript
// Add to apps/mobile/src/lib/db/schemas/activities.ts
export const activityRecovery = sqliteTable("activity_recovery", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  checkpointData: text("checkpoint_data").notNull(), // JSON stringified
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
```

## Concrete File Operations

### Files to DELETE (After Migration Complete)

**Service Layer Consolidation:**
```bash
# Remove these files - logic moved to ActivityRecordingService
rm apps/mobile/src/lib/services/activity-recorder.ts           # 650 lines
rm apps/mobile/src/lib/services/activity-service.ts            # ~100 lines  
rm apps/mobile/src/lib/services/activity-save.ts               # ~150 lines
rm apps/mobile/src/lib/services/activity-completion-service.ts # ~200 lines
rm apps/mobile/src/lib/services/local-activity-database.ts     # ~300 lines

# Total removed: ~1,400 lines
```

**Hook Layer Simplification:**
```bash
# Remove these hooks - logic moved to ActivityRecordingService
rm apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts    # 550 lines
rm apps/mobile/src/lib/hooks/useActivityManager.ts              # ~200 lines
rm apps/mobile/src/lib/hooks/useRecordSelection.ts              # ~100 lines

# Total removed: ~850 lines
```

**UI Component Cleanup:**
```bash
# Remove old stepper components (replaced by unified flow)
rm apps/mobile/src/app/modals/record/old_components/ActivityModeStep.tsx
rm apps/mobile/src/app/modals/record/old_components/BluetoothStep.tsx
rm apps/mobile/src/app/modals/record/old_components/PermissionsStep.tsx
rm apps/mobile/src/app/modals/record/old_components/PlannedActivityStep.tsx
rm apps/mobile/src/app/modals/record/old_components/ReadyStep.tsx

# Remove duplicate error boundary (if global exists)
rm apps/mobile/src/components/activity/ActivityRecordingErrorBoundary.tsx
```

### Files to CREATE

**Core Service:**
```bash
# New consolidated service (estimated ~800 lines)
touch apps/mobile/src/lib/services/activity-recording-service.ts
```

**Simplified Hooks:**
```bash
# Thin wrapper hooks for React integration
touch apps/mobile/src/lib/hooks/useRecording.ts                 # ~100 lines
touch apps/mobile/src/lib/hooks/usePermissions.ts               # ~150 lines  
touch apps/mobile/src/lib/hooks/useBluetooth.ts                 # ~200 lines
touch apps/mobile/src/lib/hooks/useActivitySync.ts              # ~100 lines

# Total new: ~550 lines
```

**Updated UI Components:**
```bash
# Record modal system (in apps/mobile/src/app/modals/record/)
# Replace existing index.tsx and add new modal components
apps/mobile/src/app/modals/record/index.tsx                     # ~400 lines (main recording interface)
apps/mobile/src/app/modals/record/activity_selection.tsx        # ~300 lines (activity type selection)
apps/mobile/src/app/modals/record/bluetooth.tsx                 # ~250 lines (BLE device management)
apps/mobile/src/app/modals/record/permissions.tsx               # ~200 lines (location permissions)

# Additional supporting components
touch apps/mobile/src/components/modals/ActivitySummaryModal.tsx # ~300 lines
touch apps/mobile/src/app/(internal)/recording.tsx              # ~400 lines (backup screen)

# Total new: ~1,850 lines
```

### Files to MODIFY

**Database Schema Updates:**
```bash
# Add recovery table and update exports
# File: apps/mobile/src/lib/db/schemas/activities.ts
# Changes: +50 lines (recovery table + relations)
```

**Service Index Updates:**
```bash
# File: apps/mobile/src/lib/services/index.ts  
# Remove old exports, add new ActivityRecordingService export
# Changes: -5 old exports, +1 new export
```

**Hook Index Updates:**
```bash  
# File: apps/mobile/src/lib/hooks/index.ts (if exists)
# Remove old hook exports, add new simplified hook exports
# Changes: -3 old exports, +4 new exports
```

**Route Updates:**
```bash
# File: apps/mobile/src/app/(internal)/(tabs)/record.tsx
# Currently just redirects to modal - update to show recording screen
# Changes: Replace 10-line placeholder with 50+ line recording interface
```

### Migration Impact Analysis

**Before Migration:**
- Services: ~1,400 lines across 5 files
- Hooks: ~850 lines across 3 files  
- UI: ~800 lines across various components
- **Total: ~3,050 lines**

**After Migration:**
- Services: ~800 lines in 1 file
- Hooks: ~550 lines across 4 files
- UI: ~1,350 lines (consolidated + new)
- **Total: ~2,700 lines**

**Net Reduction: ~200 lines (6.5%)**
*Note: Initial 40-50% reduction claim was overestimated - actual reduction is ~7% with significantly improved maintainability and consolidated logic*

## Record Modal System Specifications

Based on the existing modal structure in `apps/mobile/src/app/modals/record/`, here are the detailed specifications for each modal component:

### **1. Index Modal (`index.tsx`) - Main Recording Interface**

**Purpose**: Primary recording control interface that's reactive to `ActivityRecordingService` state

```typescript
// apps/mobile/src/app/modals/record/index.tsx
export default function RecordIndexModal() {
  const { 
    state, 
    currentActivity, 
    metrics, 
    permissions, 
    bluetoothDevices,
    canDismissModal 
  } = useRecording()
  
  // Prevent modal dismissal during active recording
  const router = useRouter()
  const handleClose = () => {
    if (canDismissModal) {
      router.back()
    } else {
      Alert.alert("Recording in Progress", "Please stop recording before closing")
    }
  }

  return (
    <Modal dismissable={canDismissModal} onRequestClose={handleClose}>
      {/* HEADER SECTION - Status & Quick Info */}
      <View className="bg-background border-b border-border px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Button size="icon" onPress={handleClose} disabled={!canDismissModal}>
            <ChevronDown size={24} />
          </Button>
          
          <View className="flex-1 items-center">
            <Text className="font-semibold">
              {currentActivity?.name || "Outdoor Run"} {/* Default display */}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {getStateDisplay(state)}
            </Text>
          </View>
          
          <View className="w-10" /> {/* Spacer for centering */}
        </View>
      </View>

      {/* MAIN CONTENT - State-dependent content */}
      <View className="flex-1">
        {state === 'idle' && <IdleStateContent />}
        {state === 'recording' && <RecordingStateContent metrics={metrics} />}
        {state === 'paused' && <PausedStateContent metrics={metrics} />}
      </View>

      {/* ICON BAR - Quick Access to Sub-modals */}
      <View className="bg-muted/50 px-4 py-3 border-t border-border">
        <View className="flex-row justify-center gap-8">
          <TouchableOpacity 
            onPress={() => router.push('/modals/record/activity_selection')}
            className="items-center"
          >
            <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
              <Activity size={20} className="text-foreground" />
            </View>
            <Text className="text-xs mt-1">Activity</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/modals/record/bluetooth')}
            className="items-center"
          >
            <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
              <Bluetooth size={20} className={bluetoothDevices.length > 0 ? "text-blue-500" : "text-muted-foreground"} />
            </View>
            <Text className="text-xs mt-1">Devices</Text>
            {bluetoothDevices.length > 0 && (
              <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full items-center justify-center">
                <Text className="text-white text-xs">{bluetoothDevices.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/modals/record/permissions')}
            className="items-center"
          >
            <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
              <MapPin size={20} className={permissions.location ? "text-green-500" : "text-orange-500"} />
            </View>
            <Text className="text-xs mt-1">GPS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FOOTER CONTROLS - Recording Actions */}
      <View className="bg-background border-t border-border px-4 py-4">
        <RecordingControls 
          state={state}
          onStart={() => ActivityRecordingService.startActivity(currentActivity?.type || 'outdoor_run')}
          onPause={() => ActivityRecordingService.pauseActivity()}
          onResume={() => ActivityRecordingService.resumeActivity()}
          onStop={() => ActivityRecordingService.finishActivity()}
          onDiscard={() => ActivityRecordingService.discardActivity()}
        />
      </View>
    </Modal>
  )
}

// State-dependent content components
const IdleStateContent = () => (
  <View className="flex-1 items-center justify-center px-6">
    <Text className="text-2xl font-bold mb-2">Ready to Start</Text>
    <Text className="text-muted-foreground text-center mb-8">
      Configure your activity and devices, then press start to begin recording
    </Text>
    <View className="w-32 h-32 bg-muted rounded-full items-center justify-center">
      <Activity size={48} className="text-muted-foreground" />
    </View>
  </View>
)

const RecordingStateContent = ({ metrics }) => (
  <View className="flex-1 px-4 py-6">
    <MetricsGrid metrics={metrics} />
    {/* Add map view or other recording-specific UI */}
  </View>
)
```

### **2. Activity Selection Modal (`activity_selection.tsx`)**

**Purpose**: Allows users to switch between planned/unplanned activities and select activity type

```typescript
// apps/mobile/src/app/modals/record/activity_selection.tsx
export default function ActivitySelectionModal() {
  const { currentActivity, setActivity } = useRecording()
  const [mode, setMode] = useState<'planned' | 'unplanned'>('unplanned')
  const [selectedType, setSelectedType] = useState<PublicActivityType>('outdoor_run')
  const router = useRouter()

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" onPress={() => router.back()}>
          <ChevronLeft size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">Select Activity</Text>
        <View className="w-10" />
      </View>

      {/* Mode Selection Tabs */}
      <View className="px-4 py-3 bg-muted/50">
        <View className="flex-row bg-background rounded-lg p-1">
          <TouchableOpacity
            onPress={() => setMode('unplanned')}
            className={`flex-1 py-2 rounded-md items-center ${mode === 'unplanned' ? 'bg-primary' : ''}`}
          >
            <Text className={mode === 'unplanned' ? 'text-primary-foreground' : 'text-muted-foreground'}>
              Quick Start
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('planned')}
            className={`flex-1 py-2 rounded-md items-center ${mode === 'planned' ? 'bg-primary' : ''}`}
          >
            <Text className={mode === 'planned' ? 'text-primary-foreground' : 'text-muted-foreground'}>
              Planned Workout
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <ScrollView className="flex-1 px-4">
        {mode === 'unplanned' ? (
          <UnplannedActivitySelection 
            selectedType={selectedType}
            onSelectType={setSelectedType}
          />
        ) : (
          <PlannedActivitySelection 
            onSelectPlanned={(id, type) => {
              setActivity({ id, type, mode: 'planned' })
              router.back()
            }}
          />
        )}
      </ScrollView>

      {/* Footer Actions (for unplanned mode) */}
      {mode === 'unplanned' && (
        <View className="border-t border-border p-4">
          <Button 
            onPress={() => {
              setActivity({ type: selectedType, mode: 'unplanned' })
              router.back()
            }}
            className="w-full"
          >
            <Text className="font-semibold">Select {ACTIVITY_NAMES[selectedType]}</Text>
          </Button>
        </View>
      )}
    </View>
  )
}

// Activity type grid component
const UnplannedActivitySelection = ({ selectedType, onSelectType }) => (
  <View className="py-4">
    <Text className="text-muted-foreground mb-4">Choose your activity type</Text>
    <View className="gap-3">
      {Object.entries(ACTIVITY_NAMES).map(([type, name]) => (
        <TouchableOpacity
          key={type}
          onPress={() => onSelectType(type)}
          className={`p-4 rounded-lg border ${selectedType === type ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-semibold mb-1">{name}</Text>
              <View className="flex-row gap-2">
                {ACTIVITY_BADGES[type].gps && (
                  <View className="px-2 py-1 bg-blue-500/10 rounded-full">
                    <Text className="text-xs text-blue-600">GPS</Text>
                  </View>
                )}
                {ACTIVITY_BADGES[type].bt && (
                  <View className="px-2 py-1 bg-purple-500/10 rounded-full">
                    <Text className="text-xs text-purple-600">Sensors</Text>
                  </View>
                )}
              </View>
            </View>
            {selectedType === type && (
              <CheckCircle size={20} className="text-primary" />
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  </View>
)
```

### **3. Bluetooth Modal (`bluetooth.tsx`)**

**Purpose**: BLE device scanning, pairing, and management interface

```typescript
// apps/mobile/src/app/modals/record/bluetooth.tsx
export default function BluetoothModal() {
  const { bluetoothDevices, bluetoothStatus } = useRecording()
  const { 
    availableDevices, 
    isScanning, 
    connectDevice, 
    disconnectDevice,
    startScan,
    stopScan 
  } = useBluetooth()
  const router = useRouter()

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" onPress={() => router.back()}>
          <ChevronLeft size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">Bluetooth Devices</Text>
        <Button 
          size="icon" 
          onPress={isScanning ? stopScan : startScan}
          className={isScanning ? 'animate-pulse' : ''}
        >
          <Search size={20} />
        </Button>
      </View>

      <ScrollView className="flex-1">
        {/* Connected Devices Section */}
        {bluetoothDevices.length > 0 && (
          <View className="px-4 py-4">
            <Text className="text-lg font-semibold mb-3">Connected Devices</Text>
            {bluetoothDevices.map(device => (
              <Card key={device.id} className="mb-3 border-green-500/20 bg-green-500/5">
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold">{device.name}</Text>
                      <Text className="text-sm text-muted-foreground">{device.type}</Text>
                      {device.lastReading && (
                        <Text className="text-xs text-green-600 mt-1">
                          Last: {device.lastReading}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row gap-2">
                      <View className="w-3 h-3 bg-green-500 rounded-full" />
                      <Button 
                        size="sm" 
                        variant="outline"
                        onPress={() => disconnectDevice(device.id)}
                      >
                        <Text>Disconnect</Text>
                      </Button>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}

        {/* Available Devices Section */}
        <View className="px-4 py-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-semibold">Available Devices</Text>
            {isScanning && (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-muted-foreground">Scanning...</Text>
              </View>
            )}
          </View>

          {availableDevices.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="p-8 items-center">
                <Bluetooth size={48} className="text-muted-foreground mb-4" />
                <Text className="text-center text-muted-foreground mb-2">
                  {isScanning ? 'Looking for devices...' : 'No devices found'}
                </Text>
                <Text className="text-center text-sm text-muted-foreground mb-4">
                  Make sure your devices are in pairing mode
                </Text>
                <Button onPress={startScan} disabled={isScanning}>
                  <Text>{isScanning ? 'Scanning...' : 'Start Scan'}</Text>
                </Button>
              </CardContent>
            </Card>
          ) : (
            availableDevices.map(device => (
              <Card key={device.id} className="mb-3">
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold">{device.name || 'Unknown Device'}</Text>
                      <Text className="text-sm text-muted-foreground">{device.type}</Text>
                      <Text className="text-xs text-muted-foreground">
                        Signal: {device.rssi}dBm
                      </Text>
                    </View>
                    <Button 
                      size="sm"
                      onPress={() => connectDevice(device)}
                      disabled={device.isConnecting}
                    >
                      <Text>{device.isConnecting ? 'Connecting...' : 'Connect'}</Text>
                    </Button>
                  </View>
                </CardContent>
              </Card>
            ))
          )}
        </View>

        {/* Device Types Guide */}
        <View className="px-4 py-4 bg-muted/50">
          <Text className="text-sm font-medium mb-2">Supported Device Types</Text>
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">• Heart Rate Monitors</Text>
            <Text className="text-xs text-muted-foreground">• Power Meters</Text>
            <Text className="text-xs text-muted-foreground">• Cadence Sensors</Text>
            <Text className="text-xs text-muted-foreground">• Speed/Distance Pods</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
```

### **4. Permissions Modal (`permissions.tsx`)**

**Purpose**: Location permission status and management interface

```typescript
// apps/mobile/src/app/modals/record/permissions.tsx
export default function PermissionsModal() {
  const { permissions, requestPermissions } = usePermissions()
  const router = useRouter()

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" onPress={() => router.back()}>
          <ChevronLeft size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">Location Permissions</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        {/* Permission Status Cards */}
        <Card className={`mb-4 ${permissions.location ? 'border-green-500/20 bg-green-500/5' : 'border-orange-500/20 bg-orange-500/5'}`}>
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <MapPin size={24} className={permissions.location ? 'text-green-500' : 'text-orange-500'} />
                <View>
                  <Text className="font-semibold">Location Access</Text>
                  <Text className="text-sm text-muted-foreground">For GPS tracking and route mapping</Text>
                </View>
              </View>
              <View className={`px-3 py-1 rounded-full ${permissions.location ? 'bg-green-500' : 'bg-orange-500'}`}>
                <Text className="text-white text-xs font-medium">
                  {permissions.location ? 'Granted' : 'Required'}
                </Text>
              </View>
            </View>
            
            {!permissions.location && (
              <Button 
                onPress={() => requestPermissions(['location'])}
                className="w-full"
              >
                <Text className="font-semibold">Grant Location Permission</Text>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={`mb-4 ${permissions.backgroundLocation ? 'border-green-500/20 bg-green-500/5' : 'border-orange-500/20 bg-orange-500/5'}`}>
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Navigation size={24} className={permissions.backgroundLocation ? 'text-green-500' : 'text-orange-500'} />
                <View>
                  <Text className="font-semibold">Background Location</Text>
                  <Text className="text-sm text-muted-foreground">Continue tracking when app is backgrounded</Text>
                </View>
              </View>
              <View className={`px-3 py-1 rounded-full ${permissions.backgroundLocation ? 'bg-green-500' : 'bg-orange-500'}`}>
                <Text className="text-white text-xs font-medium">
                  {permissions.backgroundLocation ? 'Granted' : 'Needed'}
                </Text>
              </View>
            </View>
            
            {permissions.location && !permissions.backgroundLocation && (
              <Button 
                onPress={() => requestPermissions(['backgroundLocation'])}
                className="w-full"
                variant="outline"
              >
                <Text className="font-semibold">Enable Background Tracking</Text>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Permission Guide */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <View className="flex-row items-start gap-3">
              <Info size={20} className="text-blue-500 mt-0.5" />
              <View className="flex-1">
                <Text className="font-semibold text-blue-700 mb-2">Why These Permissions?</Text>
                <View className="gap-2">
                  <Text className="text-sm text-blue-600">
                    • <Text className="font-medium">Location:</Text> Essential for GPS tracking, distance, and speed measurements
                  </Text>
                  <Text className="text-sm text-blue-600">
                    • <Text className="font-medium">Background:</Text> Keeps recording active when you switch apps or lock your phone
                  </Text>
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Device Settings Link */}
        {Platform.OS === 'ios' && (
          <Button 
            onPress={() => Linking.openSettings()}
            variant="outline"
            className="mt-4"
          >
            <Settings size={16} />
            <Text className="ml-2">Open Device Settings</Text>
          </Button>
        )}
      </ScrollView>

      {/* Footer Status */}
      <View className="border-t border-border p-4 bg-muted/50">
        <View className="flex-row items-center justify-center gap-2">
          {permissions.location && permissions.backgroundLocation ? (
            <>
              <CheckCircle size={16} className="text-green-500" />
              <Text className="text-sm text-green-600 font-medium">All permissions ready</Text>
            </>
          ) : (
            <>
              <AlertCircle size={16} className="text-orange-500" />
              <Text className="text-sm text-orange-600 font-medium">
                {permissions.location ? 'Background permission recommended' : 'Location permission required'}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  )
}
```

### **Updated Modal Layout Configuration**

```typescript
// apps/mobile/src/app/modals/record/_layout.tsx
export default function RecordLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}> {/* Hide headers - modals handle their own */}
      <Stack.Screen 
        name="index" 
        options={{ 
          presentation: "fullScreenModal",
          gestureEnabled: false, // Prevent swipe dismissal during recording
        }} 
      />
      <Stack.Screen
        name="activity_selection"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="bluetooth"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="permissions"
        options={{ presentation: "modal" }}
      />
    </Stack>
  );
}
```

This modal system integrates directly with the `ActivityRecordingService` and provides a cohesive recording experience where:

1. **Index modal** serves as the main hub, preventing dismissal during active recording
2. **Activity selection** allows switching between planned/unplanned activities
3. **Bluetooth modal** provides comprehensive device management
4. **Permissions modal** clearly shows location permission status and provides easy access to grant them

All modals are reactive to the service state and provide immediate feedback to users about the recording system status.

## Implementation Sequence

### Step 1: Create Core Service Foundation

**Objective**: Establish central service and modal behavior constraints

Begin by creating the `ActivityRecordingService` with basic state management. This service will own all recording logic and state transitions.

```typescript
// Recording context to control modal dismissal
const RecordingContext = createContext({
  isRecording: false,
  canDismissModal: true,
  activityState: 'idle'
})
```

Wire up the Record Modal with controlled dismissal behavior to prevent users from accidentally leaving during an active recording:

```typescript
// RecordModal.tsx
const { canDismissModal } = useRecording()

return (
  <Modal
    presentationStyle="fullScreen"
    onRequestClose={() => canDismissModal && onClose()}
  >
```

**Key Files to Create:**
- `activity-recording-service.ts` (skeleton with state management)
- `useRecording` hook for state access
- Updated `RecordModal.tsx` with lock behavior

### Step 2: Implement Permissions and Sensor Integration

**Objective**: Create unified permission handling and connect GPS/Bluetooth sensors

Create a centralized permissions flow that handles all permission requests in one place:

```typescript
// usePermissions.ts
export const usePermissions = () => {
  const checkAll = async () => {
    const location = await Location.getForegroundPermissionsAsync()
    const bluetooth = await ExpoDevice.isBluetoothAvailableAsync()
    return { location, bluetooth }
  }

  const requestAll = async () => {
    // Request all needed permissions
  }
}
```

Integrate Expo Location and BLE modules into the service:

```typescript
// Service methods
private async startLocationTracking() {
  await Location.requestForegroundPermissionsAsync()
  this.locationSubscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation },
    (location) => this.updateMetrics(location)
  )
}

private async connectBluetooth(deviceId: string) {
  // BLE connection logic
  this.bleSubscription = device.onValueChange((data) => {
    this.updateHeartRate(data)
  })
}
```

**Key Components to Build:**
- `PermissionsModal.tsx` - Unified permission request UI
- `BluetoothModal.tsx` - Device scanning and connection
- `usePermissions.ts` - Permission state management
- `useBluetooth.ts` - BLE device handling

### Step 3: Build Live Metrics Display

**Objective**: Create real-time metrics UI components

Consolidate all metric display logic into unified components that receive data from the recording service:

```typescript
// MetricsGrid.tsx
const MetricsGrid = () => {
  const { metrics } = useRecording()

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

**Components to Create:**
- `MetricsGrid.tsx` - Unified metrics display container
- `LiveMetricCard.tsx` - Individual metric rendering
- `RecordingControls.tsx` - Pause/Resume/Stop buttons
- `RecordingHeader.tsx` - Activity type and status display

### Step 4: Implement Activity Selection Flow

**Objective**: Handle planned vs unplanned activity selection

Build the selection UI that determines activity type and whether it's planned:

```typescript
// ActivitySelector.tsx
const ActivitySelector = () => {
  const { selectActivity } = useRecording()
  const [mode, setMode] = useState<'planned' | 'unplanned'>('unplanned')
  const [activityType, setActivityType] = useState<ActivityType>('run')

  const handleStart = () => {
    if (mode === 'planned') {
      // Fetch planned workout details
      selectActivity(activityType, plannedWorkoutId)
    } else {
      selectActivity(activityType)
    }
  }
}
```

Create the planned workout overlay that guides users through structured workouts:

```typescript
// PlannedWorkoutOverlay.tsx
const PlannedWorkoutOverlay = ({ workout }) => {
  const { currentSegment, nextSegment } = useWorkoutProgress(workout)

  return (
    <Overlay>
      <CurrentSegment {...currentSegment} />
      <NextSegmentPreview {...nextSegment} />
      <ProgressBar segments={workout.segments} />
    </Overlay>
  )
}
```

**Components to Build:**
- `ActivitySelector.tsx` - Initial activity configuration
- `PlannedWorkoutOverlay.tsx` - Structured workout guidance
- `WorkoutSegmentDisplay.tsx` - Individual segment UI

### Step 5: Handle Activity Completion and Storage

**Objective**: Implement finish flow and local persistence

Create the activity completion logic that calculates final metrics and saves locally:

```typescript
finishActivity(): ActivityResult {
  // Stop all sensors
  this.stopSensors()

  // Calculate final metrics
  const result = this.calculateSummary()

  // Generate JSON
  const activityJSON = this.generateActivityJSON()

  // Save locally
  await this.saveToLocalDB(activityJSON)

  // Queue for sync
  this.queueForSync(activityJSON.id)

  return result
}
```

Setup Drizzle schema for local storage:

```typescript
// schema/activities.ts
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  json: text('json').notNull(),
  syncStatus: text('sync_status').default('pending'),
  createdAt: integer('created_at').notNull()
})

export const activityStreams = sqliteTable('activity_streams', {
  id: text('id').primaryKey(),
  activityId: text('activity_id').notNull(),
  type: text('type').notNull(), // 'gps', 'heartrate', etc.
  data: text('data').notNull(), // JSON array of points
  chunk: integer('chunk').notNull()
})
```

Build the Activity Summary Modal:

```typescript
// ActivitySummaryModal.tsx
const ActivitySummaryModal = ({ result, onClose }) => {
  const { syncStatus } = useActivitySync(result.id)

  return (
    <Modal>
      <SummaryMetrics {...result} />
      <SyncStatusIndicator status={syncStatus} />
      <Actions>
        <Button onPress={onClose}>Done</Button>
      </Actions>
    </Modal>
  )
}
```

**Key Implementations:**
- Activity completion logic in service
- Local database schema and operations
- `ActivitySummaryModal.tsx` with results display
- Stream chunking for large datasets

### Step 6: Implement Background Sync

**Objective**: Create robust sync mechanism with retry logic

Build the sync queue that handles background uploads:

```typescript
// Sync service integration
class SyncQueue {
  private async processQueue() {
    const pending = await db.select()
      .from(activities)
      .where(eq(activities.syncStatus, 'pending'))

    for (const activity of pending) {
      try {
        // Upload activity JSON to storage
        const jsonUrl = await this.uploadJSON(activity.json)

        // Sync metadata with API
        await trpc.activities.sync.mutate({
          ...activity,
          jsonUrl
        })

        // Update local status
        await db.update(activities)
          .set({ syncStatus: 'synced' })
          .where(eq(activities.id, activity.id))
      } catch (error) {
        // Handle retry logic
        await this.scheduleRetry(activity.id)
      }
    }
  }

  private scheduleRetry(activityId: string) {
    // Exponential backoff
  }
}
```

Add network state monitoring:

```typescript
// Network monitor
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    syncQueue.processQueue()
  }
})
```

**Components to Build:**
- `SyncQueue` class with retry logic
- Network state monitoring
- Conflict resolution UI
- Upload progress indicators

### Step 7: Consolidate Recording Screen

**Objective**: Unify all recording UI into single coherent screen

Combine all recording elements into the main recording screen:

```typescript
const RecordingScreen = () => {
  const {
    state,
    metrics,
    isPlanned,
    plannedWorkout,
    pauseActivity,
    resumeActivity,
    finishActivity,
    discardActivity
  } = useRecording()

  return (
    <Screen>
      <RecordingHeader />

      <MetricsGrid metrics={metrics} />

      {isPlanned && (
        <PlannedWorkoutOverlay workout={plannedWorkout} />
      )}

      <RecordingControls
        state={state}
        onPause={pauseActivity}
        onResume={resumeActivity}
        onFinish={finishActivity}
        onDiscard={discardActivity}
      />

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

**Final Screen Components:**
- Unified `RecordingScreen.tsx`
- `PausedOverlay.tsx` for paused state
- Responsive layout for different states

### Step 8: Remove Legacy Code and Update Imports

**Objective**: Clean up deprecated files and update all references

**CRITICAL: Data Migration Safety**
Before removing any files, ensure all active sessions are completed or migrated:

```typescript
// Migration helper script (run once before cleanup)
const migrateActiveSession = async () => {
  const activeSession = await AsyncStorage.getItem('active_recording_session')
  if (activeSession) {
    console.warn('⚠️ Active recording session detected - migration required')
    // Migrate to new format or prompt user to complete
  }
}
```

**Service Layer Cleanup:**
```bash
# Phase 1: Deprecate (add deprecation warnings)
# Add @deprecated tags to old services for 1 week
# Update imports to show warnings

# Phase 2: Remove (after confirming no active usage)
rm apps/mobile/src/lib/services/activity-recorder.ts           # Ground truth preserved in new service  
rm apps/mobile/src/lib/services/activity-save.ts               # Logic moved to ActivityRecordingService.saveToLocalDB()
rm apps/mobile/src/lib/services/activity-completion-service.ts # Logic moved to ActivityRecordingService.finishActivity()
rm apps/mobile/src/lib/services/activity-service.ts            # Orchestration removed - direct service usage
rm apps/mobile/src/lib/services/local-activity-database.ts     # Database ops integrated into main service
```

**Hook Layer Cleanup:**
```bash
rm apps/mobile/src/lib/hooks/useEnhancedActivityRecording.ts    # Recovery logic preserved in service
rm apps/mobile/src/lib/hooks/useActivityManager.ts              # Logic distributed to specific hooks  
rm apps/mobile/src/lib/hooks/useRecordSelection.ts              # Selection logic moved to ActivitySelector component
```

**Import Updates (Automated with codemod):**
```typescript
// Before (deprecated imports)
import { useEnhancedActivityRecording } from '@/lib/hooks/useEnhancedActivityRecording'
import { ActivityRecorderService } from '@/lib/services/activity-recorder'
import { ActivityService } from '@/lib/services/activity-service'

// After (consolidated imports)  
import { useRecording } from '@/lib/hooks/useRecording'
import { ActivityRecordingService } from '@/lib/services/activity-recording-service'
// ActivityService removed - direct ActivityRecordingService usage
```

**Index File Updates:**
```typescript
// apps/mobile/src/lib/services/index.ts
// Remove all old exports
// export { ActivityRecorderService } from "./activity-recorder"; // REMOVED
// export { ActivityService } from "./activity-service"; // REMOVED  
// export { ActivitySyncService } from "./activity-sync-service"; // KEPT
// export { LocalActivityDatabaseService } from "./local-activity-database"; // REMOVED

// Add new consolidated export
export { ActivityRecordingService } from "./activity-recording-service"; // NEW SINGLE SOURCE OF TRUTH
export { ActivitySyncService } from "./activity-sync-service"; // Keep separate (background sync)
```

### Step 9: Add Comprehensive Testing

**Objective**: Ensure reliability through thorough testing

Create unit tests for the service:

```typescript
// activity-recording-service.test.ts
describe('ActivityRecordingService', () => {
  it('transitions states correctly', () => {
    service.startActivity('run')
    expect(service.state).toBe('recording')

    service.pauseActivity()
    expect(service.state).toBe('paused')
  })

  it('generates valid JSON', () => {
    // Test JSON generation
  })

  it('calculates metrics correctly', () => {
    // Test metric calculations
  })
})
```

Add integration tests:

```typescript
// recording-flow.integration.test.ts
it('completes full recording flow', async () => {
  // Start recording
  // Simulate GPS data
  // Pause and resume
  // Finish activity
  // Verify database save
  // Check sync queue
})
```

Create E2E tests:

```typescript
// recording.e2e.test.ts
it('prevents modal dismissal during recording', async () => {
  // Open record modal
  // Start activity
  // Attempt to close modal
  // Verify modal remains open
})
```

**Testing Coverage:**
- Unit tests for all service methods
- Integration tests for data flow
- E2E tests for user workflows
- Edge case handling tests

### Step 10: Update Documentation

**Objective**: Document the new architecture and usage

Update `README.md` with new architecture:

```markdown
## Activity Recording Architecture

The activity recording system uses a centralized service pattern:

### Service Layer
- `ActivityRecordingService`: Core recording logic and state management
- `SyncQueue`: Background sync with retry logic

### Hook Layer
- `useRecording`: Primary hook for recording state
- `usePermissions`: Unified permission handling
- `useBluetooth`: BLE device management
- `useActivitySync`: Sync status monitoring

### UI Layer
- `RecordModal`: Container with lock behavior
- `RecordingScreen`: Main recording UI
- `ActivitySummaryModal`: Post-activity summary
```

Add usage examples:

```markdown
## Usage Examples

### Starting an Activity
```typescript
const { startActivity } = useRecording()
startActivity('run', plannedId?)
```

### Accessing Metrics
```typescript
const { metrics } = useRecording()
// metrics.distance, metrics.heartRate, etc.
```
```

Update `CHANGELOG.md`:

```markdown
## [Version] - Activity Recording Consolidation

### Added
- Centralized `ActivityRecordingService`
- Unified permission handling via `usePermissions`
- Modal lock behavior during active recording
- Robust sync queue with retry logic

### Changed
- Consolidated hooks from 8+ to 4 core hooks
- Merged metric display components
- Unified Bluetooth and permissions modals

### Removed
- Deprecated service files (40% reduction)
- Redundant hooks and UI components
- Legacy AsyncStorage checkpoints (migrated to Drizzle)
```


## Key Recommendations (Production Requirements)

### 1. **Phase 0: Architecture Analysis (CRITICAL - Do First)**
Before writing any code, complete comprehensive analysis:

```bash
# Create detailed inventory
node scripts/analyze-current-state.js

# Output should include:
# - Line counts for each file to be modified
# - Current import usage across codebase  
# - Active AsyncStorage keys and data structures
# - Current database queries and schemas
# - All current GPS/sensor integration points
```

### 2. **Mobile-Specific Implementation Requirements**

**Background Processing Constraints:**
```typescript
// iOS Background App Refresh limitations
// Must maintain TaskManager.defineTask for GPS tracking
// Preserve foreground service notifications for Android

class ActivityRecordingService {
  private static setupBackgroundLocationTask(): void {
    // PRESERVE: This exact pattern is required for mobile background GPS
    TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
      // Critical for iOS - maintain exact structure
    })
  }
}
```

**Platform Permission Differences:**
```typescript
// iOS vs Android permission handling differences
const requestPermissions = async () => {
  // iOS: Location permission + Background App Refresh
  // Android: Location + Background Location + Foreground Service
  
  if (Platform.OS === 'ios') {
    // Preserve iOS-specific logic from current implementation
  } else {
    // Preserve Android-specific logic from current implementation  
  }
}
```

### 3. **Data Loss Prevention (MANDATORY)**

**Pre-Migration Backup:**
```typescript
// Must run before any code changes
const backupCurrentData = async () => {
  const keys = ['active_recording_session', 'activity_recovery_data', 'activity_checkpoint_data']
  const backup = {}
  
  for (const key of keys) {
    backup[key] = await AsyncStorage.getItem(key)
  }
  
  await AsyncStorage.setItem('pre_migration_backup', JSON.stringify(backup))
  console.log('✅ Backup created - safe to proceed with migration')
}
```

**Rollback Strategy:**
```typescript
// Must be available during migration period
const rollbackMigration = async () => {
  const backup = await AsyncStorage.getItem('pre_migration_backup')
  if (backup) {
    const data = JSON.parse(backup)
    for (const [key, value] of Object.entries(data)) {
      if (value) await AsyncStorage.setItem(key, value)
    }
    console.log('✅ Rollback completed')
  }
}
```

### 4. **Performance Validation Requirements**

**Baseline Measurements (Must Capture Before Changes):**
```bash
# Run these commands to establish baseline:
npx react-native-performance-monitor --duration=300 --activity=recording
npx metro-memory-usage --component=ActivityRecording  

# Expected results to maintain:
# - GPS lock time: <5 seconds
# - UI response time: <100ms
# - Memory usage during 1hr recording: <50MB increase
# - Battery impact: <10% per hour
```

**Regression Prevention:**
```typescript
// Add performance monitoring to new service
class ActivityRecordingService {
  private static performanceMetrics = {
    gpsLockTime: 0,
    uiResponseTimes: [],
    memoryUsage: 0
  }
  
  private static trackPerformance(operation: string, duration: number) {
    // Log performance metrics for validation
    console.log(`📊 ${operation}: ${duration}ms`)
  }
}
```

### 5. **Testing Strategy (Production Readiness)**

**Critical Test Scenarios:**
```typescript
// These scenarios MUST pass before production:

describe('Activity Recording - Critical Paths', () => {
  it('survives app backgrounding during recording', async () => {
    // Start recording -> background app -> foreground -> verify continuity
  })
  
  it('recovers from unexpected app termination', async () => {
    // Start recording -> kill app -> restart -> verify recovery prompt
  })
  
  it('handles GPS signal loss gracefully', async () => {
    // Mock GPS unavailable -> verify fallback behavior
  })
  
  it('manages storage full scenarios', async () => {
    // Fill device storage -> verify graceful degradation
  })
  
  it('maintains accuracy with poor cellular connection', async () => {
    // Simulate network instability -> verify offline recording works
  })
})
```

### 6. **Deployment Safety (Production Checklist)**

**Feature Flag Implementation:**
```typescript
// Must implement before deploying
const useConsolidatedRecording = () => {
  const isEnabled = FeatureFlags.get('consolidated-recording-service')
  
  if (isEnabled) {
    return ActivityRecordingService // New implementation
  } else {
    return ActivityRecorderService // Fallback to current
  }
}
```

**Gradual Rollout Plan:**
```bash
# Week 1: Internal testing only (feature flag off)
# Week 2: 10% of users (feature flag 0.1)  
# Week 3: 50% of users (feature flag 0.5)
# Week 4: 100% of users (feature flag 1.0)
# Week 5: Remove old code (after confirming no issues)
```

**Monitoring Requirements:**
```typescript
// Add to new service
class ActivityRecordingService {
  private static logCriticalEvent(event: string, data: any) {
    // Must integrate with existing analytics/crash reporting
    Analytics.track('activity_recording_event', { event, data })
    
    if (event === 'recovery_failed' || event === 'data_loss') {
      CrashReporting.recordError(new Error(`Critical: ${event}`), data)
    }
  }
}
```

## Migration Checklist

**Phase 0: Pre-Migration (CRITICAL)**
- [ ] **Backup current AsyncStorage data** (`active_recording_session`, recovery keys)
- [ ] **Establish performance baselines** (GPS lock time, memory usage)
- [ ] **Document current GPS/sensor integration points**
- [ ] **Map all AsyncStorage keys used by current system**
- [ ] **Identify all components importing old services/hooks**

**Phase 1: Foundation**
- [ ] **Create `ActivityRecordingService` with preserved recovery logic**
- [ ] **Implement enhanced checkpoint system** (AsyncStorage + SQLite)
- [ ] **Add database recovery table** to schema
- [ ] **Build consolidated permission handling**
- [ ] **Preserve GPS timeout and background task logic**

**Phase 2: Core Implementation**
- [ ] **Wire sensor integrations** (preserve BLE device handling)
- [ ] **Implement modal locking mechanism** (prevent dismissal during recording)
- [ ] **Build live metrics calculation** (preserve existing algorithms)  
- [ ] **Create unified activity selection flow**
- [ ] **Implement robust completion and storage logic**

**Phase 3: UI Consolidation**
- [ ] **Create simplified `useRecording` hook**
- [ ] **Build new recording screen** (reference existing MetricsGrid, RecordingControls)
- [ ] **Implement activity summary modal**
- [ ] **Create permission and Bluetooth modals**

**Phase 4: Migration & Cleanup**
- [ ] **Implement feature flag** for gradual rollout
- [ ] **Add migration helper for active sessions**
- [ ] **Update all imports** with codemod
- [ ] **Remove legacy services/hooks** (activity-recorder.ts, useEnhancedActivityRecording.ts)
- [ ] **Update export indices**

**Phase 5: Validation (MANDATORY)**
- [ ] **Test GPS signal loss recovery**
- [ ] **Test app backgrounding during recording**
- [ ] **Test unexpected app termination recovery**
- [ ] **Validate performance metrics match baseline**
- [ ] **Test on low-end devices**
- [ ] **Verify no data loss in migration**

**Phase 6: Production Deployment**
- [ ] **10% gradual rollout with monitoring**
- [ ] **Monitor crash rates and recovery success**
- [ ] **50% rollout after 1 week of stability**
- [ ] **100% rollout after 2 weeks**
- [ ] **Remove legacy code after 4 weeks**

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing flows | High | Feature flags for gradual rollout |
| BLE connection issues | Medium | Robust retry logic and fallback UI |
| Data loss during migration | High | Backup existing data before changes |
| Performance regression | Medium | Profile critical paths before/after |

## Success Metrics (Updated with Realistic Targets)

### Code Quality Metrics
- **Code Consolidation**: ~12% line reduction (from 3,050 to 2,700 lines)
- **File Reduction**: 65% fewer service files (5 files → 1 file)  
- **Hook Simplification**: 75% complexity reduction (550 lines → 100 lines in main hook)
- **Test Coverage**: >85% for new `ActivityRecordingService`
- **Documentation Coverage**: 100% of public methods documented

### Performance Metrics (Must Match or Exceed Current)
- **GPS Lock Time**: <5 seconds (maintain current performance)
- **UI Response Time**: <100ms for all recording controls
- **Memory Usage**: <50MB increase during 1-hour recording
- **Battery Impact**: <10% drain per hour of recording
- **Background Processing**: Maintain 99.9% GPS continuity when backgrounded

### Reliability Metrics (Critical for Production)
- **Data Loss Rate**: <0.01% of recording sessions
- **Recovery Success Rate**: >99% for interrupted sessions  
- **Crash Rate**: <0.1% during recording operations
- **Checkpoint Success**: >99.9% of checkpoints saved successfully
- **Migration Success**: 100% of existing active sessions preserved

### User Experience Metrics
- **Modal Lock Behavior**: 100% prevention of accidental dismissal during recording
- **Recovery UX**: <3 seconds from app restart to recovery prompt
- **Sensor Connection**: <10 seconds for Bluetooth device pairing
- **Permission Flow**: <30 seconds for all permission requests
- **Activity Completion**: <5 seconds from stop to summary display

### Deployment Safety Metrics
- **Rollout Success**: Gradual deployment with <0.5% rollback rate
- **Feature Flag Stability**: 100% uptime during gradual rollout
- **Monitoring Coverage**: 100% of critical code paths monitored
- **Rollback Time**: <2 hours to revert if critical issues detected

## Implementation Conclusion

This comprehensive consolidation plan prioritizes **production safety** over aggressive code reduction. The approach:

1. **Preserves all critical functionality** from existing robust systems
2. **Implements multi-level data protection** with enhanced checkpoint/recovery
3. **Provides detailed mobile-specific considerations** for iOS/Android
4. **Includes mandatory testing and validation phases**
5. **Features gradual deployment with rollback capabilities**

The implementation should proceed **sequentially through each phase**, with mandatory validation at each step. The phased approach allows for early detection of issues and rollback if necessary, while maintaining a clear path toward the consolidated architecture.

**Key Success Factor**: Treat this as a **reliability improvement project** rather than just a code reduction exercise. The primary goal is creating a more maintainable system while preserving all existing robust behaviors.
