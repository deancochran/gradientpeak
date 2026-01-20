# FIT File Migration Implementation Plan (Real-Time Recording)

## Document Summaries

### 1. current_recording_spec.md Summary
This document describes GradientPeak's current local-first, JSON-centric recording architecture for the mobile app (Expo/React Native). The system uses a lifecycle-scoped `ActivityRecorderService` that buffers sensor data (HR, power, cadence, GPS) in memory and writes to chunked JSON files every 100 samples for fault tolerance. Upon finishing a recording, the mobile client aggregates these chunks, compresses them using gzip/pako into base64-encoded payloads, calculates basic client-side metrics, and submits the compressed streams via tRPC to Supabase PostgreSQL where they're stored in an `activity_streams` table. Server-side, a background process decompresses these streams, fetches temporal performance metrics (FTP, LTHR) for the activity date, calculates advanced metrics (TSS, IF, NP, performance curves), and updates the activity record.

### 2. filefile_migration.md Summary
This research document recommends migrating to the FIT (Flexible and Interoperable Data Transfer) binary standard as a replacement for compressed JSON payloads. FIT is the de facto industry standard used by Garmin, Wahoo, and Strava, offering superior data richness with native support for performance metrics (TSS, IF, NP, VO2max, FTP) alongside comprehensive sensor data. The document proposes a fault-tolerant client-side implementation using temporary JSON files that get encoded to FIT upon recording completion, a pre-signed S3 URL architecture for direct-to-cloud uploads (avoiding application server proxying), server-side parsing with the `@garmin/fitsdk` library, and a one-time migration script to convert historical compressed JSON activities to FIT files. This approach provides efficiency (compact binary format), interoperability (compatible with major platforms), and eliminates custom decompression logic.

### 3. filtfile_help.md Summary
This technical guide provides detailed implementation patterns for FIT file integration, including Python and TypeScript parsing libraries (`fitdecode`, `fitparse`, `@garmin/fitsdk`), field mapping specifications (GPS coordinates stored as semicircles, timestamps as seconds since UTC epoch), and formulas for calculating performance metrics. It explains how to extract user profile data from FIT message types (`user_profile`, `zones_target`, message 140 for Garmin VO2max), calculate Normalized Power using 30-second rolling averages raised to the fourth power, derive Training Stress Score from the formula `TSS = (duration × NP × IF) / (FTP × 3600) × 100`, and estimate FTP using Critical Power models (2-parameter and 3-parameter). The document also covers third-party API integration patterns for Strava (OAuth 2.0 with asynchronous upload polling) and Garmin Connect (event-driven B2B webhooks).

---

## 1. High-Level Overview

### Executive Summary

**Goal:** Replace GradientPeak's proprietary compressed JSON activity storage with industry-standard FIT files, recording directly to FIT format in real-time during activity capture. FIT files become the single source of truth, with all database records created asynchronously from parsed FIT data.

**Key Architectural Changes:**
- **Real-Time FIT Recording:** Mobile app writes FIT record messages incrementally during recording (not post-recording)
- **No JSON Submission:** Completely eliminate JSON compression and tRPC activity submission
- **FIT as Ground Truth:** S3 FIT file is authoritative; database records are derived views
- **Asynchronous Everything:** Activity table records created by background workers after FIT upload completes
- **Crash Recovery:** Periodic FIT file checkpoints to device storage for crash resilience

**In-Scope:**
- Mobile recording: Incremental FIT message writing to device storage during recording
- Checkpoint strategy: Flush FIT file every 100 samples or 60 seconds
- Upload mechanism: Direct-to-S3 upload via pre-signed URLs after recording finishes
- Storage: Store FIT files in S3 with stable object key pattern `activities/{userId}/{activityId}/{timestamp}.fit`
- Asynchronous processing: Background worker parses FIT, creates activity record, computes metrics, updates database
- Database schema: Remove `activity_streams` table dependency, add `fit_file_path` as primary reference
- UI changes: Activity list polls for completion status; detail view loads from parsed FIT data
- Migration: One-time script to convert existing compressed JSON activities to FIT format
- Crash recovery: Resume from last checkpoint if app crashes mid-recording

**Out-of-Scope:**
- Multi-sport activities in single FIT file (each activity = one file)
- Advanced FIT developer fields (use standard messages only)
- Real-time cloud sync during recording (upload only on finish)
- Client-side metric calculation (all metrics computed server-side from FIT)

**Background:**
The current system creates vendor lock-in by storing proprietary compressed JSON in PostgreSQL. By recording directly to FIT files in real-time, we:
1. Eliminate custom compression/decompression logic
2. Make FIT the authoritative data source (not database)
3. Enable crash recovery via incremental checkpoints
4. Simplify mobile-to-server flow (no JSON encoding/transmission)
5. Unlock native compatibility with Garmin, Strava, Wahoo ecosystems
6. Enforce async-first architecture (no blocking on activity creation)

---

## 2. Technical Design

### Architecture: End-to-End Data Flow

**Data Flow (Numbered Steps):**

```
1. RECORDING START (Mobile - React Native)
   └─> User presses "Start Activity"
   └─> ActivityRecorderService initializes FIT encoder
   └─> Create temporary FIT file on device: /cache/recordings/{recordingId}.fit
   └─> Write FIT file header, file_id message, user_profile message
   └─> Write event message (timer start)
   └─> Initialize checkpoint buffer (100 samples)

2. SENSOR CAPTURE (Mobile - 1-4Hz loop)
   └─> Sensor data arrives (HR: 1Hz, Power: 1-4Hz, GPS: 1Hz, Cadence: 1Hz)
   └─> Convert to FIT record message:
       • timestamp → FIT epoch seconds
       • lat/lon → semicircles
       • speed → mm/s
       • altitude, HR, power, cadence → native FIT types
   └─> Append FIT record message to encoder buffer
   └─> Checkpoint trigger (every 100 samples OR every 60 seconds):
       └─> Flush encoder buffer to device file
       └─> Update checkpoint metadata (last_sample_index, last_timestamp)
       └─> Continue recording

3. RECORDING FINISH (Mobile)
   └─> User presses "Finish" button
   └─> Write final FIT messages:
       • Last batch of record messages
       • Event message (timer stop)
       • Session message (summary metrics: duration, distance, avg HR/power)
       • Lap messages (if manual laps recorded)
   └─> Finalize FIT file (write CRC, close encoder)
   └─> Result: Complete .fit file on device storage

4. REQUEST PRE-SIGNED URL (Mobile → tRPC API)
   └─> Client calls trpc.activities.requestFitUploadUrl.mutate()
   └─> Server generates unique activityId (UUID)
   └─> Server creates S3 object key: activities/{userId}/{activityId}/{timestamp}.fit
   └─> Server creates pre-signed PUT URL (15 min expiry)
   └─> Server creates PENDING activity stub in database:
       • id = activityId
       • profile_id = userId
       • fit_file_path = objectKey
       • processing_status = 'PENDING_UPLOAD'
       • created_at = now()
       • NO OTHER FIELDS (metrics, distance, duration all null)
   └─> Server returns { uploadUrl, objectKey, activityId }

5. DIRECT S3 UPLOAD (Mobile → S3)
   └─> Client reads FIT file from device storage
   └─> Client PUTs FIT file bytes to uploadUrl
   └─> Content-Type: application/vnd.ant.fit
   └─> No proxy through application server
   └─> On success: Delete local FIT file from device
   └─> On failure: Retry with exponential backoff (3 attempts)

6. FINALIZE UPLOAD (Mobile → tRPC API)
   └─> Client calls trpc.activities.finalizeUpload.mutate({ activityId })
   └─> Server updates activity record:
       • processing_status = 'UPLOADED'
   └─> Server enqueues background job for FIT analysis
   └─> Job payload: { activityId, objectKey }
   └─> Server returns immediately (no blocking)
   └─> Client navigates to activity detail (shows loading state)

7. BACKGROUND ANALYSIS (Worker - Node.js)
   └─> Job worker fetches .fit from S3 using objectKey
   └─> FitParser.ts (using @garmin/fitsdk):
       • Parse file_id → extract device info, timestamp
       • Parse session → extract summary metrics
       • Parse record messages → extract time-series streams
       • Parse laps → extract lap data
   └─> MetricsCalculator.ts:
       • Fetch user's FTP/LTHR for activity date
       • Calculate Normalized Power (30-sec rolling avg, 4th power mean)
       • Calculate Intensity Factor (NP / FTP)
       • Calculate TSS ((duration × NP × IF) / (FTP × 3600) × 100)
       • Calculate zone distributions (HR zones 1-5, Power zones 1-7)
       • Generate polyline from GPS coordinates
   └─> Update activity record (atomic transaction):
       • name = "Morning Ride" (default or from FIT metadata)
       • type = session.sport (cycling/running/swimming)
       • started_at = session.start_time
       • finished_at = session.timestamp
       • distance_meters = session.total_distance
       • duration_seconds = session.total_elapsed_time
       • moving_seconds = session.total_timer_time
       • elevation_gain_meters = session.total_ascent
       • metrics JSONB = { tss, if, np, polyline, avg_hr, max_power, ... }
       • hr_zone_seconds = [z1, z2, z3, z4, z5]
       • power_zone_seconds = [z1, ..., z7]
       • processing_status = 'COMPLETED'
   └─> Optional: Store extracted streams in cache (Redis) for fast UI queries

8. UI CONSUMPTION
   └─> Activity List (mobile/web):
       • Query activities WHERE processing_status = 'COMPLETED'
       • Display polyline preview from activity.metrics.polyline
       • Show TSS, distance, duration from activity table
   └─> Activity Detail (mobile/web):
       • If processing_status = 'UPLOADED': Show spinner "Processing activity..."
       • If processing_status = 'COMPLETED': Load data
       • Async load per-record streams:
         - Option A: Re-parse FIT from S3 on-demand (slower, simpler)
         - Option B: Query pre-extracted streams from cache (faster)
       • Render charts (HR, power, pace, elevation vs time)
       • Poll status every 5 seconds if not completed
```

**Component Diagram:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOBILE (Expo/React Native)                    │
│                                                                      │
│  ┌────────────────┐                                                 │
│  │  Recording     │  1. Start recording                             │
│  │  Service       │────────────────────────────────┐                │
│  └────────────────┘                                │                │
│                                                     ↓                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Real-Time FIT Encoder                                     │    │
│  │  • Initialize: Write file header, file_id, user_profile    │    │
│  │  • Per-sample: Append FIT record message (1-4Hz)           │    │
│  │  • Checkpoint: Flush to disk every 100 samples/60 sec      │    │
│  │  • Finish: Write session, laps, event (stop), CRC          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                │                                     │
│                                ↓                                     │
│  ┌────────────────────────────────────────┐                         │
│  │  Device Storage (Crash-Safe)           │                         │
│  │  /cache/recordings/{recordingId}.fit   │                         │
│  │  • Incremental writes (append-only)    │                         │
│  │  • Survives app crash                  │                         │
│  └────────────────────────────────────────┘                         │
│                                │                                     │
│                                │ 2. Recording finished               │
│                                ↓                                     │
└────────────────────────────────┼─────────────────────────────────────┘
                                 │
                                 │ 3. Request pre-signed URL
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS + tRPC API                               │
│                                                                      │
│  ┌────────────────┐                                                 │
│  │  requestFit    │  4. Create activity stub (status=PENDING_UPLOAD)│
│  │  UploadUrl     │  5. Generate S3 presigned URL                   │
│  └────────────────┘────────────────────┐                            │
│                                         ↓                            │
│                                ┌──────────────────┐                 │
│                                │  Database        │                 │
│                                │  (PostgreSQL)    │                 │
│                                │  • id            │                 │
│                                │  • profile_id    │                 │
│                                │  • fit_file_path │                 │
│                                │  • status=       │                 │
│                                │    PENDING_UPLOAD│                 │
│                                └──────────────────┘                 │
└─────────────────────────────────────────┼──────────────────────────┘
                                          │
                                          │ 6. Return { uploadUrl, activityId }
                                          ↓
                              (Mobile uploads directly to S3)
                                          │
                                          │ 7. PUT .fit file
                                          ↓
                                 ┌──────────────────┐
                                 │   S3 STORAGE     │
                                 │   (Ground Truth) │
                                 └──────────────────┘
                                          │
┌─────────────────────────────────────────┼──────────────────────────┐
│                     NEXT.JS + tRPC API  │                          │
│                                         │                          │
│  ┌────────────────┐                     │                          │
│  │  finalizeUpload│  8. Update status = │ 'UPLOADED'               │
│  │                │  9. Enqueue job     │                          │
│  └────────────────┘────────────────────┐│                          │
│                                         ││                          │
│                                         ↓↓                          │
│                                ┌──────────────────┐                 │
│                                │  BullMQ/SQS      │                 │
│                                │  Job Queue       │                 │
│                                └──────────────────┘                 │
└─────────────────────────────────────────┼──────────────────────────┘
                    │                     │
                    │ 10. Worker polls    │
                    ↓                     │
┌─────────────────────────────────────────┼──────────────────────────┐
│                  BACKGROUND WORKER      │                          │
│                                         │                          │
│  ┌────────────────┐                     │                          │
│  │  FitParser     │  11. Fetch FIT from S3                         │
│  │  (@garmin/sdk) │<────────────────────┘                          │
│  └────────────────┘                                                │
│         │                                                           │
│         │ 12. Parse all FIT messages                               │
│         ↓                                                           │
│  ┌────────────────┐                                                │
│  │  Metrics       │  13. Calculate TSS, IF, NP, zones, polyline    │
│  │  Calculator    │                                                │
│  └────────────────┘                                                │
│         │                                                           │
│         │ 14. Populate ALL activity fields                         │
│         ↓                                                           │
│  ┌────────────────┐                                                │
│  │   Database     │  • name, type, started_at, finished_at         │
│  │   (PostgreSQL) │  • distance, duration, elevation               │
│  │                │  • metrics JSONB (tss, if, np, polyline)       │
│  │                │  • zone arrays                                 │
│  │                │  • processing_status = 'COMPLETED'             │
│  └────────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
                    │
                    │ 15. WebSocket notification OR client polling
                    ↓
                 (UI updates to show completed activity)
```

**Design Rationale:**

- **Why real-time FIT writing vs. post-recording encoding?**
  - **Crash Safety:** If app crashes mid-recording, FIT file on disk preserves partial data (can be uploaded as incomplete activity)
  - **Memory Efficiency:** No need to buffer entire activity in RAM (critical for multi-hour recordings)
  - **Simplicity:** One code path for FIT creation (no separate "convert from JSON" step)
  - **Performance:** Incremental writing is faster than batch encoding at end

- **Why checkpoint every 100 samples?**
  - **Balance:** Too frequent (e.g., every sample) causes excessive I/O and battery drain
  - **Recovery:** 100 samples ≈ 25-100 seconds of data loss on crash (acceptable for MVP)
  - **Compatibility:** Matches existing JSON chunking pattern (100 samples per chunk)

- **Why async activity record creation?**
  - **Decoupling:** FIT file upload succeeds independently of database writes
  - **Resilience:** If database is down, FIT upload still works (background job retries later)
  - **Scalability:** Workers scale independently from API servers
  - **User Experience:** User sees "processing" state immediately instead of 5-15 second blocking upload

- **Why eliminate JSON submission entirely?**
  - **Single Source of Truth:** FIT file in S3 is authoritative; database is derived cache
  - **No Redundancy:** Storing both FIT and JSON wastes storage and creates consistency issues
  - **Simplicity:** One data format, one parsing pipeline, one migration path
  - **Industry Standard:** FIT is the lingua franca of fitness devices; JSON is proprietary

---

### Real-Time FIT Recording Implementation

**Core Concept:**
Instead of buffering sensor data in arrays and encoding to FIT on finish, we write FIT messages incrementally to a file during recording. This requires:
1. Stream-based FIT encoder (append messages to open file)
2. Checkpoint strategy (periodic fsync for crash recovery)
3. Session message written at end (summary metrics)

**Challenge: @garmin/fitsdk Limitation**
The official `@garmin/fitsdk` Encoder is designed for batch encoding (buffer all messages, then call `finish()`). It does NOT support streaming writes.

**Solution: Custom Streaming FIT Encoder**
We need a lightweight streaming encoder that can:
- Write FIT header upfront
- Append record messages incrementally
- Flush to disk periodically
- Write session message at end
- Calculate CRC for file integrity

**Alternative Approach: Hybrid Buffering**
Since building a full streaming FIT encoder is complex, we can use a **hybrid approach**:
1. Buffer last 100 samples in memory
2. Every 100 samples, encode to FIT and append to checkpoint file
3. On crash recovery, read checkpoint file + merge with in-memory buffer
4. On finish, encode final buffer + session message

**Recommended: Use `easy-fit` Library (Streaming Support)**

After research, the `easy-fit` npm library supports incremental message writing:

```typescript
import { FitWriter } from 'easy-fit';

const writer = new FitWriter();
writer.open('/path/to/activity.fit');

// Write messages incrementally
writer.writeFileId({ ... });
writer.writeUserProfile({ ... });

// During recording loop
for (const sample of samples) {
  writer.writeRecord({
    timestamp: fitTimestamp,
    heartRate: sample.hr,
    power: sample.power,
    ...
  });
}

// On finish
writer.writeSession({ ... });
writer.close(); // Writes CRC and finalizes
```

**Installation:**
```bash
cd apps/mobile
pnpm add easy-fit
```

---

### File & Code Changes (Prioritized Order)

**Priority 1: Core Infrastructure**

1. **`./plan_updated.md`** (this file)

2. **`packages/supabase/schemas/init.sql`** (modify)
   *Update activities table for async-first architecture*
   ```sql
   ALTER TABLE public.activities
   ADD COLUMN fit_file_path text,
   ADD COLUMN processing_status text DEFAULT 'PENDING_UPLOAD' 
       CHECK (processing_status IN ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED'));
   
   -- Make most fields nullable (populated by worker)
   ALTER TABLE public.activities
   ALTER COLUMN distance_meters DROP NOT NULL,
   ALTER COLUMN duration_seconds DROP NOT NULL,
   ALTER COLUMN started_at DROP NOT NULL,
   ALTER COLUMN finished_at DROP NOT NULL;
   
   -- Add indexes
   CREATE INDEX idx_activities_processing_status 
       ON public.activities(processing_status)
       WHERE processing_status IN ('UPLOADED', 'PROCESSING');
   
   CREATE INDEX idx_activities_fit_file_path 
       ON public.activities(fit_file_path)
       WHERE fit_file_path IS NOT NULL;
   ```

3. **`apps/mobile/lib/services/fit/StreamingFitEncoder.ts`** (create)
   *Real-time FIT encoding with checkpointing*
   ```typescript
   import { FitWriter } from 'easy-fit';
   import * as FileSystem from 'expo-file-system';
   
   export class StreamingFitEncoder {
     private writer: FitWriter;
     private filePath: string;
     private sampleCount = 0;
     private lastCheckpoint = Date.now();
     
     constructor(recordingId: string, profile: UserProfile) {
       this.filePath = `${FileSystem.cacheDirectory}recordings/${recordingId}.fit`;
       this.writer = new FitWriter();
     }
     
     async initialize(metadata: ActivityMetadata): Promise<void> {
       await this.writer.open(this.filePath);
       
       // Write file header and file_id
       this.writer.writeFileId({
         type: 'activity',
         manufacturer: 'development',
         product: 0,
         timeCreated: dateToFitTimestamp(new Date()),
         serialNumber: Math.random() * 1000000
       });
       
       // Write user profile
       this.writer.writeUserProfile({
         weight: profile.weight_kg,
         age: profile.age,
         functionalThresholdPower: profile.ftp
       });
       
       // Write timer start event
       this.writer.writeEvent({
         event: 'timer',
         eventType: 'start',
         timestamp: dateToFitTimestamp(new Date())
       });
     }
     
     async addSample(sample: SensorSample): Promise<void> {
       // Convert to FIT record message
       const fitRecord = {
         timestamp: dateToFitTimestamp(sample.timestamp),
         positionLat: sample.position_lat ? degreesToSemicircles(sample.position_lat) : undefined,
         positionLong: sample.position_long ? degreesToSemicircles(sample.position_long) : undefined,
         distance: sample.distance,
         altitude: sample.altitude,
         speed: sample.speed ? sample.speed * 1000 : undefined, // m/s to mm/s
         heartRate: sample.heart_rate,
         cadence: sample.cadence,
         power: sample.power
       };
       
       this.writer.writeRecord(fitRecord);
       this.sampleCount++;
       
       // Checkpoint every 100 samples OR every 60 seconds
       const now = Date.now();
       if (this.sampleCount % 100 === 0 || now - this.lastCheckpoint > 60000) {
         await this.checkpoint();
       }
     }
     
     private async checkpoint(): Promise<void> {
       await this.writer.flush(); // Ensure data written to disk
       this.lastCheckpoint = Date.now();
       console.log(`✅ Checkpoint: ${this.sampleCount} samples written`);
     }
     
     async finalize(sessionMetrics: SessionMetrics): Promise<string> {
       // Write session message
       this.writer.writeSession({
         sport: sessionMetrics.sport,
         startTime: dateToFitTimestamp(sessionMetrics.startTime),
         timestamp: dateToFitTimestamp(sessionMetrics.endTime),
         totalElapsedTime: sessionMetrics.totalElapsedTime,
         totalTimerTime: sessionMetrics.totalTimerTime,
         totalDistance: sessionMetrics.totalDistance,
         avgHeartRate: sessionMetrics.avgHeartRate,
         maxHeartRate: sessionMetrics.maxHeartRate,
         avgPower: sessionMetrics.avgPower,
         maxPower: sessionMetrics.maxPower
       });
       
       // Write timer stop event
       this.writer.writeEvent({
         event: 'timer',
         eventType: 'stopAll',
         timestamp: dateToFitTimestamp(sessionMetrics.endTime)
       });
       
       // Finalize file (writes CRC)
       await this.writer.close();
       
       console.log(`✅ FIT file finalized: ${this.filePath}`);
       return this.filePath;
     }
   }
   ```

4. **`apps/mobile/lib/services/fit/FitUploader.ts`** (create)
   *Handles pre-signed URL request and S3 upload*
   ```typescript
   export class FitUploader {
     private trpc = getTRPCClient();
     
     async uploadActivity(fitFilePath: string): Promise<string> {
       // 1. Request pre-signed URL
       const { uploadUrl, objectKey, activityId } = 
         await this.trpc.activities.requestFitUploadUrl.mutate({
           filename: `${Date.now()}.fit`
         });
       
       // 2. Read FIT file from device
       const fitData = await FileSystem.readAsStringAsync(fitFilePath, {
         encoding: FileSystem.EncodingType.Base64
       });
       const fitBytes = base64ToArrayBuffer(fitData);
       
       // 3. Upload to S3
       await fetch(uploadUrl, {
         method: 'PUT',
         headers: {
           'Content-Type': 'application/vnd.ant.fit'
         },
         body: fitBytes
       });
       
       // 4. Finalize upload (triggers background processing)
       await this.trpc.activities.finalizeUpload.mutate({ activityId });
       
       // 5. Delete local file
       await FileSystem.deleteAsync(fitFilePath);
       
       return activityId;
     }
   }
   ```

**Priority 2: Backend Processing**

5. **`packages/trpc/src/routers/activities.ts`** (modify)
   *Add requestFitUploadUrl and finalizeUpload mutations*
   ```typescript
   requestFitUploadUrl: protectedProcedure
     .input(z.object({ filename: z.string() }))
     .mutation(async ({ ctx, input }) => {
       const activityId = uuid();
       const userId = ctx.session.user.id;
       const objectKey = `activities/${userId}/${activityId}/${input.filename}`;
       
       // Create activity stub in database
       await ctx.db.activities.create({
         id: activityId,
         profile_id: userId,
         fit_file_path: objectKey,
         processing_status: 'PENDING_UPLOAD',
         created_at: new Date()
         // All other fields NULL (populated by worker)
       });
       
       // Generate pre-signed URL
       const uploadUrl = await generatePresignedPutUrl(objectKey, 900);
       
       return { uploadUrl, objectKey, activityId };
     });
   
   finalizeUpload: protectedProcedure
     .input(z.object({ activityId: z.string() }))
     .mutation(async ({ ctx, input }) => {
       // Update status to UPLOADED
       await ctx.db.activities.update({
         where: { id: input.activityId },
         data: { processing_status: 'UPLOADED' }
       });
       
       // Enqueue background job
       await enqueueJob('analyze-fit', { 
         activityId: input.activityId 
       });
       
       return { success: true, activityId: input.activityId };
     });
   ```

6. **`packages/workers/src/jobs/analyzeFit.ts`** (create)
   *Background job to parse FIT and populate activity record*
   ```typescript
   export async function analyzeFit(job: Job<{ activityId: string }>) {
     const { activityId } = job.data;
     
     try {
       // 1. Update status to PROCESSING
       await db.activities.update(activityId, { 
         processing_status: 'PROCESSING' 
       });
       
       // 2. Fetch activity to get fit_file_path
       const activity = await db.activities.findByPk(activityId);
       if (!activity.fit_file_path) {
         throw new Error('No FIT file path found');
       }
       
       // 3. Fetch FIT from S3
       const fitBuffer = await s3.getObject({ 
         Bucket: process.env.S3_BUCKET,
         Key: activity.fit_file_path 
       }).promise();
       
       // 4. Parse FIT
       const fitData = await FitParser.parse(fitBuffer.Body);
       
       // 5. Fetch user profile for metric calculation
       const profile = await db.profiles.findByPk(activity.profile_id);
       const userFTP = profile.ftp || 200; // Default FTP
       const userMaxHR = profile.max_heart_rate || 190;
       
       // 6. Calculate metrics
       const metrics = MetricsCalculator.calculate(fitData, {
         ftp: userFTP,
         maxHeartRate: userMaxHR
       });
       
       // 7. Generate polyline
       const polyline = encodePolyline(
         fitData.records
           .filter(r => r.positionLat && r.positionLong)
           .map(r => ({ lat: r.positionLat!, lng: r.positionLong! }))
       );
       
       // 8. Update activity with ALL fields (atomic transaction)
       await db.activities.update(activityId, {
         name: `${fitData.session.sport} Activity`, // Default name
         type: fitData.session.sport,
         started_at: fitData.session.startTime,
         finished_at: fitData.session.timestamp,
         distance_meters: fitData.session.totalDistance,
         duration_seconds: fitData.session.totalElapsedTime,
         moving_seconds: fitData.session.totalTimerTime,
         elevation_gain_meters: fitData.session.totalAscent,
         metrics: {
           tss: metrics.tss,
           intensity_factor: metrics.if,
           normalized_power: metrics.np,
           avg_heart_rate: fitData.session.avgHeartRate,
           max_heart_rate: fitData.session.maxHeartRate,
           avg_power: fitData.session.avgPower,
           max_power: fitData.session.maxPower,
           polyline
         },
         hr_zone_seconds: metrics.hrZones,
         power_zone_seconds: metrics.powerZones,
         processing_status: 'COMPLETED'
       });
       
       logger.info('Activity processed successfully', { activityId });
       
     } catch (error) {
       logger.error('Activity processing failed', { activityId, error });
       
       await db.activities.update(activityId, {
         processing_status: 'FAILED'
       });
       
       throw error; // Trigger BullMQ retry
     }
   }
   ```

**Priority 3: Mobile Integration**

7. **`apps/mobile/lib/hooks/useActivityRecorder.ts`** (modify)
   *Update to use StreamingFitEncoder*
   ```typescript
   const useActivityRecorder = () => {
     const [encoder, setEncoder] = useState<StreamingFitEncoder | null>(null);
     const [recordingId, setRecordingId] = useState<string | null>(null);
     
     const startRecording = async (metadata: ActivityMetadata) => {
       const id = uuid();
       setRecordingId(id);
       
       const newEncoder = new StreamingFitEncoder(id, userProfile);
       await newEncoder.initialize(metadata);
       setEncoder(newEncoder);
       
       // Start sensor listeners
       startSensorCapture((sample) => {
         encoder?.addSample(sample); // Write to FIT in real-time
       });
     };
     
     const finishRecording = async () => {
       if (!encoder) return;
       
       // Calculate session metrics
       const sessionMetrics = {
         sport: metadata.sport,
         startTime: recordingStartTime,
         endTime: new Date(),
         totalElapsedTime: (Date.now() - recordingStartTime.getTime()) / 1000,
         totalTimerTime: movingTime, // Calculated from speed > 0
         totalDistance: lastDistanceSample,
         avgHeartRate: calculateAvg(hrSamples),
         maxHeartRate: calculateMax(hrSamples),
         avgPower: calculateAvg(powerSamples),
         maxPower: calculateMax(powerSamples)
       };
       
       // Finalize FIT file
       const fitFilePath = await encoder.finalize(sessionMetrics);
       
       // Upload to S3
       const uploader = new FitUploader();
       const activityId = await uploader.uploadActivity(fitFilePath);
       
       // Navigate to activity detail (will show "processing" state)
       router.push(`/activity/${activityId}`);
     };
     
     return { startRecording, finishRecording };
   };
   ```

**Priority 4: UI Updates**

8. **`apps/mobile/app/(internal)/(standard)/activity-detail.tsx`** (modify)
   *Handle async loading and processing states*
   ```typescript
   export default function ActivityDetailScreen() {
     const { activityId } = useLocalSearchParams<{ activityId: string }>();
     
     const { data: activity, isLoading } = trpc.activities.getById.useQuery(
       { id: activityId! },
       { refetchInterval: activity?.processing_status !== 'COMPLETED' ? 5000 : false }
     );
     
     if (isLoading) {
       return <ActivityIndicator />;
     }
     
     // Show processing state
     if (activity?.processing_status === 'UPLOADED' || 
         activity?.processing_status === 'PROCESSING') {
       return (
         <View className="flex-1 items-center justify-center">
           <ActivityIndicator size="large" />
           <Text className="mt-4 text-lg">Processing activity...</Text>
           <Text className="text-muted-foreground">
             This usually takes 5-15 seconds
           </Text>
         </View>
       );
     }
     
     // Show error state
     if (activity?.processing_status === 'FAILED') {
       return (
         <View className="flex-1 items-center justify-center">
           <Text className="text-destructive">Activity processing failed</Text>
           <Button onPress={() => retryProcessing(activityId)}>
             Retry
           </Button>
         </View>
       );
     }
     
     // Show completed activity
     return (
       <ScrollView>
         <Text className="text-2xl font-bold">{activity.name}</Text>
         <MetricRow label="Distance" value={`${(activity.distance_meters / 1000).toFixed(2)} km`} />
         <MetricRow label="Duration" value={formatDuration(activity.duration_seconds)} />
         <MetricRow label="TSS" value={activity.metrics?.tss} />
         
         {/* Charts load streams asynchronously */}
         <AsyncStreamCharts activityId={activityId} />
       </ScrollView>
     );
   }
   ```

9. **`apps/mobile/components/activity/ActivityCard.tsx`** (modify)
   *Only show completed activities in list*
   ```typescript
   // Update query to filter completed activities
   const { data: activities } = trpc.activities.list.useQuery({
     where: { processing_status: 'COMPLETED' },
     orderBy: { started_at: 'desc' }
   });
   ```

**Priority 5: Migration & Cleanup**

10. **`scripts/migrate-json-to-fit.ts`** (create)
    *One-time migration script for historical activities*
    ```typescript
    // For each activity with compressed JSON streams:
    // 1. Decompress activity_streams
    // 2. Reconstruct FIT file using StreamingFitEncoder
    // 3. Upload to S3
    // 4. Trigger analyzeFit background job
    // 5. Wait for processing to complete
    // 6. Optionally delete activity_streams rows
    ```

11. **`packages/supabase/schemas/init.sql`** (modify)
    *Deprecate activity_streams table*
    ```sql
    -- Mark table as deprecated (add comment)
    COMMENT ON TABLE public.activity_streams IS 
    'DEPRECATED: Replaced by FIT files in S3. Will be dropped after migration completes.';
    
    -- After migration complete, drop table:
    -- DROP TABLE public.activity_streams CASCADE;
    ```

---

### Types & Schema

#### TypeScript Interfaces

**Mobile - Sensor Data:**

```typescript
// apps/mobile/lib/services/fit/types.ts
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

export interface SessionMetrics {
  sport: 'cycling' | 'running' | 'swimming' | 'other';
  startTime: Date;
  endTime: Date;
  totalElapsedTime: number;   // seconds
  totalTimerTime: number;     // moving time (seconds)
  totalDistance: number;      // meters
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  avgCadence?: number;
}

export interface ActivityMetadata {
  name: string;
  sport: 'cycling' | 'running' | 'swimming' | 'other';
  indoor: boolean;
}
```

#### Database Schema Changes (SQL)

**CRITICAL CHANGES for Async-First Architecture:**

```sql
-- ============================================================================
-- ASYNC-FIRST ARCHITECTURE - ACTIVITIES TABLE UPDATES
-- ============================================================================

-- 1. Add FIT file reference and processing status
ALTER TABLE public.activities
ADD COLUMN fit_file_path text,
ADD COLUMN processing_status text DEFAULT 'PENDING_UPLOAD' 
    CHECK (processing_status IN (
        'PENDING_UPLOAD',  -- Activity stub created, awaiting FIT upload
        'UPLOADED',        -- FIT file in S3, awaiting processing
        'PROCESSING',      -- Background worker parsing FIT
        'COMPLETED',       -- All metrics calculated, record complete
        'FAILED'           -- Processing failed (manual intervention needed)
    ));

-- 2. Make fields nullable (populated by background worker)
ALTER TABLE public.activities
ALTER COLUMN name DROP NOT NULL,
ALTER COLUMN type DROP NOT NULL,
ALTER COLUMN distance_meters DROP NOT NULL,
ALTER COLUMN duration_seconds DROP NOT NULL,
ALTER COLUMN started_at DROP NOT NULL,
ALTER COLUMN finished_at DROP NOT NULL;

-- 3. Set defaults for nullable fields
ALTER TABLE public.activities
ALTER COLUMN name SET DEFAULT 'Untitled Activity',
ALTER COLUMN type SET DEFAULT 'other',
ALTER COLUMN distance_meters SET DEFAULT 0,
ALTER COLUMN duration_seconds SET DEFAULT 0;

-- 4. Add indexes for worker queries
CREATE INDEX idx_activities_processing_status 
    ON public.activities(processing_status)
    WHERE processing_status IN ('UPLOADED', 'PROCESSING');

CREATE INDEX idx_activities_fit_file_path 
    ON public.activities(fit_file_path)
    WHERE fit_file_path IS NOT NULL;

-- 5. Add index for UI queries (only show completed)
CREATE INDEX idx_activities_completed 
    ON public.activities(started_at DESC)
    WHERE processing_status = 'COMPLETED';

-- 6. Add comments
COMMENT ON COLUMN public.activities.fit_file_path IS
'S3 object key for FIT file. Format: activities/{userId}/{activityId}/{timestamp}.fit';

COMMENT ON COLUMN public.activities.processing_status IS
'Processing lifecycle:
- PENDING_UPLOAD: Activity stub created, awaiting FIT upload from mobile
- UPLOADED: FIT file uploaded to S3, background job enqueued
- PROCESSING: Background worker parsing FIT and calculating metrics
- COMPLETED: All fields populated, activity ready for display
- FAILED: Processing failed, manual intervention required';

-- ============================================================================
-- DEPRECATE activity_streams TABLE
-- ============================================================================
COMMENT ON TABLE public.activity_streams IS 
'DEPRECATED: Replaced by FIT files in S3. This table will be dropped after migration is complete.
New activities do NOT use this table. Legacy activities will be migrated via scripts/migrate-json-to-fit.ts';

-- ============================================================================
-- MIGRATION TRACKING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.activity_migrations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    migration_status text NOT NULL CHECK (migration_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
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
'Tracks conversion of legacy compressed JSON activities to FIT format. Safe to drop after full migration.';
```

**Row-Level Security (RLS) Updates:**

```sql
-- Update RLS policies to account for PENDING_UPLOAD state
CREATE POLICY "Users can view their own activities (including pending)"
    ON public.activities
    FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can create activity stubs"
    ON public.activities
    FOR INSERT
    WITH CHECK (
        profile_id = auth.uid() AND
        processing_status = 'PENDING_UPLOAD' AND
        fit_file_path IS NOT NULL
    );

-- Workers can update any activity (via service role)
-- No RLS policy needed (uses service role key)
```

---

### Crash Recovery Strategy

**Problem:**
If the mobile app crashes mid-recording, we lose in-progress FIT data.

**Solution:**
Periodic checkpointing writes FIT data to device storage, allowing recovery on app restart.

**Implementation:**

1. **Checkpoint Metadata File:**
   ```json
   // /cache/recordings/{recordingId}.meta.json
   {
     "recordingId": "abc-123",
     "startTime": "2026-01-20T10:00:00Z",
     "lastSampleIndex": 250,
     "lastTimestamp": "2026-01-20T10:04:10Z",
     "fitFilePath": "/cache/recordings/abc-123.fit",
     "metadata": {
       "sport": "cycling",
       "indoor": false
     }
   }
   ```

2. **Recovery on App Start:**
   ```typescript
   // apps/mobile/lib/services/fit/CrashRecovery.ts
   export async function recoverFromCrash(): Promise<RecoveryResult> {
     const metaFiles = await FileSystem.readDirectoryAsync(
       `${FileSystem.cacheDirectory}recordings`
     );
     
     for (const metaFile of metaFiles.filter(f => f.endsWith('.meta.json'))) {
       const meta = JSON.parse(
         await FileSystem.readAsStringAsync(metaFile)
       );
       
       // Check if FIT file exists
       const fitExists = await FileSystem.getInfoAsync(meta.fitFilePath);
       if (!fitExists.exists) continue;
       
       // Prompt user to resume or discard
       const action = await showRecoveryPrompt(meta);
       
       if (action === 'resume') {
         // Resume recording from last checkpoint
         return { action: 'resume', metadata: meta };
       } else if (action === 'upload') {
         // Upload incomplete FIT file
         const uploader = new FitUploader();
         await uploader.uploadActivity(meta.fitFilePath);
         // Clean up
         await FileSystem.deleteAsync(meta.fitFilePath);
         await FileSystem.deleteAsync(metaFile);
       } else {
         // Discard
         await FileSystem.deleteAsync(meta.fitFilePath);
         await FileSystem.deleteAsync(metaFile);
       }
     }
     
     return { action: 'none' };
   }
   ```

3. **UI for Recovery:**
   ```tsx
   // Show modal on app start if recovery files found
   <Modal visible={showRecovery}>
     <Text>Found incomplete recording from {formatDate(meta.startTime)}</Text>
     <Text>{meta.lastSampleIndex} samples recorded</Text>
     <Button onPress={() => handleRecovery('resume')}>
       Resume Recording
     </Button>
     <Button onPress={() => handleRecovery('upload')}>
       Upload as Incomplete
     </Button>
     <Button onPress={() => handleRecovery('discard')}>
       Discard
     </Button>
   </Modal>
   ```

---

### Performance Considerations

**Checkpoint Overhead:**
- **Write frequency:** Every 100 samples = 25-100 seconds (depending on sensor Hz)
- **File I/O cost:** ~5-10ms per checkpoint (negligible)
- **Battery impact:** Minimal (disk writes are async)

**FIT File Size:**
- **1-hour cycling activity:**
  - GPS: 3600 samples × 16 bytes = 57.6 KB
  - Power: 14,400 samples × 6 bytes = 86.4 KB
  - HR: 3600 samples × 4 bytes = 14.4 KB
  - Total: ~200 KB (comparable to gzipped JSON)

**Upload Time:**
- **200 KB file on 3G:** 3-5 seconds
- **200 KB file on WiFi:** < 1 second
- **No blocking:** User sees "uploading" progress bar, can navigate away

**Background Processing Time:**
- **FIT parsing:** 1-3 seconds
- **Metric calculation:** 2-5 seconds
- **Database write:** < 500ms
- **Total:** 5-10 seconds (user polls status or gets WebSocket notification)

---

## 3. Quality & Performance

### Performance Targets

**Mobile:**
- **FIT encoding throughput:** 100+ samples/sec (real-time writing at 4Hz)
- **Checkpoint latency:** < 10ms per checkpoint
- **Memory usage:** < 50 MB during recording (no large in-memory buffers)
- **Battery drain:** < 5% per hour (comparable to current JSON implementation)

**Upload:**
- **S3 upload:** 2-10 seconds for typical 200 KB FIT file
- **Pre-signed URL generation:** < 100ms

**Backend:**
- **FIT parsing:** < 3 seconds for 1-hour activity
- **Metric calculation:** < 5 seconds
- **Total processing:** < 10 seconds end-to-end

**UI:**
- **Activity list:** < 500ms (only queries completed activities)
- **Activity detail:** Shows processing state immediately, polls every 5 seconds

### Scalability

**Concurrent Workers:**
- **BullMQ:** Supports 100+ concurrent jobs per worker instance
- **Horizontal scaling:** Add more worker instances as needed
- **Rate limiting:** Process max 10 activities/second per worker

**S3 Throughput:**
- **PUT requests:** 3,500/sec per prefix (sufficient for millions of users)
- **GET requests:** 5,500/sec per prefix

**Database:**
- **Activity inserts:** Lightweight (only stub with 4 fields)
- **Activity updates:** Single atomic transaction per job
- **Indexes:** Optimized for worker queries and UI filters

---

## 4. Rollout & Process

### Deployment Strategy

**Phase 1: Infrastructure (Week 1)**
1. Apply SQL schema changes
2. Create S3 bucket with lifecycle policies
3. Set up BullMQ/Redis for job queue
4. Deploy worker service (1 instance)
5. Configure monitoring (Prometheus + Grafana)

**Phase 2: Backend Implementation (Week 2-3)**
1. Implement `requestFitUploadUrl` mutation
2. Implement `finalizeUpload` mutation
3. Implement `FitParser` service
4. Implement `MetricsCalculator` service
5. Implement `analyzeFit` background job
6. Write unit tests
7. Write integration tests

**Phase 3: Mobile Implementation (Week 4-5)**
1. Install `easy-fit` library
2. Implement `StreamingFitEncoder`
3. Implement `FitUploader`
4. Implement crash recovery service
5. Update `useActivityRecorder` hook
6. Update UI components for processing states
7. Test on iOS and Android devices

**Phase 4: Beta Testing (Week 6)**
1. Deploy to staging
2. Enable for 10% of users
3. Monitor error rates
4. Test crash recovery
5. Verify S3 costs

**Phase 5: Migration (Week 7-8)**
1. Run migration script (dry-run)
2. Migrate 10% of activities
3. Verify data integrity
4. Migrate remaining 90%

**Phase 6: Full Rollout (Week 9)**
1. Enable for 100% of users
2. Drop `activity_streams` table
3. Update documentation
4. Announce FIT export support

---

## 5. Acceptance Criteria

### Core Functionality

- [ ] **Real-Time FIT Recording:**
  - [ ] `StreamingFitEncoder` writes FIT messages incrementally during recording
  - [ ] Checkpoint occurs every 100 samples or 60 seconds
  - [ ] FIT file valid and parseable by Garmin Connect, Strava
  - [ ] No memory leaks during multi-hour recordings
  - [ ] Battery drain < 5% per hour

- [ ] **Crash Recovery:**
  - [ ] App detects incomplete recordings on restart
  - [ ] User can resume, upload, or discard incomplete recordings
  - [ ] Resumed recordings continue seamlessly
  - [ ] Uploaded incomplete recordings processable by backend

- [ ] **Upload Flow:**
  - [ ] Pre-signed URL generated successfully
  - [ ] FIT file uploads to S3 without errors
  - [ ] Activity stub created before upload
  - [ ] Background job enqueued after upload
  - [ ] Local FIT file deleted after successful upload

- [ ] **Async Processing:**
  - [ ] Background job parses FIT correctly
  - [ ] All activity fields populated from FIT data
  - [ ] Metrics calculated accurately (TSS within 1% tolerance)
  - [ ] Processing completes in < 10 seconds for 1-hour activities
  - [ ] Failed processing marked as 'FAILED' status

### Database & Schema

- [ ] **Schema Changes:**
  - [ ] `fit_file_path` column added
  - [ ] `processing_status` column added with CHECK constraint
  - [ ] Nullable fields work correctly
  - [ ] Indexes created
  - [ ] RLS policies updated

- [ ] **Data Integrity:**
  - [ ] Activity stubs have minimal required fields only
  - [ ] Completed activities have all fields populated
  - [ ] No orphaned FIT files in S3
  - [ ] No activities stuck in 'PROCESSING' state

### UI & UX

- [ ] **Activity List:**
  - [ ] Only shows completed activities
  - [ ] Polyline preview displays correctly
  - [ ] List loads in < 500ms

- [ ] **Activity Detail:**
  - [ ] Shows "Processing..." state for uploaded activities
  - [ ] Polls status every 5 seconds
  - [ ] Displays completed activity correctly
  - [ ] Shows error state for failed processing
  - [ ] Retry button works

### Migration

- [ ] **Script Functionality:**
  - [ ] Converts 100% of test activities
  - [ ] Migrated FIT files valid
  - [ ] No data loss
  - [ ] Progress tracked in `activity_migrations` table

---

## 6. Prototype: Real-Time FIT Recording Service

**File:** `apps/mobile/lib/services/fit/StreamingFitRecorder.ts`

This prototype demonstrates real-time FIT recording with checkpointing.

```typescript
/**
 * StreamingFitRecorder - Real-Time FIT Recording with Checkpointing
 *
 * Records sensor data directly to FIT file format during activity capture.
 * Implements crash recovery via periodic checkpoints.
 *
 * Usage:
 *   const recorder = new StreamingFitRecorder(userProfile);
 *   await recorder.start({ sport: 'cycling', indoor: false });
 *   
 *   // Called at 1-4Hz by sensor listeners
 *   await recorder.addSample({ timestamp: new Date(), heart_rate: 150, power: 250, ... });
 *   
 *   const fitFilePath = await recorder.finish();
 *   // Upload fitFilePath to S3
 */

import { FitWriter } from 'easy-fit';
import * as FileSystem from 'expo-file-system';
import { v4 as uuid } from 'uuid';

export interface SensorSample {
  timestamp: Date;
  position_lat?: number;
  position_long?: number;
  distance?: number;
  altitude?: number;
  speed?: number;
  heart_rate?: number;
  cadence?: number;
  power?: number;
}

export class StreamingFitRecorder {
  private writer: FitWriter | null = null;
  private recordingId: string | null = null;
  private fitFilePath: string | null = null;
  private metaFilePath: string | null = null;
  
  private sampleCount = 0;
  private lastCheckpoint = Date.now();
  private startTime: Date | null = null;
  
  private samples: SensorSample[] = []; // For session summary calculation
  
  constructor(private profile: UserProfile) {}
  
  async start(metadata: ActivityMetadata): Promise<void> {
    this.recordingId = uuid();
    this.startTime = new Date();
    
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
      manufacturer: 'development',
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
    await this.writeCheckpointMeta(metadata);
    
    console.log(`📹 Recording started: ${this.recordingId}`);
  }
  
  async addSample(sample: SensorSample): Promise<void> {
    if (!this.writer) throw new Error('Recording not started');
    
    // Store for summary calculation
    this.samples.push(sample);
    
    // Write FIT record message
    const fitRecord = {
      timestamp: this.dateToFitTimestamp(sample.timestamp),
      positionLat: sample.position_lat ? this.degreesToSemicircles(sample.position_lat) : undefined,
      positionLong: sample.position_long ? this.degreesToSemicircles(sample.position_long) : undefined,
      distance: sample.distance,
      altitude: sample.altitude,
      speed: sample.speed ? sample.speed * 1000 : undefined,
      heartRate: sample.heart_rate,
      cadence: sample.cadence,
      power: sample.power
    };
    
    this.writer.writeRecord(fitRecord);
    this.sampleCount++;
    
    // Checkpoint every 100 samples OR every 60 seconds
    const now = Date.now();
    if (this.sampleCount % 100 === 0 || now - this.lastCheckpoint > 60000) {
      await this.checkpoint();
    }
  }
  
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
        fitFilePath: this.fitFilePath
      })
    );
    
    this.lastCheckpoint = Date.now();
    console.log(`✅ Checkpoint: ${this.sampleCount} samples`);
  }
  
  async finish(): Promise<string> {
    if (!this.writer || !this.fitFilePath) {
      throw new Error('Recording not started');
    }
    
    const endTime = new Date();
    
    // Calculate session summary metrics
    const sessionMetrics = this.calculateSessionMetrics(endTime);
    
    // Write session message
    this.writer.writeSession({
      sport: sessionMetrics.sport,
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
    
    // Close FIT writer (writes CRC)
    await this.writer.close();
    
    // Delete checkpoint metadata
    if (this.metaFilePath) {
      await FileSystem.deleteAsync(this.metaFilePath, { idempotent: true });
    }
    
    console.log(`✅ Recording finished: ${this.fitFilePath}`);
    return this.fitFilePath;
  }
  
  private calculateSessionMetrics(endTime: Date) {
    const hrSamples = this.samples.map(s => s.heart_rate).filter(Boolean) as number[];
    const powerSamples = this.samples.map(s => s.power).filter(Boolean) as number[];
    const cadenceSamples = this.samples.map(s => s.cadence).filter(Boolean) as number[];
    
    const lastSample = this.samples[this.samples.length - 1];
    
    return {
      sport: 'cycling', // TODO: Get from metadata
      totalElapsedTime: (endTime.getTime() - this.startTime!.getTime()) / 1000,
      totalTimerTime: (endTime.getTime() - this.startTime!.getTime()) / 1000, // TODO: Calculate moving time
      totalDistance: lastSample?.distance || 0,
      avgHeartRate: hrSamples.length > 0 ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) : undefined,
      maxHeartRate: hrSamples.length > 0 ? Math.max(...hrSamples) : undefined,
      avgPower: powerSamples.length > 0 ? Math.round(powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length) : undefined,
      maxPower: powerSamples.length > 0 ? Math.max(...powerSamples) : undefined,
      avgCadence: cadenceSamples.length > 0 ? Math.round(cadenceSamples.reduce((a, b) => a + b, 0) / cadenceSamples.length) : undefined
    };
  }
  
  private async writeCheckpointMeta(metadata: ActivityMetadata): Promise<void> {
    if (!this.metaFilePath) return;
    
    await FileSystem.writeAsStringAsync(
      this.metaFilePath,
      JSON.stringify({
        recordingId: this.recordingId,
        startTime: this.startTime?.toISOString(),
        lastSampleIndex: 0,
        lastTimestamp: this.startTime?.toISOString(),
        fitFilePath: this.fitFilePath,
        metadata
      })
    );
  }
  
  private dateToFitTimestamp(date: Date): number {
    const FIT_EPOCH_OFFSET = 631065600;
    return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
  }
  
  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (Math.pow(2, 31) / 180));
  }
}
```

---

## 7. Next Steps for Implementation

1. **Repository Owner Actions:**
   - Apply SQL schema changes to `init.sql`
   - Run migrations
   - Update TypeScript types

2. **Backend Implementation:**
   - Implement tRPC mutations
   - Implement background worker
   - Set up BullMQ

3. **Mobile Implementation:**
   - Install `easy-fit` library
   - Implement `StreamingFitRecorder`
   - Update UI components
   - Test crash recovery

4. **Testing:**
   - Unit tests for metric calculations
   - Integration tests for upload flow
   - Device testing on iOS/Android

5. **Deployment:**
   - Deploy to staging
   - Beta test with 10% users
   - Monitor and fix issues
   - Full rollout

---

**End of Updated Plan**

This plan now records directly to FIT files in real-time, eliminates JSON submission entirely, and makes FIT files the single source of truth with fully asynchronous database record creation.