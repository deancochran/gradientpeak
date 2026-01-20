# FIT File Migration Implementation Plan
**GradientPeak Real-Time Recording Architecture**

## Document Overview

This implementation plan details the migration of GradientPeak's activity recording system from compressed JSON streams to industry-standard FIT (Flexible and Interoperable Data Transfer) files. The migration leverages GradientPeak's existing Supabase infrastructure, maintaining the local-first, JSON-centric philosophy while adopting the FIT binary standard for enhanced interoperability with major fitness platforms (Garmin Connect, Strava, Wahoo).

### Key Architectural Principles

**Real-Time FIT Recording**: Mobile app writes FIT record messages incrementally during activity capture, not post-recording
**Supabase Storage Integration**: FIT files stored in Supabase Storage buckets with row-level security
**Asynchronous Processing**: Database records derived from parsed FIT files via background workers
**Crash Recovery**: Periodic FIT file checkpoints enable resumption after app crashes
**Single Source of Truth**: FIT files replace compressed JSON as the authoritative activity data source

---

## 1. Executive Summary

### Current Architecture (JSON-Based)

GradientPeak currently implements a local-first recording architecture where:

1. **Mobile Recording**: `ActivityRecorderService` buffers sensor data (HR, power, cadence, GPS) in memory
2. **Local Persistence**: Chunked JSON files written every 100 samples to Expo SQLite for fault tolerance
3. **Compression**: Upon recording completion, chunks are aggregated and compressed using gzip/pako into base64 payloads
4. **Cloud Upload**: Compressed streams submitted via tRPC to Supabase PostgreSQL `activity_streams` table
5. **Server Processing**: Background workers decompress streams, fetch performance metrics (FTP, LTHR), calculate advanced metrics (TSS, IF, NP), and update activity records

### Proposed Architecture (FIT-Based)

The new system eliminates JSON compression and replaces it with real-time FIT encoding:

1. **Real-Time FIT Encoding**: Mobile app writes FIT messages incrementally during recording using `easy-fit` library
2. **Checkpoint Strategy**: Flush FIT file to device storage every 100 samples or 60 seconds for crash recovery
3. **Direct Upload**: Upon recording finish, upload complete FIT file to Supabase Storage bucket via signed URL
4. **Asynchronous Processing**: Background worker parses FIT, creates activity record, computes all metrics
5. **Database as Cache**: Activity table records are derived views of FIT file data, not primary storage

### Migration Benefits

| Benefit | Description |
|---------|-------------|
| **Industry Standard** | Native compatibility with Garmin, Strava, Wahoo ecosystems |
| **Data Richness** | FIT supports 100+ native message types beyond basic sensor data |
| **Crash Safety** | Incremental checkpoints preserve partial recordings on app crashes |
| **Simplified Architecture** | Eliminates custom compression/decompression logic |
| **Storage Efficiency** | Binary FIT format comparable to gzipped JSON (~200 KB/hour) |
| **Vendor Independence** | Open format prevents lock-in to proprietary JSON schema |

### In-Scope Requirements

- ✅ Real-time FIT recording with incremental message writing
- ✅ Checkpoint-based crash recovery (100 samples or 60 seconds)
- ✅ Supabase Storage integration with signed URLs
- ✅ Background worker for FIT parsing and metric calculation
- ✅ Database schema updates for async-first architecture
- ✅ Mobile UI updates for processing state visibility
- ✅ One-time migration script for historical JSON activities

### Out-of-Scope Items

- ❌ Multi-sport activities in single FIT file (one activity = one file)
- ❌ Advanced FIT developer fields (use standard messages only)
- ❌ Real-time cloud sync during recording (upload only on finish)
- ❌ Client-side metric calculation (all metrics computed server-side)

---

## 2. Technical Architecture

### 2.1 Data Flow: Recording to Storage

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MOBILE APP (Expo/React Native)                    │
│                                                                      │
│  1. USER STARTS RECORDING                                           │
│     └─> ActivityRecorderService initializes                         │
│     └─> StreamingFitEncoder.start()                                │
│     └─> Create temp file: /cache/recordings/{recordingId}.fit      │
│     └─> Write FIT header, file_id, user_profile messages           │
│                                                                      │
│  2. SENSOR CAPTURE LOOP (1-4Hz)                                     │
│     └─> Sensor data arrives (HR, Power, GPS, Cadence)              │
│     └─> Convert to FIT record message                              │
│     └─> StreamingFitEncoder.addSample()                            │
│     └─> Checkpoint trigger every 100 samples OR 60 seconds:        │
│         └─> Flush encoder buffer to device storage                 │
│         └─> Update checkpoint metadata                             │
│                                                                      │
│  3. USER FINISHES RECORDING                                         │
│     └─> Calculate session summary metrics                          │
│     └─> Write session, lap, event messages                         │
│     └─> StreamingFitEncoder.finalize()                             │
│     └─> Result: Complete .fit file on device                       │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 4. REQUEST SIGNED URL
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS API (tRPC Routes)                        │
│                                                                      │
│  trpc.activities.requestFitUploadUrl.mutate()                       │
│     └─> Generate activityId (UUID)                                 │
│     └─> Create Supabase Storage path:                              │
│         activities/{userId}/{activityId}/{timestamp}.fit            │
│     └─> Generate signed upload URL (15 min expiry)                 │
│     └─> Create PENDING activity stub in PostgreSQL:                │
│         • id = activityId                                           │
│         • profile_id = userId                                       │
│         • fit_file_path = storage path                              │
│         • processing_status = 'PENDING_UPLOAD'                      │
│         • ALL other fields NULL                                     │
│     └─> Return { uploadUrl, storagePath, activityId }              │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 5. UPLOAD FIT FILE
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      SUPABASE STORAGE                                │
│                                                                      │
│  Mobile → PUT request to signed URL                                 │
│     └─> Content-Type: application/vnd.ant.fit                       │
│     └─> No proxy through application server                         │
│     └─> Bucket: activity-files (private)                            │
│     └─> Path: activities/{userId}/{activityId}/{timestamp}.fit      │
│     └─> Row-Level Security enforced                                 │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 6. FINALIZE UPLOAD
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS API (tRPC Routes)                        │
│                                                                      │
│  trpc.activities.finalizeUpload.mutate({ activityId })              │
│     └─> Update activity.processing_status = 'UPLOADED'             │
│     └─> Enqueue BullMQ job: analyze-fit                            │
│         Payload: { activityId, storagePath }                        │
│     └─> Return immediately (non-blocking)                           │
│     └─> Client navigates to activity detail (loading state)        │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 7. BACKGROUND ANALYSIS
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND WORKER (Node.js)                       │
│                                                                      │
│  BullMQ Job Worker                                                  │
│     └─> Fetch FIT file from Supabase Storage                        │
│     └─> Parse using @garmin/fitsdk:                                │
│         • Extract file_id, session, record messages, laps           │
│     └─> Fetch user profile (FTP, LTHR) for metric calculation      │
│     └─> Calculate performance metrics:                              │
│         • Normalized Power (30-sec rolling avg, 4th power)          │
│         • Intensity Factor (NP / FTP)                               │
│         • TSS: (duration × NP × IF) / (FTP × 3600) × 100            │
│         • HR/Power zone distributions                               │
│         • Generate polyline from GPS coordinates                    │
│     └─> Update activity record (atomic transaction):               │
│         • All fields populated from FIT data                        │
│         • processing_status = 'COMPLETED'                           │
│     └─> Optional: Cache extracted streams in Redis                 │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ 8. UI CONSUMPTION
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    WEB/MOBILE UI (React/Next.js)                    │
│                                                                      │
│  Activity List                                                      │
│     └─> Query WHERE processing_status = 'COMPLETED'                │
│     └─> Display polyline, TSS, distance, duration                  │
│                                                                      │
│  Activity Detail                                                    │
│     └─> If status = 'UPLOADED' or 'PROCESSING':                    │
│         Show spinner "Processing activity..."                       │
│         Poll status every 5 seconds                                 │
│     └─> If status = 'COMPLETED':                                   │
│         Load full activity data                                     │
│         Render charts (HR, power, pace vs time)                    │
│     └─> If status = 'FAILED':                                      │
│         Show error with retry button                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENT                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  StreamingFitEncoder (easy-fit library)                    │ │
│  │  • Initialize: Write FIT header, file_id, user_profile     │ │
│  │  • Per-sample: Append FIT record message (1-4Hz)           │ │
│  │  • Checkpoint: Flush to device storage every 100/60s       │ │
│  │  • Finalize: Write session, laps, event messages           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Device Storage (Crash-Safe)                                │ │
│  │  /cache/recordings/{recordingId}.fit                        │ │
│  │  /cache/recordings/{recordingId}.meta.json (checkpoint)     │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ↓ (tRPC API calls)
┌──────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API LAYER                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  tRPC Router: activities                                    │ │
│  │  • requestFitUploadUrl: Generate signed URL                 │ │
│  │  • finalizeUpload: Trigger background processing            │ │
│  │  • getById: Fetch activity with status                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Supabase Client                                            │ │
│  │  • Storage: signed URL generation                           │ │
│  │  • Database: activity stub creation                         │ │
│  │  • Auth: user session management                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│                      SUPABASE INFRASTRUCTURE                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Storage Bucket: activity-files                             │ │
│  │  • Private bucket with RLS policies                         │ │
│  │  • Path structure: activities/{userId}/{activityId}/        │ │
│  │  • Automatic compression for FIT files                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL Database                                        │ │
│  │  • activities table (async-first schema)                    │ │
│  │  • profiles table (FTP, LTHR, zones)                        │ │
│  │  • RLS policies for data isolation                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Realtime Subscriptions (optional)                          │ │
│  │  • Activity status change notifications                     │ │
│  │  • Alternative to 5-second polling                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│                    BACKGROUND WORKER SERVICE                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  BullMQ Queue Processor                                     │ │
│  │  • Job queue: analyze-fit                                   │ │
│  │  • Redis backing store                                      │ │
│  │  • Horizontal scaling support                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  FIT Parser (@garmin/fitsdk)                                │ │
│  │  • Parse file_id, session, records, laps                    │ │
│  │  • Extract time-series streams                              │ │
│  │  • Convert semicircles to lat/lng                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  MetricsCalculator (@repo/core)                             │ │
│  │  • Normalized Power calculation                             │ │
│  │  • TSS, Intensity Factor                                    │ │
│  │  • HR/Power zone analysis                                   │ │
│  │  • Polyline encoding                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 Supabase Storage Configuration

**Bucket Setup:**

```sql
-- Create private storage bucket for activity files
INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-files', 'activity-files', false);

-- Set size limits and allowed MIME types
UPDATE storage.buckets
SET 
  file_size_limit = 10485760, -- 10 MB max per file
  allowed_mime_types = ARRAY['application/vnd.ant.fit', 'application/octet-stream']
WHERE id = 'activity-files';
```

**Row-Level Security Policies:**

```sql
-- Allow users to upload their own activity files
CREATE POLICY "Users can upload their own activity files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'activity-files' AND
  (storage.foldername(name))[1] = 'activities' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to read their own activity files
CREATE POLICY "Users can read their own activity files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'activity-files' AND
  (storage.foldername(name))[1] = 'activities' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow service role to read all files (for background workers)
CREATE POLICY "Service role can read all activity files"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'activity-files');

-- Prevent deletion of files (audit trail)
CREATE POLICY "Prevent deletion of activity files"
ON storage.objects FOR DELETE
TO authenticated
USING (false);
```

**Path Structure:**

```
activity-files/
└── activities/
    └── {userId}/           # UUID of profile/user
        └── {activityId}/   # UUID of activity
            └── {timestamp}.fit   # ISO timestamp + .fit
            
Example:
activity-files/activities/550e8400-e29b-41d4-a716-446655440000/
                         abc123-def456-ghi789/
                         2026-01-20T15-30-45.123Z.fit
```

---

## 3. Database Schema Updates

### 3.1 Activities Table Migration

**Current Schema:**

```sql
CREATE TABLE public.activities (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    type text NOT NULL, -- 'cycling', 'running', 'swimming'
    started_at timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    distance_meters numeric NOT NULL,
    duration_seconds integer NOT NULL,
    moving_seconds integer,
    elevation_gain_meters numeric,
    metrics jsonb, -- { tss, if, np, polyline, avg_hr, max_power, ... }
    hr_zone_seconds integer[5], -- [z1, z2, z3, z4, z5]
    power_zone_seconds integer[7], -- [z1, ..., z7]
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Updated Schema (Async-First):**

```sql
-- Add new columns for FIT file reference and processing status
ALTER TABLE public.activities
ADD COLUMN fit_file_path text,
ADD COLUMN processing_status text DEFAULT 'PENDING_UPLOAD' 
    CHECK (processing_status IN (
        'PENDING_UPLOAD',  -- Activity stub created, awaiting FIT upload
        'UPLOADED',        -- FIT file in Supabase Storage, awaiting processing
        'PROCESSING',      -- Background worker parsing FIT
        'COMPLETED',       -- All metrics calculated, ready for display
        'FAILED'           -- Processing failed (manual intervention needed)
    ));

-- Make most fields nullable (populated by background worker)
ALTER TABLE public.activities
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN type DROP NOT NULL,
ALTER COLUMN started_at DROP NOT NULL,
ALTER COLUMN finished_at DROP NOT NULL,
ALTER COLUMN distance_meters DROP NOT NULL,
ALTER COLUMN duration_seconds DROP NOT NULL;

-- Set sensible defaults for nullable fields
ALTER TABLE public.activities
ALTER COLUMN name SET DEFAULT 'Untitled Activity',
ALTER COLUMN type SET DEFAULT 'other',
ALTER COLUMN distance_meters SET DEFAULT 0,
ALTER COLUMN duration_seconds SET DEFAULT 0;

-- Add indexes for worker queries and UI filters
CREATE INDEX idx_activities_processing_status 
    ON public.activities(processing_status)
    WHERE processing_status IN ('UPLOADED', 'PROCESSING');

CREATE INDEX idx_activities_fit_file_path 
    ON public.activities(fit_file_path)
    WHERE fit_file_path IS NOT NULL;

-- Index for UI queries (only show completed activities)
CREATE INDEX idx_activities_completed 
    ON public.activities(profile_id, started_at DESC)
    WHERE processing_status = 'COMPLETED';

-- Add column comments for documentation
COMMENT ON COLUMN public.activities.fit_file_path IS
'Supabase Storage path for FIT file. Format: activities/{userId}/{activityId}/{timestamp}.fit';

COMMENT ON COLUMN public.activities.processing_status IS
'Processing lifecycle:
- PENDING_UPLOAD: Activity stub created, awaiting FIT upload from mobile
- UPLOADED: FIT file uploaded to Supabase Storage, background job enqueued
- PROCESSING: Background worker parsing FIT and calculating metrics
- COMPLETED: All fields populated, activity ready for display
- FAILED: Processing failed, manual intervention required';
```

### 3.2 Deprecate activity_streams Table

```sql
-- Mark table as deprecated (will be dropped post-migration)
COMMENT ON TABLE public.activity_streams IS 
'DEPRECATED: Replaced by FIT files in Supabase Storage. This table will be dropped after full migration.
New activities do NOT use this table. Historical activities will be migrated via migration script.';

-- After successful migration, drop the table:
-- DROP TABLE public.activity_streams CASCADE;
```

### 3.3 Migration Tracking Table

```sql
-- Track conversion of legacy JSON activities to FIT format
CREATE TABLE IF NOT EXISTS public.activity_migrations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    migration_status text NOT NULL CHECK (migration_status IN (
        'PENDING',      -- Activity queued for migration
        'IN_PROGRESS',  -- FIT file being created from JSON
        'COMPLETED',    -- Successfully migrated to FIT
        'FAILED'        -- Migration failed (see error_message)
    )),
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(activity_id)
);

CREATE INDEX idx_activity_migrations_status
    ON public.activity_migrations(migration_status)
    WHERE migration_status IN ('PENDING', 'IN_PROGRESS');

COMMENT ON TABLE public.activity_migrations IS
'Tracks conversion of legacy compressed JSON activities to FIT format. 
Safe to drop after full migration completes.';
```

### 3.4 Updated Row-Level Security Policies

```sql
-- Allow users to view their own activities (including pending)
CREATE POLICY "Users can view their own activities"
    ON public.activities
    FOR SELECT
    USING (profile_id = auth.uid());

-- Allow users to create activity stubs (minimal fields)
CREATE POLICY "Users can create activity stubs"
    ON public.activities
    FOR INSERT
    WITH CHECK (
        profile_id = auth.uid() AND
        processing_status = 'PENDING_UPLOAD' AND
        fit_file_path IS NOT NULL
    );

-- Allow users to update status during upload finalization
CREATE POLICY "Users can finalize their own uploads"
    ON public.activities
    FOR UPDATE
    USING (profile_id = auth.uid())
    WITH CHECK (
        profile_id = auth.uid() AND
        processing_status IN ('UPLOADED', 'FAILED')
    );

-- Service role can update any activity (for background workers)
-- No explicit policy needed; service role bypasses RLS
```

---

## 4. Implementation Details

### 4.1 Mobile: Real-Time FIT Recording

**Installation:**

```bash
cd apps/mobile
npm install easy-fit
npm install uuid
```

**Core Service: StreamingFitEncoder**

File: `apps/mobile/lib/services/fit/StreamingFitEncoder.ts`

```typescript
/**
 * StreamingFitEncoder - Real-Time FIT Recording with Checkpointing
 * 
 * Records sensor data directly to FIT file format during activity capture.
 * Implements crash recovery via periodic checkpoints to device storage.
 * 
 * Usage:
 *   const encoder = new StreamingFitEncoder(userProfile);
 *   await encoder.start({ sport: 'cycling', indoor: false });
 *   
 *   // Called at 1-4Hz by sensor listeners
 *   await encoder.addSample({ 
 *     timestamp: new Date(), 
 *     heart_rate: 150, 
 *     power: 250,
 *     position_lat: 43.6532,
 *     position_long: -72.3174
 *   });
 *   
 *   const fitFilePath = await encoder.finish();
 *   // Upload fitFilePath to Supabase Storage
 */

import { FitWriter } from 'easy-fit';
import * as FileSystem from 'expo-file-system';
import { v4 as uuid } from 'uuid';

export interface SensorSample {
  timestamp: Date;
  position_lat?: number;      // degrees
  position_long?: number;     // degrees
  distance?: number;          // cumulative meters
  altitude?: number;          // meters
  speed?: number;             // m/s
  heart_rate?: number;        // bpm
  cadence?: number;           // rpm
  power?: number;             // watts
  temperature?: number;       // celsius
}

export interface ActivityMetadata {
  sport: 'cycling' | 'running' | 'swimming' | 'other';
  indoor: boolean;
}

export interface UserProfile {
  weight_kg: number;
  age: number;
  ftp: number;
  max_heart_rate: number;
}

export class StreamingFitEncoder {
  private writer: FitWriter | null = null;
  private recordingId: string | null = null;
  private fitFilePath: string | null = null;
  private metaFilePath: string | null = null;
  
  private sampleCount = 0;
  private lastCheckpoint = Date.now();
  private startTime: Date | null = null;
  private metadata: ActivityMetadata | null = null;
  
  private samples: SensorSample[] = []; // For session summary calculation
  
  constructor(private profile: UserProfile) {}
  
  /**
   * Initialize FIT recording session
   */
  async start(metadata: ActivityMetadata): Promise<void> {
    this.recordingId = uuid();
    this.startTime = new Date();
    this.metadata = metadata;
    
    // Create recording directory
    const recordingsDir = `${FileSystem.cacheDirectory}recordings`;
    await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
    
    // File paths
    this.fitFilePath = `${recordingsDir}/${this.recordingId}.fit`;
    this.metaFilePath = `${recordingsDir}/${this.recordingId}.meta.json`;
    
    // Initialize FIT writer
    this.writer = new FitWriter();
    await this.writer.open(this.fitFilePath);
    
    // Write FIT file header
    this.writer.writeFileId({
      type: 'activity',
      manufacturer: 'development', // Garmin manufacturer ID
      product: 0,
      timeCreated: this.dateToFitTimestamp(this.startTime),
      serialNumber: Math.floor(Math.random() * 1000000)
    });
    
    // Write user profile
    this.writer.writeUserProfile({
      weight: this.profile.weight_kg,
      age: this.profile.age,
      functionalThresholdPower: this.profile.ftp,
      maxHeartRate: this.profile.max_heart_rate
    });
    
    // Write timer start event
    this.writer.writeEvent({
      event: 'timer',
      eventType: 'start',
      timestamp: this.dateToFitTimestamp(this.startTime)
    });
    
    // Write checkpoint metadata
    await this.writeCheckpointMeta();
    
    console.log(`📹 Recording started: ${this.recordingId}`);
  }
  
  /**
   * Add sensor sample (called at 1-4Hz)
   */
  async addSample(sample: SensorSample): Promise<void> {
    if (!this.writer) throw new Error('Recording not started');
    
    // Store for summary calculation
    this.samples.push(sample);
    
    // Write FIT record message
    const fitRecord = {
      timestamp: this.dateToFitTimestamp(sample.timestamp),
      positionLat: sample.position_lat 
        ? this.degreesToSemicircles(sample.position_lat) 
        : undefined,
      positionLong: sample.position_long 
        ? this.degreesToSemicircles(sample.position_long) 
        : undefined,
      distance: sample.distance,
      altitude: sample.altitude,
      speed: sample.speed ? sample.speed * 1000 : undefined, // m/s to mm/s
      heartRate: sample.heart_rate,
      cadence: sample.cadence,
      power: sample.power,
      temperature: sample.temperature
    };
    
    this.writer.writeRecord(fitRecord);
    this.sampleCount++;
    
    // Checkpoint every 100 samples OR every 60 seconds
    const now = Date.now();
    if (this.sampleCount % 100 === 0 || now - this.lastCheckpoint > 60000) {
      await this.checkpoint();
    }
  }
  
  /**
   * Flush data to disk for crash recovery
   */
  private async checkpoint(): Promise<void> {
    if (!this.writer || !this.metaFilePath) return;
    
    // Flush FIT writer to disk
    await this.writer.flush();
    
    // Update checkpoint metadata
    const lastSample = this.samples[this.samples.length - 1];
    await FileSystem.writeAsStringAsync(
      this.metaFilePath,
      JSON.stringify({
        recordingId: this.recordingId,
        startTime: this.startTime?.toISOString(),
        lastSampleIndex: this.sampleCount,
        lastTimestamp: lastSample?.timestamp.toISOString(),
        fitFilePath: this.fitFilePath,
        metadata: this.metadata
      })
    );
    
    this.lastCheckpoint = Date.now();
    console.log(`✅ Checkpoint: ${this.sampleCount} samples`);
  }
  
  /**
   * Finalize FIT file with session summary
   */
  async finish(): Promise<string> {
    if (!this.writer || !this.fitFilePath) {
      throw new Error('Recording not started');
    }
    
    const endTime = new Date();
    
    // Calculate session summary metrics
    const sessionMetrics = this.calculateSessionMetrics(endTime);
    
    // Write session message
    this.writer.writeSession({
      sport: this.metadata!.sport,
      startTime: this.dateToFitTimestamp(this.startTime!),
      timestamp: this.dateToFitTimestamp(endTime),
      totalElapsedTime: sessionMetrics.totalElapsedTime,
      totalTimerTime: sessionMetrics.totalTimerTime,
      totalDistance: sessionMetrics.totalDistance,
      avgHeartRate: sessionMetrics.avgHeartRate,
      maxHeartRate: sessionMetrics.maxHeartRate,
      avgPower: sessionMetrics.avgPower,
      maxPower: sessionMetrics.maxPower,
      avgCadence: sessionMetrics.avgCadence
    });
    
    // Write timer stop event
    this.writer.writeEvent({
      event: 'timer',
      eventType: 'stopAll',
      timestamp: this.dateToFitTimestamp(endTime)
    });
    
    // Close FIT writer (writes CRC checksum)
    await this.writer.close();
    
    // Delete checkpoint metadata
    if (this.metaFilePath) {
      await FileSystem.deleteAsync(this.metaFilePath, { idempotent: true });
    }
    
    console.log(`✅ Recording finished: ${this.fitFilePath}`);
    return this.fitFilePath;
  }
  
  /**
   * Calculate session summary from recorded samples
   */
  private calculateSessionMetrics(endTime: Date) {
    const hrSamples = this.samples
      .map(s => s.heart_rate)
      .filter(Boolean) as number[];
    const powerSamples = this.samples
      .map(s => s.power)
      .filter(Boolean) as number[];
    const cadenceSamples = this.samples
      .map(s => s.cadence)
      .filter(Boolean) as number[];
    
    const lastSample = this.samples[this.samples.length - 1];
    
    // Calculate moving time (samples where speed > 0)
    const movingSamples = this.samples.filter(s => 
      s.speed && s.speed > 0.5 // 0.5 m/s threshold
    );
    const movingTime = movingSamples.length; // Approximate (assumes 1Hz)
    
    return {
      sport: this.metadata!.sport,
      totalElapsedTime: (endTime.getTime() - this.startTime!.getTime()) / 1000,
      totalTimerTime: movingTime,
      totalDistance: lastSample?.distance || 0,
      avgHeartRate: hrSamples.length > 0 
        ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) 
        : undefined,
      maxHeartRate: hrSamples.length > 0 
        ? Math.max(...hrSamples) 
        : undefined,
      avgPower: powerSamples.length > 0 
        ? Math.round(powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length) 
        : undefined,
      maxPower: powerSamples.length > 0 
        ? Math.max(...powerSamples) 
        : undefined,
      avgCadence: cadenceSamples.length > 0 
        ? Math.round(cadenceSamples.reduce((a, b) => a + b, 0) / cadenceSamples.length) 
        : undefined
    };
  }
  
  /**
   * Convert JavaScript Date to FIT timestamp
   * FIT epoch: 1989-12-31 00:00:00 UTC
   */
  private dateToFitTimestamp(date: Date): number {
    const FIT_EPOCH_OFFSET = 631065600; // Seconds between Unix and FIT epochs
    return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
  }
  
  /**
   * Convert degrees to semicircles (FIT format for lat/lng)
   * Semicircles = degrees × (2^31 / 180)
   */
  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (Math.pow(2, 31) / 180));
  }
  
  /**
   * Write checkpoint metadata for crash recovery
   */
  private async writeCheckpointMeta(): Promise<void> {
    if (!this.metaFilePath) return;
    
    await FileSystem.writeAsStringAsync(
      this.metaFilePath,
      JSON.stringify({
        recordingId: this.recordingId,
        startTime: this.startTime?.toISOString(),
        lastSampleIndex: 0,
        lastTimestamp: this.startTime?.toISOString(),
        fitFilePath: this.fitFilePath,
        metadata: this.metadata
      })
    );
  }
}
```

### 4.2 Mobile: FIT File Upload Service

File: `apps/mobile/lib/services/fit/FitUploader.ts`

```typescript
/**
 * FitUploader - Handles FIT file upload to Supabase Storage
 * 
 * Workflow:
 * 1. Request signed upload URL from API
 * 2. Upload FIT file directly to Supabase Storage
 * 3. Finalize upload to trigger background processing
 * 4. Clean up local file
 */

import * as FileSystem from 'expo-file-system';
import { trpc } from '@/lib/trpc';

export class FitUploader {
  /**
   * Upload completed FIT file to Supabase Storage
   * 
   * @param fitFilePath - Local device path to FIT file
   * @returns activityId - UUID of created activity
   */
  async uploadActivity(fitFilePath: string): Promise<string> {
    try {
      // 1. Request signed upload URL from API
      const { uploadUrl, storagePath, activityId } = 
        await trpc.activities.requestFitUploadUrl.mutate({
          filename: `${new Date().toISOString()}.fit`
        });
      
      console.log(`📤 Uploading to: ${storagePath}`);
      
      // 2. Read FIT file from device storage
      const fitData = await FileSystem.readAsStringAsync(fitFilePath, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Convert base64 to binary
      const fitBytes = this.base64ToArrayBuffer(fitData);
      
      // 3. Upload to Supabase Storage via signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.ant.fit',
          'Content-Length': fitBytes.byteLength.toString()
        },
        body: fitBytes
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }
      
      console.log(`✅ Upload complete: ${activityId}`);
      
      // 4. Finalize upload (triggers background processing)
      await trpc.activities.finalizeUpload.mutate({ activityId });
      
      // 5. Delete local FIT file
      await FileSystem.deleteAsync(fitFilePath, { idempotent: true });
      
      return activityId;
      
    } catch (error) {
      console.error('FIT upload failed:', error);
      throw error;
    }
  }
  
  /**
   * Convert base64 string to ArrayBuffer for binary upload
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
```

### 4.3 Backend: tRPC API Routes

File: `packages/trpc/src/routers/activities.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { v4 as uuid } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import { enqueueJob } from '@/lib/queue'; // BullMQ job queue

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const activitiesRouter = router({
  /**
   * Request signed upload URL for FIT file
   * Creates activity stub in database with PENDING_UPLOAD status
   */
  requestFitUploadUrl: protectedProcedure
    .input(z.object({ 
      filename: z.string() 
    }))
    .mutation(async ({ ctx, input }) => {
      const activityId = uuid();
      const userId = ctx.session.user.id;
      
      // Generate Supabase Storage path
      const storagePath = `activities/${userId}/${activityId}/${input.filename}`;
      
      // Create activity stub in database
      const { error: dbError } = await ctx.db
        .from('activities')
        .insert({
          id: activityId,
          profile_id: userId,
          fit_file_path: storagePath,
          processing_status: 'PENDING_UPLOAD',
          created_at: new Date().toISOString()
          // All other fields remain NULL
        });
      
      if (dbError) {
        throw new Error(`Failed to create activity stub: ${dbError.message}`);
      }
      
      // Generate signed upload URL (15 min expiry)
      const { data, error } = await supabase.storage
        .from('activity-files')
        .createSignedUploadUrl(storagePath, {
          upsert: false
        });
      
      if (error || !data) {
        throw new Error(`Failed to generate upload URL: ${error?.message}`);
      }
      
      return {
        uploadUrl: data.signedUrl,
        storagePath,
        activityId
      };
    }),
  
  /**
   * Finalize upload and trigger background processing
   */
  finalizeUpload: protectedProcedure
    .input(z.object({ 
      activityId: z.string().uuid() 
    }))
    .mutation(async ({ ctx, input }) => {
      // Update activity status to UPLOADED
      const { error } = await ctx.db
        .from('activities')
        .update({ 
          processing_status: 'UPLOADED',
          updated_at: new Date().toISOString()
        })
        .eq('id', input.activityId)
        .eq('profile_id', ctx.session.user.id); // Ensure ownership
      
      if (error) {
        throw new Error(`Failed to update activity: ${error.message}`);
      }
      
      // Enqueue background job for FIT analysis
      await enqueueJob('analyze-fit', {
        activityId: input.activityId
      });
      
      return { 
        success: true, 
        activityId: input.activityId 
      };
    }),
  
  /**
   * Get activity by ID (with processing status)
   */
  getById: protectedProcedure
    .input(z.object({ 
      id: z.string().uuid() 
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('activities')
        .select('*')
        .eq('id', input.id)
        .eq('profile_id', ctx.session.user.id)
        .single();
      
      if (error || !data) {
        throw new Error('Activity not found');
      }
      
      return data;
    }),
  
  /**
   * List completed activities for user
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0)
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('activities')
        .select('*')
        .eq('profile_id', ctx.session.user.id)
        .eq('processing_status', 'COMPLETED') // Only show completed
        .order('started_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      
      if (error) {
        throw new Error(`Failed to fetch activities: ${error.message}`);
      }
      
      return data || [];
    })
});
```

### 4.4 Backend: Background Worker for FIT Analysis

File: `packages/workers/src/jobs/analyzeFit.ts`

```typescript
/**
 * Background job: analyze-fit
 * 
 * Processes uploaded FIT files:
 * 1. Fetch FIT file from Supabase Storage
 * 2. Parse FIT messages using @garmin/fitsdk
 * 3. Calculate performance metrics using @repo/core
 * 4. Update activity record with all fields
 */

import { Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { FitParser, Stream } from '@garmin/fitsdk';
import { 
  calculateNormalizedPower, 
  calculateTSS, 
  calculateIntensityFactor,
  calculateHrZones,
  calculatePowerZones 
} from '@repo/core';
import polyline from '@mapbox/polyline';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AnalyzeFitPayload {
  activityId: string;
}

export async function analyzeFit(job: Job<AnalyzeFitPayload>) {
  const { activityId } = job.data;
  
  try {
    // Update status to PROCESSING
    await updateStatus(activityId, 'PROCESSING');
    
    // 1. Fetch activity to get fit_file_path
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select('fit_file_path, profile_id')
      .eq('id', activityId)
      .single();
    
    if (fetchError || !activity) {
      throw new Error(`Activity not found: ${activityId}`);
    }
    
    if (!activity.fit_file_path) {
      throw new Error('No FIT file path in activity record');
    }
    
    // 2. Download FIT file from Supabase Storage
    const { data: fitData, error: storageError } = await supabase.storage
      .from('activity-files')
      .download(activity.fit_file_path);
    
    if (storageError || !fitData) {
      throw new Error(`Failed to download FIT file: ${storageError?.message}`);
    }
    
    // 3. Parse FIT file
    const fitBuffer = await fitData.arrayBuffer();
    const parsedFit = FitParser.parse(fitBuffer);
    
    // Extract messages
    const fileId = parsedFit.messages.fileIdMesgs[0];
    const session = parsedFit.messages.sessionMesgs[0];
    const records = parsedFit.messages.recordMesgs || [];
    const laps = parsedFit.messages.lapMesgs || [];
    
    // 4. Fetch user profile for metric calculations
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ftp, threshold_hr, max_heart_rate, weight_kg')
      .eq('id', activity.profile_id)
      .single();
    
    if (profileError || !profile) {
      throw new Error('Profile not found');
    }
    
    const userFTP = profile.ftp || 200; // Default FTP
    const userMaxHR = profile.max_heart_rate || 190;
    const userThresholdHR = profile.threshold_hr || 170;
    
    // 5. Calculate performance metrics
    const powerSamples = records
      .map(r => r.power)
      .filter(Boolean) as number[];
    const hrSamples = records
      .map(r => r.heartRate)
      .filter(Boolean) as number[];
    
    // Normalized Power (30-second rolling average, 4th power)
    const normalizedPower = calculateNormalizedPower(powerSamples, 30);
    
    // Intensity Factor = NP / FTP
    const intensityFactor = calculateIntensityFactor(normalizedPower, userFTP);
    
    // TSS = (duration × NP × IF) / (FTP × 3600) × 100
    const duration = session.totalElapsedTime || 0;
    const tss = calculateTSS(duration, normalizedPower, intensityFactor, userFTP);
    
    // Zone distributions
    const hrZones = calculateHrZones(hrSamples, userThresholdHR, userMaxHR);
    const powerZones = calculatePowerZones(powerSamples, userFTP);
    
    // 6. Generate polyline from GPS coordinates
    const gpsPoints = records
      .filter(r => r.positionLat && r.positionLong)
      .map(r => [
        semicirclesToDegrees(r.positionLat!),
        semicirclesToDegrees(r.positionLong!)
      ]);
    
    const encodedPolyline = gpsPoints.length > 0 
      ? polyline.encode(gpsPoints) 
      : null;
    
    // 7. Update activity record with ALL fields (atomic transaction)
    const { error: updateError } = await supabase
      .from('activities')
      .update({
        name: session.name || `${session.sport} Activity`,
        type: session.sport || 'other',
        started_at: fitTimestampToIso(session.startTime),
        finished_at: fitTimestampToIso(session.timestamp),
        distance_meters: session.totalDistance || 0,
        duration_seconds: session.totalElapsedTime || 0,
        moving_seconds: session.totalTimerTime || 0,
        elevation_gain_meters: session.totalAscent || 0,
        metrics: {
          tss,
          intensity_factor: intensityFactor,
          normalized_power: normalizedPower,
          avg_heart_rate: session.avgHeartRate,
          max_heart_rate: session.maxHeartRate,
          avg_power: session.avgPower,
          max_power: session.maxPower,
          avg_cadence: session.avgCadence,
          polyline: encodedPolyline
        },
        hr_zone_seconds: hrZones,
        power_zone_seconds: powerZones,
        processing_status: 'COMPLETED',
        updated_at: new Date().toISOString()
      })
      .eq('id', activityId);
    
    if (updateError) {
      throw new Error(`Failed to update activity: ${updateError.message}`);
    }
    
    console.log(`✅ Activity processed successfully: ${activityId}`);
    
  } catch (error) {
    console.error(`❌ Activity processing failed: ${activityId}`, error);
    
    // Update status to FAILED
    await updateStatus(activityId, 'FAILED');
    
    // Rethrow to trigger BullMQ retry mechanism
    throw error;
  }
}

/**
 * Helper: Update activity processing status
 */
async function updateStatus(
  activityId: string, 
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
): Promise<void> {
  await supabase
    .from('activities')
    .update({ 
      processing_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', activityId);
}

/**
 * Helper: Convert FIT timestamp to ISO string
 * FIT epoch: 1989-12-31 00:00:00 UTC
 */
function fitTimestampToIso(fitTimestamp: number): string {
  const FIT_EPOCH_OFFSET = 631065600;
  const unixTimestamp = (fitTimestamp + FIT_EPOCH_OFFSET) * 1000;
  return new Date(unixTimestamp).toISOString();
}

/**
 * Helper: Convert semicircles to degrees
 */
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

---

## 5. Mobile UI Updates

### 5.1 Activity Recording Hook

File: `apps/mobile/lib/hooks/useActivityRecorder.ts`

```typescript
import { useState, useCallback } from 'react';
import { StreamingFitEncoder, ActivityMetadata, SensorSample } from '@/lib/services/fit/StreamingFitEncoder';
import { FitUploader } from '@/lib/services/fit/FitUploader';
import { useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';

export function useActivityRecorder() {
  const router = useRouter();
  const [encoder, setEncoder] = useState<StreamingFitEncoder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  
  // Fetch user profile for FIT encoding
  const { data: profile } = trpc.profiles.getCurrent.useQuery();
  
  /**
   * Start new recording
   */
  const startRecording = useCallback(async (metadata: ActivityMetadata) => {
    if (!profile) {
      throw new Error('User profile not loaded');
    }
    
    const newEncoder = new StreamingFitEncoder({
      weight_kg: profile.weight_kg,
      age: profile.age,
      ftp: profile.ftp || 200,
      max_heart_rate: profile.max_heart_rate || 190
    });
    
    await newEncoder.start(metadata);
    setEncoder(newEncoder);
    setIsRecording(true);
    
    console.log('🎬 Recording started');
  }, [profile]);
  
  /**
   * Add sensor sample (called from sensor listeners)
   */
  const addSample = useCallback(async (sample: SensorSample) => {
    if (!encoder) {
      console.warn('Cannot add sample: encoder not initialized');
      return;
    }
    
    await encoder.addSample(sample);
  }, [encoder]);
  
  /**
   * Finish recording and upload to Supabase
   */
  const finishRecording = useCallback(async () => {
    if (!encoder) {
      throw new Error('No active recording');
    }
    
    try {
      // Finalize FIT file
      const fitFilePath = await encoder.finalize();
      console.log('✅ FIT file created:', fitFilePath);
      
      // Upload to Supabase Storage
      const uploader = new FitUploader();
      const activityId = await uploader.uploadActivity(fitFilePath);
      
      // Reset state
      setEncoder(null);
      setIsRecording(false);
      
      // Navigate to activity detail (will show processing state)
      router.push(`/activity/${activityId}`);
      
    } catch (error) {
      console.error('Failed to finish recording:', error);
      throw error;
    }
  }, [encoder, router]);
  
  return {
    isRecording,
    startRecording,
    addSample,
    finishRecording
  };
}
```

### 5.2 Activity Detail Screen

File: `apps/mobile/app/(internal)/(standard)/activity/[id].tsx`

```tsx
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/Button';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  
  // Poll every 5 seconds if activity is processing
  const { data: activity, isLoading, refetch } = trpc.activities.getById.useQuery(
    { id: id! },
    { 
      refetchInterval: (data) => 
        data?.processing_status !== 'COMPLETED' ? 5000 : false,
      enabled: !!id
    }
  );
  
  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }
  
  // Activity not found
  if (!activity) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-destructive">Activity not found</Text>
      </View>
    );
  }
  
  // Processing state
  if (activity.processing_status === 'UPLOADED' || 
      activity.processing_status === 'PROCESSING') {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" className="mb-4" />
        <Text className="text-lg font-semibold mb-2">
          Processing activity...
        </Text>
        <Text className="text-muted-foreground text-center">
          This usually takes 5-15 seconds.
          We're analyzing your workout data.
        </Text>
      </View>
    );
  }
  
  // Failed state
  if (activity.processing_status === 'FAILED') {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-destructive text-lg font-semibold mb-4">
          Activity processing failed
        </Text>
        <Text className="text-muted-foreground text-center mb-6">
          We encountered an error processing your workout.
          Please try again or contact support.
        </Text>
        <Button onPress={() => retryProcessing(id)}>
          Retry Processing
        </Button>
      </View>
    );
  }
  
  // Completed activity
  return (
    <ScrollView className="flex-1 bg-background p-4">
      <Text className="text-2xl font-bold mb-4">{activity.name}</Text>
      
      {/* Metrics Grid */}
      <View className="grid grid-cols-2 gap-4 mb-6">
        <MetricCard 
          label="Distance" 
          value={`${(activity.distance_meters / 1000).toFixed(2)} km`} 
        />
        <MetricCard 
          label="Duration" 
          value={formatDuration(activity.duration_seconds)} 
        />
        <MetricCard 
          label="TSS" 
          value={activity.metrics?.tss?.toFixed(0) || 'N/A'} 
        />
        <MetricCard 
          label="Avg Power" 
          value={activity.metrics?.avg_power 
            ? `${activity.metrics.avg_power} W` 
            : 'N/A'
          } 
        />
      </View>
      
      {/* Polyline Map Preview */}
      {activity.metrics?.polyline && (
        <MapPreview polyline={activity.metrics.polyline} />
      )}
      
      {/* Additional activity details... */}
    </ScrollView>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="bg-card p-4 rounded-lg">
      <Text className="text-muted-foreground text-sm mb-1">{label}</Text>
      <Text className="text-xl font-semibold">{value}</Text>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
```

### 5.3 Crash Recovery Service

File: `apps/mobile/lib/services/fit/CrashRecovery.ts`

```typescript
/**
 * CrashRecovery - Handle incomplete recordings from app crashes
 * 
 * On app startup, checks for incomplete recordings and prompts user:
 * - Resume recording from last checkpoint
 * - Upload incomplete FIT file
 * - Discard incomplete recording
 */

import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { FitUploader } from './FitUploader';

interface RecoveryMetadata {
  recordingId: string;
  startTime: string;
  lastSampleIndex: number;
  lastTimestamp: string;
  fitFilePath: string;
  metadata: {
    sport: string;
    indoor: boolean;
  };
}

export async function recoverFromCrash(): Promise<RecoveryResult> {
  const recordingsDir = `${FileSystem.cacheDirectory}recordings`;
  
  // Check if recordings directory exists
  const dirInfo = await FileSystem.getInfoAsync(recordingsDir);
  if (!dirInfo.exists) {
    return { action: 'none' };
  }
  
  // Find all .meta.json files (checkpoint metadata)
  const files = await FileSystem.readDirectoryAsync(recordingsDir);
  const metaFiles = files.filter(f => f.endsWith('.meta.json'));
  
  if (metaFiles.length === 0) {
    return { action: 'none' };
  }
  
  // Process first incomplete recording found
  for (const metaFile of metaFiles) {
    const metaPath = `${recordingsDir}/${metaFile}`;
    const metaContent = await FileSystem.readAsStringAsync(metaPath);
    const metadata: RecoveryMetadata = JSON.parse(metaContent);
    
    // Check if FIT file exists
    const fitInfo = await FileSystem.getInfoAsync(metadata.fitFilePath);
    if (!fitInfo.exists) {
      // Clean up orphaned metadata
      await FileSystem.deleteAsync(metaPath, { idempotent: true });
      continue;
    }
    
    // Prompt user for action
    const action = await promptRecoveryAction(metadata);
    
    if (action === 'upload') {
      // Upload incomplete FIT file
      const uploader = new FitUploader();
      await uploader.uploadActivity(metadata.fitFilePath);
      
      // Clean up
      await FileSystem.deleteAsync(metadata.fitFilePath, { idempotent: true });
      await FileSystem.deleteAsync(metaPath, { idempotent: true });
      
      Alert.alert(
        'Recovery Complete',
        'Your incomplete recording has been uploaded.'
      );
    } else if (action === 'discard') {
      // Delete incomplete recording
      await FileSystem.deleteAsync(metadata.fitFilePath, { idempotent: true });
      await FileSystem.deleteAsync(metaPath, { idempotent: true });
    }
    
    // Note: 'resume' action would be handled by returning metadata
    // and letting the recording screen reinitialize from checkpoint
    
    return { action, metadata };
  }
  
  return { action: 'none' };
}

/**
 * Prompt user for recovery action
 */
async function promptRecoveryAction(
  metadata: RecoveryMetadata
): Promise<'upload' | 'discard' | 'none'> {
  return new Promise((resolve) => {
    Alert.alert(
      'Incomplete Recording Found',
      `Found ${metadata.lastSampleIndex} samples from ${new Date(metadata.startTime).toLocaleString()}.\n\nWhat would you like to do?`,
      [
        {
          text: 'Upload Incomplete',
          onPress: () => resolve('upload')
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => resolve('discard')
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve('none')
        }
      ]
    );
  });
}

export interface RecoveryResult {
  action: 'upload' | 'discard' | 'resume' | 'none';
  metadata?: RecoveryMetadata;
}
```

---

## 6. Migration Strategy

### 6.1 Historical JSON to FIT Conversion

File: `scripts/migrate-json-to-fit.ts`

```typescript
/**
 * Migration Script: Convert Legacy JSON Activities to FIT Format
 * 
 * Process:
 * 1. Query all activities with activity_streams but no fit_file_path
 * 2. For each activity:
 *    - Decompress activity_streams JSON
 *    - Reconstruct FIT file using StreamingFitEncoder
 *    - Upload to Supabase Storage
 *    - Update activity.fit_file_path
 *    - Mark migration as completed
 * 3. Optionally delete activity_streams after successful migration
 */

import { createClient } from '@supabase/supabase-js';
import pako from 'pako';
import { StreamingFitEncoder } from '../apps/mobile/lib/services/fit/StreamingFitEncoder';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LegacyActivity {
  id: string;
  profile_id: string;
  started_at: string;
  type: string;
  streams: {
    hr: number[];
    power: number[];
    cadence: number[];
    lat: number[];
    lng: number[];
    distance: number[];
    altitude: number[];
    timestamps: string[];
  };
}

async function migrateActivity(activity: LegacyActivity): Promise<void> {
  console.log(`Migrating activity ${activity.id}...`);
  
  try {
    // 1. Fetch user profile for FIT encoding
    const { data: profile } = await supabase
      .from('profiles')
      .select('weight_kg, age, ftp, max_heart_rate')
      .eq('id', activity.profile_id)
      .single();
    
    if (!profile) {
      throw new Error('Profile not found');
    }
    
    // 2. Create FIT file from JSON streams
    const encoder = new StreamingFitEncoder({
      weight_kg: profile.weight_kg,
      age: profile.age,
      ftp: profile.ftp || 200,
      max_heart_rate: profile.max_heart_rate || 190
    });
    
    await encoder.start({
      sport: activity.type as any,
      indoor: false
    });
    
    // Add all samples
    for (let i = 0; i < activity.streams.timestamps.length; i++) {
      await encoder.addSample({
        timestamp: new Date(activity.streams.timestamps[i]),
        heart_rate: activity.streams.hr[i],
        power: activity.streams.power[i],
        cadence: activity.streams.cadence[i],
        position_lat: activity.streams.lat[i],
        position_long: activity.streams.lng[i],
        distance: activity.streams.distance[i],
        altitude: activity.streams.altitude[i]
      });
    }
    
    const tempFitPath = await encoder.finish();
    
    // 3. Upload to Supabase Storage
    const storagePath = `activities/${activity.profile_id}/${activity.id}/migrated-${Date.now()}.fit`;
    
    const fitBuffer = await Deno.readFile(tempFitPath); // Or fs.readFileSync for Node
    
    const { error: uploadError } = await supabase.storage
      .from('activity-files')
      .upload(storagePath, fitBuffer, {
        contentType: 'application/vnd.ant.fit',
        upsert: false
      });
    
    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    
    // 4. Update activity record
    const { error: updateError } = await supabase
      .from('activities')
      .update({
        fit_file_path: storagePath,
        processing_status: 'COMPLETED'
      })
      .eq('id', activity.id);
    
    if (updateError) {
      throw new Error(`Update failed: ${updateError.message}`);
    }
    
    // 5. Mark migration as completed
    await supabase
      .from('activity_migrations')
      .upsert({
        activity_id: activity.id,
        migration_status: 'COMPLETED',
        completed_at: new Date().toISOString()
      });
    
    console.log(`✅ Migration completed: ${activity.id}`);
    
  } catch (error) {
    console.error(`❌ Migration failed: ${activity.id}`, error);
    
    // Mark migration as failed
    await supabase
      .from('activity_migrations')
      .upsert({
        activity_id: activity.id,
        migration_status: 'FAILED',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
  }
}

async function main() {
  console.log('Starting migration of legacy activities...');
  
  // Query all activities needing migration
  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, profile_id, started_at, type')
    .is('fit_file_path', null)
    .order('started_at', { ascending: true });
  
  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }
  
  console.log(`Found ${activities?.length || 0} activities to migrate`);
  
  // Process activities in batches
  const batchSize = 10;
  for (let i = 0; i < activities!.length; i += batchSize) {
    const batch = activities!.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(activity => migrateActivity(activity as any))
    );
    
    console.log(`Progress: ${Math.min(i + batchSize, activities!.length)}/${activities!.length}`);
  }
  
  console.log('✅ Migration complete');
}

main().catch(console.error);
```

### 6.2 Rollout Plan

**Phase 1: Infrastructure (Week 1)**
- ✅ Apply SQL schema migrations (add fit_file_path, processing_status columns)
- ✅ Create Supabase Storage bucket with RLS policies
- ✅ Set up BullMQ/Redis for job queue
- ✅ Deploy background worker service (1 instance)
- ✅ Configure monitoring (logs, error tracking)

**Phase 2: Backend Implementation (Week 2-3)**
- ✅ Implement tRPC mutations (requestFitUploadUrl, finalizeUpload)
- ✅ Implement FIT parser service using @garmin/fitsdk
- ✅ Implement metrics calculator using @repo/core
- ✅ Implement analyze-fit background job
- ✅ Write unit tests for all services
- ✅ Write integration tests for upload flow

**Phase 3: Mobile Implementation (Week 4-5)**
- ✅ Install easy-fit library
- ✅ Implement StreamingFitEncoder
- ✅ Implement FitUploader
- ✅ Implement crash recovery service
- ✅ Update useActivityRecorder hook
- ✅ Update UI components for processing states
- ✅ Test on iOS and Android devices

**Phase 4: Beta Testing (Week 6)**
- ✅ Deploy to staging environment
- ✅ Enable for 10% of users (feature flag)
- ✅ Monitor error rates and performance
- ✅ Test crash recovery scenarios
- ✅ Verify Supabase Storage costs

**Phase 5: Migration (Week 7-8)**
- ✅ Run migration script (dry-run mode)
- ✅ Migrate 10% of historical activities
- ✅ Verify data integrity (compare metrics)
- ✅ Migrate remaining 90% in batches
- ✅ Monitor storage usage and costs

**Phase 6: Full Rollout (Week 9)**
- ✅ Enable for 100% of users
- ✅ Deprecate activity_streams table (add comment)
- ✅ Update documentation
- ✅ Announce FIT export support to users
- ✅ Monitor for issues

**Phase 7: Cleanup (Week 10+)**
- ✅ Drop activity_streams table after 30 days
- ✅ Drop activity_migrations table
- ✅ Optimize Supabase Storage lifecycle policies
- ✅ Final performance review

---

## 7. Performance & Scalability

### 7.1 Performance Targets

**Mobile Recording:**
- FIT encoding throughput: 100+ samples/second (real-time at 4Hz)
- Checkpoint latency: < 10ms per checkpoint
- Memory usage: < 50 MB during recording
- Battery drain: < 5% per hour (comparable to current JSON)

**Upload:**
- Supabase Storage upload: 2-10 seconds for 200 KB file
- Signed URL generation: < 100ms
- Total user-facing time: < 15 seconds (upload + navigation)

**Background Processing:**
- FIT parsing: < 3 seconds for 1-hour activity
- Metric calculation: < 5 seconds
- Total processing: < 10 seconds end-to-end
- Job queue throughput: 100+ jobs/minute

**UI Response:**
- Activity list query: < 500ms (only completed activities)
- Activity detail initial load: < 200ms (show processing state)
- Polling interval: 5 seconds (when processing)
- Full detail load: < 1 second (after completion)

### 7.2 Scalability Considerations

**Concurrent Workers:**
- BullMQ supports 100+ concurrent jobs per worker instance
- Horizontal scaling: Add more worker instances as needed
- Rate limiting: Process max 10 activities/second per worker
- Retry mechanism: Exponential backoff for failed jobs

**Supabase Storage:**
- PUT throughput: 3,500 requests/second per prefix
- GET throughput: 5,500 requests/second per prefix
- Storage limits: 100 GB free tier, unlimited paid
- Bandwidth: 50 GB/month free tier

**Database:**
- Activity inserts: Lightweight (only 5 fields initially)
- Activity updates: Single atomic transaction per job
- Indexes: Optimized for worker queries and UI filters
- Connection pooling: Supabase handles automatically

**Cost Projections (1000 users, 10 activities/user/month):**
- Storage: 10,000 activities × 200 KB = 2 GB
- Bandwidth: 10,000 uploads × 200 KB = 2 GB
- Database operations: Negligible (within free tier)
- Total monthly cost: ~$0 (within free tiers)

---

## 8. Testing & Quality Assurance

### 8.1 Unit Tests

**Mobile Services:**
```typescript
// StreamingFitEncoder.test.ts
describe('StreamingFitEncoder', () => {
  it('should create valid FIT file header', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    await encoder.start(mockMetadata);
    // Verify FIT file exists and has valid header
  });
  
  it('should checkpoint every 100 samples', async () => {
    // Add 100 samples, verify flush called
  });
  
  it('should convert degrees to semicircles correctly', () => {
    // Test conversion function
  });
});

// FitUploader.test.ts
describe('FitUploader', () => {
  it('should upload FIT file to Supabase Storage', async () => {
    // Mock Supabase client, verify upload
  });
  
  it('should retry on upload failure', async () => {
    // Mock network error, verify retry logic
  });
});
```

**Backend Services:**
```typescript
// analyzeFit.test.ts
describe('analyzeFit Job', () => {
  it('should parse FIT file and extract session data', async () => {
    // Load test FIT file, verify parsed data
  });
  
  it('should calculate TSS correctly', async () => {
    // Verify metric calculations match expected values
  });
  
  it('should handle malformed FIT files gracefully', async () => {
    // Test error handling
  });
});
```

### 8.2 Integration Tests

**Upload Flow:**
```typescript
describe('FIT Upload Flow', () => {
  it('should complete end-to-end upload and processing', async () => {
    // 1. Create FIT file on device
    // 2. Request signed URL
    // 3. Upload to Supabase Storage
    // 4. Finalize upload
    // 5. Verify background job enqueued
    // 6. Wait for processing completion
    // 7. Verify activity record populated
  });
});
```

**Crash Recovery:**
```typescript
describe('Crash Recovery', () => {
  it('should detect incomplete recordings on startup', async () => {
    // Create checkpoint metadata, verify detection
  });
  
  it('should upload incomplete FIT file successfully', async () => {
    // Test recovery upload flow
  });
});
```

### 8.3 Acceptance Criteria

**Core Functionality:**
- ✅ StreamingFitEncoder writes valid FIT files
- ✅ Checkpoint occurs every 100 samples or 60 seconds
- ✅ FIT files parseable by Garmin Connect, Strava
- ✅ No memory leaks during multi-hour recordings
- ✅ Battery drain < 5% per hour

**Crash Recovery:**
- ✅ App detects incomplete recordings on restart
- ✅ User can upload incomplete recordings
- ✅ Uploaded incomplete files processable by backend

**Upload Flow:**
- ✅ Signed URL generated successfully
- ✅ FIT file uploads to Supabase Storage
- ✅ Activity stub created before upload
- ✅ Background job enqueued after upload
- ✅ Local FIT file deleted after successful upload

**Async Processing:**
- ✅ Background job parses FIT correctly
- ✅ All activity fields populated from FIT data
- ✅ Metrics calculated accurately (TSS within 1%)
- ✅ Processing completes in < 10 seconds
- ✅ Failed processing marked as 'FAILED'

**UI/UX:**
- ✅ Activity list shows only completed activities
- ✅ Activity detail shows "Processing..." state
- ✅ Status polling works correctly
- ✅ Error state displays with retry button
- ✅ Polyline preview renders correctly

---

## 9. Monitoring & Observability

### 9.1 Key Metrics

**Mobile App:**
- FIT file creation success rate
- Average checkpoint duration
- Memory usage during recording
- Battery drain per hour
- Upload success rate
- Upload duration (p50, p95, p99)

**Backend:**
- Background job processing time (p50, p95, p99)
- Job failure rate
- FIT parsing errors
- Supabase Storage errors
- Database update errors

**User Experience:**
- Time to activity completion (upload → processing → complete)
- Activity list load time
- Activity detail load time
- Crash recovery usage rate

### 9.2 Alerting

**Critical Alerts:**
- Upload failure rate > 5% (15 min window)
- Background job failure rate > 10% (15 min window)
- Processing time > 30 seconds (p95)
- Supabase Storage errors

**Warning Alerts:**
- Upload duration > 15 seconds (p95)
- Processing time > 15 seconds (p95)
- FIT parsing warnings

### 9.3 Logging

**Structured Logs:**
```typescript
logger.info('FIT upload started', {
  activityId,
  userId,
  fileSize: fitFileSize,
  timestamp: new Date().toISOString()
});

logger.info('Background job processing', {
  activityId,
  jobId,
  stage: 'parsing' | 'calculating' | 'updating',
  duration: processingTime
});

logger.error('FIT upload failed', {
  activityId,
  userId,
  error: error.message,
  retryCount
});
```

---

## 10. Appendix

### 10.1 FIT Format Reference

**FIT Timestamp Conversion:**
```typescript
// FIT epoch: 1989-12-31 00:00:00 UTC
const FIT_EPOCH_OFFSET = 631065600; // seconds

// JavaScript Date → FIT timestamp
function dateToFitTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
}

// FIT timestamp → JavaScript Date
function fitTimestampToDate(fitTimestamp: number): Date {
  return new Date((fitTimestamp + FIT_EPOCH_OFFSET) * 1000);
}
```

**GPS Coordinate Conversion:**
```typescript
// Degrees → Semicircles
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

// Semicircles → Degrees
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

**Speed Conversion:**
```typescript
// m/s → mm/s (FIT format)
const speedMmPerSec = speedMetersPerSec * 1000;

// mm/s → m/s
const speedMetersPerSec = speedMmPerSec / 1000;
```

### 10.2 Supabase Storage Best Practices

**File Naming Convention:**
```
activities/{userId}/{activityId}/{timestamp}.fit

Example:
activities/550e8400-e29b-41d4-a716-446655440000/
          abc123-def456-ghi789/
          2026-01-20T15-30-45.123Z.fit
```

**Signed URL Expiry:**
- Upload URLs: 15 minutes (sufficient for mobile uploads)
- Download URLs: 1 hour (for background workers)

**Storage Lifecycle Policies:**
```sql
-- Archive old activities to cheaper storage tier after 1 year
-- (Supabase doesn't support this yet, but AWS S3 does)
```

### 10.3 TypeScript Type Definitions

```typescript
// Activity processing status
type ProcessingStatus = 
  | 'PENDING_UPLOAD'  // Stub created, awaiting upload
  | 'UPLOADED'        // File uploaded, awaiting processing
  | 'PROCESSING'      // Background worker parsing
  | 'COMPLETED'       // Ready for display
  | 'FAILED';         // Processing failed

// Activity record (async-first schema)
interface Activity {
  id: string;
  profile_id: string;
  fit_file_path: string;
  processing_status: ProcessingStatus;
  
  // Populated by background worker:
  name?: string;
  type?: 'cycling' | 'running' | 'swimming' | 'other';
  started_at?: string;
  finished_at?: string;
  distance_meters?: number;
  duration_seconds?: number;
  moving_seconds?: number;
  elevation_gain_meters?: number;
  
  metrics?: {
    tss?: number;
    intensity_factor?: number;
    normalized_power?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    avg_power?: number;
    max_power?: number;
    polyline?: string;
  };
  
  hr_zone_seconds?: number[];
  power_zone_seconds?: number[];
  
  created_at: string;
  updated_at: string;
}
```

---

## Summary

This implementation plan provides a complete migration path from GradientPeak's current compressed JSON architecture to an industry-standard FIT file system. By leveraging Supabase Storage for file hosting, maintaining the async-first processing model, and implementing crash-safe real-time recording, the system achieves:

1. **Industry Compatibility**: Native integration with Garmin, Strava, Wahoo
2. **Data Integrity**: FIT files as single source of truth
3. **Crash Safety**: Checkpoint-based recovery for incomplete recordings
4. **Scalability**: Async processing with horizontal worker scaling
5. **User Experience**: Fast uploads with transparent processing states

The phased rollout strategy ensures minimal disruption to existing users while enabling a smooth transition to the new architecture.