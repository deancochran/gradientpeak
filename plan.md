# FIT File Migration Implementation Plan

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

**Goal:** Replace GradientPeak's proprietary compressed JSON activity storage with industry-standard FIT files to gain interoperability with Garmin, Wahoo, and Strava while eliminating custom compression/decompression logic.

**In-Scope:**
- Mobile recording: Write FIT files directly on-device during or immediately after activity recording
- Upload mechanism: Direct-to-S3 upload via pre-signed URLs (no proxying through tRPC API)
- Storage: Store FIT files in S3 with stable object key pattern `activities/{userId}/{activityId}/{timestamp}.fit`
- Post-upload analysis: Asynchronous worker to parse FIT, extract streams, compute metrics (TSS, NP, IF, zone distributions, GPX/polyline), and update database
- Database schema: Add `fit_file_path` column to activities, deprecate `activity_streams` table, migrate `metrics` JSONB to be populated from FIT analysis
- UI changes: Activity list must display polyline preview; activity detail must async-load streams from parsed FIT data
- Migration: One-time script to convert existing compressed JSON activities to FIT format
- No crash recovery during recording (initial implementation stores all data in memory until "Finish" is pressed)

**Out-of-Scope:**
- Real-time FIT encoding during recording (too complex for MVP; encode on finish only)
- Resumable uploads after network failures (use simple retry logic)
- Advanced FIT developer fields (use standard messages only)
- Multi-sport activities in single FIT file (each activity = one file)
- Lap detection from sensor data (rely on manual lap markers or post-processing)

**Background:**
The current system compresses telemetry streams using gzip and stores them as base64 text in PostgreSQL `activity_streams` table. This approach creates vendor lock-in, requires bespoke server-side decompression, and lacks compatibility with fitness platforms. FIT files provide a compact binary format (comparable compression to gzipped JSON), are the native output of Garmin/Wahoo devices, and include standardized fields for summary metrics and per-record sensor data. By storing FIT files in object storage and extracting analytics asynchronously, we achieve better separation of concerns, simplify the ingestion pipeline, and unlock export/import compatibility with the broader fitness ecosystem.

---

## 2. Technical Design

### Architecture: End-to-End Data Flow

**Data Flow (Numbered Steps):**

```
1. SENSOR CAPTURE (Mobile - React Native)
   └─> ActivityRecorderService captures sensor data at 1-4Hz
       (HR: 1Hz, Power: 1-4Hz, GPS: 1Hz, Cadence: 1Hz)
   └─> Data stored in memory arrays (no crash recovery in MVP)

2. RECORDING FINISH (Mobile)
   └─> User presses "Finish" button
   └─> FitEncoder.ts constructs FIT messages:
       • file_id (device info, timestamp)
       • session (summary: duration, distance, avg/max metrics)
       • lap (if manual laps recorded)
       • record[] (per-second data: lat/lon, HR, power, cadence, altitude)
   └─> Outputs Uint8Array binary .fit file in memory

3. REQUEST PRE-SIGNED URL (Mobile → tRPC API)
   └─> Client calls trpc.activities.requestFitUploadUrl.mutate({ filename })
   └─> Server generates S3 object key: activities/{userId}/{activityId}/{timestamp}.fit
   └─> Server creates pre-signed PUT URL (15 min expiry) using @aws-sdk/s3-request-presigner
   └─> Server returns { uploadUrl, objectKey, activityId }

4. DIRECT S3 UPLOAD (Mobile → S3)
   └─> Client PUTs FIT file bytes to uploadUrl using fetch()
   └─> Content-Type: application/vnd.ant.fit
   └─> No proxy through application server (direct to S3)

5. FINALIZE UPLOAD (Mobile → tRPC API)
   └─> Client calls trpc.activities.finalizeFitUpload.mutate({ activityId, objectKey, metadata })
   └─> Server creates activity record in DB:
       • fit_file_path = objectKey
       • status = 'PROCESSING'
       • Basic metadata (name, type, started_at, finished_at)
   └─> Server enqueues background job for FIT analysis (BullMQ/SQS)

6. BACKGROUND ANALYSIS (Worker - Node.js)
   └─> Job worker fetches .fit from S3 using objectKey
   └─> FitParser.ts (using @garmin/fitsdk or fitdecode):
       • Parses session message → extract summary metrics
       • Parses record messages → extract time-series streams
       • Calculates derived metrics:
         - Normalized Power (30-sec rolling avg, 4th power mean)
         - Intensity Factor (NP / FTP)
         - TSS = (duration × NP × IF) / (FTP × 3600) × 100
         - Zone distributions (HR zones 1-5, Power zones 1-7)
       • Generates polyline from GPS coordinates (encode to Google polyline format)
   └─> Updates activity record:
       • metrics JSONB: { tss, if, np, avg_hr, max_power, ... }
       • hr_zone_seconds: [z1_sec, z2_sec, z3_sec, z4_sec, z5_sec]
       • power_zone_seconds: [z1_sec, ..., z7_sec]
       • distance_meters, duration_seconds, moving_seconds
       • status = 'COMPLETED'
   └─> Optional: Store extracted streams in cache/separate table for UI queries

7. UI CONSUMPTION
   └─> Activity List (mobile/web):
       • Displays polyline preview (fetched from activity.metrics.polyline or pre-computed)
   └─> Activity Detail (mobile/web):
       • Async loads per-record streams:
         - Option A: Re-parse FIT from S3 on-demand (slower, simpler)
         - Option B: Query pre-extracted streams from cache (faster, more complex)
   └─> Charts render HR, power, pace, elevation vs time
```

**Component Diagram:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOBILE (Expo/React Native)                    │
│                                                                      │
│  ┌────────────────┐          ┌──────────────────┐                  │
│  │  Recording     │  1. Sensor data (1-4Hz)     │                  │
│  │  Service       │────────────────────────────>│  In-Memory       │
│  └────────────────┘                             │  Arrays          │
│                                                  │  (no crash save) │
│  ┌────────────────┐          ┌──────────────────┐                  │
│  │  FitEncoder    │  2. On "Finish"             │                  │
│  │  (TypeScript)  │<────────────────────────────│                  │
│  └────────────────┘                             │                  │
│         │ 3. Encode to FIT binary (.fit bytes)  │                  │
│         ↓                                        │                  │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          │ 4. Request pre-signed URL (tRPC)
          ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS + tRPC API                               │
│                                                                      │
│  ┌────────────────┐                                                 │
│  │  requestFit    │  5. Generate S3 presigned URL                   │
│  │  UploadUrl     │────────────────────────┐                        │
│  └────────────────┘                        ↓                        │
│                                   ┌──────────────────┐              │
│                                   │  AWS SDK         │              │
│                                   │  (S3 Presigner)  │              │
│                                   └──────────────────┘              │
└───────────────────────────────────────────┼──────────────────────────┘
                                            │
                                            │ 6. Return { uploadUrl, objectKey }
                                            ↓
                              (Mobile uploads directly to S3)
                                            │
                                            │ 7. PUT .fit file
                                            ↓
                                   ┌──────────────────┐
                                   │   S3 STORAGE     │
                                   │   (Object Store) │
                                   └──────────────────┘
                                            │
┌───────────────────────────────────────────┼──────────────────────────┐
│                     NEXT.JS + tRPC API    │                          │
│                                           │                          │
│  ┌────────────────┐                       │                          │
│  │  finalizeFit   │  8. Create activity   │                          │
│  │  Upload        │  record in DB         │                          │
│  └────────────────┘  (status=PROCESSING)  │                          │
│         │                                  │                          │
│         │ 9. Enqueue background job        │                          │
│         ↓                                  │                          │
│  ┌────────────────┐                        │                          │
│  │  BullMQ/SQS    │                        │                          │
│  │  Job Queue     │                        │                          │
│  └────────────────┘                        │                          │
└───────────────────────────────────────────┼──────────────────────────┘
                    │                        │
                    │ 10. Worker polls job   │
                    ↓                        │
┌─────────────────────────────────────────────┼──────────────────────────┐
│                  BACKGROUND WORKER          │                          │
│                                             │                          │
│  ┌────────────────┐                         │                          │
│  │  FitParser     │  11. Fetch .fit from S3 │                          │
│  │  (@garmin/sdk) │<────────────────────────┘                          │
│  └────────────────┘                                                    │
│         │                                                              │
│         │ 12. Parse session, records, compute metrics                 │
│         ↓                                                              │
│  ┌────────────────┐                                                   │
│  │  Metrics       │  13. Update DB:                                   │
│  │  Calculator    │  - metrics JSONB (tss, if, np, polyline)          │
│  └────────────────┘  - zone arrays                                    │
│         │             - status = COMPLETED                            │
│         ↓                                                              │
│  ┌────────────────┐                                                   │
│  │   Database     │                                                   │
│  │   (PostgreSQL) │                                                   │
│  └────────────────┘                                                   │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    │ 14. Return success
                    ↓
                 (UI polls or websocket notifies)
```

**Design Rationale:**

- **Why FIT vs. raw JSON?** FIT is 50-70% smaller than uncompressed JSON and comparable to gzipped JSON. More importantly, it's a universal standard compatible with Garmin Connect, Strava, Wahoo, and all major platforms, eliminating vendor lock-in.

- **Why pre-signed URLs?** Proxying large binary files through tRPC/Next.js creates server load and timeout risks. Pre-signed URLs enable direct client-to-S3 uploads, reducing API server cost and latency. Industry best practice for file uploads.

- **Why async analysis?** Parsing FIT and calculating complex metrics (NP, TSS, curves) can take 5-15 seconds for long activities. Synchronous processing blocks the upload flow and creates poor UX. Async workers scale independently and allow immediate activity creation with incremental enrichment.

- **Why S3 over PostgreSQL?** Object storage is cheaper ($0.023/GB/month vs. ~$0.10/GB for database), designed for large binary blobs, and enables CDN caching. PostgreSQL JSONB is ideal for queryable metadata, not multi-MB binary files.

---

### File & Code Changes (Prioritized Order)

**Priority 1: Core Infrastructure**

1. **`./plan.md`** (create)
   *This file*

2. **`packages/supabase/schemas/init.sql`** (modify)
   *Add `fit_file_path` column to activities, indexes, constraints*
   *(See SQL section below - repo owner applies manually)*

3. **`apps/mobile/lib/services/fit/FitEncoder.ts`** (create)
   *TypeScript FIT encoding service for mobile*
   ```typescript
   export class FitEncoder {
     constructor(activityData: RecordingData, profile: UserProfile);
     encode(): Uint8Array; // Returns binary .fit file
   }
   ```

4. **`apps/mobile/lib/services/fit/FitUploader.ts`** (create)
   *Handles pre-signed URL request and S3 upload*
   ```typescript
   export class FitUploader {
     async requestUploadUrl(filename: string): Promise<UploadCredentials>;
     async uploadToS3(url: string, fitData: Uint8Array): Promise<void>;
     async finalizeUpload(activityId: string, objectKey: string): Promise<Activity>;
   }
   ```

**Priority 2: Backend Processing**

5. **`packages/trpc/src/routers/activities.ts`** (modify)
   *Add `requestFitUploadUrl` and `finalizeFitUpload` mutations*
   ```typescript
   requestFitUploadUrl: protectedProcedure
     .input(z.object({ filename: z.string() }))
     .mutation(async ({ ctx, input }) => {
       const objectKey = generateS3Key(ctx.session.user.id, uuid(), input.filename);
       const uploadUrl = await generatePresignedPutUrl(objectKey, 900); // 15 min
       return { uploadUrl, objectKey, activityId: uuid() };
     });

   finalizeFitUpload: protectedProcedure
     .input(z.object({ activityId: z.string(), objectKey: z.string(), metadata: z.object(...) }))
     .mutation(async ({ ctx, input }) => {
       const activity = await ctx.db.activities.create({
         id: input.activityId,
         profile_id: ctx.session.user.id,
         fit_file_path: input.objectKey,
         status: 'PROCESSING',
         ...input.metadata
       });
       await enqueueJob('analyze-fit', { activityId: input.activityId });
       return activity;
     });
   ```

6. **`packages/workers/src/jobs/analyzeFit.ts`** (create)
   *Background job for FIT parsing and metric calculation*
   ```typescript
   export async function analyzeFit(job: Job<{ activityId: string }>) {
     const { activityId } = job.data;
     const activity = await db.activities.findByPk(activityId);

     // Fetch FIT from S3
     const fitBuffer = await s3.getObject({ Key: activity.fit_file_path }).promise();

     // Parse with @garmin/fitsdk
     const fitData = await FitParser.parse(fitBuffer.Body);

     // Extract metrics
     const metrics = calculateMetrics(fitData, profile);

     // Update database
     await db.activities.update(activityId, {
       metrics,
       hr_zone_seconds: fitData.hrZones,
       power_zone_seconds: fitData.powerZones,
       distance_meters: fitData.totalDistance,
       duration_seconds: fitData.totalTime,
       status: 'COMPLETED'
     });
   }
   ```

7. **`packages/workers/src/services/FitParser.ts`** (create)
   *Server-side FIT parsing using @garmin/fitsdk*
   ```typescript
   export class FitParser {
     static async parse(fitBuffer: Buffer): Promise<ParsedFitData> {
       const decoder = new Decoder(Stream.fromBuffer(fitBuffer));
       const { messages } = decoder.read();

       return {
         session: extractSession(messages.sessionMesgs[0]),
         records: messages.recordMesgs.map(extractRecord),
         laps: messages.lapMesgs?.map(extractLap) || [],
         ...
       };
     }
   }
   ```

**Priority 3: Mobile Integration**

8. **`apps/mobile/lib/hooks/useActivityRecorder.ts`** (modify)
   *Update `finishRecording` to call FitEncoder*
   ```typescript
   const finishRecording = async () => {
     const recordingData = service.getRecordingData();
     const fitEncoder = new FitEncoder(recordingData, profile);
     const fitBytes = fitEncoder.encode();

     const uploader = new FitUploader();
     const { uploadUrl, objectKey, activityId } = await uploader.requestUploadUrl('activity.fit');
     await uploader.uploadToS3(uploadUrl, fitBytes);
     await uploader.finalizeUpload(activityId, objectKey, { name, notes });

     // Navigate to activity detail
     router.push(`/activity/${activityId}`);
   };
   ```

**Priority 4: UI Updates**

9. **`apps/mobile/components/activity/ActivityCard.tsx`** (modify)
   *Display polyline preview from `activity.metrics.polyline`*
   ```typescript
   export function ActivityCard({ activity }: Props) {
     const polyline = activity.metrics?.polyline || '';
     return (
       <View>
         <PolylineMap polyline={polyline} />
         <Text>{activity.name}</Text>
       </View>
     );
   }
   ```

10. **`apps/mobile/app/(internal)/(standard)/activity-detail.tsx`** (modify)
    *Async load streams from FIT parser API*
    ```typescript
    const { data: streams } = trpc.activities.getStreams.useQuery({ activityId });

    return (
      <View>
        <PowerChart data={streams?.power || []} />
        <HeartRateChart data={streams?.heartRate || []} />
      </View>
    );
    ```

11. **`packages/trpc/src/routers/activities.ts`** (modify)
    *Add `getStreams` query for fetching per-record data*
    ```typescript
    getStreams: protectedProcedure
      .input(z.object({ activityId: z.string() }))
      .query(async ({ ctx, input }) => {
        const activity = await ctx.db.activities.findByPk(input.activityId);
        const fitBuffer = await s3.getObject({ Key: activity.fit_file_path }).promise();
        const { records } = await FitParser.parse(fitBuffer.Body);

        return {
          timestamps: records.map(r => r.timestamp),
          heartRate: records.map(r => r.heartRate).filter(Boolean),
          power: records.map(r => r.power).filter(Boolean),
          cadence: records.map(r => r.cadence).filter(Boolean),
          ...
        };
      });
    ```

**Priority 5: Migration & Cleanup**

12. **`scripts/migrate-json-to-fit.ts`** (create)
    *One-time migration script for historical activities*
    ```typescript
    // For each activity with compressed JSON streams:
    // 1. Decompress activity_streams
    // 2. Reconstruct FIT file using FitEncoder
    // 3. Upload to S3
    // 4. Update activity.fit_file_path
    // 5. Optionally delete activity_streams rows
    ```

13. **`docs/fit-integration.md`** (create)
    *Developer documentation for FIT format, field mappings, troubleshooting*

---

### Types & Schema

#### TypeScript Interfaces

**Mobile - Recording Data:**

```typescript
// apps/mobile/lib/services/fit/types.ts
export interface RecordingData {
  deviceInfo: {
    manufacturer: string;    // e.g., 'GradientPeak'
    product: string;         // e.g., 'GradientPeak Mobile'
    serialNumber: string;
  };
  session: {
    startTime: Date;
    endTime: Date;
    totalElapsedTime: number; // seconds
    totalTimerTime: number;   // moving time (seconds)
    totalDistance: number;    // meters
    sport: 'cycling' | 'running' | 'swimming' | 'other';
    subSport?: string;        // 'indoor_cycling', 'road', etc.
  };
  records: SensorRecord[];
  laps?: LapData[];
}

export interface SensorRecord {
  timestamp: Date;
  position_lat?: number;      // degrees (will convert to semicircles)
  position_long?: number;     // degrees
  distance?: number;          // cumulative meters
  altitude?: number;          // meters
  speed?: number;             // m/s (will convert to mm/s for FIT)
  heart_rate?: number;        // bpm (uint8)
  cadence?: number;           // rpm (uint8)
  power?: number;             // watts (uint16)
  temperature?: number;       // celsius (int8)
}

export interface LapData {
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  totalDistance: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  avgCadence?: number;
  normalizedPower?: number;
}
```

**Backend - Parsed FIT Data:**

```typescript
// packages/workers/src/services/fit/types.ts
export interface ParsedFitData {
  session: {
    sport: string;
    totalElapsedTime: number;
    totalTimerTime: number;
    totalDistance: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    avgPower?: number;
    maxPower?: number;
    avgCadence?: number;
    totalCalories?: number;
    totalAscent?: number;
    totalDescent?: number;
    normalizedPower?: number;
    trainingStressScore?: number;  // TSS from device
    intensityFactor?: number;      // IF from device
  };
  records: RecordMessage[];
  laps: LapMessage[];
  userProfile?: {
    age?: number;
    gender?: 'male' | 'female';
    weight?: number;  // kg
    functionalThresholdPower?: number;
    maximumHeartRate?: number;
  };
}

export interface RecordMessage {
  timestamp: Date;
  positionLat?: number;    // degrees (converted from semicircles)
  positionLong?: number;   // degrees
  distance?: number;       // meters
  altitude?: number;       // meters
  speed?: number;          // m/s (converted from mm/s)
  heartRate?: number;      // bpm
  cadence?: number;        // rpm
  power?: number;          // watts
  temperature?: number;    // celsius
}
```

#### Database Schema Changes (SQL for init.sql)

**IMPORTANT:** The repository owner must manually apply these SQL changes to `/home/deancochran/GradientPeak/packages/supabase/schemas/init.sql`, run migrations, update TypeScript types (via supazod or codegen), and update Supabase schemas.

**SQL Changes to Apply:**

```sql
-- ============================================================================
-- FIT FILE MIGRATION - ADD TO activities TABLE
-- ============================================================================
-- Add fit_file_path column to store S3 object key
-- Add processing_status to track async analysis state
-- ============================================================================

-- 1. Add new columns to activities table
ALTER TABLE public.activities
ADD COLUMN fit_file_path text,
ADD COLUMN processing_status text DEFAULT 'COMPLETED' CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));

-- 2. Add index for status queries (worker polling)
CREATE INDEX IF NOT EXISTS idx_activities_processing_status
ON public.activities(processing_status)
WHERE processing_status IN ('PENDING', 'PROCESSING');

-- 3. Add index for S3 path lookups
CREATE INDEX IF NOT EXISTS idx_activities_fit_file_path
ON public.activities(fit_file_path)
WHERE fit_file_path IS NOT NULL;

-- 4. Add comment for documentation
COMMENT ON COLUMN public.activities.fit_file_path IS
'S3 object key for FIT file. Format: activities/{userId}/{activityId}/{timestamp}.fit. NULL for legacy JSON-based activities.';

COMMENT ON COLUMN public.activities.processing_status IS
'Status of async FIT analysis: PENDING (uploaded, awaiting parse), PROCESSING (worker active), COMPLETED (metrics extracted), FAILED (parse error). Legacy activities default to COMPLETED.';

-- ============================================================================
-- DEPRECATION PLAN FOR activity_streams TABLE
-- ============================================================================
-- Option A (Conservative): Keep activity_streams for backward compatibility
--   - No changes needed
--   - Both FIT and JSON streams can coexist
--   - activity_streams.activity_id can reference activities.id
--
-- Option B (Clean Migration): Deprecate activity_streams after migration
--   - Step 1: Migrate all JSON activities to FIT (run migration script)
--   - Step 2: Verify all activities have fit_file_path populated
--   - Step 3: Drop table (CAUTION: Irreversible)
--   - Uncomment SQL below ONLY after migration is complete:

-- -- DROP TABLE public.activity_streams CASCADE;

-- For MVP, we recommend Option A (keep both) to avoid data loss risk.
-- The migration script will populate fit_file_path for new FIT-based activities,
-- while old activities retain their activity_streams rows.
-- ============================================================================

-- ============================================================================
-- MIGRATION HELPER TABLE (Optional)
-- ============================================================================
-- Track migration progress for JSON->FIT conversion
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

CREATE INDEX IF NOT EXISTS idx_activity_migrations_status
ON public.activity_migrations(migration_status)
WHERE migration_status IN ('PENDING', 'IN_PROGRESS');

COMMENT ON TABLE public.activity_migrations IS
'Tracks conversion of legacy compressed JSON activities to FIT format. Safe to drop after full migration.';
```

**Post-SQL Steps (Repository Owner Responsibility):**

1. **Apply SQL to init.sql:**
   Edit `/home/deancochran/GradientPeak/packages/supabase/schemas/init.sql` and insert the above SQL block after the `activities` table definition (around line 440).

2. **Run Supabase migration:**
   ```bash
   cd packages/supabase
   supabase db reset --local  # or apply via migration file
   ```

3. **Update TypeScript types:**
   ```bash
   # If using supazod or similar codegen:
   pnpm run generate:types

   # Manually verify types in:
   # packages/supabase/types/database.ts
   ```

4. **Update Supabase remote (production):**
   ```bash
   supabase db push
   ```

---

### FIT Format Field Mapping

**Critical FIT Message Types:**

| **Message Type** | **FIT Message #** | **Purpose** | **Key Fields** |
|------------------|-------------------|-------------|----------------|
| `file_id` | 0 | File metadata | `manufacturer`, `product`, `time_created`, `type` (activity) |
| `file_creator` | 49 | Device info | `software_version`, `hardware_version` |
| `event` | 21 | Recording start/stop | `event`, `event_type`, `timestamp` |
| `device_info` | 23 | Connected sensors | `device_index`, `device_type`, `manufacturer`, `product` |
| `session` | 18 | Activity summary | `sport`, `start_time`, `total_elapsed_time`, `total_timer_time`, `total_distance`, `avg_heart_rate`, `max_heart_rate`, `avg_power`, `max_power`, `avg_cadence`, `total_calories`, `total_ascent`, `total_descent`, `normalized_power`, `training_stress_score`, `intensity_factor` |
| `lap` | 19 | Lap summaries | (same fields as session, per lap) |
| `record` | 20 | Per-second data | `timestamp`, `position_lat`, `position_long`, `distance`, `altitude`, `speed`, `heart_rate`, `cadence`, `power`, `temperature` |
| `user_profile` | 3 | Athlete data | `age`, `gender`, `weight`, `height` |
| `zones_target` | 7 | Training zones | `functional_threshold_power`, `max_heart_rate`, `threshold_heart_rate` |

**Data Type Conversions:**

| **Data Type** | **Units** | **FIT Storage** | **Conversion Formula** |
|---------------|-----------|-----------------|------------------------|
| **GPS Latitude/Longitude** | Degrees (-180 to 180) | Semicircles (int32) | `semicircles = degrees × (2^31 / 180)` |
| **Altitude** | Meters | Millimeters (uint16) | `mm = meters × 1000` (with offset) |
| **Speed** | m/s | mm/s (uint16) | `mm/s = m/s × 1000` |
| **Distance** | Meters | Meters (uint32) | Direct (accumulate as cumulative) |
| **Heart Rate** | BPM | BPM (uint8) | Direct (0-255) |
| **Power** | Watts | Watts (uint16) | Direct (0-65535) |
| **Cadence** | RPM | RPM (uint8) | Direct (0-255) |
| **Temperature** | Celsius | Celsius (int8) | Direct (-128 to 127) |
| **Timestamp** | JavaScript Date | Seconds since UTC epoch (uint32) | `fitTimestamp = (date.getTime() / 1000) - FIT_EPOCH_OFFSET` where `FIT_EPOCH_OFFSET = 631065600` (Dec 31, 1989 00:00:00 UTC) |

**Timestamp Handling:**

FIT uses seconds since December 31, 1989 00:00:00 UTC (timestamp 0 in FIT = 631065600 in Unix epoch).

```typescript
// JavaScript Date to FIT timestamp
const FIT_EPOCH_OFFSET = 631065600; // seconds between Unix epoch and FIT epoch
function dateToFitTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
}

// FIT timestamp to JavaScript Date
function fitTimestampToDate(fitTimestamp: number): Date {
  return new Date((fitTimestamp + FIT_EPOCH_OFFSET) * 1000);
}
```

**GPS Coordinate Conversion:**

```typescript
// Degrees to semicircles (for encoding)
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

// Semicircles to degrees (for parsing)
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

---

### Code Snippets

#### FIT Encoding (Mobile - TypeScript)

```typescript
// apps/mobile/lib/services/fit/FitEncoder.ts
import { Encoder, Stream } from '@garmin/fitsdk';
import type { RecordingData, SensorRecord } from './types';

export class FitEncoder {
  private data: RecordingData;
  private profile: { ftp?: number; weight?: number; age?: number };

  constructor(data: RecordingData, profile: UserProfile) {
    this.data = data;
    this.profile = {
      ftp: profile.ftp,
      weight: profile.weight_kg,
      age: profile.age
    };
  }

  encode(): Uint8Array {
    const encoder = new Encoder();

    // 1. File ID message (required)
    encoder.writeMessage('fileId', {
      type: 'activity',
      manufacturer: 'development',
      product: 0,
      timeCreated: this.dateToFitTimestamp(this.data.session.startTime),
      serialNumber: this.data.deviceInfo.serialNumber
    });

    // 2. User profile (if available)
    if (this.profile.weight || this.profile.age) {
      encoder.writeMessage('userProfile', {
        weight: this.profile.weight,
        age: this.profile.age,
        functionalThresholdPower: this.profile.ftp
      });
    }

    // 3. Event: Timer start
    encoder.writeMessage('event', {
      event: 'timer',
      eventType: 'start',
      timestamp: this.dateToFitTimestamp(this.data.session.startTime)
    });

    // 4. Record messages (per-second data)
    this.data.records.forEach((record) => {
      const fitRecord: any = {
        timestamp: this.dateToFitTimestamp(record.timestamp)
      };

      if (record.position_lat !== undefined && record.position_long !== undefined) {
        fitRecord.positionLat = this.degreesToSemicircles(record.position_lat);
        fitRecord.positionLong = this.degreesToSemicircles(record.position_long);
      }
      if (record.distance !== undefined) fitRecord.distance = record.distance;
      if (record.altitude !== undefined) fitRecord.altitude = record.altitude;
      if (record.speed !== undefined) fitRecord.speed = record.speed * 1000; // m/s to mm/s
      if (record.heart_rate !== undefined) fitRecord.heartRate = record.heart_rate;
      if (record.cadence !== undefined) fitRecord.cadence = record.cadence;
      if (record.power !== undefined) fitRecord.power = record.power;
      if (record.temperature !== undefined) fitRecord.temperature = record.temperature;

      encoder.writeMessage('record', fitRecord);
    });

    // 5. Lap messages (if any)
    this.data.laps?.forEach((lap) => {
      encoder.writeMessage('lap', {
        timestamp: this.dateToFitTimestamp(lap.startTime),
        totalElapsedTime: lap.totalElapsedTime,
        totalTimerTime: lap.totalTimerTime,
        totalDistance: lap.totalDistance,
        avgHeartRate: lap.avgHeartRate,
        maxHeartRate: lap.maxHeartRate,
        avgPower: lap.avgPower,
        maxPower: lap.maxPower,
        avgCadence: lap.avgCadence,
        normalizedPower: lap.normalizedPower
      });
    });

    // 6. Session message (activity summary)
    const sessionMessage = {
      sport: this.mapSportType(this.data.session.sport),
      subSport: this.data.session.subSport,
      startTime: this.dateToFitTimestamp(this.data.session.startTime),
      timestamp: this.dateToFitTimestamp(this.data.session.endTime),
      totalElapsedTime: this.data.session.totalElapsedTime,
      totalTimerTime: this.data.session.totalTimerTime,
      totalDistance: this.data.session.totalDistance,
      // Aggregate metrics computed client-side or left for server
      avgHeartRate: this.calculateAvg(this.data.records, 'heart_rate'),
      maxHeartRate: this.calculateMax(this.data.records, 'heart_rate'),
      avgPower: this.calculateAvg(this.data.records, 'power'),
      maxPower: this.calculateMax(this.data.records, 'power'),
      avgCadence: this.calculateAvg(this.data.records, 'cadence')
      // Note: Normalized power, TSS, IF computed server-side for accuracy
    };

    encoder.writeMessage('session', sessionMessage);

    // 7. Event: Timer stop
    encoder.writeMessage('event', {
      event: 'timer',
      eventType: 'stopAll',
      timestamp: this.dateToFitTimestamp(this.data.session.endTime)
    });

    // Return FIT file as Uint8Array
    const fitBytes = encoder.finish();
    return fitBytes;
  }

  private dateToFitTimestamp(date: Date): number {
    const FIT_EPOCH_OFFSET = 631065600;
    return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
  }

  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (Math.pow(2, 31) / 180));
  }

  private mapSportType(sport: string): string {
    const sportMap: Record<string, string> = {
      cycling: 'cycling',
      running: 'running',
      swimming: 'swimming',
      other: 'generic'
    };
    return sportMap[sport] || 'generic';
  }

  private calculateAvg(records: SensorRecord[], field: keyof SensorRecord): number | undefined {
    const values = records.map(r => r[field]).filter(v => v !== undefined) as number[];
    if (values.length === 0) return undefined;
    return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  }

  private calculateMax(records: SensorRecord[], field: keyof SensorRecord): number | undefined {
    const values = records.map(r => r[field]).filter(v => v !== undefined) as number[];
    if (values.length === 0) return undefined;
    return Math.max(...values);
  }
}
```

#### Backend FIT Parsing (Node.js)

```typescript
// packages/workers/src/services/fit/FitParser.ts
import { Decoder, Stream } from '@garmin/fitsdk';
import type { ParsedFitData, RecordMessage } from './types';

export class FitParser {
  static async parse(fitBuffer: Buffer): Promise<ParsedFitData> {
    const stream = Stream.fromBuffer(fitBuffer);
    const decoder = new Decoder(stream);
    const { messages, errors } = decoder.read();

    if (errors.length > 0) {
      console.warn('FIT parsing warnings:', errors);
    }

    // Extract session (activity summary)
    const sessionMsg = messages.sessionMesgs?.[0];
    if (!sessionMsg) throw new Error('No session message found in FIT file');

    // Extract records (per-second telemetry)
    const records: RecordMessage[] = (messages.recordMesgs || []).map(r => ({
      timestamp: this.fitTimestampToDate(r.timestamp),
      positionLat: r.positionLat !== undefined ? this.semicirclesToDegrees(r.positionLat) : undefined,
      positionLong: r.positionLong !== undefined ? this.semicirclesToDegrees(r.positionLong) : undefined,
      distance: r.distance,
      altitude: r.altitude,
      speed: r.speed !== undefined ? r.speed / 1000 : undefined, // mm/s to m/s
      heartRate: r.heartRate,
      cadence: r.cadence,
      power: r.power,
      temperature: r.temperature
    }));

    // Extract user profile (if present)
    const userProfileMsg = messages.userProfileMesgs?.[0];

    return {
      session: {
        sport: sessionMsg.sport,
        totalElapsedTime: sessionMsg.totalElapsedTime,
        totalTimerTime: sessionMsg.totalTimerTime,
        totalDistance: sessionMsg.totalDistance,
        avgHeartRate: sessionMsg.avgHeartRate,
        maxHeartRate: sessionMsg.maxHeartRate,
        avgPower: sessionMsg.avgPower,
        maxPower: sessionMsg.maxPower,
        avgCadence: sessionMsg.avgCadence,
        totalCalories: sessionMsg.totalCalories,
        totalAscent: sessionMsg.totalAscent,
        totalDescent: sessionMsg.totalDescent,
        normalizedPower: sessionMsg.normalizedPower,
        trainingStressScore: sessionMsg.trainingStressScore,
        intensityFactor: sessionMsg.intensityFactor
      },
      records,
      laps: messages.lapMesgs || [],
      userProfile: userProfileMsg ? {
        age: userProfileMsg.age,
        gender: userProfileMsg.gender,
        weight: userProfileMsg.weight,
        functionalThresholdPower: userProfileMsg.functionalThresholdPower,
        maximumHeartRate: userProfileMsg.maxHeartRate
      } : undefined
    };
  }

  private static fitTimestampToDate(fitTimestamp: number): Date {
    const FIT_EPOCH_OFFSET = 631065600;
    return new Date((fitTimestamp + FIT_EPOCH_OFFSET) * 1000);
  }

  private static semicirclesToDegrees(semicircles: number): number {
    return semicircles * (180 / Math.pow(2, 31));
  }
}
```

#### Metric Calculation (Server)

```typescript
// packages/workers/src/services/metrics/MetricsCalculator.ts
export class MetricsCalculator {
  /**
   * Calculate Normalized Power (NP) using 30-second rolling average.
   * Formula: NP = (average of (30-sec rolling avg)^4)^(1/4)
   */
  static calculateNormalizedPower(powerData: number[]): number {
    if (powerData.length === 0) return 0;

    const rollingWindow = 30; // 30-second window
    const rollingAverages: number[] = [];

    for (let i = 0; i < powerData.length; i++) {
      const start = Math.max(0, i - rollingWindow + 1);
      const window = powerData.slice(start, i + 1);
      const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
      rollingAverages.push(avg);
    }

    // Calculate 4th power mean
    const sum4thPower = rollingAverages.reduce((sum, avg) => sum + Math.pow(avg, 4), 0);
    const mean4thPower = sum4thPower / rollingAverages.length;
    const normalizedPower = Math.pow(mean4thPower, 1 / 4);

    return Math.round(normalizedPower);
  }

  /**
   * Calculate Intensity Factor (IF).
   * Formula: IF = NP / FTP
   */
  static calculateIntensityFactor(normalizedPower: number, ftp: number): number {
    if (!ftp || ftp === 0) return 0;
    return parseFloat((normalizedPower / ftp).toFixed(2));
  }

  /**
   * Calculate Training Stress Score (TSS).
   * Formula: TSS = (duration × NP × IF) / (FTP × 3600) × 100
   */
  static calculateTSS(
    durationSeconds: number,
    normalizedPower: number,
    ftp: number
  ): number {
    if (!ftp || ftp === 0) return 0;

    const intensityFactor = this.calculateIntensityFactor(normalizedPower, ftp);
    const tss = (durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600) * 100;

    return Math.round(tss);
  }

  /**
   * Calculate power zone distribution (time in each Coggan zone).
   * Zones: [Recovery <56%, Endurance 56-75%, Tempo 76-90%, Threshold 91-105%, VO2Max 106-120%, Anaerobic 121-150%, Neuromuscular >150%]
   */
  static calculatePowerZones(powerData: number[], ftp: number): number[] {
    const zoneThresholds = [0, 0.56, 0.75, 0.90, 1.05, 1.20, 1.50, Infinity];
    const zoneCounts = new Array(7).fill(0);

    powerData.forEach(power => {
      const percent = power / ftp;
      for (let i = 0; i < 7; i++) {
        if (percent >= zoneThresholds[i] && percent < zoneThresholds[i + 1]) {
          zoneCounts[i]++;
          break;
        }
      }
    });

    return zoneCounts; // Array of seconds in each zone (assuming 1Hz data)
  }

  /**
   * Calculate heart rate zone distribution (5 zones based on max HR).
   */
  static calculateHRZones(hrData: number[], maxHR: number): number[] {
    const zoneThresholds = [0, 0.60, 0.70, 0.80, 0.90, 1.00];
    const zoneCounts = new Array(5).fill(0);

    hrData.forEach(hr => {
      const percent = hr / maxHR;
      for (let i = 0; i < 5; i++) {
        if (percent >= zoneThresholds[i] && percent < zoneThresholds[i + 1]) {
          zoneCounts[i]++;
          break;
        }
      }
    });

    return zoneCounts;
  }
}
```

---

### Storage & Object Keying

**S3 Bucket Structure:**

```
s3://gradientpeak-activities/
├── activities/
│   ├── {userId}/
│   │   ├── {activityId}/
│   │   │   ├── {timestamp}.fit          # Primary FIT file
│   │   │   ├── {timestamp}.fit.backup   # Optional: backup copy
│   │   │   └── metadata.json            # Optional: indexing metadata
│   │   └── ...
│   └── ...
```

**Object Key Pattern:**

```typescript
function generateS3Key(userId: string, activityId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `activities/${userId}/${activityId}/${timestamp}.fit`;
}
```

**Rationale:**
- **Partition by userId:** Enables per-user bucket policies, lifecycle rules, and billing analysis
- **Nested activityId:** Groups related files (e.g., original FIT + processed GPX/TCX exports)
- **Timestamp suffix:** Allows versioning if activity is re-uploaded (e.g., after manual edit)
- **Extension `.fit`:** Clear file type for CDN content-type headers

**Lifecycle Policies:**

```json
{
  "Rules": [
    {
      "Id": "archive-old-activities",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    },
    {
      "Id": "delete-orphaned-fits",
      "Status": "Enabled",
      "Filter": {
        "Tag": {
          "Key": "orphaned",
          "Value": "true"
        }
      },
      "Expiration": {
        "Days": 7
      }
    }
  ]
}
```

**Caching Strategy:**

- **CloudFront CDN:** Serve FIT files via CDN with signed URLs (for privacy)
- **Cache-Control:** `max-age=31536000, immutable` (FIT files never change)
- **Polyline Cache:** Store extracted polyline in `activity.metrics.polyline` to avoid re-parsing for list views

---

### Analysis & Post-Storage Processing

**Processing Pipeline:**

```
1. FIT file uploaded to S3
   ↓
2. Activity record created with status='PROCESSING'
   ↓
3. Job enqueued in BullMQ/SQS
   ↓
4. Worker fetches FIT from S3
   ↓
5. Parse FIT with @garmin/fitsdk:
   - Extract session summary
   - Extract per-record streams
   - Extract user profile (if present)
   ↓
6. Calculate derived metrics:
   - Normalized Power (30-sec rolling avg, 4th power mean)
   - Intensity Factor (NP / FTP)
   - TSS ((duration × NP × IF) / (FTP × 3600) × 100)
   - Power zone distribution (7 Coggan zones)
   - HR zone distribution (5 zones)
   - Variability Index (NP / avg power)
   - Efficiency Factor (NP / avg HR)
   ↓
7. Generate polyline:
   - Encode lat/lon coordinates to Google polyline format
   - Store in activity.metrics.polyline
   ↓
8. Update database:
   - activity.metrics = { tss, if, np, polyline, ... }
   - activity.hr_zone_seconds = [z1, z2, z3, z4, z5]
   - activity.power_zone_seconds = [z1, ..., z7]
   - activity.distance_meters, duration_seconds, moving_seconds
   - activity.processing_status = 'COMPLETED'
   ↓
9. Optional: Notify client via WebSocket/polling
```

**Synchronous vs. Asynchronous:**

- **Synchronous (Not Recommended):** Parse FIT immediately in `finalizeFitUpload` mutation
  - ❌ Blocks API response (5-15 seconds for long activities)
  - ❌ Timeout risk on large files
  - ❌ No retry on failure

- **Asynchronous (Recommended):** Background worker job
  - ✅ Immediate API response (< 500ms)
  - ✅ Independent scaling (workers auto-scale)
  - ✅ Automatic retry on failure
  - ✅ Status polling UX pattern

**Worker Implementation (BullMQ):**

```typescript
// packages/workers/src/index.ts
import { Queue, Worker } from 'bullmq';
import { analyzeFit } from './jobs/analyzeFit';

const fitAnalysisQueue = new Queue('fit-analysis', {
  connection: { host: 'redis', port: 6379 }
});

const worker = new Worker('fit-analysis', async (job) => {
  await analyzeFit(job);
}, {
  connection: { host: 'redis', port: 6379 },
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000 // 10 jobs/sec max
  }
});

worker.on('completed', (job) => {
  console.log(`✅ Analyzed activity ${job.data.activityId}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Failed to analyze activity ${job?.data?.activityId}:`, err);
});
```

---

### UI Integration

#### Activity List Preview (Polyline)

```tsx
// apps/mobile/components/activity/ActivityCard.tsx
import { View, Text } from 'react-native';
import { Polyline } from '@/components/maps/Polyline';

export interface ActivityCardProps {
  activity: {
    id: string;
    name: string;
    type: string;
    distance_meters: number;
    duration_seconds: number;
    metrics?: { polyline?: string; tss?: number; avg_hr?: number };
  };
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const polyline = activity.metrics?.polyline;

  return (
    <View className="bg-card p-4 rounded-lg mb-2">
      {polyline && (
        <View className="h-32 rounded overflow-hidden mb-2">
          <Polyline encodedPolyline={polyline} />
        </View>
      )}
      <Text className="text-foreground font-semibold">{activity.name}</Text>
      <Text className="text-muted-foreground">
        {(activity.distance_meters / 1000).toFixed(2)} km • {Math.floor(activity.duration_seconds / 60)} min
      </Text>
      {activity.metrics?.tss && (
        <Text className="text-muted-foreground">TSS: {activity.metrics.tss}</Text>
      )}
    </View>
  );
}
```

#### Activity Detail (Async Stream Loading)

```tsx
// apps/mobile/app/(internal)/(standard)/activity-detail.tsx
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { PowerChart } from '@/components/charts/PowerChart';
import { HeartRateChart } from '@/components/charts/HeartRateChart';

export default function ActivityDetailScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();

  // Fetch activity metadata (from DB - fast)
  const { data: activity, isLoading: activityLoading } = trpc.activities.getById.useQuery({
    id: activityId!
  });

  // Fetch per-record streams (parsed from FIT - slower)
  const { data: streams, isLoading: streamsLoading } = trpc.activities.getStreams.useQuery({
    activityId: activityId!
  }, {
    enabled: !!activityId,
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  });

  if (activityLoading) {
    return <ActivityIndicator size="large" className="flex-1 items-center justify-center" />;
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4">
        <Text className="text-2xl font-bold text-foreground">{activity?.name}</Text>
        <Text className="text-muted-foreground">
          {activity?.type} • {(activity?.distance_meters / 1000).toFixed(2)} km
        </Text>

        {/* Summary metrics */}
        <View className="mt-4">
          <MetricRow label="TSS" value={activity?.metrics?.tss} />
          <MetricRow label="NP" value={activity?.metrics?.normalized_power} />
          <MetricRow label="IF" value={activity?.metrics?.intensity_factor} />
        </View>

        {/* Charts (show loading state while streams load) */}
        {streamsLoading ? (
          <ActivityIndicator className="my-8" />
        ) : (
          <>
            {streams?.power && (
              <View className="mt-6">
                <PowerChart
                  data={streams.power}
                  timestamps={streams.timestamps}
                  ftp={activity?.profile_snapshot?.ftp}
                />
              </View>
            )}
            {streams?.heartRate && (
              <View className="mt-6">
                <HeartRateChart
                  data={streams.heartRate}
                  timestamps={streams.timestamps}
                  maxHR={activity?.profile_snapshot?.max_hr}
                />
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
```

#### tRPC Endpoint for Streams

```typescript
// packages/trpc/src/routers/activities.ts
getStreams: protectedProcedure
  .input(z.object({ activityId: z.string() }))
  .query(async ({ ctx, input }) => {
    // 1. Fetch activity
    const activity = await ctx.db.activities.findFirst({
      where: { id: input.activityId, profile_id: ctx.session.user.id }
    });

    if (!activity) throw new TRPCError({ code: 'NOT_FOUND' });
    if (!activity.fit_file_path) {
      // Legacy activity - fallback to activity_streams
      return getLegacyStreams(activity.id, ctx.db);
    }

    // 2. Check cache (optional - e.g., Redis)
    const cacheKey = `streams:${activity.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 3. Fetch FIT from S3
    const fitBuffer = await s3.getObject({
      Bucket: process.env.S3_BUCKET,
      Key: activity.fit_file_path
    }).promise();

    // 4. Parse FIT
    const parsed = await FitParser.parse(fitBuffer.Body as Buffer);

    // 5. Extract streams
    const streams = {
      timestamps: parsed.records.map(r => r.timestamp.toISOString()),
      heartRate: parsed.records.map(r => r.heartRate).filter(Boolean),
      power: parsed.records.map(r => r.power).filter(Boolean),
      cadence: parsed.records.map(r => r.cadence).filter(Boolean),
      speed: parsed.records.map(r => r.speed).filter(Boolean),
      altitude: parsed.records.map(r => r.altitude).filter(Boolean),
      latLng: parsed.records
        .filter(r => r.positionLat && r.positionLong)
        .map(r => ({ lat: r.positionLat!, lng: r.positionLong! }))
    };

    // 6. Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(streams));

    return streams;
  });
```

---

### Backwards Compatibility & Migration

**Migration Strategy:**

1. **Dual Support Period (Recommended 3-6 months):**
   - New activities: Write FIT files, populate `fit_file_path`
   - Old activities: Retain `activity_streams` table
   - Query logic: Check `fit_file_path` first, fallback to `activity_streams`

2. **Migration Script (One-Time):**
   ```bash
   pnpm run migrate:json-to-fit --batch-size=100 --dry-run
   ```

3. **Rollback Plan:**
   - Keep S3 bucket versioning enabled
   - Retain `activity_streams` table for 90 days post-migration
   - DB backup before migration script run

**Migration Script (Pseudocode):**

```typescript
// scripts/migrate-json-to-fit.ts
import { db } from '@/lib/db';
import { FitEncoder } from '@/lib/services/fit/FitEncoder';
import { s3 } from '@/lib/aws';

async function migrateActivity(activityId: string) {
  // 1. Fetch activity and streams from DB
  const activity = await db.activities.findByPk(activityId);
  const streams = await db.activityStreams.findAll({ where: { activity_id: activityId } });

  if (!streams.length) {
    console.warn(`No streams for activity ${activityId}, skipping`);
    return;
  }

  // 2. Decompress JSON streams
  const decompressed = streams.map(s => ({
    type: s.type,
    values: decompressBase64(s.compressed_values),
    timestamps: decompressBase64(s.compressed_timestamps)
  }));

  // 3. Reconstruct RecordingData format
  const recordingData = reconstructFromStreams(decompressed, activity);

  // 4. Encode to FIT
  const encoder = new FitEncoder(recordingData, activity.profile_snapshot);
  const fitBytes = encoder.encode();

  // 5. Upload to S3
  const objectKey = `activities/${activity.profile_id}/${activity.id}/migrated.fit`;
  await s3.putObject({
    Bucket: process.env.S3_BUCKET,
    Key: objectKey,
    Body: fitBytes,
    ContentType: 'application/vnd.ant.fit',
    Metadata: {
      migratedFrom: 'json',
      originalActivityId: activity.id,
      migrationDate: new Date().toISOString()
    }
  }).promise();

  // 6. Update activity record
  await db.activities.update(activityId, {
    fit_file_path: objectKey
  });

  // 7. Mark migration complete
  await db.activityMigrations.update(
    { activity_id: activityId },
    { migration_status: 'COMPLETED', completed_at: new Date() }
  );

  console.log(`✅ Migrated activity ${activityId}`);
}

// Run migration in batches
async function runMigration() {
  const activitiesToMigrate = await db.activities.findAll({
    where: { fit_file_path: null },
    limit: 100
  });

  for (const activity of activitiesToMigrate) {
    try {
      await migrateActivity(activity.id);
    } catch (error) {
      console.error(`❌ Migration failed for ${activity.id}:`, error);
      await db.activityMigrations.update(
        { activity_id: activity.id },
        { migration_status: 'FAILED', error_message: error.message }
      );
    }
  }
}
```

**SQL for Safe Migration:**

```sql
-- Check migration progress
SELECT
  migration_status,
  COUNT(*) as count
FROM public.activity_migrations
GROUP BY migration_status;

-- Find activities needing migration
SELECT
  a.id,
  a.name,
  a.started_at
FROM public.activities a
LEFT JOIN public.activity_migrations m ON a.id = m.activity_id
WHERE a.fit_file_path IS NULL
AND (m.migration_status IS NULL OR m.migration_status IN ('PENDING', 'FAILED'))
ORDER BY a.started_at DESC
LIMIT 100;

-- After successful migration, verify data integrity
SELECT
  COUNT(*) as total_activities,
  COUNT(fit_file_path) as migrated_to_fit,
  COUNT(*) - COUNT(fit_file_path) as legacy_json_only
FROM public.activities;
```

---

## 3. Quality & Performance

### Performance Targets

**Memory Usage:**
- **Mobile during recording:** < 50 MB in-memory buffer (for 2-hour activity at 1Hz, ~7200 samples × 6 fields × 4 bytes ≈ 172 KB raw data + overhead)
- **FIT encoding:** < 100 MB peak (Encoder allocates buffers)
- **Server-side parsing:** < 200 MB per worker process (FitParser + metric calculations)

**Write Speed:**
- **FIT encoding throughput:** 50-100 samples/sec encoding rate (target < 2 seconds for 1-hour activity with 3600 records)
- **S3 upload:** Streaming upload support for files > 5 MB (avoid loading entire file in memory)

**Upload Performance:**
- **Pre-signed URL generation:** < 100ms (synchronous AWS SDK call)
- **S3 PUT request:** 2-10 seconds depending on file size and network (1 MB file ≈ 3 seconds on 3G)
- **Analysis processing:** 5-15 seconds for typical activity (1-2 hours, 3600-7200 records)

**Query Performance:**
- **Activity list (with polyline):** < 500ms for 20 activities (polyline stored in JSONB, indexed)
- **Activity detail streams:** < 2 seconds for 1-hour activity (S3 fetch + parse + return)
- **Stream caching:** Redis cache reduces subsequent loads to < 100ms

### Scalability

**Concurrent Uploads:**
- **S3 PUT throughput:** 3,500 PUT/sec per prefix (sufficient for millions of users)
- **Pre-signed URL generation:** Horizontal scaling (stateless Next.js API)
- **Worker concurrency:** BullMQ supports 100+ concurrent jobs per worker instance

**Worker Autoscaling:**
```yaml
# Docker Swarm / Kubernetes autoscaling config
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: fit-analysis-worker
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: fit-analysis-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: External
    external:
      metric:
        name: bullmq_queue_size
        selector:
          matchLabels:
            queue: fit-analysis
      target:
        type: AverageValue
        averageValue: "10"  # Scale up if queue > 10 jobs/worker
```

**Storage Throughput:**
- **S3 read:** 5,500 GET/sec per prefix (sufficient for UI queries)
- **CDN caching:** 99% cache hit rate for polyline images (reduce S3 reads)

### Observability

**Metrics to Track (Prometheus/Grafana):**

```typescript
// packages/workers/src/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const fitAnalysisMetrics = {
  // Counters
  fitFilesProcessed: new Counter({
    name: 'fit_files_processed_total',
    help: 'Total FIT files successfully processed',
    labelNames: ['sport_type']
  }),

  fitParseErrors: new Counter({
    name: 'fit_parse_errors_total',
    help: 'Total FIT parse failures',
    labelNames: ['error_type']
  }),

  // Histograms (for latency)
  fitParseTime: new Histogram({
    name: 'fit_parse_duration_seconds',
    help: 'FIT parsing duration',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  }),

  metricCalculationTime: new Histogram({
    name: 'metric_calculation_duration_seconds',
    help: 'Metric calculation duration',
    buckets: [0.1, 0.5, 1, 2, 5]
  }),

  // Gauges (for current state)
  queueSize: new Gauge({
    name: 'fit_analysis_queue_size',
    help: 'Current job queue size'
  })
};
```

**Structured Logging:**

```typescript
// packages/workers/src/jobs/analyzeFit.ts
import { logger } from '@/lib/logger';

export async function analyzeFit(job: Job<{ activityId: string }>) {
  const startTime = Date.now();

  try {
    logger.info('FIT analysis started', {
      activityId: job.data.activityId,
      jobId: job.id
    });

    const activity = await db.activities.findByPk(job.data.activityId);
    const fitBuffer = await s3.getObject({ Key: activity.fit_file_path }).promise();

    const parseStart = Date.now();
    const parsed = await FitParser.parse(fitBuffer.Body);
    fitAnalysisMetrics.fitParseTime.observe((Date.now() - parseStart) / 1000);

    const metrics = MetricsCalculator.calculate(parsed, activity.profile_snapshot);

    await db.activities.update(job.data.activityId, { metrics, status: 'COMPLETED' });

    fitAnalysisMetrics.fitFilesProcessed.inc({ sport_type: activity.type });

    logger.info('FIT analysis completed', {
      activityId: job.data.activityId,
      durationMs: Date.now() - startTime,
      recordCount: parsed.records.length
    });

  } catch (error) {
    fitAnalysisMetrics.fitParseErrors.inc({ error_type: error.name });

    logger.error('FIT analysis failed', {
      activityId: job.data.activityId,
      error: error.message,
      stack: error.stack
    });

    await db.activities.update(job.data.activityId, { status: 'FAILED' });
    throw error; // Trigger BullMQ retry
  }
}
```

**Alert Thresholds:**
- Parse error rate > 1% in 5-minute window → Critical alert
- Average parse time > 10 seconds → Warning alert
- Queue size > 100 for > 10 minutes → Scaling alert
- S3 GET errors > 0.5% → Infrastructure alert

---

## 4. Rollout & Process

### Deployment Strategy

**Phase 1: Infrastructure Setup (Week 1)**
1. Create S3 bucket with lifecycle policies
2. Set up BullMQ/Redis for job queue
3. Deploy worker service (1 instance initially)
4. Configure CloudFront CDN for S3
5. Add monitoring (Prometheus + Grafana dashboards)

**Phase 2: Backend Implementation (Week 2-3)**
1. Implement `requestFitUploadUrl` and `finalizeFitUpload` tRPC mutations
2. Implement `FitParser` service with @garmin/fitsdk
3. Implement `MetricsCalculator` (NP, IF, TSS, zones)
4. Implement `analyzeFit` background job
5. Add `getStreams` tRPC query
6. Write unit tests for metric calculations
7. Write integration tests for FIT parsing

**Phase 3: Mobile Implementation (Week 4-5)**
1. Implement `FitEncoder` service
2. Implement `FitUploader` service
3. Update `useActivityRecorder` hook to call FitEncoder
4. Update `ActivityCard` to display polyline
5. Update `ActivityDetail` to async-load streams
6. Test on iOS and Android devices
7. Test with real Bluetooth sensors (HR, power, GPS)

**Phase 4: Beta Testing (Week 6)**
1. Deploy to staging environment
2. Enable feature flag for 10% of users
3. Monitor error rates and performance
4. Collect user feedback
5. Fix critical bugs

**Phase 5: Migration (Week 7-8)**
1. Run migration script on production DB (dry-run first)
2. Migrate 10% of activities, verify integrity
3. Migrate remaining 90% in batches
4. Monitor S3 costs and storage usage
5. Verify all activities have polylines and metrics

**Phase 6: Full Rollout (Week 9)**
1. Enable feature flag for 100% of users
2. Deprecate `activity_streams` table (keep for 90 days)
3. Update documentation
4. Announce FIT export/import support

### Security & Access

**Object Store Security:**
- **Bucket policy:** Private by default (no public access)
- **IAM roles:** Separate roles for upload (mobile API) and read (worker)
- **Pre-signed URLs:** 15-minute expiry for PUTs, 1-hour expiry for GETs
- **Encryption:** AES-256 server-side encryption (SSE-S3)
- **CORS:** Restrict to app domains only

**File Validation:**
- **Size limit:** Max 100 MB per FIT file (reject larger uploads)
- **Content-Type validation:** Require `application/vnd.ant.fit` or `application/fit`
- **FIT structure validation:** Parser rejects malformed FIT files (corrupt header, invalid CRC)
- **User ownership:** Verify `userId` in object key matches authenticated user

**Example Pre-Signed URL Generation:**

```typescript
// packages/trpc/src/routers/activities.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

requestFitUploadUrl: protectedProcedure
  .input(z.object({ filename: z.string().max(255) }))
  .mutation(async ({ ctx, input }) => {
    const activityId = uuid();
    const userId = ctx.session.user.id;
    const objectKey = `activities/${userId}/${activityId}/${Date.now()}.fit`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: objectKey,
      ContentType: 'application/vnd.ant.fit',
      Metadata: {
        userId,
        activityId,
        uploadedAt: new Date().toISOString()
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900 // 15 minutes
    });

    return { uploadUrl, objectKey, activityId };
  });
```

### Cleanup

**Orphaned FIT Files:**
- **Scenario:** User uploads FIT but never calls `finalizeFitUpload` (app crash, network loss)
- **Detection:** S3 lifecycle rule tags files as orphaned if no DB record exists after 24 hours
- **Cleanup:** Delete orphaned files after 7 days (S3 lifecycle policy)

**Activity Deletion:**
- **Cascade delete:** When activity is deleted from DB, trigger S3 deletion via background job
- **Grace period:** Move to `deleted-activities/` prefix for 30 days before permanent deletion

```typescript
// packages/trpc/src/routers/activities.ts
deleteActivity: protectedProcedure
  .input(z.object({ activityId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const activity = await ctx.db.activities.findByPk(input.activityId);

    // Soft delete in DB
    await ctx.db.activities.update(input.activityId, { deleted_at: new Date() });

    // Move FIT file to deleted prefix (allows recovery)
    if (activity.fit_file_path) {
      const newKey = activity.fit_file_path.replace('activities/', 'deleted-activities/');
      await s3.copyObject({
        Bucket: process.env.S3_BUCKET,
        CopySource: `${process.env.S3_BUCKET}/${activity.fit_file_path}`,
        Key: newKey
      }).promise();
      await s3.deleteObject({
        Bucket: process.env.S3_BUCKET,
        Key: activity.fit_file_path
      }).promise();
    }

    return { success: true };
  });
```

### Communication

**Documentation Updates:**

1. **Developer Docs:**
   - `docs/fit-integration.md`: FIT format overview, field mappings, troubleshooting
   - `docs/migration-guide.md`: JSON-to-FIT migration instructions
   - Update `CLAUDE.md`: Add FIT architecture section

2. **User-Facing:**
   - Changelog: "FIT file support - export activities to Garmin, Strava, and more!"
   - Help center: "How to export activities as FIT files"
   - Blog post: "Why we switched to FIT files"

3. **API Documentation:**
   - Update tRPC API docs with new mutations (`requestFitUploadUrl`, `finalizeFitUpload`)
   - Add example code snippets for FIT upload flow

**Training Materials:**
- Internal wiki: Architecture diagrams, troubleshooting runbook
- On-call playbook: Alert response procedures, common issues

---

## 5. Acceptance Criteria

### Core Functionality

- [ ] **FIT Encoding:**
  - [ ] `FitEncoder.ts` creates valid FIT files parseable by Garmin Connect, Strava, and `@garmin/fitsdk`
  - [ ] FIT files contain file_id, session, record[], and lap messages
  - [ ] GPS coordinates correctly converted from degrees to semicircles
  - [ ] Timestamps correctly converted to FIT epoch (seconds since Dec 31, 1989)
  - [ ] All sensor fields (HR, power, cadence, altitude) encoded with correct data types

- [ ] **Upload Flow:**
  - [ ] Pre-signed URL generation completes in < 100ms
  - [ ] Mobile client successfully uploads FIT files to S3 via PUT request
  - [ ] `finalizeFitUpload` creates activity record with `fit_file_path` and `status='PROCESSING'`
  - [ ] Background job enqueued successfully
  - [ ] Failed uploads do not create orphaned DB records

- [ ] **FIT Parsing:**
  - [ ] `FitParser.ts` successfully parses FIT files from Garmin, Wahoo, and GradientPeak
  - [ ] Extracted session summary matches original recording (within 1% tolerance)
  - [ ] Per-record streams extracted with correct timestamps and values
  - [ ] Malformed FIT files rejected with clear error messages
  - [ ] Parsing completes in < 5 seconds for 1-hour activities

- [ ] **Metric Calculation:**
  - [ ] Normalized Power calculated correctly (30-sec rolling avg, 4th power mean)
  - [ ] Intensity Factor = NP / FTP (within 0.01 precision)
  - [ ] TSS = (duration × NP × IF) / (FTP × 3600) × 100 (within 1% tolerance)
  - [ ] Power zone distribution matches manual calculations
  - [ ] HR zone distribution matches manual calculations
  - [ ] Polyline encoded from GPS coordinates and stored in `metrics.polyline`

### Database & Schema

- [ ] **Schema Changes:**
  - [ ] `fit_file_path` column added to `activities` table
  - [ ] `processing_status` column added with CHECK constraint
  - [ ] Indexes created for `processing_status` and `fit_file_path`
  - [ ] `activity_migrations` table created (optional)
  - [ ] Repository owner has applied SQL changes to `init.sql`
  - [ ] TypeScript types updated via codegen (e.g., supazod)

- [ ] **Data Integrity:**
  - [ ] All new activities have `fit_file_path` populated
  - [ ] Activities with `fit_file_path` have valid S3 objects
  - [ ] Migrated activities retain original `started_at` and `finished_at` timestamps
  - [ ] Metrics JSONB contains TSS, IF, NP, polyline for all processed activities

### UI & UX

- [ ] **Activity List:**
  - [ ] Polyline preview displayed for activities with GPS data
  - [ ] List loads in < 500ms for 20 activities
  - [ ] TSS badge displayed (if calculated)
  - [ ] Placeholder shown for activities without GPS (indoor)

- [ ] **Activity Detail:**
  - [ ] Streams load asynchronously (loading spinner shown)
  - [ ] Power chart displays if power data available
  - [ ] Heart rate chart displays if HR data available
  - [ ] Altitude/elevation chart for outdoor activities
  - [ ] Summary metrics (TSS, IF, NP) displayed
  - [ ] Streams load in < 2 seconds for 1-hour activities

- [ ] **Error Handling:**
  - [ ] Upload failures show retry button
  - [ ] Parse failures show "Activity processing failed" message
  - [ ] Missing streams show "No data available" instead of crashing

### Migration & Compatibility

- [ ] **Migration Script:**
  - [ ] `migrate-json-to-fit.ts` successfully converts 100% of test activities
  - [ ] Migrated FIT files parseable by external tools (Strava, Garmin Connect)
  - [ ] Migration resumes from last checkpoint on failure
  - [ ] Dry-run mode available for testing
  - [ ] Migration progress tracked in `activity_migrations` table

- [ ] **Backward Compatibility:**
  - [ ] Legacy activities without `fit_file_path` still display in UI
  - [ ] `getStreams` query falls back to `activity_streams` table for legacy activities
  - [ ] No data loss during migration
  - [ ] Rollback plan tested and documented

### Performance & Scalability

- [ ] **Performance Benchmarks:**
  - [ ] FIT encoding: < 2 seconds for 1-hour activity (3600 records)
  - [ ] S3 upload: < 10 seconds on 3G connection (1 MB file)
  - [ ] FIT parsing: < 5 seconds for 1-hour activity
  - [ ] Metric calculation: < 2 seconds for 1-hour activity
  - [ ] Total end-to-end: < 20 seconds from "Finish" to metrics displayed

- [ ] **Scalability:**
  - [ ] Worker scales to 20 instances under load
  - [ ] Queue handles 100+ concurrent jobs
  - [ ] S3 throughput supports 100 uploads/minute
  - [ ] Database handles 1000+ activities/day

### Monitoring & Observability

- [ ] **Metrics:**
  - [ ] `fit_files_processed_total` counter tracking successful parses
  - [ ] `fit_parse_errors_total` counter tracking failures by error type
  - [ ] `fit_parse_duration_seconds` histogram with P50/P95/P99 percentiles
  - [ ] `fit_analysis_queue_size` gauge showing current job backlog
  - [ ] Grafana dashboard displaying all metrics

- [ ] **Alerts:**
  - [ ] Alert fires when parse error rate > 1% in 5 minutes
  - [ ] Alert fires when queue size > 100 for > 10 minutes
  - [ ] Alert fires when average parse time > 10 seconds
  - [ ] On-call team receives PagerDuty notifications

- [ ] **Logging:**
  - [ ] Structured JSON logs for all FIT operations
  - [ ] Error logs include stack traces and context
  - [ ] Logs shipped to centralized logging (e.g., CloudWatch, Datadog)

### Security

- [ ] **Access Control:**
  - [ ] S3 bucket is private (no public access)
  - [ ] Pre-signed URLs expire after 15 minutes
  - [ ] Users can only upload to their own `userId` prefix
  - [ ] Workers use separate IAM role (read-only S3 access)
  - [ ] FIT files encrypted at rest (SSE-S3)

- [ ] **Validation:**
  - [ ] FIT files > 100 MB rejected
  - [ ] Invalid Content-Type rejected
  - [ ] Malformed FIT files logged and rejected
  - [ ] Orphaned files deleted after 7 days

### Testing

- [ ] **Unit Tests:**
  - [ ] `FitEncoder` tested with sample recording data
  - [ ] `FitParser` tested with FIT files from Garmin, Wahoo, and GradientPeak
  - [ ] `MetricsCalculator` tested with known power data (NP, TSS, IF)
  - [ ] Test coverage > 80% for core FIT logic

- [ ] **Integration Tests:**
  - [ ] End-to-end test: Record activity → Encode → Upload → Parse → Display
  - [ ] Migration script tested on copy of production DB
  - [ ] tRPC endpoints tested with Postman/Insomnia

- [ ] **Device Testing:**
  - [ ] FIT encoding tested on iOS (physical device)
  - [ ] FIT encoding tested on Android (physical device)
  - [ ] Real Bluetooth sensors (HR monitor, power meter) tested
  - [ ] GPS outdoor recording tested

### Documentation

- [ ] **Code Documentation:**
  - [ ] `FitEncoder.ts` has JSDoc comments for all public methods
  - [ ] `FitParser.ts` has JSDoc comments
  - [ ] Field mapping table documented in code
  - [ ] Example usage snippets in README

- [ ] **Developer Docs:**
  - [ ] `docs/fit-integration.md` created with architecture diagrams
  - [ ] `docs/migration-guide.md` created with step-by-step instructions
  - [ ] `CLAUDE.md` updated with FIT architecture section

- [ ] **User Docs:**
  - [ ] Changelog entry for FIT file support
  - [ ] Help center article on exporting activities
  - [ ] Blog post announcement

---

## 6. Prototype: RecordingService with FIT Encoding

**File:** `apps/mobile/lib/services/fit/FitRecordingService.ts`

This prototype demonstrates a minimal working implementation of FIT file creation from in-memory sensor data. It is a standalone proof-of-concept that can be tested independently.

**Installation:**

```bash
cd apps/mobile
npm install @garmin/fitsdk
# or
pnpm add @garmin/fitsdk
```

**Prototype Code:**

```typescript
/**
 * FitRecordingService - Prototype
 *
 * Demonstrates FIT file creation from in-memory telemetry streams.
 * This is a simplified, MVP-level implementation without crash recovery.
 *
 * Usage:
 *   const service = new FitRecordingService(userProfile);
 *   service.start();
 *   service.addSample({ timestamp: new Date(), heart_rate: 150, power: 250, ... });
 *   // ... record for duration of activity
 *   service.finish();
 *   const fitBytes = service.export();
 *   // Upload fitBytes to S3 or save to file
 */

import { Encoder } from '@garmin/fitsdk';

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

export interface UserProfile {
  ftp?: number;
  weight_kg?: number;
  age?: number;
  max_heart_rate?: number;
}

export interface ActivityMetadata {
  name: string;
  sport: 'cycling' | 'running' | 'swimming' | 'other';
  indoor: boolean;
}

export class FitRecordingService {
  private samples: SensorSample[] = [];
  private startTime?: Date;
  private endTime?: Date;
  private profile: UserProfile;
  private metadata?: ActivityMetadata;
  private isRecording = false;

  constructor(profile: UserProfile) {
    this.profile = profile;
  }

  /**
   * Start recording. Captures start timestamp.
   */
  start(metadata: ActivityMetadata): void {
    this.startTime = new Date();
    this.metadata = metadata;
    this.isRecording = true;
    this.samples = [];
    console.log(`📹 Recording started at ${this.startTime.toISOString()}`);
  }

  /**
   * Add a sensor sample. Called at 1-4Hz during recording.
   */
  addSample(sample: SensorSample): void {
    if (!this.isRecording) {
      throw new Error('Recording not started. Call start() first.');
    }
    this.samples.push(sample);
  }

  /**
   * Finish recording. Captures end timestamp.
   */
  finish(): void {
    if (!this.isRecording) {
      throw new Error('Recording not started.');
    }
    this.endTime = new Date();
    this.isRecording = false;
    console.log(`⏹️  Recording finished at ${this.endTime.toISOString()}`);
    console.log(`📊 Total samples: ${this.samples.length}`);
  }

  /**
   * Export recording as FIT file (Uint8Array).
   * Returns binary FIT file ready for upload to S3 or local save.
   */
  export(): Uint8Array {
    if (!this.startTime || !this.endTime || !this.metadata) {
      throw new Error('Cannot export: recording not completed.');
    }

    const encoder = new Encoder();

    // 1. File ID message (required)
    encoder.writeMessage('fileId', {
      type: 'activity',
      manufacturer: 'development',  // Use 'development' for testing
      product: 0,
      timeCreated: this.dateToFitTimestamp(this.startTime),
      serialNumber: Math.floor(Math.random() * 1000000)
    });

    // 2. User profile (optional but recommended)
    if (this.profile.weight_kg || this.profile.age || this.profile.ftp) {
      encoder.writeMessage('userProfile', {
        weight: this.profile.weight_kg,
        age: this.profile.age,
        functionalThresholdPower: this.profile.ftp,
        maxHeartRate: this.profile.max_heart_rate
      });
    }

    // 3. Event: Timer start
    encoder.writeMessage('event', {
      event: 'timer',
      eventType: 'start',
      timestamp: this.dateToFitTimestamp(this.startTime)
    });

    // 4. Record messages (per-second telemetry)
    this.samples.forEach((sample) => {
      const fitRecord: any = {
        timestamp: this.dateToFitTimestamp(sample.timestamp)
      };

      // GPS coordinates (convert degrees to semicircles)
      if (sample.position_lat !== undefined && sample.position_long !== undefined) {
        fitRecord.positionLat = this.degreesToSemicircles(sample.position_lat);
        fitRecord.positionLong = this.degreesToSemicircles(sample.position_long);
      }

      // Other fields (direct mapping)
      if (sample.distance !== undefined) fitRecord.distance = sample.distance;
      if (sample.altitude !== undefined) fitRecord.altitude = sample.altitude;
      if (sample.speed !== undefined) fitRecord.speed = sample.speed * 1000; // m/s to mm/s
      if (sample.heart_rate !== undefined) fitRecord.heartRate = sample.heart_rate;
      if (sample.cadence !== undefined) fitRecord.cadence = sample.cadence;
      if (sample.power !== undefined) fitRecord.power = sample.power;
      if (sample.temperature !== undefined) fitRecord.temperature = sample.temperature;

      encoder.writeMessage('record', fitRecord);
    });

    // 5. Session message (activity summary)
    const totalElapsedTime = (this.endTime.getTime() - this.startTime.getTime()) / 1000;
    const sessionMessage = {
      sport: this.mapSportType(this.metadata.sport),
      subSport: this.metadata.indoor ? 'indoor_cycling' : undefined,
      startTime: this.dateToFitTimestamp(this.startTime),
      timestamp: this.dateToFitTimestamp(this.endTime),
      totalElapsedTime,
      totalTimerTime: totalElapsedTime, // Assume no pauses for MVP
      totalDistance: this.getTotalDistance(),
      avgHeartRate: this.calculateAvg('heart_rate'),
      maxHeartRate: this.calculateMax('heart_rate'),
      avgPower: this.calculateAvg('power'),
      maxPower: this.calculateMax('power'),
      avgCadence: this.calculateAvg('cadence')
    };

    encoder.writeMessage('session', sessionMessage);

    // 6. Event: Timer stop
    encoder.writeMessage('event', {
      event: 'timer',
      eventType: 'stopAll',
      timestamp: this.dateToFitTimestamp(this.endTime)
    });

    // Return FIT file as Uint8Array
    const fitBytes = encoder.finish();
    console.log(`✅ FIT file created: ${fitBytes.length} bytes`);
    return fitBytes;
  }

  /**
   * Get recording statistics (for UI display before export).
   */
  getStats() {
    return {
      sampleCount: this.samples.length,
      duration: this.startTime && this.endTime
        ? (this.endTime.getTime() - this.startTime.getTime()) / 1000
        : 0,
      totalDistance: this.getTotalDistance(),
      avgHeartRate: this.calculateAvg('heart_rate'),
      avgPower: this.calculateAvg('power'),
      avgCadence: this.calculateAvg('cadence')
    };
  }

  // =================================================================
  // HELPER METHODS
  // =================================================================

  /**
   * Convert JavaScript Date to FIT timestamp.
   * FIT epoch: December 31, 1989 00:00:00 UTC (timestamp 0)
   * Unix epoch: January 1, 1970 00:00:00 UTC
   * Offset: 631065600 seconds
   */
  private dateToFitTimestamp(date: Date): number {
    const FIT_EPOCH_OFFSET = 631065600;
    return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
  }

  /**
   * Convert GPS degrees to FIT semicircles.
   * Formula: semicircles = degrees × (2^31 / 180)
   */
  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (Math.pow(2, 31) / 180));
  }

  /**
   * Map sport type to FIT sport enum.
   */
  private mapSportType(sport: string): string {
    const sportMap: Record<string, string> = {
      cycling: 'cycling',
      running: 'running',
      swimming: 'swimming',
      other: 'generic'
    };
    return sportMap[sport] || 'generic';
  }

  /**
   * Get total distance from last sample (assumes cumulative distance).
   */
  private getTotalDistance(): number {
    const distanceSamples = this.samples
      .map(s => s.distance)
      .filter(d => d !== undefined) as number[];
    return distanceSamples.length > 0
      ? distanceSamples[distanceSamples.length - 1]
      : 0;
  }

  /**
   * Calculate average of a numeric field.
   */
  private calculateAvg(field: keyof SensorSample): number | undefined {
    const values = this.samples
      .map(s => s[field])
      .filter(v => typeof v === 'number') as number[];
    if (values.length === 0) return undefined;
    return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  }

  /**
   * Calculate max of a numeric field.
   */
  private calculateMax(field: keyof SensorSample): number | undefined {
    const values = this.samples
      .map(s => s[field])
      .filter(v => typeof v === 'number') as number[];
    if (values.length === 0) return undefined;
    return Math.max(...values);
  }
}
```

**Test Script:**

```typescript
/**
 * Test script for FitRecordingService prototype.
 * Run with: ts-node apps/mobile/lib/services/fit/__tests__/FitRecordingService.test.ts
 */

import { FitRecordingService } from '../FitRecordingService';
import * as fs from 'fs';

async function testFitRecording() {
  // 1. Create service with user profile
  const profile = {
    ftp: 250,
    weight_kg: 75,
    age: 32,
    max_heart_rate: 190
  };

  const service = new FitRecordingService(profile);

  // 2. Start recording
  service.start({
    name: 'Test Indoor Ride',
    sport: 'cycling',
    indoor: true
  });

  // 3. Simulate 5 minutes of recording (300 samples at 1Hz)
  const startTime = new Date();
  for (let i = 0; i < 300; i++) {
    const timestamp = new Date(startTime.getTime() + i * 1000);

    service.addSample({
      timestamp,
      heart_rate: 140 + Math.floor(Math.random() * 20), // 140-160 BPM
      power: 200 + Math.floor(Math.random() * 100),     // 200-300 watts
      cadence: 85 + Math.floor(Math.random() * 10),     // 85-95 RPM
      distance: i * 10,                                  // 10m per second
      speed: 10                                          // 10 m/s constant
    });
  }

  // 4. Finish recording
  service.finish();

  // 5. Export to FIT
  const fitBytes = service.export();

  // 6. Save to file
  const outputPath = '/tmp/test-activity.fit';
  fs.writeFileSync(outputPath, fitBytes);
  console.log(`\n✅ FIT file saved to: ${outputPath}`);

  // 7. Display stats
  const stats = service.getStats();
  console.log('\n📊 Recording Stats:');
  console.log(`   Samples: ${stats.sampleCount}`);
  console.log(`   Duration: ${stats.duration}s`);
  console.log(`   Distance: ${stats.totalDistance}m`);
  console.log(`   Avg HR: ${stats.avgHeartRate} BPM`);
  console.log(`   Avg Power: ${stats.avgPower}W`);
  console.log(`   Avg Cadence: ${stats.avgCadence} RPM`);

  console.log('\n✅ Test complete! Upload test-activity.fit to Garmin Connect or Strava to verify.');
}

testFitRecording().catch(console.error);
```

**Running the Test:**

```bash
cd apps/mobile
npx ts-node lib/services/fit/__tests__/FitRecordingService.test.ts

# Expected output:
# 📹 Recording started at 2026-01-20T12:00:00.000Z
# ⏹️  Recording finished at 2026-01-20T12:05:00.000Z
# 📊 Total samples: 300
# ✅ FIT file created: 8432 bytes
# ✅ FIT file saved to: /tmp/test-activity.fit
#
# 📊 Recording Stats:
#    Samples: 300
#    Duration: 300s
#    Distance: 2990m
#    Avg HR: 150 BPM
#    Avg Power: 250W
#    Avg Cadence: 90 RPM
#
# ✅ Test complete! Upload test-activity.fit to Garmin Connect or Strava to verify.
```

**Verification:**

Upload the generated `/tmp/test-activity.fit` to:
- **Garmin Connect:** https://connect.garmin.com/modern/import-data
- **Strava:** https://www.strava.com/upload/select
- **FIT File Viewer:** Use online tool at https://www.fitfileviewer.com/

Verify that:
1. File is recognized as valid FIT activity
2. Duration shows 5 minutes (300 seconds)
3. Average power shows ~250W
4. Average heart rate shows ~150 BPM
5. Total distance shows ~3 km

---

## 7. Next Steps for Implementation

1. **Repository Owner Actions:**
   - Apply SQL changes to `packages/supabase/schemas/init.sql`
   - Run Supabase migration: `supabase db reset --local`
   - Update TypeScript types: `pnpm run generate:types`
   - Commit schema changes

2. **Backend Implementation:**
   - Install dependencies: `pnpm add @garmin/fitsdk @aws-sdk/client-s3 @aws-sdk/s3-request-presigner bullmq`
   - Implement `requestFitUploadUrl` and `finalizeFitUpload` mutations in `packages/trpc/src/routers/activities.ts`
   - Implement `FitParser.ts` in `packages/workers/src/services/fit/`
   - Implement `MetricsCalculator.ts` in `packages/workers/src/services/metrics/`
   - Implement `analyzeFit.ts` background job in `packages/workers/src/jobs/`
   - Write unit tests for metric calculations
   - Set up BullMQ worker service

3. **Mobile Implementation:**
   - Install dependencies: `pnpm add @garmin/fitsdk` (in apps/mobile)
   - Copy prototype `FitRecordingService.ts` to `apps/mobile/lib/services/fit/`
   - Implement `FitUploader.ts` for pre-signed URL upload flow
   - Update `useActivityRecorder.ts` to call FitEncoder on finish
   - Update `ActivityCard.tsx` to display polyline preview
   - Update `ActivityDetail.tsx` to async-load streams
   - Test on iOS and Android physical devices

4. **Testing & Validation:**
   - Run prototype test script to validate FIT encoding
   - Upload test FIT files to Garmin Connect and Strava to verify compatibility
   - Run migration script on test database
   - Load test worker with 100 concurrent jobs
   - Verify metrics match manual calculations

5. **Deployment:**
   - Create S3 bucket with lifecycle policies
   - Deploy worker service with monitoring
   - Enable feature flag for beta users (10%)
   - Monitor error rates and performance
   - Roll out to 100% after validation

---

## Appendix: Third-Party Library Evaluation

**@garmin/fitsdk (Official Garmin SDK)**
- **Pros:** Official SDK, well-maintained, TypeScript support, works in Node.js and browser
- **Cons:** Larger bundle size (~100 KB), learning curve for API
- **Recommendation:** Use for production (best compatibility)

**fit-file-encoder (npm)**
- **Pros:** Lightweight, simple API
- **Cons:** Less actively maintained, limited documentation
- **Recommendation:** Alternative if bundle size critical

**fitdecode (Python)**
- **Pros:** Fast parsing, good for server-side
- **Cons:** Python only (not suitable for mobile)
- **Recommendation:** Use for migration script if needed

**Selected Library:** `@garmin/fitsdk` for both mobile encoding and server-side parsing.

---

**End of Plan**

This plan provides a complete, developer-ready roadmap for migrating GradientPeak to FIT file-based activity storage. All database changes, code snippets, and acceptance criteria are explicitly defined. The repository owner should begin by applying the SQL changes to `init.sql`, then proceed with backend and mobile implementation in parallel.
