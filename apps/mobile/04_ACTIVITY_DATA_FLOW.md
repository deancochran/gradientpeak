# TurboFit Mobile App: Data Flow and Fault Tolerance Specification

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Integration](#architecture-integration)
3. [Data Structures](#data-structures)
4. [Core Data Flow](#core-data-flow)
5. [Fault Tolerance Architecture](#fault-tolerance-architecture)
6. [Error Classification and Recovery](#error-classification-and-recovery)
7. [State Management](#state-management)
8. [User Experience Design](#user-experience-design)
9. [Performance Considerations](#performance-considerations)
10. [Monitoring and Observability](#monitoring-and-observability)

## System Overview

The TurboFit mobile application implements a sophisticated JSON-first, offline-first architecture built on Expo, React Native, and modern tooling. The system operates in three distinct phases:

1. **Real-time data recording** during workouts using Expo Location and BLE sensors
2. **Immediate local processing** using Drizzle ORM with SQLite and JSON file storage
3. **Background synchronization** via tRPC API to Supabase backend

### Core Principles
- **JSON-First Architecture**: All activity data stored as JSON files with Drizzle ORM metadata
- **Offline-First Design**: Full functionality without network connectivity
- **Type Safety**: End-to-end TypeScript with tRPC and Zod validation
- **Graceful Degradation**: System continues operating during component failures
- **Idempotent Operations**: Retry-safe sync operations with conflict resolution

## Architecture Integration

### Drizzle ORM Schema (`src/lib/db/schemas/activities.ts`)
```typescript
export const activities = sqliteTable("activities", {
  // Primary identification
  id: text("id").primaryKey(), // UUID stored as text in SQLite
  idx: integer("idx"), // Serial equivalent, managed by app
  profileId: text("profile_id").notNull(),

  // Activity metadata
  name: text("name").notNull(),
  notes: text("notes"),
  localFilePath: text("local_file_path").notNull(),
  syncStatus: text("sync_status")
    .$type<SyncStatus>()
    .notNull()
    .default("local_only"),

  // Activity Type
  type: text("type").$type<ActivityType>().notNull().default("other"),
  // Timing information
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  totalTime: integer("total_time").notNull().default(0),
  movingTime: integer("moving_time").notNull().default(0),

  // Snapshot data (user's fitness profile at time of activity)
  snapshotWeightKg: integer("snapshot_weight_kg").notNull(),
  snapshotFtp: integer("snapshot_ftp").notNull(),
  snapshotThresholdHr: integer("snapshot_threshold_hr").notNull(),

  // Performance metrics
  tss: integer("tss").notNull(), // Training Stress Score
  intensityFactor: integer("if").notNull(), // Note: 'if' is renamed to avoid keyword conflict
  normalizedPower: integer("normalized_power"),
  avgPower: integer("avg_power"),
  peakPower: integer("peak_power"),

  // Heart rate metrics
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),

  // Cadence metrics
  avgCadence: integer("avg_cadence"),
  maxCadence: integer("max_cadence"),

  // Distance and speed metrics
  distance: integer("distance"),
  avgSpeed: real("avg_speed"), // numeric(5,2) equivalent in SQLite
  maxSpeed: real("max_speed"), // numeric(5,2) equivalent in SQLite

  // Elevation metrics
  totalAscent: integer("total_ascent"),
  totalDescent: integer("total_descent"),

  // System metadata
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

### tRPC Integration (`packages/trpc/src/routers/activities.ts`)
```typescript
export const activitiesRouter = createTRPCRouter({
  sync: protectedProcedure
    .input(activitySyncSchema)
    .mutation(async ({ ctx, input }) => {
      const activityData = {
        id: input.activityId,
        started_at: input.startedAt,
        live_metrics: input.liveMetrics,
        file_path: input.filePath,
        profile_id: ctx.session.user.id,
        sync_status: "synced",
      };

      const { data: activity, error } = await ctx.supabase
        .from("activities")
        .upsert(activityData, {
          onConflict: "id",
          ignoreDuplicates: false,
        })
        .select();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return {
        synced: activity ? 1 : 0,
        activity: activity,
      };
    }),
});
```

### Core Package Integration (`packages/core/types/activity-types.ts`)
```typescript
enum ActivityTypeId {
  RUNNING = "running",
  CYCLING = "cycling",
  // ... comprehensive activity types
}
```

## Data Structures

### JSON File Structures
Each workout is stored as a comprehensive JSON file serving as the single source of truth


### Drizzle ORM Schema
### Activity Streams Table (`src/lib/db/schemas/activities.ts`)
```typescript
export const activityStreams = sqliteTable("activity_streams", {
  // Primary identification
  id: text("id").primaryKey(), // UUID stored as text in SQLite
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),

  // Stream metadata
  type: text("type").$type<ActivityMetric>().notNull(),
  dataType: text("data_type").$type<ActivityMetricDataType>().notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  originalSize: integer("original_size").notNull(),

  // Stream data (JSONB equivalent stored as text in SQLite)
  data: text("data").notNull(), // JSON stringified data

  // System metadata
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),

  // Additional local-only fields for fault tolerance
  syncStatus: text("sync_status")
    .$type<SyncStatus>()
    .notNull()
    .default("local_only"),
});
```

Local SQLite database with optimized mobile performance:
- `activities` table for workout summaries and metadata
- `activity_streams` table for time-series sensor data
- `sync_status` enum tracking synchronization state for both tables
- Foreign key relationships with cascading deletes
- Chunk-based storage for efficient data management

### Supabase Mirror Schema
Remote database with additional cloud optimizations:
- Real-time capabilities via Supabase Realtime
- Row-level security for data isolation
- Storage integration for large JSON files

## Core Data Flow

### Phase 1: Real-Time Data Recording & JSON File Creation

#### Sensor Integration & Data Collection
- **Expo Location**: High-precision GPS tracking with background support
- **React Native BLE PLX**: Bluetooth Low Energy sensor integration for heart rate, power, cadence
- **Expo TaskManager**: Background task management for continuous recording

#### JSON File Creation Process (`src/lib/services/activity-save.ts`)
```typescript
static async saveActivityRecording(
  recording: ActivityRecording,
  profileId: string,
  activityName?: string,
): Promise<string> {
  // 1. Generate comprehensive activity JSON with raw sensor data
  const activityJSON = this.generateActivityJSON(recording, activityName);

  // 2. Calculate advanced metrics using @repo/core calculations
  const summary = this.calculateSummaryMetrics(recording);
  activityJSON.summary = { ...activityJSON.summary, ...summary };

  // 3. Save JSON file locally with atomic file operations
  const localFilePath = await this.saveActivityJSONFile(activityJSON);

  return localFilePath;
}
```

#### JSON File Structure
Each workout JSON file contains:
- **Raw sensor data arrays** with timestamps
- **GPS location data** with coordinates and altitude
- **Performance metrics** calculated in real-time
- **Device information** and recording metadata
- **Privacy settings** and sharing preferences

### Phase 2: Local Database Population from JSON Files

#### Activity Record Creation (`src/lib/services/activity-completion-service.ts`)
```typescript
static async completeActivity(
  recording: ActivityRecording,
  options?: CompletionWorkflowOptions
): Promise<ActivityRecord> {
  // 1. Generate activity record from JSON data
  const activityRecord = await this.generateActivityRecord(recording);

  // 2. Create activity streams from sensor data
  const activityStreams = await this.generateActivityStreams(recording);

  // 3. Save to local SQLite database using Drizzle ORM
  await this.saveToLocalStorage(activityRecord, activityStreams);

  // 4. Queue for cloud synchronization
  await this.queueForCloudSync(activityRecord.id);

  return activityRecord;
}
```

#### Database Insertion Process
```typescript
// Insert activity record with comprehensive metrics
const localActivity: InsertLocalActivity = {
  id: recording.id,
  profileId: profileId,
  name: activityJSON.name,
  type: activityJSON.activityType,
  startedAt: new Date(recording.startTime),
  totalTime: summary.totalTime,
  movingTime: summary.movingTime,
  snapshotWeightKg: userProfile.weightKg,
  snapshotFtp: userProfile.ftp,
  snapshotThresholdHr: userProfile.thresholdHr,
  tss: summary.tss,
  intensityFactor: summary.intensityFactor,
  normalizedPower: summary.normalizedPower,
  avgPower: summary.avgPower,
  peakPower: summary.peakPower,
  avgHeartRate: summary.avgHeartRate,
  maxHeartRate: summary.maxHeartRate,
  avgCadence: summary.avgCadence,
  maxCadence: summary.maxCadence,
  distance: summary.totalDistance,
  avgSpeed: summary.avgSpeed,
  maxSpeed: summary.maxSpeed,
  totalAscent: summary.elevationGain,
  totalDescent: summary.elevationLoss,
  localFilePath: filePath,
  syncStatus: "local_only",
  syncAttempts: 0,
};

await LocalActivityDatabaseService.createActivity(localActivity);
```

#### Activity Streams Population
```typescript
// Create activity streams for time-series data
const streamRecords = sensorData.map((dataPoint, index) => ({
  id: `${activityId}_${dataPoint.type}_${index}`,
  activityId: activityId,
  type: dataPoint.type as ActivityMetric,
  dataType: this.getDataTypeForMetric(dataPoint.type),
  chunkIndex: Math.floor(index / 1000), // Batch in chunks of 1000
  originalSize: JSON.stringify(dataPoint.data).length,
  data: JSON.stringify(dataPoint.data),
  syncStatus: "local_only",
}));

// Batch insert streams for efficiency
await LocalActivityDatabaseService.batchInsertStreams(streamRecords);
```

### Phase 3: Cloud Synchronization Process

#### Sync Queue Management (`src/lib/services/activity-sync-service.ts`)
```typescript
private static syncQueue: Set<string> = new Set();
private static readonly BATCH_SIZE = 5;
private static readonly MAX_RETRY_ATTEMPTS = 3;
private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
```

#### tRPC Cloud Upload Process
```typescript
static async syncSingleActivity(activityId: string): Promise<SyncResult> {
  try {
    // 1. Update sync status to "syncing"
    await LocalActivityDatabaseService.updateSyncStatus(activityId, "syncing");

    // 2. Load activity and JSON data
    const activity = await LocalActivityDatabaseService.getActivity(activityId);
    const jsonData = await this.loadActivityJSON(activity.localFilePath);
    const streams = await LocalActivityDatabaseService.getStreamsForActivity(activityId);

    // 3. Type-safe tRPC call to sync endpoint
    const result = await trpc.activities.sync.mutate({
      activityId: activity.id,
      startedAt: activity.startedAt.toISOString(),
      liveMetrics: jsonData.summary,
      filePath: activity.localFilePath,
      streams: streams.map(stream => ({
        type: stream.type,
        dataType: stream.dataType,
        data: JSON.parse(stream.data),
        chunkIndex: stream.chunkIndex
      }))
    });

    // 4. Update sync status based on result
    if (result.synced > 0) {
      await LocalActivityDatabaseService.updateSyncStatus(activityId, "synced");
      await LocalActivityDatabaseService.updateStreamsSyncStatus(activityId, "synced");
    }

    return result;
  } catch (error) {
    // Update sync status to failed with error details
    await LocalActivityDatabaseService.updateSyncStatus(
      activityId,
      "sync_failed",
      undefined,
      error instanceof Error ? error.message : "Unknown error",
      (activity?.syncAttempts || 0) + 1
    );
    throw error;
  }
}
```

#### Batch Synchronization
```typescript
static async syncBatch(activityIds: string[]): Promise<SyncResult> {
  const results: SyncResult[] = [];

  for (const activityId of activityIds) {
    try {
      const result = await this.syncSingleActivityWithRetry(activityId);
      results.push(result);
    } catch (error) {
      results.push({
        success: 0,
        failed: 1,
        skipped: 0,
        conflicts: 0,
        details: [{ activityId, error: error.message }]
      });
    }
  }

  return this.aggregateResults(results);
}
```

#### Conflict Resolution (`packages/trpc/src/routers/sync.ts`)
```typescript
const resolveConflictSchema = z.object({
  activityId: z.string(),
  resolution: z.enum(["use_local", "use_remote", "merge", "skip"]),
  mergeData: z.unknown().optional(),
});

export const syncRouter = createTRPCRouter({
  resolveConflict: protectedProcedure
    .input(resolveConflictSchema)
    .mutation(async ({ ctx, input }) => {
      // Handle conflict resolution based on user choice
      switch (input.resolution) {
        case "use_local":
          // Re-upload local data
          break;
        case "use_remote":
          // Update local database with remote data
          break;
        case "merge":
          // Merge local and remote data
          break;
        case "skip":
          // Mark as resolved without changes
          break;
      }
    }),
});
```

### Fault Tolerance Architecture

### Atomic Operations
- **File Operations**: Temporary files with atomic renames using Expo FileSystem, ensuring JSON file integrity
- **Database Transactions**: Drizzle ORM transactions with rollback capability for both activities and streams
- **JSON Integrity**: Checksum validation and version tracking with automatic backup creation
- **Stream Processing**: Chunk-based processing with individual transaction commits

### Checkpointing Strategy
- **JSON Processing**: Offset tracking through raw JSON data with resumable parsing
- **Database Insertion**: Batch processing with transaction commit markers for both activities and streams
- **Sync State**: `sync_status` enum tracking for both activities and activity_streams tables
- **Retry Management**: Exponential backoff with configurable limits (1s, 5s, 15s)
- **Chunk Indexing**: Stream data processed in manageable chunks (1000 points per chunk)

### Data Integrity Verification
1. **Real-time Validation**: Zod schema validation during recording using `@repo/core` schemas
2. **Post-processing**: Logical consistency checks between JSON data and database records
3. **Stream Validation**: Type and data type validation for all activity stream entries
4. **Pre-sync**: Compatibility verification with Supabase schema via tRPC procedures
5. **Post-sync**: Integrity confirmation with checksum comparison and Supabase validation
6. **Cross-Table Consistency**: Referential integrity between activities and activity_streams

### Redundancy and Backup
- **Raw Data Preservation**: JSON files retained until successful sync confirmation of both activities and streams
- **Database Redundancy**: Local records maintained for offline access with proper indexing
- **Metadata Duplication**: Critical metadata stored in both file and database with version tracking
- **Stream Backup**: Individual stream chunks backed up separately for partial recovery

### Error Classification and Recovery

### Transient Errors
- **Network Timeouts**: Automatic retry with exponential backoff (1s, 5s, 15s) for both activities and streams
- **Database Locks**: Transaction retry with incremental delays for SQLite operations
- **Memory Pressure**: Streaming processing with memory cleanup and chunk-based loading
- **Stream Processing**: Individual stream chunk failures with isolated retry logic

### Retryable Errors
- **Data Validation**: Schema validation failures with automatic correction where possible
- **Server Errors**: HTTP 5xx responses with limited retry attempts and progressive backoff
- **Resource Constraints**: Memory or storage limits with automatic cleanup of temporary files
- **Stream Size Limits**: Large stream data handling with chunking and compression

### Fatal Errors
- **Data Corruption**: JSON schema violations requiring manual intervention or data salvage
- **Schema Incompatibility**: Version mismatches between local and remote schemas requiring migration
- **Permanent Rejections**: Server-side policy violations or authentication failures
- **Stream Corruption**: Irrecoverable stream data corruption requiring partial data reconstruction

### Recovery Procedures
- **Crash Recovery**: Startup detection of incomplete operations using sync_status field in both tables
- **Data Salvage**: Partial data recovery from corrupted JSON files with stream reconstruction
- **Sync Retry**: Multiple retry strategies with activity and stream-level retry tracking
- **Database Repair**: SQLite integrity checks with automatic stream reindexing
- **File System Recovery**: Expo FileSystem error handling with activity and stream backup restoration
- **Partial Sync**: Ability to sync completed streams even if others fail

### State Management

### Processing State Machine
Activities and streams progress through coordinated states:
- **Recording**: `recording` → data collection with real-time buffering
- **Processing**: `processing` → JSON generation → metric calculation → database insertion
- **Sync Preparation**: `local_only` → activity and streams ready for sync
- **Synchronization**: `syncing` → activity metadata sync → stream chunk sync → `synced`
- **Error Handling**: `sync_failed` → retry analysis → `retrying` or manual intervention
- **Conflict Resolution**: `conflict` → user resolution → re-sync or data merge

### Progress Tracking
- **Percentage Completion**: Real-time progress indicators for both activities and streams
- **Stage Identification**: Current processing phase visibility with chunk-level tracking
- **Error Context**: Detailed error information with stream-specific debugging
- **Sync Metrics**: Individual tracking of activity metadata and stream chunk synchronization

### Concurrency Control
- **Activity Locking**: Single activity processing at a time with Zustand state management
- **Stream Parallelism**: Multiple stream chunks processed concurrently where possible
- **Batch Processing**: Parallel sync of multiple activities with configurable batch size (default: 5)
- **UI Responsiveness**: Non-blocking operations with React Query background synchronization
- **Database Locking**: Drizzle ORM transaction management with proper isolation levels for both tables
- **Network Throttling**: Intelligent sync scheduling based on network conditions and battery status
- **Resource Management**: Memory and CPU usage monitoring during stream processing

### User Experience Design

### Immediate Feedback
- **Workout Summaries**: Essential metrics within seconds of completion using JSON data
- **Live Processing**: Progressive enhancement during background processing of streams
- **Sync Status**: Clear indication of cloud synchronization state for both activities and streams
- **Stream Progress**: Visual feedback on stream processing and upload progress

### Progressive Enhancement
- **Initial View**: Basic metrics and duration from activity record
- **Intermediate**: Heart rate zones and power analysis using stream data and `@repo/core` calculations
- **Complete**: Advanced analytics and visualizations with full stream data integration
- **Real-time Updates**: Live metric updates during stream processing via Zustand state subscriptions
- **Chunk Loading**: Progressive loading of stream data for large activities

### Error Communication
- **Transparent Status**: Clear error messages with activity and stream-specific details
- **Actionable Steps**: User-friendly guidance for resolution with retry options
- **Support Integration**: Easy access to debugging information including stream chunk status
- **Partial Success**: Clear communication when some streams sync successfully while others fail

### Offline Capability
- **Full Functionality**: Complete feature set without network using Drizzle ORM SQLite storage
- **Automatic Sync**: Background synchronization when connectivity returns with intelligent chunking
- **Data Access**: Historical data available offline with efficient SQLite queries across both tables
- **Conflict Resolution**: Smart merging strategies with user intervention options for stream data
- **Partial Sync**: Ability to work with partially synced data while background sync continues

### Performance Considerations

### Memory Management
- **Streaming Processing**: Chunk-based JSON parsing avoiding large memory usage with Expo FileSystem streaming
- **Buffer Optimization**: Efficient sensor data buffering with periodic flushing (1000 data point threshold)
- **Stream Chunking**: Memory-efficient processing of activity streams in manageable chunks
- **Cleanup Strategies**: Aggressive memory release after stream processing completion
- **Garbage Collection**: Manual memory management for large stream data structures

### Battery Optimization
- **Sensor Polling**: Adaptive intervals based on activity type using React Native BLE PLX optimization
- **Background Processing**: Efficient use of Expo TaskManager for both recording and sync operations
- **Network Efficiency**: Batched sync operations reducing radio usage with intelligent chunk timing
- **CPU Throttling**: Performance profiling for stream processing and database operations
- **Stream Priority**: Intelligent prioritization of stream sync based on user activity

### Storage Efficiency
- **JSON Compression**: Efficient storage format with binary data optimization for raw sensor data
- **Stream Storage**: Compact storage of time-series data in SQLite with proper indexing
- **Automatic Cleanup**: Configurable retention policies with coordinated cleanup of JSON files and database records
- **Database Optimization**: SQLite performance tuning with indexes on activity_id and sync_status
- **File Management**: Efficient file storage with automatic cleanup of orphaned JSON files

### Network Optimization
- **Batch Uploads**: Multiple activities and stream chunks in optimized tRPC calls
- **Data Compression**: Gzip compression for both activity metadata and stream payloads
- **Chunk Prioritization**: Intelligent ordering of stream chunk uploads based on importance
- **Intelligent Scheduling**: Network-aware sync timing with connection quality detection
- **Retry Logic**: Exponential backoff with jitter for network failures, with stream-level retry
- **Bandwidth Management**: Adaptive chunk sizing based on network conditions

## Monitoring and Observability

### System Metrics
- **Processing Times**: Stage duration tracking for both activity and stream processing
- **Stream Chunk Metrics**: Individual chunk processing times and success rates
- **Error Rates**: Categorized error tracking for activities and streams separately
- **Sync Success**: Success rate monitoring with activity vs stream comparison
- **Memory Usage**: Real-time memory consumption during stream processing

### User Analytics
- **Workout Completion**: Activity recording success rates with stream data quality
- **Sync Reliability**: Cloud synchronization performance for both metadata and streams
- **Stream Utilization**: Usage patterns of different stream types (HR, power, GPS)
- **Feature Usage**: Component utilization with stream data dependency analysis
- **Storage Efficiency**: JSON file size vs database storage efficiency metrics

### Debugging Support
- **Detailed Logging**: Comprehensive activity and stream lifecycle logging
- **Stream-Specific Errors**: Rich error information with chunk-level debugging
- **Data Integrity**: Validation reports for both JSON files and stream data
- **Sync State Tracking**: Real-time monitoring of activity and stream sync status
- **Performance Profiling**: CPU and memory usage during stream processing

### Health Monitoring
- **File System**: Storage capacity with JSON file size tracking and cleanup efficiency
- **Database Health**: SQLite consistency verification with stream table optimization
- **Network Performance**: Connectivity status with stream upload bandwidth monitoring
- **Battery Impact**: Power consumption during stream processing and synchronization
- **Resource Usage**: Memory and CPU utilization during large stream operations

## Implementation Examples

### Activity Recording Service with Stream Support
```typescript
// src/lib/services/activity-recorder.ts
static async startRecording(activityType: string): Promise<void> {
  await this.initialize();
  this.currentSession = this.createNewSession(activityType);
  
  // Initialize stream buffers for different data types
  this.sensorDataBuffer = [];
  this.gpsDataBuffer = [];
  this.heartRateBuffer = [];
  
  await this.startLocationTracking();
  await this.startSensorTracking();
  this.startRecordingTimer();
}

static addSensorData(data: SensorDataPoint) {
  // Add to appropriate buffer based on data type
  switch (data.type) {
    case 'heartrate':
      this.heartRateBuffer.push(data);
      break;
    case 'power':
    case 'cadence':
      this.sensorDataBuffer.push(data);
      break;
    case 'location':
      this.gpsDataBuffer.push(data);
      break;
  }
  
  // Periodic buffer flushing to JSON
  if (this.getTotalBufferSize() > 1000) {
    this.flushBuffersToJson();
  }
}
```

### Sync Service Integration with Stream Support
```typescript
// src/lib/services/activity-sync-service.ts
static async syncAll(): Promise<SyncResult> {
  if (!this.isInitialized) {
    await this.initialize();
  }

  if (this.syncInProgress) {
    return { success: 0, failed: 0, skipped: 0, conflicts: 0, details: [] };
  }

  const result: SyncResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    conflicts: 0,
    details: [],
    streamsSynced: 0,
    streamsFailed: 0,
  };

  try {
    this.syncInProgress = true;

    // Check network connectivity
    const isOnline = await this.isNetworkAvailable();
    if (!isOnline) {
      return result;
    }

    // Get activities with pending streams
    const pendingActivities = await LocalActivityDatabaseService.getActivitiesWithPendingStreams();
    const batches = this.createBatches(pendingActivities, this.BATCH_SIZE);

    for (const batch of batches) {
      const batchResult = await this.syncBatchWithStreams(batch);
      // Aggregate results with stream metrics
      result.success += batchResult.success;
      result.failed += batchResult.failed;
      result.conflicts += batchResult.conflicts;
      result.streamsSynced += batchResult.streamsSynced;
      result.streamsFailed += batchResult.streamsFailed;
      result.details.push(...batchResult.details);
    }

    return result;
  } finally {
    this.syncInProgress = false;
  }
}

static async syncBatchWithStreams(activityIds: string[]): Promise<SyncResult> {
  const results: SyncResult[] = [];

  for (const activityId of activityIds) {
    try {
      // Sync activity metadata first
      const activityResult = await this.syncSingleActivity(activityId);
      
      // Then sync streams in chunks
      const streamResult = await this.syncActivityStreams(activityId);
      
      results.push({
        ...activityResult,
        streamsSynced: streamResult.success,
        streamsFailed: streamResult.failed
      });
    } catch (error) {
      results.push({
        success: 0,
        failed: 1,
        skipped: 0,
        conflicts: 0,
        streamsSynced: 0,
        streamsFailed: 0,
        details: [{ activityId, error: error.message }]
      });
    }
  }

  return this.aggregateResults(results);
}
```

### tRPC Client Usage with Stream Support
```typescript
// src/lib/trpc.ts
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers: async () => {
        const session = await supabase.auth.getSession();
        return {
          Authorization: `Bearer ${session.data.session?.access_token}`,
          'X-Stream-Version': '1.0',
          'X-Chunk-Size': '1000',
        };
      },
    }),
  ],
});

// Extended sync procedure with stream support
export const activitySyncWithStreamsSchema = z.object({
  activityId: z.string(),
  startedAt: z.string(),
  liveMetrics: z.unknown(),
  filePath: z.string().optional(),
  streams: z.array(z.object({
    type: z.string(),
    dataType: z.string(),
    data: z.unknown(),
    chunkIndex: z.number(),
    originalSize: z.number().optional(),
  })).optional(),
});

export const activitiesRouter = createTRPCRouter({
  syncWithStreams: protectedProcedure
    .input(activitySyncWithStreamsSchema)
    .mutation(async ({ ctx, input }) => {
      // Handle both activity metadata and stream data sync
      const activityResult = await this.syncActivityMetadata(input);
      const streamResult = await this.syncActivityStreams(input.streams || []);
      
      return {
        ...activityResult,
        streamsSynced: streamResult.success,
        streamsFailed: streamResult.failed,
      };
    }),
});
```

## Conclusion

This comprehensive data flow and fault tolerance design ensures reliable workout data capture and processing while maintaining excellent user experience. The TurboFit mobile application leverages modern technologies including Drizzle ORM, tRPC, and Supabase to deliver enterprise-grade reliability in a consumer fitness context. Through careful integration with the shared `@repo/core` package and consistent type safety across all layers, the system provides robust data handling with graceful degradation during failure scenarios.
