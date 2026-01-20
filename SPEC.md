# FIT File Migration Specification - GradientPeak

**Version:** 1.0
**Date:** 2026-01-20
**Status:** Draft for Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Analysis](#2-current-architecture-analysis)
3. [Gap Analysis: Plan vs Reality](#3-gap-analysis-plan-vs-reality)
4. [Profile Metrics Integration](#4-profile-metrics-integration)
5. [Implementation Phases](#5-implementation-phases)
6. [Deprecated Code Identification](#6-deprecated-code-identification)
7. [Database Schema Changes](#7-database-schema-changes)
8. [File-by-File Implementation Guide](#8-file-by-file-implementation-guide)
9. [Testing Strategy](#9-testing-strategy)
10. [Rollout & Migration Plan](#10-rollout--migration-plan)

---

## 1. Executive Summary

### Purpose
This specification provides a developer-ready roadmap for migrating GradientPeak's activity recording system from **compressed JSON streams in PostgreSQL** to **FIT file-based storage using the official Garmin FIT SDK**.

### Critical Corrections to plan.md

**Incorrect Assumption in plan.md:**
> "GradientPeak currently implements a local-first recording architecture where JSON files are uploaded to Supabase Storage as source of truth."

**Actual Current Implementation:**
- ❌ No JSON files in Supabase Storage
- ✅ File-based `StreamBuffer` on mobile device (Expo FileSystem)
- ✅ Compressed activity streams stored directly in PostgreSQL `activity_streams` table
- ✅ Gzip + Base64 encoding for sensor data
- ✅ No FIT file support currently exists

### Key Additions Not in plan.md

1. **Profile Metric Logs** (`profile_metric_logs` table)
   - Biometric data: weight, resting HR, HRV, sleep duration
   - Critical for weight-adjusted TSS calculations
   - Temporal queries: "What was user's weight on Jan 15?"

2. **Profile Performance Metric Logs** (`profile_performance_metric_logs` table)
   - Performance thresholds: FTP, LTHR, threshold pace, max HR
   - Critical for historical TSS/IF/zone calculations
   - Temporal queries: "What was user's FTP on Jan 15?"
   - `[INACTIVE]` marking for outdated metrics

### Migration Goals

1. **Replace JSON Compression** → Real-time FIT encoding
2. **Add Supabase Storage** → Store FIT files as source of truth
3. **Maintain Profile Metrics Integration** → FTP/weight lookups at activity date
4. **Enable Platform Compatibility** → Export to Strava, Garmin, Wahoo
5. **Preserve Historical Data** → One-time migration of existing activities
6. **Crash Recovery** → Periodic FIT checkpoints

---

## 2. Current Architecture Analysis

### 2.1 Mobile Recording Flow (Current)

```
User starts recording
        ↓
ActivityRecorderService.start()
  - Creates StreamBuffer instance
  - Initializes LiveMetricsManager
  - Starts 1-second metrics timer
  - Starts 60-second flush timer
        ↓
Sensor readings → ingestSensorData()
             → StreamBuffer accumulates in memory
             → LiveMetricsManager calculates metrics
             → Emits stats every 1 second
        ↓
Every 60 seconds:
  - StreamBuffer.flushToFiles()
    → Writes chunks to FileSystem.cache/recording_${timestamp}/
  - Clears in-memory buffers
        ↓
User finishes recording
        ↓
ActivityRecorderService.finishRecording()
  - Stops all timers
  - Reads all StreamBuffer chunk files
  - Compresses data with gzip + base64
  - Builds ActivityPayload
        ↓
tRPC: activities.createWithStreams()
  - INSERT activity record
  - INSERT compressed streams (activity_streams table)
  - UPDATE profile_snapshot (JSONB)
        ↓
Done - Activity visible in dashboard
```

### 2.2 Current File Locations

| Component | Current Path | Status |
|-----------|-------------|--------|
| Recording Service | `apps/mobile/lib/services/ActivityRecorder/index.ts` | ✅ Exists |
| Live Metrics Manager | `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` | ✅ Exists |
| Stream Buffer | `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts` | ✅ Exists |
| Location Manager | `apps/mobile/lib/services/ActivityRecorder/LocationManager.ts` | ✅ Exists |
| Sensors Manager | `apps/mobile/lib/services/ActivityRecorder/SensorsManager.ts` | ✅ Exists |
| Plan Manager | `apps/mobile/lib/services/ActivityRecorder/PlanManager.ts` | ✅ Exists |
| Activities Router | `packages/trpc/src/routers/activities.ts` | ✅ Exists |
| Profile Metrics Router | `packages/trpc/src/routers/profile-metrics.ts` | ✅ Exists |
| Performance Metrics Router | `packages/trpc/src/routers/profile-performance-metrics.ts` | ✅ Exists |
| Stream Decompression (Server) | `packages/core/utils/streamDecompression.ts` | ✅ Exists |
| Stream Decompression (Client) | `apps/mobile/lib/utils/streamDecompression.ts` | ✅ Exists |
| Database Types | `packages/supabase/database.types.ts` | ✅ Exists |

### 2.3 Database Schema (Current)

#### `activities` Table
```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  type activity_type NOT NULL, -- enum: run, bike, swim, strength, other
  location TEXT, -- outdoor, indoor, pool
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  moving_seconds INTEGER,
  distance_meters NUMERIC,
  elevation_gain_meters NUMERIC,
  metrics JSONB, -- {tss, intensity_factor, normalized_power, avg_hr, max_hr, avg_power, max_power, avg_cadence, polyline, total_calories}
  hr_zone_seconds INTEGER[], -- Array of 5 elements (zones 1-5)
  power_zone_seconds INTEGER[], -- Array of 7 elements (zones 1-7)
  activity_plan_id UUID REFERENCES activity_plans(id), -- nullable
  profile_snapshot JSONB, -- Snapshot of profile at activity time
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `activity_streams` Table
```sql
CREATE TABLE activity_streams (
  id UUID PRIMARY KEY,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  type stream_type NOT NULL, -- enum: heartrate, power, speed, cadence, distance, latlng, altitude, etc.
  data_type stream_data_type NOT NULL, -- enum: float, latlng, boolean
  compressed_values TEXT NOT NULL, -- base64-encoded gzipped data
  compressed_timestamps TEXT NOT NULL, -- base64-encoded gzipped timestamps
  sample_count INTEGER NOT NULL,
  original_size INTEGER, -- Size before compression (bytes)
  avg_value NUMERIC,
  min_value NUMERIC,
  max_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_streams_activity_id ON activity_streams(activity_id);
CREATE INDEX idx_activity_streams_type ON activity_streams(activity_id, type);
```

#### `profile_metric_logs` Table
```sql
CREATE TABLE profile_metric_logs (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  metric_type profile_metric_type NOT NULL, -- enum: weight, resting_hr, hrv, sleep_duration, etc.
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reference_activity_id UUID REFERENCES activities(id), -- nullable
  notes TEXT
);

CREATE INDEX idx_profile_metric_logs_profile_date ON profile_metric_logs(profile_id, recorded_at DESC);
CREATE INDEX idx_profile_metric_logs_type ON profile_metric_logs(profile_id, metric_type, recorded_at DESC);
```

#### `profile_performance_metric_logs` Table
```sql
CREATE TABLE profile_performance_metric_logs (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category activity_category NOT NULL, -- enum: run, bike, swim, strength, other
  type performance_metric_type NOT NULL, -- enum: ftp, lthr, threshold_pace, max_hr, etc.
  value NUMERIC NOT NULL,
  duration_seconds INTEGER, -- nullable - for duration-specific metrics like FTP at 2-hour
  unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reference_activity_id UUID REFERENCES activities(id), -- nullable
  notes TEXT -- Can contain [INACTIVE] prefix to mark outdated metrics
);

CREATE INDEX idx_profile_performance_metric_logs_profile_date ON profile_performance_metric_logs(profile_id, recorded_at DESC);
CREATE INDEX idx_profile_performance_metric_logs_type ON profile_performance_metric_logs(profile_id, category, type, recorded_at DESC);
```

### 2.4 Critical API Patterns

#### Temporal Metric Queries

**Use Case 1: Get user's weight at activity date**
```typescript
// Used for weight-adjusted TSS calculations
const weight = await trpc.profileMetrics.getAtDate.query({
  metricType: 'weight',
  date: activity.started_at,
});
```

**Use Case 2: Get user's FTP at activity date**
```typescript
// Used for historical TSS/IF calculations
const ftp = await trpc.profilePerformanceMetrics.getAtDate.query({
  category: 'bike',
  type: 'ftp',
  date: activity.started_at,
});
```

**Implementation:**
```typescript
// Returns most recent metric at or before the specified date
// Filters out [INACTIVE] marked metrics
const metric = await db.profile_performance_metric_logs
  .where('profile_id', profileId)
  .where('category', category)
  .where('type', type)
  .where('recorded_at', '<=', date)
  .where('notes', 'NOT LIKE', '[INACTIVE]%')
  .orderBy('recorded_at', 'desc')
  .first();
```

---

## 3. Gap Analysis: Plan vs Reality

### 3.1 Incorrect Assumptions in plan.md

| plan.md Statement | Reality | Impact |
|-------------------|---------|--------|
| "Chunked JSON files written to Expo SQLite" | ❌ No SQLite - Uses Expo FileSystem directly | **HIGH** - Implementation path differs |
| "JSON uploaded to Supabase Storage as source of truth" | ❌ No Supabase Storage - PostgreSQL only | **HIGH** - Architecture change needed |
| "Background workers decompress streams" | ❌ No workers - Server-side decompression on-demand | **MEDIUM** - Workers need to be created |
| "Local-first, JSON-centric philosophy" | ✅ Partially true - Local recording, but no JSON in cloud | **LOW** - Philosophy correct, implementation differs |

### 3.2 Missing Components in plan.md

| Component | Current Status | Required Action |
|-----------|----------------|-----------------|
| **Profile Metric Logs** | ✅ Implemented | Document integration with FIT workflow |
| **Profile Performance Metric Logs** | ✅ Implemented | Document temporal FTP/LTHR lookup |
| **Supabase Storage Bucket** | ❌ Does not exist | Create `activity-files` bucket with RLS |
| **Background Workers** | ❌ Does not exist | Create `packages/workers/` with BullMQ |
| **FIT SDK Integration** | ❌ Does not exist | Download and integrate Garmin FIT SDK |
| **FIT Decoder** | ❌ Does not exist | Create backend FIT parsing service |
| **StreamingFitEncoder** | ❌ Does not exist | Create mobile FIT encoding service |

### 3.3 Correct Components in plan.md

| Component | Status | Notes |
|-----------|--------|-------|
| Message Sequencing (Summary Last) | ✅ Correct | Follow Garmin's best practices |
| Timer Start/Stop Events | ✅ Correct | Required for FIT compatibility |
| Checkpoint Strategy | ✅ Correct | Aligns with current 60-second flush |
| tRPC Integration | ✅ Correct | Use existing routers |
| Database-Independent Core | ✅ Correct | `@repo/core` already follows this |

---

## 4. Profile Metrics Integration

### 4.1 Why Profile Metrics Matter for FIT Migration

FIT files support **User Profile Messages** and **Device Info Messages**, but they don't inherently support temporal lookups. GradientPeak's profile metrics system enables:

1. **Historical TSS Calculations**: Calculate TSS for old activities using FTP at activity date
2. **Weight-Adjusted Metrics**: Power-to-weight ratios using weight at activity date
3. **Zone Accuracy**: HR zones calculated using LTHR at activity date
4. **Trend Analysis**: Track performance changes over time

### 4.2 FIT File + Profile Metrics Workflow

```
1. Record activity with FIT encoder
   - Write UserProfileMesg with current FTP/weight/max_hr

2. Upload FIT file to Supabase Storage

3. Background worker analyzes FIT file
   - Extract session data
   - Query profile_performance_metric_logs.getAtDate(ftp, activity.started_at)
   - Query profile_metric_logs.getAtDate(weight, activity.started_at)

4. Calculate metrics using historical values
   - TSS = f(normalizedPower, duration, FTP_at_date)
   - Power-to-weight = avgPower / weight_at_date

5. Store calculated metrics in activity record
   - metrics JSONB
   - hr_zone_seconds, power_zone_seconds
```

### 4.3 FIT File Structure for Profile Data

**UserProfileMesg Fields (Written at Recording Start):**
```typescript
const userProfileMesg = new Fit.UserProfileMesg();
userProfileMesg.setWeight(profile.weight_kg); // Current weight
userProfileMesg.setAge(profile.age);
userProfileMesg.setGender(profile.gender === 'male' ? Fit.Gender.MALE : Fit.Gender.FEMALE);

// IMPORTANT: Write current FTP/LTHR for reference
userProfileMesg.setFunctionalThresholdPower(profile.ftp); // Current FTP
userProfileMesg.setMaxHeartRate(profile.max_heart_rate); // Current max HR
```

**Session Summary (Written at Recording End):**
```typescript
const sessionMesg = new Fit.SessionMesg();
// ... standard session fields ...

// Custom Developer Fields (Optional - for future use)
// sessionMesg.setDeveloperField('historical_ftp', ftp_at_date);
// sessionMesg.setDeveloperField('historical_weight', weight_at_date);
```

### 4.4 Temporal Lookup Implementation

**Scenario:** User records activity on Jan 15, 2026

**Step 1: FIT file written with current metrics**
```typescript
// At recording start (Jan 15)
const userProfileMesg = new Fit.UserProfileMesg();
userProfileMesg.setFunctionalThresholdPower(260); // Current FTP as of Jan 15
```

**Step 2: Background worker calculates historical metrics**
```typescript
// Background worker processing FIT file
const activityDate = session.start_time; // Jan 15, 2026

// Query historical FTP (what was FTP on Jan 15?)
const ftpAtDate = await trpc.profilePerformanceMetrics.getAtDate.query({
  category: 'bike',
  type: 'ftp',
  date: activityDate,
});
// Returns: 260W (if FTP was set before Jan 15)

// Query historical weight
const weightAtDate = await trpc.profileMetrics.getAtDate.query({
  metricType: 'weight',
  date: activityDate,
});
// Returns: 75kg (most recent weight log before Jan 15)

// Calculate TSS using historical FTP
const tss = calculateTSS({
  normalizedPower: 250,
  duration: 3600,
  ftp: ftpAtDate, // 260W
});

// Calculate power-to-weight using historical weight
const powerToWeight = avgPower / weightAtDate; // W/kg
```

**Step 3: Store metrics in activity record**
```typescript
await db.activities.update({
  id: activityId,
  metrics: {
    tss, // Calculated with historical FTP
    intensity_factor,
    normalized_power,
    power_to_weight, // Calculated with historical weight
    // ... other metrics
  },
  profile_snapshot: {
    // Snapshot of profile at activity date
    ftp: ftpAtDate,
    weight: weightAtDate,
    lthr: lthrAtDate,
    max_heart_rate: maxHrAtDate,
  },
});
```

### 4.5 Profile Snapshot Strategy

**Current Implementation:**
- `activities.profile_snapshot` (JSONB) stores profile state at activity time
- Ensures historical calculations remain consistent even if profile changes

**FIT Migration Strategy:**
1. **Maintain profile_snapshot** for backward compatibility
2. **Query temporal metrics** for accurate calculations
3. **Store reference in FIT file** for portability

**Example profile_snapshot:**
```json
{
  "ftp": 260,
  "lthr": 170,
  "max_heart_rate": 190,
  "weight_kg": 75,
  "resting_hr": 48,
  "age": 35,
  "gender": "male"
}
```

---

## 5. Implementation Phases

### Phase 0: Pre-Implementation (1-2 days)

**Objectives:**
- Download Garmin FIT SDK
- Set up Supabase Storage bucket
- Create database migrations
- Set up workers package

**Tasks:**
1. ✅ Download FIT SDK from https://developer.garmin.com/fit/download/
   - Extract JavaScript SDK to `apps/mobile/lib/fit-sdk/fit.js`
   - Create TypeScript declarations if needed

2. ✅ Create Supabase Storage bucket
   ```sql
   -- Create bucket
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('activity-files', 'activity-files', false);

   -- Create RLS policies
   CREATE POLICY "Users can upload their own activity files"
   ON storage.objects FOR INSERT
   WITH CHECK (
     bucket_id = 'activity-files' AND
     (storage.foldername(name))[1] = auth.uid()::text
   );

   CREATE POLICY "Users can read their own activity files"
   ON storage.objects FOR SELECT
   USING (
     bucket_id = 'activity-files' AND
     (storage.foldername(name))[1] = auth.uid()::text
   );
   ```

3. ✅ Create database migration for new fields
   ```sql
   -- Add FIT file path to activities table
   ALTER TABLE activities
   ADD COLUMN fit_file_path TEXT,
   ADD COLUMN processing_status TEXT DEFAULT 'PENDING'
     CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));

   CREATE INDEX idx_activities_processing_status
   ON activities(processing_status, created_at)
   WHERE processing_status != 'COMPLETED';
   ```

4. ✅ Create workers package structure
   ```bash
   mkdir -p packages/workers/src/jobs
   mkdir -p packages/workers/src/lib
   cd packages/workers
   pnpm init
   pnpm add bullmq ioredis @supabase/supabase-js
   pnpm add -D @types/node typescript
   ```

5. ✅ Install mobile dependencies
   ```bash
   cd apps/mobile
   pnpm add uuid @types/node
   ```

---

### Phase 1: Mobile FIT Encoder (3-5 days)

**Objectives:**
- Create `StreamingFitEncoder` service
- Replace `StreamBuffer` with FIT encoding
- Maintain checkpoint strategy
- Preserve crash recovery

**Critical Path:**
```
StreamBuffer.ts (current) → StreamingFitEncoder.ts (new)
                              ↓
                   Uses Garmin FIT SDK
                              ↓
           Writes FIT file incrementally
                              ↓
                Checkpoint every 60 seconds
```

#### 1.1 Create StreamingFitEncoder Service

**File:** `apps/mobile/lib/services/fit/StreamingFitEncoder.ts`

**Implementation Strategy:**
- Follow plan.md structure (lines 159-726)
- **MODIFY** to use profile metrics for UserProfileMesg
- **ADD** error handling and validation
- **ADD** pause/resume timer support

**Key Methods:**
```typescript
class StreamingFitEncoder {
  async start(metadata: ActivityMetadata): Promise<void>
  async addSample(sample: SensorSample): Promise<void>
  async pauseTimer(): Promise<void>
  async resumeTimer(): Promise<void>
  async finish(): Promise<string> // Returns FIT file path
  private async checkpoint(): Promise<void>
  private calculateSessionSummary(endTime: Date): SessionSummary
}
```

**Integration Points:**
1. Query current profile metrics at recording start
2. Write UserProfileMesg with current FTP/weight/max_hr
3. Store FIT file path in checkpoint metadata
4. Handle crash recovery by reading checkpoint metadata

#### 1.2 Modify ActivityRecorderService

**File:** `apps/mobile/lib/services/ActivityRecorder/index.ts`

**Changes:**
```typescript
// BEFORE (current)
private streamBuffer: StreamBuffer;

constructor() {
  this.streamBuffer = new StreamBuffer();
}

// AFTER (new)
private fitEncoder: StreamingFitEncoder | null = null;

constructor(private profile: Profile) {
  // Profile passed in constructor for UserProfileMesg
}

async start(activity: Activity) {
  // Create FIT encoder
  this.fitEncoder = new StreamingFitEncoder(this.profile);

  await this.fitEncoder.start({
    sport: activity.type,
    subSport: activity.subType,
    indoor: activity.location === 'indoor',
  });

  // Start existing managers
  await this.liveMetricsManager.startRecording();
  // ...
}
```

**Deprecate:**
- ❌ `StreamBuffer.ts` - Replaced by `StreamingFitEncoder.ts`
- ❌ `StreamBuffer.flushToFiles()` - Replaced by `fitEncoder.checkpoint()`
- ❌ `StreamBuffer.aggregateChunks()` - Not needed with FIT encoding

#### 1.3 Update LiveMetricsManager

**File:** `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts`

**Changes:**
```typescript
// Modify ingestSensorData to write to FIT encoder
async ingestSensorData(reading: SensorReading) {
  // Accumulate for metrics calculation (unchanged)
  this.dataBuffer.push(reading);

  // NEW: Write to FIT encoder
  if (this.fitEncoder && !this.paused) {
    await this.fitEncoder.addSample({
      timestamp: new Date(reading.timestamp),
      position_lat: reading.latitude,
      position_long: reading.longitude,
      distance: reading.distance,
      altitude: reading.altitude,
      speed: reading.speed,
      heart_rate: reading.heartRate,
      cadence: reading.cadence,
      power: reading.power,
      temperature: reading.temperature,
    });
  }

  // Existing metrics calculation (unchanged)
  // ...
}
```

#### 1.4 Testing Strategy for Phase 1

**Unit Tests:**
```typescript
// apps/mobile/lib/services/fit/__tests__/StreamingFitEncoder.test.ts

describe('StreamingFitEncoder', () => {
  it('should write File ID as first message', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    await encoder.start(mockMetadata);

    const messages = extractMessages(encoder);
    expect(messages[0].name).toBe('file_id');
  });

  it('should write Timer Start before first Record', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    await encoder.start(mockMetadata);
    await encoder.addSample(mockSample);

    const messages = extractMessages(encoder);
    const timerStartIndex = messages.findIndex(m =>
      m.name === 'event' && m.event === Fit.Event.TIMER
    );
    const firstRecordIndex = messages.findIndex(m =>
      m.name === 'record'
    );

    expect(timerStartIndex).toBeLessThan(firstRecordIndex);
  });

  it('should checkpoint every 100 samples', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    const checkpointSpy = jest.spyOn(encoder as any, 'checkpoint');

    await encoder.start(mockMetadata);
    for (let i = 0; i < 100; i++) {
      await encoder.addSample(mockSample);
    }

    expect(checkpointSpy).toHaveBeenCalled();
  });
});
```

**Integration Tests:**
```typescript
// apps/mobile/lib/services/ActivityRecorder/__tests__/integration.test.ts

describe('ActivityRecorder + FIT Integration', () => {
  it('should record 30-second activity and generate valid FIT file', async () => {
    const service = new ActivityRecorderService(mockProfile);

    await service.start(mockActivity);
    await service.startRecording();

    // Simulate 30 seconds of data
    for (let i = 0; i < 30; i++) {
      await service.ingestSensorData(generateMockReading(i));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const fitFilePath = await service.finishRecording();

    // Validate FIT file
    const fitBytes = await FileSystem.readAsStringAsync(fitFilePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const decoder = new Fit.Decode();
    expect(decoder.isFit(base64ToBytes(fitBytes))).toBe(true);
    expect(decoder.checkIntegrity(base64ToBytes(fitBytes))).toBe(true);
  });
});
```

---

### Phase 2: Backend FIT Upload & Storage (2-3 days)

**Objectives:**
- Create FIT file uploader service
- Add tRPC procedures for signed URLs
- Upload FIT files to Supabase Storage
- Create activity record with pending status

#### 2.1 Create FitUploader Service

**File:** `apps/mobile/lib/services/fit/FitUploader.ts`

**Implementation:**
- Follow plan.md structure (lines 729-814)
- **ADD** retry logic for failed uploads
- **ADD** progress tracking for large files
- **ADD** cleanup of local files after upload

**Key Methods:**
```typescript
class FitUploader {
  async uploadActivity(fitFilePath: string): Promise<string> // Returns activityId
  private base64ToArrayBuffer(base64: string): ArrayBuffer
}
```

#### 2.2 Add tRPC Procedures

**File:** `packages/trpc/src/routers/activities.ts`

**New Procedures:**
```typescript
export const activitiesRouter = router({
  // Existing procedures...

  /**
   * Request signed upload URL for FIT file
   */
  requestFitUploadUrl: protectedProcedure
    .input(z.object({
      filename: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const profileId = ctx.session.user.id;
      const activityId = generateUUID();
      const storagePath = `${profileId}/${activityId}.fit`;

      // Generate signed upload URL (expires in 5 minutes)
      const { signedUrl } = await ctx.supabase.storage
        .from('activity-files')
        .createSignedUploadUrl(storagePath);

      // Create pending activity record
      await ctx.db.activities.insert({
        id: activityId,
        profile_id: profileId,
        fit_file_path: storagePath,
        processing_status: 'PENDING',
        name: 'Processing...', // Temporary name
      });

      return {
        uploadUrl: signedUrl,
        storagePath,
        activityId,
      };
    }),

  /**
   * Finalize upload and trigger background processing
   */
  finalizeUpload: protectedProcedure
    .input(z.object({
      activityId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Enqueue background job
      await ctx.queue.add('analyze-fit', {
        activityId: input.activityId,
      });

      return { success: true };
    }),
});
```

#### 2.3 Modify Recording Submission Flow

**File:** `apps/mobile/app/(internal)/submit-activity.tsx`

**Changes:**
```typescript
// BEFORE (current)
const handleSubmit = async (data: ActivityInput) => {
  // Compress streams
  const compressedStreams = compressActivityStreams(streamBuffer);

  // Upload
  await trpc.activities.createWithStreams.mutate({
    activity: data,
    streams: compressedStreams,
  });
};

// AFTER (new)
const handleSubmit = async (data: ActivityInput) => {
  // Upload FIT file
  const uploader = new FitUploader();
  const activityId = await uploader.uploadActivity(fitFilePath);

  // Activity record created with PENDING status
  // Background worker will process and update

  router.push('/(internal)/(tabs)/activities');
};
```

---

### Phase 3: Background Worker & FIT Analysis (3-4 days)

**Objectives:**
- Create BullMQ worker for FIT processing
- Decode FIT files using Garmin SDK
- Query profile metrics at activity date
- Calculate performance metrics
- Update activity record

#### 3.1 Create Workers Package

**File:** `packages/workers/package.json`
```json
{
  "name": "@repo/workers",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.2",
    "@supabase/supabase-js": "^2.39.0",
    "@mapbox/polyline": "^1.2.1",
    "@repo/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.9.2",
    "tsx": "^4.7.0"
  }
}
```

#### 3.2 Create analyzeFit Job

**File:** `packages/workers/src/jobs/analyzeFit.ts`

**Implementation:**
- Follow plan.md structure (lines 816-1099)
- **ADD** temporal profile metrics queries
- **ADD** error handling and retry logic
- **ADD** profile_snapshot creation

**Key Implementation:**
```typescript
export async function analyzeFit(job: Job<AnalyzeFitPayload>) {
  const { activityId } = job.data;

  try {
    // Update status
    await updateStatus(activityId, 'PROCESSING');

    // 1. Fetch activity to get fit_file_path
    const activity = await getActivity(activityId);

    // 2. Download FIT file from Supabase Storage
    const fitData = await downloadFitFile(activity.fit_file_path);

    // 3. Decode FIT file using Garmin SDK
    const decoder = new Fit.Decode();
    if (!decoder.isFit(fitData)) throw new Error('Invalid FIT file');
    if (!decoder.checkIntegrity(fitData)) throw new Error('CRC check failed');

    const decodedFit = decoder.decode(fitData);

    // 4. Extract messages
    const session = decodedFit.messages.find(m => m.name === 'session');
    const recordMessages = decodedFit.messages.filter(m => m.name === 'record');

    // 5. Query profile metrics at activity date
    const activityDate = fitTimestampToDate(session.start_time);

    const ftpAtDate = await queryProfilePerformanceMetric({
      profileId: activity.profile_id,
      category: 'bike',
      type: 'ftp',
      date: activityDate,
    });

    const weightAtDate = await queryProfileMetric({
      profileId: activity.profile_id,
      metricType: 'weight',
      date: activityDate,
    });

    const lthrAtDate = await queryProfilePerformanceMetric({
      profileId: activity.profile_id,
      category: 'bike',
      type: 'lthr',
      date: activityDate,
    });

    // 6. Extract sensor data
    const powerSamples = recordMessages
      .map(r => r.power)
      .filter(p => p !== undefined);

    const hrSamples = recordMessages
      .map(r => r.heart_rate)
      .filter(hr => hr !== undefined);

    const gpsPoints = recordMessages
      .filter(r => r.position_lat && r.position_long)
      .map(r => [
        semicirclesToDegrees(r.position_lat),
        semicirclesToDegrees(r.position_long),
      ]);

    // 7. Calculate metrics using historical values
    const normalizedPower = calculateNormalizedPower(powerSamples, 30);
    const intensityFactor = calculateIntensityFactor(normalizedPower, ftpAtDate);
    const tss = calculateTSS(
      session.total_elapsed_time,
      normalizedPower,
      intensityFactor,
      ftpAtDate
    );

    const hrZones = calculateHrZones(hrSamples, lthrAtDate, maxHrAtDate);
    const powerZones = calculatePowerZones(powerSamples, ftpAtDate);

    // 8. Generate polyline
    const encodedPolyline = polyline.encode(gpsPoints);

    // 9. Update activity record
    await updateActivity(activityId, {
      name: session.name || `${activityType} Activity`,
      type: mapFitSportType(session.sport),
      started_at: fitTimestampToIso(session.start_time),
      finished_at: fitTimestampToIso(session.timestamp),
      distance_meters: session.total_distance,
      duration_seconds: Math.round(session.total_elapsed_time),
      moving_seconds: Math.round(session.total_timer_time),
      elevation_gain_meters: session.total_ascent,
      metrics: {
        tss,
        intensity_factor: intensityFactor,
        normalized_power: normalizedPower,
        avg_heart_rate: session.avg_heart_rate,
        max_heart_rate: session.max_heart_rate,
        avg_power: session.avg_power,
        max_power: session.max_power,
        avg_cadence: session.avg_cadence,
        polyline: encodedPolyline,
        total_calories: session.total_calories,
      },
      hr_zone_seconds: hrZones,
      power_zone_seconds: powerZones,
      profile_snapshot: {
        ftp: ftpAtDate,
        lthr: lthrAtDate,
        weight_kg: weightAtDate,
        // ... other profile fields
      },
      processing_status: 'COMPLETED',
    });

    console.log(`✅ Activity processed: ${activityId}`);

  } catch (error) {
    console.error(`❌ Processing failed: ${activityId}`, error);
    await updateStatus(activityId, 'FAILED');
    throw error; // Trigger retry
  }
}
```

#### 3.3 Create Worker Orchestrator

**File:** `packages/workers/src/index.ts`
```typescript
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { analyzeFit } from './jobs/analyzeFit';

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'activity-processing',
  async (job) => {
    switch (job.name) {
      case 'analyze-fit':
        return await analyzeFit(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5, // Process 5 activities concurrently
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  }
);

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});

console.log('🚀 Worker started - listening for jobs...');
```

---

### Phase 4: Database Schema Updates (1 day)

**Objectives:**
- Add `fit_file_path` and `processing_status` columns
- Deprecate `activity_streams` table (keep for migration)
- Create indexes for performance

#### 4.1 Create Migration

**File:** `packages/supabase/migrations/20260120_add_fit_file_support.sql`

```sql
-- Add FIT file support to activities table
ALTER TABLE activities
ADD COLUMN fit_file_path TEXT,
ADD COLUMN processing_status TEXT DEFAULT 'COMPLETED'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));

-- Create index for processing queue
CREATE INDEX idx_activities_processing_status
ON activities(processing_status, created_at)
WHERE processing_status IN ('PENDING', 'PROCESSING');

-- Add comments
COMMENT ON COLUMN activities.fit_file_path IS 'Path to FIT file in Supabase Storage (e.g., profile_id/activity_id.fit)';
COMMENT ON COLUMN activities.processing_status IS 'Status of background FIT file processing';

-- Update existing activities to COMPLETED status
UPDATE activities
SET processing_status = 'COMPLETED'
WHERE processing_status IS NULL;

-- Mark activity_streams table as deprecated (keep for migration)
COMMENT ON TABLE activity_streams IS 'DEPRECATED: Used for legacy compressed JSON streams. New activities use FIT files. Keep for historical data.';
```

#### 4.2 Update Database Types

**File:** `packages/supabase/database.types.ts`

**Add types:**
```typescript
export interface Activity {
  // ... existing fields
  fit_file_path: string | null;
  processing_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}
```

---

### Phase 5: Mobile UI Updates (2 days)

**Objectives:**
- Show processing state in activity list
- Add retry button for failed uploads
- Update recording submission flow

#### 5.1 Update Activity List

**File:** `apps/mobile/app/(internal)/(tabs)/activities.tsx`

**Changes:**
```typescript
function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <View className="bg-card border-border border rounded-lg p-4">
      <Text className="text-foreground font-semibold">{activity.name}</Text>

      {activity.processing_status === 'PENDING' && (
        <View className="flex-row items-center mt-2">
          <Spinner size="small" />
          <Text className="text-muted-foreground ml-2">Processing...</Text>
        </View>
      )}

      {activity.processing_status === 'FAILED' && (
        <View className="flex-row items-center mt-2">
          <Icon as={AlertCircle} className="text-destructive" />
          <Text className="text-destructive ml-2">Processing failed</Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => retryProcessing(activity.id)}
          >
            <Text className="text-foreground">Retry</Text>
          </Button>
        </View>
      )}
    </View>
  );
}
```

#### 5.2 Update Submit Activity Screen

**File:** `apps/mobile/app/(internal)/submit-activity.tsx`

**Changes:**
```typescript
const submitMutation = trpc.activities.finalizeUpload.useMutation({
  onSuccess: () => {
    toast.success('Activity uploaded! Processing in background...');
    router.push('/(internal)/(tabs)/activities');
  },
  onError: (error) => {
    toast.error(`Upload failed: ${error.message}`);
  },
});

const handleSubmit = async (data: ActivityInput) => {
  try {
    // Upload FIT file
    setUploading(true);
    const uploader = new FitUploader();
    const activityId = await uploader.uploadActivity(fitFilePath);

    // Finalize and trigger processing
    await submitMutation.mutateAsync({ activityId });

  } catch (error) {
    console.error('Upload error:', error);
    toast.error('Upload failed. Activity saved locally.');
  } finally {
    setUploading(false);
  }
};
```

---

### Phase 6: Historical Data Migration (2-3 days)

**Objectives:**
- Create one-time migration script
- Convert existing activity_streams to FIT files
- Backfill fit_file_path for old activities

#### 6.1 Create Migration Script

**File:** `packages/workers/src/migrations/migrateActivitiesToFit.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import Fit from '../lib/fit-sdk/fit';
import { decompressStream } from '@repo/core/utils/streamDecompression';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Migrate historical activities from compressed JSON streams to FIT files
 */
export async function migrateActivitiesToFit() {
  console.log('🔄 Starting historical activity migration...');

  // Fetch all activities without FIT files
  const { data: activities } = await supabase
    .from('activities')
    .select('id, profile_id, started_at, finished_at, metrics')
    .is('fit_file_path', null)
    .order('started_at', { ascending: true });

  console.log(`📊 Found ${activities?.length || 0} activities to migrate`);

  for (const activity of activities || []) {
    try {
      console.log(`\n📝 Migrating activity ${activity.id}...`);

      // 1. Fetch all streams for this activity
      const { data: streams } = await supabase
        .from('activity_streams')
        .select('*')
        .eq('activity_id', activity.id);

      if (!streams || streams.length === 0) {
        console.log(`⚠️  No streams found - skipping`);
        continue;
      }

      // 2. Decompress all streams
      const decompressedStreams = streams.map(stream => ({
        type: stream.type,
        values: decompressStream(stream.compressed_values, stream.data_type),
        timestamps: decompressStream(stream.compressed_timestamps, 'float'),
      }));

      // 3. Build FIT file from streams
      const fitFile = await buildFitFileFromStreams({
        activity,
        streams: decompressedStreams,
      });

      // 4. Upload FIT file to Supabase Storage
      const storagePath = `${activity.profile_id}/${activity.id}.fit`;

      const { error: uploadError } = await supabase.storage
        .from('activity-files')
        .upload(storagePath, fitFile, {
          contentType: 'application/vnd.ant.fit',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 5. Update activity record
      await supabase
        .from('activities')
        .update({
          fit_file_path: storagePath,
          processing_status: 'COMPLETED',
        })
        .eq('id', activity.id);

      console.log(`✅ Migrated: ${activity.id}`);

    } catch (error) {
      console.error(`❌ Failed to migrate ${activity.id}:`, error);

      // Mark as failed but continue
      await supabase
        .from('activities')
        .update({ processing_status: 'FAILED' })
        .eq('id', activity.id);
    }
  }

  console.log('\n✅ Migration complete!');
}

/**
 * Build FIT file from decompressed streams
 */
async function buildFitFileFromStreams(params: {
  activity: Activity;
  streams: DecompressedStream[];
}): Promise<Buffer> {
  const { activity, streams } = params;

  // Create encoder
  const encoder = new Fit.Encode(Fit.ProtocolVersion.V20);

  // Write File ID
  const fileIdMesg = new Fit.FileIdMesg();
  fileIdMesg.setType(Fit.File.ACTIVITY);
  fileIdMesg.setManufacturer(Fit.Manufacturer.DEVELOPMENT);
  fileIdMesg.setProduct(0);
  fileIdMesg.setTimeCreated(dateToFitTimestamp(activity.started_at));
  encoder.write(fileIdMesg);

  // Write Record messages from streams
  const timestamps = streams.find(s => s.type === 'time')?.timestamps || [];

  for (let i = 0; i < timestamps.length; i++) {
    const recordMesg = new Fit.RecordMesg();
    recordMesg.setTimestamp(timestamps[i]);

    // Add all stream data for this timestamp
    streams.forEach(stream => {
      switch (stream.type) {
        case 'heartrate':
          recordMesg.setHeartRate(stream.values[i]);
          break;
        case 'power':
          recordMesg.setPower(stream.values[i]);
          break;
        case 'cadence':
          recordMesg.setCadence(stream.values[i]);
          break;
        case 'speed':
          recordMesg.setSpeed(stream.values[i]);
          break;
        case 'latlng':
          const [lat, lng] = stream.values[i];
          recordMesg.setPositionLat(degreesToSemicircles(lat));
          recordMesg.setPositionLong(degreesToSemicircles(lng));
          break;
        case 'altitude':
          recordMesg.setAltitude(stream.values[i]);
          break;
        case 'distance':
          recordMesg.setDistance(stream.values[i]);
          break;
      }
    });

    encoder.write(recordMesg);
  }

  // Write Lap message
  const lapMesg = new Fit.LapMesg();
  lapMesg.setMessageIndex(0);
  lapMesg.setStartTime(dateToFitTimestamp(activity.started_at));
  lapMesg.setTimestamp(dateToFitTimestamp(activity.finished_at));
  lapMesg.setTotalElapsedTime(activity.duration_seconds);
  lapMesg.setTotalTimerTime(activity.moving_seconds);
  lapMesg.setTotalDistance(activity.distance_meters);
  encoder.write(lapMesg);

  // Write Session message
  const sessionMesg = new Fit.SessionMesg();
  sessionMesg.setMessageIndex(0);
  sessionMesg.setStartTime(dateToFitTimestamp(activity.started_at));
  sessionMesg.setTimestamp(dateToFitTimestamp(activity.finished_at));
  sessionMesg.setSport(mapActivityTypeToFitSport(activity.type));
  sessionMesg.setTotalElapsedTime(activity.duration_seconds);
  sessionMesg.setTotalTimerTime(activity.moving_seconds);
  sessionMesg.setTotalDistance(activity.distance_meters);

  // Add metrics from activity.metrics JSONB
  if (activity.metrics.avg_heart_rate) {
    sessionMesg.setAvgHeartRate(activity.metrics.avg_heart_rate);
  }
  if (activity.metrics.max_heart_rate) {
    sessionMesg.setMaxHeartRate(activity.metrics.max_heart_rate);
  }
  if (activity.metrics.avg_power) {
    sessionMesg.setAvgPower(activity.metrics.avg_power);
  }
  if (activity.metrics.max_power) {
    sessionMesg.setMaxPower(activity.metrics.max_power);
  }

  encoder.write(sessionMesg);

  // Write Activity message
  const activityMesg = new Fit.ActivityMesg();
  activityMesg.setTimestamp(dateToFitTimestamp(activity.finished_at));
  activityMesg.setTotalTimerTime(activity.moving_seconds);
  activityMesg.setNumSessions(1);
  activityMesg.setType(Fit.Activity.MANUAL);
  activityMesg.setEvent(Fit.Event.ACTIVITY);
  activityMesg.setEventType(Fit.EventType.STOP);
  encoder.write(activityMesg);

  // Get encoded bytes
  const fitBytes = encoder.getBytes();
  return Buffer.from(fitBytes);
}
```

#### 6.2 Run Migration

```bash
# In packages/workers
pnpm run migrate:activities-to-fit

# Or via script
tsx src/migrations/migrateActivitiesToFit.ts
```

---

## 6. Deprecated Code Identification

### 6.1 Files to Deprecate

| File | Current Path | Status | Migration Path |
|------|-------------|--------|----------------|
| **StreamBuffer.ts** | `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts` | ⚠️  **DEPRECATE** | Replace with `StreamingFitEncoder.ts` |
| **Compression Utils** | `apps/mobile/lib/utils/streamCompression.ts` | ⚠️  **DEPRECATE** | No longer needed with FIT encoding |
| **Stream Upload Logic** | Various files with `createStreams` calls | ⚠️  **DEPRECATE** | Replace with FIT upload |

### 6.2 Database Tables to Keep (With Deprecation Notice)

| Table | Status | Reason |
|-------|--------|--------|
| **activity_streams** | 🔒 **KEEP (Read-Only)** | Historical data - needed for migration and legacy activities |
| **activities** | ✅ **KEEP (Active)** | Core table - add new FIT-related columns |
| **profile_metric_logs** | ✅ **KEEP (Active)** | Critical for temporal metrics |
| **profile_performance_metric_logs** | ✅ **KEEP (Active)** | Critical for temporal performance metrics |

### 6.3 Code Patterns to Refactor

#### Pattern 1: Stream Compression

**BEFORE:**
```typescript
// Compress streams before upload
const compressedStreams = await compressStreams(streamBuffer.getAllStreams());

await trpc.activities.createWithStreams.mutate({
  activity: activityData,
  streams: compressedStreams,
});
```

**AFTER:**
```typescript
// Upload FIT file
const uploader = new FitUploader();
const activityId = await uploader.uploadActivity(fitFilePath);

await trpc.activities.finalizeUpload.mutate({ activityId });
```

#### Pattern 2: Stream Buffer Usage

**BEFORE:**
```typescript
// Write to stream buffer
this.streamBuffer.addSample({
  type: 'heartrate',
  value: reading.heartRate,
  timestamp: reading.timestamp,
});

// Flush every 60 seconds
await this.streamBuffer.flushToFiles();
```

**AFTER:**
```typescript
// Write to FIT encoder
await this.fitEncoder.addSample({
  timestamp: new Date(reading.timestamp),
  heart_rate: reading.heartRate,
  // ... other fields
});

// Checkpoint handled automatically every 60 seconds
```

#### Pattern 3: Activity Creation

**BEFORE:**
```typescript
const { data: activity } = await trpc.activities.createWithStreams.mutate({
  activity: {
    name: 'Morning Run',
    type: 'run',
    started_at: startTime,
    finished_at: endTime,
    duration_seconds: duration,
  },
  streams: compressedStreams,
});
```

**AFTER:**
```typescript
// FIT file uploaded and activity created with PENDING status
const activityId = await uploader.uploadActivity(fitFilePath);

// Background worker processes FIT file and updates activity
// Activity visible immediately with "Processing..." state
```

### 6.4 Deprecation Timeline

| Phase | Timeframe | Action |
|-------|-----------|--------|
| **Phase 1-5** | Weeks 1-3 | Implement FIT encoding alongside existing stream system |
| **Phase 6** | Week 4 | Run historical data migration |
| **Phase 7** | Week 5 | Monitor new activities, ensure FIT workflow stable |
| **Phase 8** | Week 6+ | Mark deprecated files with `@deprecated` comments |
| **Phase 9** | Month 3+ | Remove deprecated code after 90-day grace period |

### 6.5 Deprecation Warnings

Add deprecation comments to files:

**File:** `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts`
```typescript
/**
 * @deprecated This class is deprecated and will be removed in v2.0.
 * Use StreamingFitEncoder instead for FIT file-based recording.
 *
 * See migration guide: /docs/migration/fit-encoding.md
 */
export class StreamBuffer {
  // ... existing implementation
}
```

**File:** `packages/trpc/src/routers/activities.ts`
```typescript
/**
 * @deprecated This procedure is deprecated and will be removed in v2.0.
 * Use requestFitUploadUrl + finalizeUpload instead.
 */
createWithStreams: protectedProcedure
  .input(createWithStreamsSchema)
  .mutation(async ({ input, ctx }) => {
    // ... existing implementation
  }),
```

---

## 7. Database Schema Changes

### 7.1 Required Migrations

**File:** `packages/supabase/migrations/20260120_add_fit_file_support.sql`

```sql
-- ============================================================================
-- Migration: Add FIT File Support to Activities
-- ============================================================================

BEGIN;

-- Add FIT file support columns
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS fit_file_path TEXT,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'COMPLETED'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));

-- Add column comments
COMMENT ON COLUMN activities.fit_file_path IS 'Path to FIT file in Supabase Storage bucket activity-files (format: profile_id/activity_id.fit)';
COMMENT ON COLUMN activities.processing_status IS 'Status of background FIT file processing. PENDING = uploaded, PROCESSING = analyzing, COMPLETED = done, FAILED = error';

-- Create index for processing queue (only for pending/processing activities)
CREATE INDEX IF NOT EXISTS idx_activities_processing_status
ON activities(processing_status, created_at)
WHERE processing_status IN ('PENDING', 'PROCESSING');

-- Create index for FIT file path lookups
CREATE INDEX IF NOT EXISTS idx_activities_fit_file_path
ON activities(fit_file_path)
WHERE fit_file_path IS NOT NULL;

-- Update existing activities to COMPLETED status
UPDATE activities
SET processing_status = 'COMPLETED'
WHERE processing_status IS NULL;

-- Mark activity_streams table as deprecated
COMMENT ON TABLE activity_streams IS 'DEPRECATED (2026-01-20): This table stores legacy compressed JSON streams. New activities (2026-01-20+) use FIT files stored in Supabase Storage. Historical data will be migrated. DO NOT use for new activities.';

-- Add trigger to prevent new streams being created
CREATE OR REPLACE FUNCTION prevent_new_activity_streams()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_streams table is deprecated. Use FIT file upload instead.';
END;
$$ LANGUAGE plpgsql;

-- Note: Commented out to allow migration to complete
-- Uncomment after migration is done
-- CREATE TRIGGER trg_prevent_new_activity_streams
-- BEFORE INSERT ON activity_streams
-- FOR EACH ROW
-- EXECUTE FUNCTION prevent_new_activity_streams();

COMMIT;
```

### 7.2 Rollback Migration (If Needed)

**File:** `packages/supabase/migrations/20260120_rollback_fit_file_support.sql`

```sql
-- ============================================================================
-- Rollback: Remove FIT File Support
-- ============================================================================

BEGIN;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_prevent_new_activity_streams ON activity_streams;
DROP FUNCTION IF EXISTS prevent_new_activity_streams();

-- Drop indexes
DROP INDEX IF EXISTS idx_activities_processing_status;
DROP INDEX IF EXISTS idx_activities_fit_file_path;

-- Remove columns
ALTER TABLE activities
DROP COLUMN IF EXISTS fit_file_path,
DROP COLUMN IF EXISTS processing_status;

-- Remove comments
COMMENT ON TABLE activity_streams IS NULL;

COMMIT;
```

### 7.3 Supabase Storage Setup

**Create Bucket (Supabase Dashboard or SQL):**

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-files',
  'activity-files',
  false, -- Not public
  10485760, -- 10MB max file size
  ARRAY['application/vnd.ant.fit']
);

-- Create RLS policy: Users can upload their own files
CREATE POLICY "Users can upload their own activity FIT files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'activity-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create RLS policy: Users can read their own files
CREATE POLICY "Users can read their own activity FIT files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'activity-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create RLS policy: Users can delete their own files
CREATE POLICY "Users can delete their own activity FIT files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'activity-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

**Storage Path Format:**
```
activity-files/
├── {profile_id_1}/
│   ├── {activity_id_1}.fit
│   ├── {activity_id_2}.fit
│   └── {activity_id_3}.fit
├── {profile_id_2}/
│   ├── {activity_id_4}.fit
│   └── {activity_id_5}.fit
```

---

## 8. File-by-File Implementation Guide

### 8.1 Mobile App Files

#### File 1: `apps/mobile/lib/fit-sdk/fit.js`
**Action:** Add (from Garmin FIT SDK)
**Steps:**
1. Download FIT SDK from https://developer.garmin.com/fit/download/
2. Extract `javascript/fit.js` from SDK
3. Copy to `apps/mobile/lib/fit-sdk/fit.js`
4. Create TypeScript declarations if needed

**Verification:**
```typescript
import Fit from '@/lib/fit-sdk/fit';

console.log(Fit.Encode); // Should be defined
console.log(Fit.Decode); // Should be defined
console.log(Fit.FileIdMesg); // Should be defined
```

---

#### File 2: `apps/mobile/lib/services/fit/StreamingFitEncoder.ts`
**Action:** Create
**Implementation:** Follow plan.md lines 159-726 with modifications
**Dependencies:**
- `@/lib/fit-sdk/fit`
- `expo-file-system`
- `uuid`

**Key Modifications from plan.md:**
1. Add profile metrics integration
2. Add proper error handling
3. Add pause/resume support
4. Add checkpoint metadata

**Testing:**
```bash
cd apps/mobile
pnpm test lib/services/fit/__tests__/StreamingFitEncoder.test.ts
```

---

#### File 3: `apps/mobile/lib/services/fit/FitUploader.ts`
**Action:** Create
**Implementation:** Follow plan.md lines 729-814
**Dependencies:**
- `expo-file-system`
- `@/lib/trpc`

**Testing:**
```bash
cd apps/mobile
pnpm test lib/services/fit/__tests__/FitUploader.test.ts
```

---

#### File 4: `apps/mobile/lib/services/ActivityRecorder/index.ts`
**Action:** Modify
**Changes:**
1. Add `fitEncoder: StreamingFitEncoder | null = null`
2. Replace `StreamBuffer` instantiation with `StreamingFitEncoder`
3. Update `start()` method to initialize FIT encoder
4. Update `finishRecording()` to return FIT file path
5. **Keep StreamBuffer temporarily** for rollback capability

**Diff Preview:**
```diff
+ import { StreamingFitEncoder } from '../fit/StreamingFitEncoder';

  export class ActivityRecorderService {
-   private streamBuffer: StreamBuffer;
+   private fitEncoder: StreamingFitEncoder | null = null;
+   private streamBuffer: StreamBuffer; // Keep temporarily

    constructor(private profile: Profile) {
      this.streamBuffer = new StreamBuffer(); // Keep temporarily
    }

    async start(activity: Activity) {
+     // Initialize FIT encoder
+     this.fitEncoder = new StreamingFitEncoder(this.profile);
+     await this.fitEncoder.start({
+       sport: activity.type,
+       subSport: activity.subType,
+       indoor: activity.location === 'indoor',
+     });

      // Existing initialization
      await this.liveMetricsManager.startRecording();
      // ...
    }

    async finishRecording(): Promise<string> {
-     // Aggregate stream buffer chunks
-     const aggregated = await this.streamBuffer.aggregateChunks();
-     return aggregated;
+     // Finalize FIT file
+     if (!this.fitEncoder) throw new Error('FIT encoder not initialized');
+     const fitFilePath = await this.fitEncoder.finish();
+     return fitFilePath;
    }
  }
```

**Testing:**
```bash
cd apps/mobile
pnpm test lib/services/ActivityRecorder/__tests__/integration.test.ts
```

---

#### File 5: `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts`
**Action:** Modify
**Changes:**
1. Update `ingestSensorData()` to call `fitEncoder.addSample()`
2. Keep existing metrics calculation logic

**Diff Preview:**
```diff
  async ingestSensorData(reading: SensorReading) {
    // Accumulate for metrics calculation (unchanged)
    this.dataBuffer.push(reading);

+   // Write to FIT encoder
+   if (this.fitEncoder && !this.paused) {
+     await this.fitEncoder.addSample({
+       timestamp: new Date(reading.timestamp),
+       position_lat: reading.latitude,
+       position_long: reading.longitude,
+       distance: reading.distance,
+       altitude: reading.altitude,
+       speed: reading.speed,
+       heart_rate: reading.heartRate,
+       cadence: reading.cadence,
+       power: reading.power,
+       temperature: reading.temperature,
+     });
+   }

    // Existing metrics calculation (unchanged)
    // ...
  }
```

---

#### File 6: `apps/mobile/app/(internal)/submit-activity.tsx`
**Action:** Modify
**Changes:**
1. Replace stream compression logic with FIT upload
2. Update mutation to use `finalizeUpload`
3. Add loading state for upload

**Diff Preview:**
```diff
+ import { FitUploader } from '@/lib/services/fit/FitUploader';

  const handleSubmit = async (data: ActivityInput) => {
    try {
-     // Compress streams
-     const compressedStreams = await compressStreams(streamBuffer);
-
-     // Upload
-     await trpc.activities.createWithStreams.mutate({
-       activity: data,
-       streams: compressedStreams,
-     });

+     // Upload FIT file
+     setUploading(true);
+     const uploader = new FitUploader();
+     const activityId = await uploader.uploadActivity(fitFilePath);
+
+     // Finalize and trigger processing
+     await trpc.activities.finalizeUpload.mutate({ activityId });

      toast.success('Activity uploaded!');
      router.push('/(internal)/(tabs)/activities');

    } catch (error) {
      toast.error('Upload failed');
    } finally {
+     setUploading(false);
    }
  };
```

---

### 8.2 Backend Files

#### File 7: `packages/trpc/src/routers/activities.ts`
**Action:** Modify (Add new procedures)
**Changes:**
1. Add `requestFitUploadUrl` mutation
2. Add `finalizeUpload` mutation
3. **Keep** `createWithStreams` for backward compatibility

**New Procedures:**
```typescript
export const activitiesRouter = router({
  // ... existing procedures

  /**
   * Request signed upload URL for FIT file upload
   */
  requestFitUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const profileId = ctx.session.user.id;
      const activityId = generateUUID();
      const storagePath = `${profileId}/${activityId}.fit`;

      // Generate signed upload URL (5 minute expiry)
      const { data: signedUrlData, error } = await ctx.supabase.storage
        .from('activity-files')
        .createSignedUploadUrl(storagePath);

      if (error) throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to create upload URL: ${error.message}`,
      });

      // Create pending activity record
      const { error: insertError } = await ctx.supabase
        .from('activities')
        .insert({
          id: activityId,
          profile_id: profileId,
          fit_file_path: storagePath,
          processing_status: 'PENDING',
          name: 'Processing...', // Temporary placeholder
          type: 'other', // Will be updated by worker
          location: 'unknown',
        });

      if (insertError) throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to create activity: ${insertError.message}`,
      });

      return {
        uploadUrl: signedUrlData.signedUrl,
        storagePath,
        activityId,
      };
    }),

  /**
   * Finalize FIT file upload and trigger background processing
   */
  finalizeUpload: protectedProcedure
    .input(
      z.object({
        activityId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify activity belongs to user
      const { data: activity } = await ctx.supabase
        .from('activities')
        .select('id')
        .eq('id', input.activityId)
        .eq('profile_id', ctx.session.user.id)
        .single();

      if (!activity) throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Activity not found',
      });

      // Enqueue background job
      await ctx.queue.add('analyze-fit', {
        activityId: input.activityId,
      });

      return { success: true };
    }),

  // ... existing procedures
});
```

---

#### File 8: `packages/workers/src/jobs/analyzeFit.ts`
**Action:** Create
**Implementation:** Follow plan.md lines 816-1099 with modifications
**Dependencies:**
- `@supabase/supabase-js`
- `@repo/core` (calculations)
- `@mapbox/polyline`
- Garmin FIT SDK

**Key Modifications from plan.md:**
1. Add temporal profile metrics queries
2. Add profile_snapshot creation
3. Add proper error handling and retry logic

**Testing:**
```bash
cd packages/workers
pnpm test src/jobs/__tests__/analyzeFit.test.ts
```

---

#### File 9: `packages/workers/src/index.ts`
**Action:** Create
**Implementation:** BullMQ worker orchestrator
**Dependencies:**
- `bullmq`
- `ioredis`

---

#### File 10: `packages/workers/src/lib/profileMetrics.ts`
**Action:** Create (Helper functions)
**Purpose:** Query profile metrics at specific dates

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Query profile metric value at specific date
 * Returns most recent metric at or before the specified date
 */
export async function queryProfileMetric(params: {
  profileId: string;
  metricType: string;
  date: Date;
}): Promise<number | null> {
  const { data } = await supabase
    .from('profile_metric_logs')
    .select('value')
    .eq('profile_id', params.profileId)
    .eq('metric_type', params.metricType)
    .lte('recorded_at', params.date.toISOString())
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  return data?.value || null;
}

/**
 * Query profile performance metric value at specific date
 * Filters out [INACTIVE] marked metrics
 */
export async function queryProfilePerformanceMetric(params: {
  profileId: string;
  category: string;
  type: string;
  date: Date;
}): Promise<number | null> {
  const { data } = await supabase
    .from('profile_performance_metric_logs')
    .select('value')
    .eq('profile_id', params.profileId)
    .eq('category', params.category)
    .eq('type', params.type)
    .lte('recorded_at', params.date.toISOString())
    .not('notes', 'like', '[INACTIVE]%')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  return data?.value || null;
}

/**
 * Build profile snapshot at specific date
 */
export async function buildProfileSnapshot(params: {
  profileId: string;
  date: Date;
}): Promise<ProfileSnapshot> {
  const [ftp, lthr, maxHr, weight, restingHr] = await Promise.all([
    queryProfilePerformanceMetric({
      profileId: params.profileId,
      category: 'bike',
      type: 'ftp',
      date: params.date,
    }),
    queryProfilePerformanceMetric({
      profileId: params.profileId,
      category: 'bike',
      type: 'lthr',
      date: params.date,
    }),
    queryProfilePerformanceMetric({
      profileId: params.profileId,
      category: 'bike',
      type: 'max_hr',
      date: params.date,
    }),
    queryProfileMetric({
      profileId: params.profileId,
      metricType: 'weight',
      date: params.date,
    }),
    queryProfileMetric({
      profileId: params.profileId,
      metricType: 'resting_hr',
      date: params.date,
    }),
  ]);

  return {
    ftp,
    lthr,
    max_heart_rate: maxHr,
    weight_kg: weight,
    resting_hr: restingHr,
  };
}
```

---

### 8.3 Core Package Files

#### File 11: `packages/core/utils/fitHelpers.ts`
**Action:** Create
**Purpose:** FIT format conversion utilities

```typescript
/**
 * Convert JavaScript Date to FIT timestamp
 * FIT epoch: 1989-12-31 00:00:00 UTC (631065600 seconds after Unix epoch)
 */
export function dateToFitTimestamp(date: Date): number {
  const FIT_EPOCH_OFFSET = 631065600;
  return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
}

/**
 * Convert FIT timestamp to JavaScript Date
 */
export function fitTimestampToDate(fitTimestamp: number): Date {
  const FIT_EPOCH_OFFSET = 631065600;
  const unixTimestamp = (fitTimestamp + FIT_EPOCH_OFFSET) * 1000;
  return new Date(unixTimestamp);
}

/**
 * Convert FIT timestamp to ISO string
 */
export function fitTimestampToIso(fitTimestamp: number): string {
  return fitTimestampToDate(fitTimestamp).toISOString();
}

/**
 * Convert degrees to semicircles (FIT format for lat/lng)
 * Semicircles = degrees × (2^31 / 180)
 */
export function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

/**
 * Convert semicircles to degrees
 */
export function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

---

## 9. Testing Strategy

### 9.1 Testing Pyramid

```
         /\
        /  \     E2E Tests (5%)
       /____\    - Full recording → upload → processing flow
      /      \
     /        \  Integration Tests (25%)
    /__________\ - FIT encoder + Activity recorder
   /            \
  /              \  Unit Tests (70%)
 /________________\ - Individual functions, calculations
```

### 9.2 Unit Tests

#### StreamingFitEncoder Tests
```typescript
describe('StreamingFitEncoder', () => {
  describe('Message Sequencing', () => {
    it('should write File ID as first message');
    it('should write Timer Start before first Record');
    it('should write summary messages (Lap, Session, Activity) at end');
  });

  describe('Checkpoint Strategy', () => {
    it('should checkpoint every 100 samples');
    it('should checkpoint every 60 seconds');
    it('should write checkpoint metadata');
  });

  describe('Pause/Resume', () => {
    it('should write Timer Stop event on pause');
    it('should write Timer Start event on resume');
    it('should not write Record messages while paused');
  });

  describe('Session Summary', () => {
    it('should calculate total elapsed time correctly');
    it('should calculate moving time from samples');
    it('should calculate elevation gain/loss');
  });
});
```

#### FitUploader Tests
```typescript
describe('FitUploader', () => {
  it('should request signed upload URL');
  it('should upload FIT file to Supabase Storage');
  it('should finalize upload and trigger processing');
  it('should delete local file after successful upload');
  it('should retry upload on network error');
});
```

#### analyzeFit Job Tests
```typescript
describe('analyzeFit Job', () => {
  it('should decode FIT file using Garmin SDK');
  it('should query FTP at activity date');
  it('should query weight at activity date');
  it('should calculate TSS with historical FTP');
  it('should calculate power-to-weight with historical weight');
  it('should update activity record with COMPLETED status');
  it('should update processing_status to FAILED on error');
});
```

### 9.3 Integration Tests

#### Full Recording Flow Test
```typescript
describe('Activity Recording Flow', () => {
  it('should record 30-second activity with FIT encoding', async () => {
    // 1. Start recording
    const service = new ActivityRecorderService(mockProfile);
    await service.start(mockActivity);
    await service.startRecording();

    // 2. Simulate 30 seconds of sensor data
    for (let i = 0; i < 30; i++) {
      await service.ingestSensorData(generateMockReading(i));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. Finish recording
    const fitFilePath = await service.finishRecording();

    // 4. Validate FIT file
    const decoder = new Fit.Decode();
    const fitBytes = await readFitFile(fitFilePath);

    expect(decoder.isFit(fitBytes)).toBe(true);
    expect(decoder.checkIntegrity(fitBytes)).toBe(true);

    const decoded = decoder.decode(fitBytes);
    expect(decoded.messages.some(m => m.name === 'file_id')).toBe(true);
    expect(decoded.messages.some(m => m.name === 'session')).toBe(true);
    expect(decoded.messages.filter(m => m.name === 'record').length).toBe(30);
  });
});
```

#### Upload and Processing Test
```typescript
describe('Upload and Processing Flow', () => {
  it('should upload FIT file and process in background', async () => {
    // 1. Upload FIT file
    const uploader = new FitUploader();
    const activityId = await uploader.uploadActivity(mockFitFilePath);

    // 2. Verify activity created with PENDING status
    const activity = await db.activities.findOne({ id: activityId });
    expect(activity.processing_status).toBe('PENDING');

    // 3. Trigger background job
    await trpc.activities.finalizeUpload.mutate({ activityId });

    // 4. Wait for job to complete
    await waitForJobCompletion(activityId);

    // 5. Verify activity updated with COMPLETED status
    const updatedActivity = await db.activities.findOne({ id: activityId });
    expect(updatedActivity.processing_status).toBe('COMPLETED');
    expect(updatedActivity.metrics.tss).toBeGreaterThan(0);
  });
});
```

### 9.4 E2E Tests (Future - Playwright/Detox)

```typescript
describe('Complete User Journey', () => {
  it('should record, upload, and view activity', async () => {
    // 1. User navigates to record screen
    await page.goto('/record');

    // 2. User starts recording
    await page.click('button:has-text("Start")');

    // 3. Wait 30 seconds (simulate activity)
    await page.waitForTimeout(30000);

    // 4. User finishes recording
    await page.click('button:has-text("Stop")');
    await page.click('button:has-text("Finish")');

    // 5. User submits activity
    await page.fill('input[name="name"]', 'Test Run');
    await page.click('button:has-text("Submit")');

    // 6. Verify activity appears in list
    await expect(page.locator('text=Test Run')).toBeVisible();

    // 7. Wait for processing to complete
    await expect(page.locator('text=Processing...')).toBeHidden({
      timeout: 30000,
    });

    // 8. Verify TSS displayed
    await page.click('text=Test Run');
    await expect(page.locator('text=TSS')).toBeVisible();
  });
});
```

---

## 10. Rollout & Migration Plan

### 10.1 Rollout Phases

| Phase | Duration | Description | Rollback Risk |
|-------|----------|-------------|---------------|
| **Phase 0: Setup** | 1-2 days | Download SDK, create storage bucket, migrations | 🟢 Low - No production impact |
| **Phase 1: Mobile FIT** | 3-5 days | Implement FIT encoder, keep StreamBuffer | 🟢 Low - Parallel implementation |
| **Phase 2: Upload** | 2-3 days | Create upload service and tRPC endpoints | 🟢 Low - New endpoints only |
| **Phase 3: Workers** | 3-4 days | Create background worker and FIT analysis | 🟡 Medium - New infrastructure |
| **Phase 4: Schema** | 1 day | Run database migrations | 🟡 Medium - Schema changes |
| **Phase 5: UI Updates** | 2 days | Update mobile UI for processing states | 🟢 Low - UI only |
| **Phase 6: Migration** | 2-3 days | Migrate historical activities to FIT | 🟡 Medium - Data transformation |
| **Phase 7: Monitoring** | 1 week | Monitor new activities, fix issues | 🟢 Low - Observation only |
| **Phase 8: Deprecation** | 1 week | Mark old code as deprecated | 🟢 Low - Comments only |
| **Phase 9: Cleanup** | Month 3+ | Remove deprecated code after 90 days | 🟢 Low - Cleanup only |

### 10.2 Rollback Procedures

#### Rollback Phase 1-2 (Mobile/Upload)
```typescript
// Revert to StreamBuffer in ActivityRecorder
export class ActivityRecorderService {
  async finishRecording() {
    // Use feature flag
    if (USE_FIT_ENCODING) {
      return await this.fitEncoder.finish();
    } else {
      return await this.streamBuffer.aggregateChunks();
    }
  }
}
```

#### Rollback Phase 3-4 (Workers/Schema)
```bash
# Stop workers
pm2 stop workers

# Rollback database migration
psql $DATABASE_URL < packages/supabase/migrations/20260120_rollback_fit_file_support.sql

# Revert tRPC procedures (use old createWithStreams)
git revert <commit-hash>
```

#### Rollback Phase 6 (Migration)
```bash
# Migration is non-destructive
# Original activity_streams data is preserved
# Simply update activities.fit_file_path to NULL

psql $DATABASE_URL <<SQL
UPDATE activities
SET fit_file_path = NULL,
    processing_status = 'COMPLETED'
WHERE fit_file_path IS NOT NULL;
SQL
```

### 10.3 Feature Flags

**Environment Variables:**
```bash
# .env.local (mobile)
EXPO_PUBLIC_USE_FIT_ENCODING=true
EXPO_PUBLIC_ENABLE_FIT_UPLOAD=true

# .env (backend)
ENABLE_FIT_PROCESSING=true
ENABLE_ACTIVITY_MIGRATION=false # Enable only during migration
```

**Usage:**
```typescript
// Mobile
const useFitEncoding = process.env.EXPO_PUBLIC_USE_FIT_ENCODING === 'true';

if (useFitEncoding) {
  const fitEncoder = new StreamingFitEncoder(profile);
  // ...
} else {
  const streamBuffer = new StreamBuffer();
  // ...
}

// Backend
const enableFitProcessing = process.env.ENABLE_FIT_PROCESSING === 'true';

if (enableFitProcessing) {
  // Start worker
  const worker = new Worker('activity-processing', ...);
}
```

### 10.4 Monitoring

**Key Metrics to Track:**

1. **Upload Success Rate**
   - Target: >99% successful uploads
   - Alert if <95%

2. **Processing Time**
   - Target: <30 seconds per activity
   - Alert if >2 minutes

3. **Processing Failure Rate**
   - Target: <1% failed processing
   - Alert if >5%

4. **FIT File Validation**
   - Target: 100% valid FIT files
   - Alert if any invalid files

5. **Storage Usage**
   - Monitor Supabase Storage bucket size
   - Typical FIT file: 200-500KB per hour of recording

**Monitoring Dashboard (Example):**
```typescript
// packages/workers/src/monitoring/metrics.ts

import { Queue } from 'bullmq';

export async function getActivityProcessingMetrics() {
  const queue = new Queue('activity-processing');

  const [completed, failed, active, waiting] = await Promise.all([
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getActiveCount(),
    queue.getWaitingCount(),
  ]);

  const totalProcessed = completed + failed;
  const successRate = totalProcessed > 0 ? (completed / totalProcessed) * 100 : 0;

  return {
    completed,
    failed,
    active,
    waiting,
    successRate,
  };
}
```

### 10.5 Migration Validation

**Post-Migration Checklist:**

- [ ] All activities have `fit_file_path` populated
- [ ] All FIT files are valid (run validation script)
- [ ] No activities stuck in PENDING/PROCESSING status
- [ ] All historical TSS values match original calculations
- [ ] All GPS routes render correctly
- [ ] All zone distributions match original data

**Validation Script:**
```bash
# packages/workers/src/migrations/validateMigration.ts

pnpm tsx src/migrations/validateMigration.ts
```

---

## Summary

This specification provides a comprehensive, developer-ready roadmap for migrating GradientPeak from compressed JSON streams to FIT file-based activity recording. Key takeaways:

1. **Corrected plan.md assumptions** - Current system uses file-based StreamBuffer, not JSON in Supabase Storage
2. **Integrated profile metrics** - Temporal FTP/weight lookups at activity date for accurate historical calculations
3. **Phased implementation** - 9 phases over 3-4 weeks with rollback procedures
4. **Incremental approach** - Keep existing StreamBuffer alongside FIT encoder initially
5. **File-by-file guidance** - Detailed implementation steps for every file
6. **Deprecation strategy** - Mark old code as deprecated, remove after 90-day grace period
7. **Testing pyramid** - 70% unit tests, 25% integration tests, 5% E2E tests

**Next Steps:**
1. Review this specification with team
2. Download Garmin FIT SDK
3. Begin Phase 0 (Setup)
4. Implement Phase 1 (Mobile FIT Encoder)
5. Test thoroughly before moving to Phase 2

**Questions? Contact:**
- Technical Lead: [name]
- Architecture Review: [name]
- Database Admin: [name]
