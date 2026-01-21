# FIT File Integration - Detailed Architecture Research
**Date**: 2026-01-21
**Agent**: Architecture Research Expert
**Status**: Final
**Related Task**: fit-file-integration-2026-01-21

## Document Purpose
This document provides comprehensive architectural analysis for replacing GradientPeak's JSON-based activity storage with industry-standard FIT files. Includes component placement, data flow, integration patterns, and risk analysis.

## Table of Contents
1. System Context
2. Component Architecture
3. Data Flow Patterns
4. Storage & Database Design
5. Integration Patterns
6. Performance Considerations
7. Risk Analysis
8. Implementation Strategy

---

## 1. System Context

### Current Architecture
GradientPeak uses a **local-first, JSON-centric architecture** where activities are recorded as sensor data streams, stored as compressed JSON in the database, and processed on-demand.

**Recording Flow**:
```
Mobile App → ActivityRecorderService → LiveMetricsManager → StreamBuffer
                                                               ↓
                                                      60s JSON chunks
                                                               ↓
                                                      finish() aggregates
                                                               ↓
                                                      Upload to PostgreSQL
```

**Key Components**:
- **ActivityRecorderService** (1770 lines): Coordinates recording lifecycle, sensors, location, plan
- **LiveMetricsManager** (1412 lines): Real-time metrics calculation, 1s UI updates, 60s persistence
- **StreamBuffer** (483 lines): Accumulates sensor/GPS data, writes JSON chunks every 60s

### Target Architecture
Replace JSON storage with **FIT files** (Garmin standard) for platform compatibility while maintaining local-first principles.

**New Recording Flow**:
```
Mobile App → ActivityRecorderService → LiveMetricsManager → StreamingFitEncoder
                                                               ↓
                                                      Real-time FIT messages
                                                               ↓
                                                      60s checkpoints
                                                               ↓
                                                      finish() closes file
                                                               ↓
                                                      Upload to Supabase Storage
                                                               ↓
                                                      Edge Function processes
```

**Benefits**:
1. Platform compatibility (Strava, Garmin Connect, Wahoo)
2. Official standards compliance (guaranteed compatibility)
3. Automatic serverless processing
4. Better performance (files in storage vs. database)
5. Crash recovery via checkpoints
6. Historical accuracy (FTP/weight at activity date)

---

## 2. Component Architecture

### 2.1 StreamingFitEncoder

**Purpose**: Replace StreamBuffer with real-time FIT encoding

**Location**: `apps/mobile/lib/services/fit/StreamingFitEncoder.ts`

**Responsibilities**:
1. Initialize FIT file with File ID, User Profile, Device Info messages
2. Write Record messages in real-time as sensor/GPS data arrives
3. Maintain internal buffer for 60-second checkpoints
4. Flush checkpoints to disk for crash recovery
5. Finalize FIT file with Lap, Session, Activity summary messages
6. Calculate CRC and close file on finish

**Interface**:
```typescript
export class StreamingFitEncoder {
  constructor(
    userId: string,
    sessionId: string,
    metadata: RecordingMetadata
  ) {}

  // Initialize FIT file and write headers
  async initialize(): Promise<void>;

  // Add a sensor reading (HR, power, cadence, speed)
  addSensorReading(reading: SensorReading): void;

  // Add a GPS location point
  addLocationReading(location: LocationReading): void;

  // Checkpoint: flush buffer to disk (called every 60s)
  async checkpoint(): Promise<void>;

  // Finalize: write summary messages and close file
  async finalize(stats: SessionStats): Promise<string>; // Returns file path

  // Cleanup: remove temp files
  async cleanup(): Promise<void>;

  // Get current file size
  getFileSize(): number;
}
```

**FIT Message Sequence**:
```
1. File ID (protocol version, manufacturer, product)
2. User Profile (age, weight, gender, FTP, threshold_hr)
3. Device Info (device type, manufacturer, serial number)
4. [Recording starts]
5. Record messages (timestamp, HR, power, cadence, lat/lng, altitude)
   - Written in real-time as data arrives
   - Frequency: 1-4 Hz (as sensor data comes in)
6. [Recording ends]
7. Lap messages (if laps recorded)
8. Session message (aggregated stats)
9. Activity message (overall summary)
10. CRC (file integrity check)
```

**Checkpoint Strategy**:
```typescript
// Every 60 seconds (timer in LiveMetricsManager)
async checkpoint(): Promise<void> {
  // 1. Flush encoder's internal buffer to disk
  await this.encoder.flush();
  
  // 2. Write temp marker file (for crash detection)
  await FileSystem.writeAsStringAsync(
    `${this.sessionDir}/checkpoint_${Date.now()}.marker`,
    JSON.stringify({ timestamp: Date.now(), recordCount: this.recordCount })
  );
  
  // 3. Encoder continues writing to same file
  // No file rotation - append-only
}
```

**Crash Recovery**:
```typescript
// On app restart, check for incomplete FIT files
static async recoverFromCrash(): Promise<string[]> {
  // 1. Find marker files without matching completed FIT
  // 2. Validate FIT file integrity (CRC)
  // 3. If valid: return file paths for upload
  // 4. If invalid: attempt repair or discard
}
```

**Integration with LiveMetricsManager**:

**Current (StreamBuffer)**:
```typescript
// Line 56: Declaration
public streamBuffer: StreamBuffer;

// Line 108: Initialization
this.streamBuffer = new StreamBuffer();

// Line 141: Start recording
await this.streamBuffer.initialize();

// Line 277: Add sensor data
this.streamBuffer.add(reading);

// Line 289: Add location data
this.streamBuffer.addLocation(location);

// Line 760: Periodic flush (60s)
await this.streamBuffer.flushToFiles();

// Line 206-210: Finalize
await this.streamBuffer.aggregateAllChunks();
```

**Proposed (StreamingFitEncoder)**:
```typescript
// Line 56: Declaration
public fitEncoder: StreamingFitEncoder;

// Line 108: Initialization
this.fitEncoder = new StreamingFitEncoder(
  profile.id,
  `recording_${Date.now()}`,
  metadata
);

// Line 141: Start recording
await this.fitEncoder.initialize();

// Line 277: Add sensor data
this.fitEncoder.addSensorReading(reading);

// Line 289: Add location data
this.fitEncoder.addLocationReading(location);

// Line 760: Periodic checkpoint (60s)
await this.fitEncoder.checkpoint();

// Line 206-210: Finalize
const fitFilePath = await this.fitEncoder.finalize(stats);
return { fitFilePath, stats };
```

### 2.2 FitUploader

**Purpose**: Upload completed FIT file to Supabase Storage and create activity record

**Location**: `apps/mobile/lib/services/fit/FitUploader.ts`

**Responsibilities**:
1. Request signed upload URL from tRPC
2. Upload FIT file to Supabase Storage
3. Verify upload success
4. Create activity database record with `processing_status: 'pending'`
5. Handle errors and retries

**Interface**:
```typescript
export class FitUploader {
  // Upload FIT file and create activity
  async uploadActivity(params: {
    fitFilePath: string;
    name: string;
    metadata: RecordingMetadata;
    stats: SessionStats;
  }): Promise<{ activityId: string; uploadedPath: string }>;

  // Retry failed upload
  async retryUpload(activityId: string): Promise<void>;

  // Check upload progress
  getUploadProgress(): { bytesUploaded: number; totalBytes: number };
}
```

**Upload Flow**:
```typescript
async uploadActivity(params) {
  // 1. Get file size
  const fileInfo = await FileSystem.getInfoAsync(params.fitFilePath);
  
  // 2. Request signed upload URL
  const { uploadUrl, storagePath, expiresAt } = await trpc.activities.requestFitUploadUrl.mutate({
    filename: `${params.metadata.activityId}.fit`,
    fileSize: fileInfo.size,
  });
  
  // 3. Upload file to Supabase Storage
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, params.fitFilePath, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  
  if (uploadResult.status !== 200) {
    throw new Error(`Upload failed: ${uploadResult.status}`);
  }
  
  // 4. Create activity record in database
  const activity = await trpc.activities.createFromFit.mutate({
    name: params.name,
    fit_file_path: storagePath,
    fit_file_size: fileInfo.size,
    started_at: params.metadata.startedAt,
    finished_at: params.metadata.endedAt,
    activity_category: params.metadata.activityCategory,
    activity_location: params.metadata.activityLocation,
    profile_id: params.metadata.profileId,
  });
  
  // 5. Clean up local file (optional - keep for debugging)
  // await FileSystem.deleteAsync(params.fitFilePath);
  
  return {
    activityId: activity.id,
    uploadedPath: storagePath,
  };
}
```

**Error Handling**:
```typescript
// Network failures
try {
  await uploadActivity(params);
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    // Store for retry
    await AsyncStorage.setItem(`pending_upload_${activityId}`, JSON.stringify({
      fitFilePath,
      params,
      attemptCount: 0,
    }));
    
    // Show UI: "Upload failed. Tap to retry."
  }
}

// Retry logic
async retryUpload(activityId: string) {
  const pendingData = await AsyncStorage.getItem(`pending_upload_${activityId}`);
  const { fitFilePath, params, attemptCount } = JSON.parse(pendingData);
  
  if (attemptCount >= 3) {
    throw new Error('Max retry attempts exceeded');
  }
  
  await AsyncStorage.setItem(`pending_upload_${activityId}`, JSON.stringify({
    ...pendingData,
    attemptCount: attemptCount + 1,
  }));
  
  await uploadActivity(params);
}
```

### 2.3 Edge Function (Serverless Processing)

**Purpose**: Parse uploaded FIT files and calculate metrics

**Location**: `supabase/functions/process-activity-fit/index.ts`

**Trigger**: Database trigger on `activities` INSERT

**Responsibilities**:
1. Download FIT file from Supabase Storage
2. Parse FIT file with Garmin SDK
3. Extract all sensor streams (HR, power, cadence, GPS)
4. Calculate metrics using `@repo/core`
5. Generate GPS polyline
6. Update activity record with results
7. Handle errors gracefully

**Structure**:
```typescript
// index.ts
serve(async (req) => {
  const { activityId } = await req.json();
  
  try {
    // 1. Update status to 'processing'
    await updateActivityStatus(activityId, 'processing');
    
    // 2. Get activity record
    const activity = await getActivity(activityId);
    
    // 3. Download FIT file
    const fitBuffer = await downloadFitFile(activity.fit_file_path);
    
    // 4. Parse FIT file
    const fitData = await parseFitFile(fitBuffer);
    
    // 5. Calculate metrics
    const metrics = calculateMetrics(fitData, activity);
    
    // 6. Update activity
    await updateActivityWithMetrics(activityId, metrics);
    
    // 7. Update status to 'completed'
    await updateActivityStatus(activityId, 'completed');
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Log error
    console.error('Processing failed:', error);
    
    // Update status to 'failed'
    await updateActivityStatus(activityId, 'failed', error.message);
    
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

**Parsing Logic** (`parser.ts`):
```typescript
export async function parseFitFile(buffer: Uint8Array): Promise<FitData> {
  // Use Garmin SDK (Deno-compatible)
  const decoder = new FitDecoder();
  const messages = decoder.decode(buffer);
  
  // Extract message types
  const records = messages.filter(m => m.type === 'record');
  const laps = messages.filter(m => m.type === 'lap');
  const session = messages.find(m => m.type === 'session');
  
  // Convert to streams
  const streams = {
    heartrate: extractStream(records, 'heart_rate'),
    power: extractStream(records, 'power'),
    cadence: extractStream(records, 'cadence'),
    speed: extractStream(records, 'speed'),
    latlng: extractLatLng(records),
    altitude: extractStream(records, 'altitude'),
    timestamps: records.map(r => r.timestamp),
  };
  
  return { records, laps, session, streams };
}
```

**Metrics Calculation** (`metrics.ts`):
```typescript
export function calculateMetrics(
  fitData: FitData,
  activity: { profile_id: string }
): ActivityMetrics {
  // Import from @repo/core (database-independent)
  const { 
    calculateTSS,
    calculateNormalizedPower,
    calculateIntensityFactor,
    calculateZoneDistribution,
  } = require('@repo/core');
  
  // Get user's FTP/HR at time of activity
  const profile = await getProfileSnapshot(activity.profile_id, activity.started_at);
  
  // Calculate advanced metrics
  const np = calculateNormalizedPower(fitData.streams.power);
  const tss = calculateTSS({
    normalizedPower: np,
    duration: activity.duration_seconds,
    ftp: profile.ftp,
  });
  
  const hrZones = calculateZoneDistribution(
    fitData.streams.heartrate,
    profile.threshold_hr,
    'heartrate'
  );
  
  const powerZones = calculateZoneDistribution(
    fitData.streams.power,
    profile.ftp,
    'power'
  );
  
  return {
    tss,
    normalized_power: np,
    intensity_factor: calculateIntensityFactor(np, profile.ftp),
    hr_zone_seconds: hrZones,
    power_zone_seconds: powerZones,
    // ... other metrics
  };
}
```

---

## 3. Data Flow Patterns

### 3.1 Recording Flow (Detailed)

**Phase 1: Initialization**
```
User taps "Start" → ActivityRecorderService.startRecording()
                          ↓
          LiveMetricsManager.startRecording()
                          ↓
          StreamingFitEncoder.initialize()
                          ↓
          Write FIT file headers:
            - File ID message
            - User Profile message
            - Device Info message
                          ↓
          Create session directory (cache)
          Create recording_{timestamp}.fit
                          ↓
          Return ready state
```

**Phase 2: Recording (Real-time)**
```
Sensor data arrives (1-4 Hz)
          ↓
SensorsManager.handleReading()
          ↓
ActivityRecorderService.handleSensorData()
          ↓
LiveMetricsManager.ingestSensorData()
          ↓
StreamingFitEncoder.addSensorReading()
          ↓
Encode as FIT Record message
          ↓
Append to buffer (in-memory)
          ↓
If buffer > 8KB: flush to file
```

**Phase 3: Checkpoints (Every 60s)**
```
Timer fires (60s interval)
          ↓
LiveMetricsManager.persistAndCleanup()
          ↓
StreamingFitEncoder.checkpoint()
          ↓
Flush encoder buffer to file
          ↓
Write checkpoint marker
          ↓
Continue recording (no interruption)
```

**Phase 4: Finalization**
```
User taps "Finish" → ActivityRecorderService.finishRecording()
                          ↓
          LiveMetricsManager.finishRecording()
                          ↓
          StreamingFitEncoder.finalize(stats)
                          ↓
          Write summary messages:
            - Lap messages (if any)
            - Session message
            - Activity message
                          ↓
          Calculate CRC
          Close file
                          ↓
          Return file path: /cache/recording_123/activity.fit
                          ↓
          Navigate to submit screen
```

### 3.2 Upload Flow

**Phase 1: Request Upload URL**
```
Submit screen → FitUploader.uploadActivity()
                     ↓
     trpc.activities.requestFitUploadUrl.mutate()
                     ↓
     tRPC validates: user has storage quota
                     ↓
     Generate signed URL (15 min expiry)
     Target: fit-files/{userId}/{activityId}.fit
                     ↓
     Return: { uploadUrl, storagePath, expiresAt }
```

**Phase 2: Upload File**
```
FitUploader receives signed URL
          ↓
FileSystem.uploadAsync(uploadUrl, fitFilePath)
          ↓
Direct upload to Supabase Storage
(No tRPC involved - binary upload)
          ↓
Return HTTP 200 on success
```

**Phase 3: Create Activity Record**
```
Upload successful
          ↓
trpc.activities.createFromFit.mutate()
          ↓
INSERT INTO activities:
  - fit_file_path: 'fit-files/{userId}/{activityId}.fit'
  - processing_status: 'pending'
  - started_at, finished_at, type, location
  - ftp_at_time_of_activity: {current FTP}
  - weight_at_time_of_activity: {current weight}
          ↓
Database trigger fires
          ↓
Invoke Edge Function with activity_id
          ↓
Return activity_id to mobile
```

**Phase 4: Processing (Async)**
```
Edge Function receives activity_id
          ↓
UPDATE processing_status = 'processing'
          ↓
Download FIT from Storage
          ↓
Parse FIT with SDK
          ↓
Calculate metrics (@repo/core)
          ↓
UPDATE activities SET:
  - metrics = {...}
  - hr_zone_seconds = [...]
  - power_zone_seconds = [...]
  - processing_status = 'completed'
          ↓
Mobile polls status (every 2s)
          ↓
Status = 'completed' → Navigate to detail
```

### 3.3 Error Recovery

**Scenario 1: App Crash During Recording**
```
App crashes → FIT file partially written
          ↓
On app restart:
          ↓
StreamingFitEncoder.recoverFromCrash()
          ↓
Find checkpoint markers
          ↓
Validate FIT file (CRC fails - expected)
          ↓
Attempt recovery:
  - Read all complete records
  - Generate summary from partial data
  - Recalculate CRC
          ↓
If recovery successful:
  - Add "_recovered" suffix
  - Allow user to review/upload
If recovery fails:
  - Discard file
  - Log for debugging
```

**Scenario 2: Upload Failure**
```
Network error during upload
          ↓
FitUploader catches error
          ↓
Store pending upload in AsyncStorage:
{
  activityId,
  fitFilePath,
  params,
  attemptCount: 0,
  timestamp,
}
          ↓
Show UI: "Upload failed. Tap to retry."
          ↓
User taps retry OR automatic retry on network restore
          ↓
FitUploader.retryUpload(activityId)
          ↓
Retry up to 3 times
          ↓
If all retries fail: keep file locally, show permanent retry button
```

**Scenario 3: Processing Failure**
```
Edge Function encounters error
          ↓
UPDATE processing_status = 'failed'
UPDATE processing_error = 'Parse error: Invalid FIT file'
          ↓
Mobile polls and detects failure
          ↓
Show UI: "Processing failed. [Retry] [Contact Support]"
          ↓
User taps "Retry"
          ↓
trpc.activities.retryProcessing.mutate()
          ↓
UPDATE processing_status = 'pending'
CLEAR processing_error
          ↓
Trigger fires again → Edge Function retries
```

---

## 4. Storage & Database Design

### 4.1 Supabase Storage

**Bucket Configuration**:
```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('fit-files', 'fit-files', false);

-- Set file size limit: 100 MB per file
UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id = 'fit-files';

-- Set allowed MIME types
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/octet-stream']
WHERE id = 'fit-files';
```

**RLS Policies** (Security):
```sql
-- Policy 1: Users can upload to their own folder
CREATE POLICY "upload_own_files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'fit-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Users can read their own files
CREATE POLICY "read_own_files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'fit-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Users can delete their own files
CREATE POLICY "delete_own_files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'fit-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Service role (Edge Function) can read all
CREATE POLICY "service_read_all"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'fit-files');
```

**Path Structure**:
```
fit-files/
├── {userId}/
│   ├── {activityId}.fit        # Main FIT file
│   ├── {activityId}_raw.fit    # Raw uploaded (if processing modifies)
│   └── checkpoints/            # Future: store checkpoints
│       └── {activityId}_checkpoint_{timestamp}.fit
```

### 4.2 Database Schema

**Enhanced Migration**:
```sql
-- Base columns (from original migration)
ALTER TABLE activities 
ADD COLUMN fit_file_path TEXT,
ADD COLUMN processing_status TEXT DEFAULT 'pending' 
  CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN fit_file_size INTEGER,
ADD COLUMN fit_file_version INTEGER;

-- Processing timestamps (RECOMMENDED ADDITION)
ADD COLUMN processing_started_at TIMESTAMPTZ,
ADD COLUMN processing_completed_at TIMESTAMPTZ,
ADD COLUMN processing_error TEXT;

-- Historical metrics snapshot (RECOMMENDED ADDITION)
ADD COLUMN ftp_at_time_of_activity INTEGER,
ADD COLUMN weight_at_time_of_activity NUMERIC(5,2),
ADD COLUMN threshold_hr_at_time_of_activity INTEGER;

-- Indexes
CREATE INDEX idx_activities_processing_status 
ON activities(processing_status);

CREATE INDEX idx_activities_fit_file_path 
ON activities(fit_file_path) 
WHERE fit_file_path IS NOT NULL;

-- Partial index for monitoring pending activities
CREATE INDEX idx_activities_processing_pending 
ON activities(processing_status, created_at) 
WHERE processing_status = 'pending';

-- Comments
COMMENT ON COLUMN activities.fit_file_path 
  IS 'Path to FIT file in Supabase Storage (e.g., fit-files/{userId}/{activityId}.fit)';
COMMENT ON COLUMN activities.processing_status 
  IS 'FIT file processing status: pending, processing, completed, failed';
COMMENT ON COLUMN activities.ftp_at_time_of_activity 
  IS 'User FTP at time of activity (for historical accuracy)';
```

**Database Trigger**:
```sql
-- Function to invoke Edge Function
CREATE OR REPLACE FUNCTION trigger_fit_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if fit_file_path is set and status is pending
  IF NEW.fit_file_path IS NOT NULL AND NEW.processing_status = 'pending' THEN
    -- Invoke Edge Function (Supabase specific)
    PERFORM net.http_post(
      url := current_setting('app.settings.edge_function_url', true) || '/process-activity-fit',
      body := jsonb_build_object('activityId', NEW.id),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on INSERT
CREATE TRIGGER on_activity_created
AFTER INSERT ON activities
FOR EACH ROW
EXECUTE FUNCTION trigger_fit_processing();
```

**Rollback Plan**:
```sql
-- Step 1: Disable processing
DROP TRIGGER IF EXISTS on_activity_created ON activities;
DROP FUNCTION IF EXISTS trigger_fit_processing();

-- Step 2: Mark all FIT activities as completed (preserve data)
UPDATE activities 
SET processing_status = 'completed'
WHERE fit_file_path IS NOT NULL;

-- Step 3: (Optional) Remove columns after reverting to JSON system
ALTER TABLE activities 
DROP COLUMN IF EXISTS fit_file_path,
DROP COLUMN IF EXISTS processing_status,
DROP COLUMN IF EXISTS fit_file_size,
DROP COLUMN IF EXISTS fit_file_version,
DROP COLUMN IF EXISTS processing_started_at,
DROP COLUMN IF EXISTS processing_completed_at,
DROP COLUMN IF EXISTS processing_error,
DROP COLUMN IF EXISTS ftp_at_time_of_activity,
DROP COLUMN IF EXISTS weight_at_time_of_activity,
DROP COLUMN IF EXISTS threshold_hr_at_time_of_activity;
```

---

## 5. Integration Patterns

### 5.1 Lifecycle Integration

**Current Lifecycle** (JSON-based):
```
ActivityRecorderService:
  pending → ready → recording → paused → finished
                              ↓
                  LiveMetricsManager (1s updates, 60s persistence)
                              ↓
                        StreamBuffer (JSON chunks)
```

**Proposed Lifecycle** (FIT-based):
```
ActivityRecorderService:
  pending → ready → recording → paused → finished
                              ↓
                  LiveMetricsManager (1s updates, 60s checkpoints)
                              ↓
                   StreamingFitEncoder (real-time FIT messages)
```

**Key Insight**: Minimal changes to ActivityRecorderService. All FIT logic encapsulated in LiveMetricsManager and encoder.

### 5.2 Dependency Injection

**Current**:
```typescript
// LiveMetricsManager.ts line 56
public streamBuffer: StreamBuffer;

// Constructor line 107-108
this.streamBuffer = new StreamBuffer();
```

**Proposed**:
```typescript
// LiveMetricsManager.ts line 56
public fitEncoder: StreamingFitEncoder;

// Constructor line 107-108
this.fitEncoder = new StreamingFitEncoder(
  profile.id,
  `session_${Date.now()}`,
  {
    activityCategory: 'bike', // Will be set via setActivityCategory()
    activityLocation: 'indoor',
  }
);
```

**Benefits**:
- Single point of change (LiveMetricsManager)
- Same interface pattern
- Easy to test (mock encoder)
- Can support both JSON and FIT during migration

### 5.3 Event-Driven Updates

**Pattern**: LiveMetricsManager emits events, UI subscribes

**Current Events** (remain unchanged):
```typescript
interface LiveMetricsEvents {
  statsUpdate: (data: { stats: SessionStats; timestamp: number }) => void;
  sensorUpdate: (data: { readings: any; timestamp: number }) => void;
  persistenceError: (error: unknown) => void;
}
```

**No Changes Required**: UI components continue using existing hooks:
- `useSessionStats(service)`
- `useCurrentReadings(service)`

**Why This Works**:
- Encoding is internal to LiveMetricsManager
- UI doesn't care about storage format
- Same metrics calculated regardless of backend

---

## 6. Performance Considerations

### 6.1 Encoding Performance

**Target**: <5ms per FIT Record message

**Measurement Strategy**:
```typescript
// In StreamingFitEncoder
addSensorReading(reading: SensorReading): void {
  const startTime = performance.now();
  
  // Encode FIT message
  const message = this.encodeRecordMessage(reading);
  this.buffer.append(message);
  
  const duration = performance.now() - startTime;
  if (duration > 5) {
    console.warn(`[FitEncoder] Slow encoding: ${duration.toFixed(2)}ms`);
  }
}
```

**Optimization Strategies**:
1. **Buffer aggregation**: Accumulate 100 messages before flushing
2. **Lazy encoding**: Don't encode until flush time
3. **Native module**: Use native FIT SDK if JS implementation is slow
4. **Queue with backpressure**: If encoding can't keep up, pause sensor reads

### 6.2 Memory Usage

**Current (StreamBuffer)**:
- Holds 60 seconds of data in memory
- ~16 bytes per sensor reading
- ~40 bytes per GPS point
- Typical: 1-2 MB per 60s

**Proposed (StreamingFitEncoder)**:
- Holds encoded FIT messages in buffer
- ~20 bytes per Record message (binary format)
- Flush when buffer > 8 KB (not time-based)
- More efficient for long recordings

**4-Hour Recording**:
```
Current JSON approach:
  60s chunks × 240 = 240 file writes
  Memory: 1-2 MB held at any time
  Total files: 240 × ~100 KB = 24 MB on disk

Proposed FIT approach:
  Real-time writes with 8KB buffer
  ~1800 buffer flushes over 4 hours
  Memory: 8 KB held at any time
  Total file: 1 FIT file, ~15 MB
```

### 6.3 File I/O

**Write Frequency**:
- Current: Every 60 seconds (fixed)
- Proposed: Every ~2-5 seconds (when buffer full)

**File Size Growth**:
```
Current: 240 separate files, aggregate at end
Proposed: Single file, append-only

Benefits:
- No aggregation overhead at finish
- No file directory scanning
- Simpler cleanup
```

### 6.4 Network Upload

**File Size Comparison**:
```
1-hour activity:
  JSON (compressed): ~500 KB
  FIT file: ~1 MB

4-hour activity:
  JSON (compressed): ~2 MB
  FIT file: ~4 MB
```

**Upload Strategy**:
- Use chunked/multipart upload for files > 5 MB
- Show progress bar (bytes uploaded / total bytes)
- Support resume on network interruption
- Compress FIT file? (Research: does Garmin SDK support compressed FIT?)

---

## 7. Risk Analysis

### 7.1 Critical Risks

#### Risk 1: FIT SDK React Native Compatibility
**Probability**: HIGH (40%)
**Impact**: CRITICAL - Blocks Phase 2

**Analysis**:
- Garmin FIT SDK is C++ with platform bindings
- May not have official React Native support
- Native modules require Expo dev client (not Expo Go)

**Mitigation**:
1. Research pure JavaScript FIT libraries (e.g., `fit-file-parser`)
2. Create proof-of-concept: encode 10-minute activity, validate with Garmin SDK
3. Performance benchmark: ensure <5ms per message
4. Fallback: Write custom FIT encoder (protocol is documented)

**Decision Point**: Complete this research BEFORE starting Phase 2

#### Risk 2: Real-Time Encoding Performance
**Probability**: MEDIUM (30%)
**Impact**: HIGH - UI lag during recording

**Analysis**:
- Sensors emit data at 1-4 Hz (multiple sensors)
- Encoding must complete in <5ms to avoid backlog
- Mobile devices have limited CPU
- React Native bridge overhead

**Mitigation**:
1. Benchmark on low-end device (old Android phone)
2. Profile with 4-hour recording test
3. Implement backpressure: pause sensor reads if encoder falls behind
4. Use queue with batch processing if needed

**Success Criteria**: No UI lag during 4-hour recording on Pixel 4a

#### Risk 3: Checkpoint Corruption
**Probability**: MEDIUM (25%)
**Impact**: MEDIUM - Lost recording data

**Analysis**:
- App crash during checkpoint write could corrupt file
- Partial writes to FIT file could break structure
- CRC validation would fail

**Mitigation**:
1. Atomic writes: write to temp file, then rename
2. Write checkpoint markers separately (metadata only)
3. Test crash scenarios (force kill app during recording)
4. Implement recovery: validate FIT structure, repair if possible

**Recovery Strategy**:
- Read all complete FIT records
- Discard incomplete final record
- Recalculate summary and CRC
- Mark as "_recovered" for user review

### 7.2 Medium Risks

#### Risk 4: Edge Function Cold Start
**Probability**: MEDIUM (50%)
**Impact**: LOW - Slow processing (5-10s)

**Analysis**:
- Serverless functions have cold start penalty
- First invocation after idle may take 5-10 seconds
- Subsequent invocations are faster (warm)

**Mitigation**:
1. Set user expectations: "Processing usually takes a moment"
2. Keep functions warm with periodic health checks (optional)
3. Optimize function: minimize dependencies, lazy load FIT SDK
4. Show engaging UI: "Analyzing your performance..." with animation

**User Experience**: Most users won't notice. Power users may complain if processing takes >30s.

#### Risk 5: Storage Costs
**Probability**: LOW (10%)
**Impact**: MEDIUM - Increased hosting costs

**Analysis**:
```
FIT files vs. compressed JSON:
  FIT: ~1 MB/hour
  JSON: ~500 KB/hour (compressed in DB)

1000 users × 10 hours/month = 10,000 hours
  FIT storage: 10 GB/month
  JSON storage: 5 GB/month

Supabase Storage pricing:
  $0.021/GB/month
  Difference: $0.10/month
```

**Mitigation**:
1. Implement storage quotas (100 GB per user = 100 hours)
2. Archive old activities to cold storage after 1 year
3. Offer "delete old FIT files" option (keep database records)

**Decision**: Accept risk. Storage is cheap, compatibility is valuable.

#### Risk 6: Migration Data Integrity
**Probability**: MEDIUM (30%)
**Impact**: MEDIUM - Corrupted historical data

**Analysis**:
- Converting JSON → FIT → metrics may introduce calculation errors
- Timezone issues with timestamps
- Missing data in old JSON may cause FIT generation to fail

**Mitigation**:
1. Run migration script in test environment first
2. Validate metrics before/after: TSS, distance, duration within 5% tolerance
3. Keep JSON backups for 90 days
4. Batch processing: 100 activities at a time
5. Manual review: flag activities with >10% metric deviation

**Rollback**: If migration fails, revert to JSON, fix script, retry

---

## 8. Implementation Strategy

### 8.1 Phase Breakdown

**Phase 1: Infrastructure Setup** (1-2 days)
```
Day 1:
□ Execute database migration (20240120_add_fit_file_support.sql)
□ Create Supabase Storage bucket with RLS policies
□ Add tRPC procedures: requestFitUploadUrl, createFromFit
□ Test upload flow with dummy file

Day 2:
□ Create Edge Function scaffold (logging only)
□ Set up database trigger
□ Test trigger invocation
□ Deploy to dev environment
```

**Phase 2: Mobile Recording** (3-5 days)
```
Day 1:
□ Research FIT SDK compatibility
□ Create StreamingFitEncoder.ts (stub implementation)
□ Write unit tests for encoder interface

Day 2-3:
□ Implement FIT message encoding
□ Integrate with LiveMetricsManager
□ Test real-time encoding performance

Day 4:
□ Implement checkpoint system
□ Test crash recovery scenarios
□ Profile memory usage

Day 5:
□ Integration testing with full recording flow
□ Fix bugs
□ Code review
```

**Phase 3: Serverless Processing** (4-5 days)
```
Day 1:
□ Set up Edge Function development environment
□ Install Deno-compatible FIT parser

Day 2:
□ Implement FIT parsing logic
□ Extract sensor streams
□ Unit tests for parser

Day 3:
□ Integrate @repo/core calculations
□ Calculate metrics: TSS, NP, zones
□ Generate GPS polyline

Day 4:
□ Implement database updates
□ Error handling and retries
□ Logging and monitoring

Day 5:
□ End-to-end testing
□ Performance optimization
□ Deploy to production
```

**Phase 4: User Interface** (2 days)
```
Day 1:
□ Create ProcessingStatusBadge component
□ Update ActivityCard to show status
□ Add polling logic to activity detail screen
□ Show "Analyzing..." loader

Day 2:
□ Implement FitUploadProgress component
□ Add retry buttons for failed uploads/processing
□ Test UI flows
□ Polish animations
```

**Phase 5: Data Migration** (2-3 days)
```
Day 1:
□ Write migration script (packages/scripts/migrate-activities-to-fit.ts)
□ Test on dev database (10 activities)
□ Validate metrics accuracy

Day 2:
□ Run migration in batches (100 at a time)
□ Monitor for errors
□ Validate each batch

Day 3:
□ Final validation
□ Update documentation
□ Announce migration complete
```

### 8.2 Testing Strategy

**Unit Tests**:
- StreamingFitEncoder: Mock FIT SDK, test message encoding
- FitUploader: Mock tRPC, test upload flow
- Edge Function: Mock Supabase, test parsing and calculations

**Integration Tests**:
- Full recording flow: sensors → encoder → upload → processing
- Error scenarios: network failures, parse errors, crashes
- Performance tests: 4-hour recording, memory profiling

**Manual Testing**:
- Real device testing (iOS and Android)
- Various activity types (bike, run, indoor, outdoor)
- Edge cases: no GPS, no sensors, very long recordings

### 8.3 Rollback Strategy

**If Phase 2 fails** (FIT SDK incompatible):
```
□ Keep JSON-based recording
□ Research alternative libraries
□ Consider custom FIT encoder implementation
□ Delay FIT integration until solution found
```

**If Phase 3 fails** (Edge Function issues):
```
□ Process FIT files in mobile app (less ideal)
□ Upload FIT + pre-calculated metrics
□ Edge Function becomes optional (for web dashboard)
```

**If migration fails**:
```
□ Revert database changes
□ Keep JSON system
□ FIT files become export-only feature
```

### 8.4 Success Criteria

**Phase 1**: ✅ Can upload dummy file, trigger invokes successfully
**Phase 2**: ✅ Records 4-hour activity without crashes, file validates with SDK
**Phase 3**: ✅ Processes activity in <30s, metrics match expected values
**Phase 4**: ✅ UI shows status correctly, retries work
**Phase 5**: ✅ Migrated activities have <5% metric deviation

**Overall Success**: 
- 100% of new recordings use FIT format
- >95% upload success rate
- >98% processing success rate
- No user complaints about performance
- All existing activities migrated

---

## 9. Open Questions

1. **FIT SDK Licensing**: Does Garmin FIT SDK allow commercial use? Check license terms.

2. **Compression**: Should FIT files be compressed before upload? Research if SDK supports `.fitz` format.

3. **Backward Compatibility**: Support both JSON and FIT during transition? Or hard cutover?

4. **Web Dashboard**: Does web need to generate FIT files for manual uploads? Or JSON→FIT conversion server-side?

5. **Stream Storage**: Keep activity_streams table? Or rely solely on FIT file as source of truth?

6. **Export**: Should users be able to download their FIT files? Add "Export to FIT" button?

7. **Import**: Support importing FIT files from Garmin/Strava? Phase 6 feature?

---

## 10. References

### Existing Code
- [ActivityRecorderService](../../../apps/mobile/lib/services/ActivityRecorder/index.ts)
- [LiveMetricsManager](../../../apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts)
- [StreamBuffer](../../../apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts)
- [activities.ts](../../../packages/trpc/src/routers/activities.ts)
- [Database Migration](../../../packages/supabase/migrations/20240120_add_fit_file_support.sql)

### External Documentation
- [Garmin FIT SDK](https://developer.garmin.com/fit/)
- [FIT Protocol Overview](https://developer.garmin.com/fit/overview/)
- [FIT File Types](https://developer.garmin.com/fit/file-types/)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

### Related Research
- [Technology Findings](../technology/2026-01-21_fit-sdk-evaluation.md) - FIT SDK evaluation (pending)
- [Integration Findings](../integration/2026-01-21_supabase-storage-fit.md) - Storage integration (pending)
- [Performance Findings](../performance/2026-01-21_fit-performance-analysis.md) - Performance analysis (pending)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-21
**Next Review**: After Technology Expert research completes
