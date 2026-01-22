# FIT File Integration - Comprehensive Research Findings

**Generated:** 2026-01-21
**Project:** FIT_FILE_PROJECT.md Implementation Research
**Status:** Complete - Ready for Implementation

---

## Executive Summary

This document consolidates research from 6 parallel investigations covering all aspects of the FIT file integration project. The current architecture is well-suited for this migration with minimal refactoring required.

**Key Findings:**

- Mobile app uses StreamBuffer for JSON-based recording (easily adaptable to FIT)
- Database schema supports JSONB metrics (complements FIT approach)
- tRPC already has FIT file upload patterns in `fit-files.ts` router
- Edge Function exists (`analyze-fit-file`) with proven patterns
- Storage buckets and RLS policies already configured for FIT files

---

## 1. Mobile Recording Infrastructure

### Current Implementation

**Primary File:** `apps/mobile/lib/services/ActivityRecorder/index.ts`

The `ActivityRecorderService` coordinates:

- Lifecycle: `startRecording()`, `pauseRecording()`, `resumeRecording()`, `finishRecording()`
- EventEmitter for 4 core events: `stateChanged`, `recordingComplete`, `sensorsChanged`, `timeUpdated`
- Direct manager access: `liveMetricsManager`, `locationManager`, `sensorsManager`

### Data Flow: StreamBuffer System

**File:** `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts`

Two-tier architecture:

1. **Memory buffer** (`readings` Map, `locations` array) - accumulates between flushes
2. **File storage** (`storageDir`) - persists JSON chunks every 60 seconds

**Key Methods:**

- `add(reading)` - Add sensor reading
- `addLocation(location)` - Add GPS location
- `flushToFiles()` - Writes JSON chunks every 60 seconds
- `aggregateAllChunks()` - Merges all chunks at finish
- `cleanup()` - Deletes temp files after upload

**Current Data Format:**

```typescript
interface StreamChunk {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[] | number[][];
  timestamps: number[];
  sampleCount: number;
  startTime: Date;
  endTime: Date;
}
```

### Sensor Data Collection

| Sensor | File                | Key Features                                                          |
| ------ | ------------------- | --------------------------------------------------------------------- |
| GPS    | `location.ts`       | watchPositionAsync (1s/1m), background TaskManager, offline buffering |
| BLE    | `sensors.ts`        | HR, Power, Cadence, Speed; FTMS support; exponential backoff          |
| FTMS   | `FTMSController.ts` | ERG, SIM, Resistance modes; feature detection                         |

### Current Upload Flow

**File:** `apps/mobile/lib/hooks/useActivitySubmission.ts`

1. Recording finishes → `recordingComplete` event fires
2. `processRecording()`:
   - `streamBuffer.aggregateAllChunks()` merges JSON chunks
   - Compresses with `pako.gzip()`
   - Stores as base64 strings
3. Calls tRPC `activities.createWithStreams` mutation
4. `streamBuffer.cleanup()` deletes local files

### Sensor-to-FIT Message Mapping

| Current StreamBuffer | FIT Message         | Notes            |
| -------------------- | ------------------- | ---------------- |
| `heartrate`          | `record_heart_rate` | Direct mapping   |
| `power`              | `record_power`      | Direct mapping   |
| `cadence`            | `record_cadence`    | Direct mapping   |
| `speed`              | `record_speed`      | Direct mapping   |
| `latlng`             | `record_location`   | Include altitude |
| `altitude`           | `record_location`   | With lat/lng     |

### Files Affected (Mobile)

| File                        | Change Type | Description                                  |
| --------------------------- | ----------- | -------------------------------------------- |
| `StreamBuffer.ts`           | Modify      | Add parallel FIT encoding alongside JSON     |
| `ActivityRecorder/index.ts` | Modify      | Integrate FIT encoder lifecycle              |
| `useActivitySubmission.ts`  | Modify      | Upload .fit file instead/in addition to JSON |
| `types.ts`                  | Modify      | Add FIT-related types                        |

**New Files Required:**

- `lib/services/fit/StreamingFitEncoder.ts` - Real-time FIT encoder
- `lib/services/fit/FitUploader.ts` - Upload service

---

## 2. Database Schema

### Current Activities Table

**Location:** `packages/supabase/schemas/init.sql` (lines 353-496)

```sql
-- Core identity
id uuid primary key default uuid_generate_v4()
idx serial unique not null
profile_id uuid not null references public.profiles(id) on delete cascade

-- Core metadata
name text not null
notes text
type text not null              -- 'bike', 'run', 'swim', 'strength', 'other'
location text                   -- 'indoor', 'outdoor'
is_private boolean not null default true

-- Timing (indexed)
started_at timestamptz not null
finished_at timestamptz not null
duration_seconds integer not null default 0
moving_seconds integer not null default 0

-- Distance
distance_meters integer not null default 0

-- Metrics (JSONB - flexible schema)
metrics jsonb not null default '{}'::jsonb

-- Zone times (arrays)
hr_zone_seconds integer[5]
power_zone_seconds integer[7]

-- Profile snapshot (JSONB)
profile_snapshot jsonb

-- External integration
provider integration_provider   -- 'strava', 'wahoo', 'trainingpeaks', 'garmin', 'zwift'
external_id text

-- Audit
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### Migration Required

**New Columns:**

```sql
ALTER TABLE activities
ADD COLUMN fit_file_path TEXT,
ADD COLUMN processing_status TEXT DEFAULT 'PENDING',
ADD COLUMN processing_error TEXT,
ADD COLUMN ftp_at_time_of_activity INTEGER,
ADD COLUMN weight_at_time_of_activity NUMERIC(5,2);
```

**Indexes Required:**

- `idx_activities_fit_status` - btree on processing_status
- `idx_activities_fit_path` - btree on fit_file_path

### Migration Pattern

**Location:** `packages/supabase/migrations/`

Naming: `YYYYMMDDHHMMSS_description.sql`

Pattern from existing migrations:

```sql
-- Add column
alter table "public"."activities" add column "new_column" text;

-- Add index
CREATE INDEX idx_activities_new_column ON public.activities USING btree (new_column);

-- Add constraint (optional)
alter table "public"."activities" add constraint "activities_new_column_check" CHECK (...) not valid;
```

### Related Tables Affected

| Table              | Impact | Change                                       |
| ------------------ | ------ | -------------------------------------------- |
| `activity_streams` | Low    | May become optional if FIT contains all data |
| `activity_plans`   | None   | No changes needed                            |
| `activity_routes`  | None   | No changes needed                            |

### Zod Schemas to Update

**Files:**

- `packages/supabase/supazod/schemas.ts` - Add new columns
- `packages/supabase/database.types.ts` - Add TypeScript types

---

## 3. tRPC Router Structure

### Current Router Organization

**Main Router:** `packages/trpc/src/routers/index.ts`

All routers composed into single `appRouter`:

- `auth`, `profiles`, `profilePerformanceMetrics`, `profileMetrics`
- `activities`, `activityPlans`, `plannedActivities`
- `fitFiles`, `integrations`, `trainingPlans`
- `routes`, `trends`, `storage`, `home`

### Activities Router

**File:** `packages/trpc/src/routers/activities.ts` (823 lines)

**Existing Procedures:**

- `list` - Legacy date-range filtered listing
- `listPaginated` - Paginated with filters
- `getActivityWithStreams` - Get activity with streams
- `create` - Create activity
- `createStreams` - Create streams
- `createWithStreams` - Combined atomic creation
- `update` - Update activity
- `delete` - Hard delete
- `calculateMetrics` - TSS/IF calculation

### Existing FIT Files Router

**File:** `packages/trpc/src/routers/fit-files.ts`

Already has upload pattern:

```typescript
uploadFitFile: protectedProcedure.input(
  z.object({ fileName, fileSize, fileType, fileData }),
);
// Uploads base64 encoded file to fit-files bucket

getFitFileUrl: protectedProcedure.input(z.object({ filePath, expiresIn }));
// Returns signed download URL

analyzeFitFile: protectedProcedure;
// Triggers edge function processing
```

### Storage Router Patterns

**File:** `packages/trpc/src/routers/storage.ts`

Two methods used:

1. `createSignedUploadUrl(path)` - Returns `{ signedUrl, path }`
2. `createSignedUrl(path, expiresIn)` - Returns `{ signedUrl }`

### Required tRPC Changes

| Router          | Change | Description                          |
| --------------- | ------ | ------------------------------------ |
| `activities.ts` | Modify | Add `createWithFitFile` mutation     |
| `activities.ts` | Modify | Add status query procedures          |
| `fit-files.ts`  | Modify | May need updates for new upload flow |

### Auth & Context

**File:** `packages/trpc/src/context.ts`

- Supports header-based and cookie-based auth
- `protectedProcedure` requires auth (throws `UNAUTHORIZED` if no session)
- `x-client-type` header for client identification

---

## 4. Edge Functions

### Existing Function: analyze-fit-file

**Location:** `packages/supabase/functions/analyze-fit-file/`

**Structure:**

```
supabase/functions/analyze-fit-file/
├── index.ts          # Main Edge Function (604 lines)
└── deno.json         # Deno import map
```

**Runtime:** Deno (not Node.js)

### Current Implementation Pattern

```typescript
Deno.serve(async (req: Request) => {
  // CORS handling
  if (req.method === "OPTIONS") { ... }

  // Method validation
  if (req.method !== "POST") { ... }

  // Process request
  const requestBody = await req.json();
  const result = await analyzeFitFile(requestBody);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### Processing Flow (Existing)

1. Download FIT file from Storage bucket
2. Parse FIT file using SDK/library
3. Query profile for FTP/HR thresholds
4. Calculate metrics (TSS, Normalized Power, zones)
5. Update activity record with all data
6. Return structured result

### New Edge Function Required

**Proposed:** `packages/supabase/functions/process-activity-fit/index.ts`

**Responsibilities:**

1. Accept `activityId` from database trigger
2. Download FIT file from `activity-files` bucket
3. Parse and extract all metrics
4. Query historical FTP/weight values
5. Calculate all performance metrics
6. Update activity with results
7. Update `processing_status` to COMPLETED/FAILED

### Database Trigger Pattern

```sql
CREATE OR REPLACE FUNCTION trigger_fit_processing()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fit_file_path IS NOT NULL AND NEW.processing_status = 'pending' THEN
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

CREATE TRIGGER on_activity_fit_uploaded
AFTER INSERT ON activities
FOR EACH ROW
EXECUTE FUNCTION trigger_fit_processing();
```

### Edge Function Configuration

**File:** `packages/supabase/config.toml`

```toml
[functions.process-activity-fit]
enabled = true
verify_jwt = true
import_map = "./functions/process-activity-fit/deno.json"
entrypoint = "./functions/process-activity-fit/index.ts"
```

---

## 5. Storage Patterns

### Existing Buckets

| Bucket            | Public | Max Size | Purpose      |
| ----------------- | ------ | -------- | ------------ |
| `profile-avatars` | Yes    | 5MB      | User avatars |
| `fit-files`       | No     | 50MB     | FIT files    |
| `profile-routes`  | No     | 10MB     | GPX routes   |

### New Bucket Required

**Name:** `activity-files`
**Public:** No
**Max Size:** 50MB
**Path Structure:** `{userId}/{activityId}.fit`

### Storage RLS Policies

**File:** `packages/supabase/policies/fit_files_storage_policies.sql`

Existing pattern to follow:

```sql
-- Users can upload their own FIT files
CREATE POLICY "Users can upload their own activity FIT files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'activity-files' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = auth.uid()
);

-- Users can read their own FIT files
CREATE POLICY "Users can read their own activity FIT files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'activity-files' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = auth.uid()
);

-- Service role full access
CREATE POLICY "Service role can manage all activity FIT files" ON storage.objects
FOR ALL USING (
  bucket_id = 'activity-files' AND
  auth.role() = 'service_role'
);
```

### Upload Patterns

**Pattern 1: Signed Upload URL (Recommended for large files)**

```typescript
// Request signed URL
const { signedUrl, path } = await trpc.storage.createSignedUploadUrl.mutate({
  fileName: `${activityId}.fit`,
  fileType: "application/octet-stream",
});

// Direct upload to Supabase Storage
await fetch(signedUrl, {
  method: "PUT",
  body: fitFileBuffer,
  headers: { "Content-Type": "application/octet-stream" },
});
```

**Pattern 2: Base64 Upload (Existing in fit-files.ts)**

```typescript
// Convert to base64
const base64 = Buffer.from(fitFileBuffer).toString("base64");

// Upload via tRPC
await trpc.fitFiles.uploadFitFile.mutate({
  fileName: `${activityId}.fit`,
  fileSize: fitFileBuffer.length,
  fileType: "application/octet-stream",
  fileData: base64,
});
```

### Related Files

| File                                                        | Purpose               |
| ----------------------------------------------------------- | --------------------- |
| `packages/trpc/src/routers/storage.ts`                      | Signed URL generation |
| `packages/trpc/src/routers/fit-files.ts`                    | FIT file operations   |
| `packages/supabase/seed.sql`                                | Bucket creation       |
| `packages/supabase/policies/fit_files_storage_policies.sql` | RLS policies          |

---

## 6. UI Components

### Activity Display Components

| Component            | Path                                                        | Purpose                       |
| -------------------- | ----------------------------------------------------------- | ----------------------------- |
| PastActivityCard     | `apps/mobile/components/PastActivityCard.tsx`               | Displays completed activities |
| ActivityPlanCard     | `apps/mobile/components/shared/ActivityPlanCard.tsx`        | Displays planned activities   |
| ActivityDetailScreen | `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` | Full activity detail view     |
| ActivityHeader       | `apps/mobile/components/activity/shared/ActivityHeader.tsx` | Activity title, date, notes   |
| MetricCard           | `apps/mobile/components/activity/shared/MetricCard.tsx`     | Display individual metrics    |

### Processing Status Components

| Component             | Path                                                          | Purpose                      |
| --------------------- | ------------------------------------------------------------- | ---------------------------- |
| useActivitySubmission | `apps/mobile/lib/hooks/useActivitySubmission.ts`              | Manages submission lifecycle |
| SubmitScreen          | `apps/mobile/app/(internal)/record/submit.tsx`                | Activity save form           |
| GPSStatusOverlay      | `apps/mobile/components/recording/GPSStatusOverlay.tsx`       | GPS signal status            |
| RecordingFooter       | `apps/mobile/components/recording/footer/RecordingFooter.tsx` | Recording controls           |

### Status Display Patterns

**Current Phase States (useActivitySubmission):**

```typescript
type Phase = "loading" | "ready" | "uploading" | "success" | "error";
```

**Status Badge Pattern (WeeklyPlanPreview):**

- `completed`: green-500/20 bg, green-400 text
- `current`: blue-500/20 bg, blue-400 text
- `upcoming`: muted/50 bg, muted-foreground text

**Metric Variants (MetricCard):**

- `default`: text-foreground
- `success`: text-green-600
- `warning`: text-yellow-600
- `danger`: text-red-600

### New UI Elements Required

1. **Processing Status Badge**
   - Add to PastActivityCard and ActivityDetailScreen
   - States: PENDING, PROCESSING, COMPLETED, FAILED

2. **Retry Button**
   - Show when `processing_status = 'FAILED'`
   - Triggers re-upload of FIT file

3. **Analyzing Overlay**
   - Show "Analyzing..." during processing
   - Progress indicator (optional)

4. **Status Display in SubmitScreen**
   - Update during upload and processing
   - Show error details if failed

### Related Files

| File                       | Change                       |
| -------------------------- | ---------------------------- |
| `PastActivityCard.tsx`     | Add processing status badge  |
| `ActivityDetailScreen.tsx` | Add status display           |
| `SubmitScreen.tsx`         | Update for FIT upload status |
| `useActivitySubmission.ts` | Add processing phase         |
| `WeeklyPlanPreview.tsx`    | May need status updates      |

---

## 7. Implementation File Map

### New Files to Create

| File                     | Location                                            | Purpose                  |
| ------------------------ | --------------------------------------------------- | ------------------------ |
| `StreamingFitEncoder.ts` | `apps/mobile/lib/services/fit/`                     | Real-time FIT encoder    |
| `FitUploader.ts`         | `apps/mobile/lib/services/fit/`                     | Upload service           |
| `index.ts`               | `packages/supabase/functions/process-activity-fit/` | Processing Edge Function |
| `deno.json`              | `packages/supabase/functions/process-activity-fit/` | Deno import map          |
| `migration.sql`          | `packages/supabase/migrations/`                     | Database schema update   |

### Files to Modify

| File                                                        | Change                       |
| ----------------------------------------------------------- | ---------------------------- |
| `apps/mobile/lib/services/ActivityRecorder/index.ts`        | Integrate FIT encoder        |
| `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts` | Add parallel FIT encoding    |
| `apps/mobile/lib/hooks/useActivitySubmission.ts`            | Upload .fit file             |
| `apps/mobile/components/PastActivityCard.tsx`               | Add status badge             |
| `packages/trpc/src/routers/activities.ts`                   | Add FIT procedures           |
| `packages/supabase/schemas/init.sql`                        | Add columns                  |
| `packages/supabase/supazod/schemas.ts`                      | Update Zod schemas           |
| `packages/supabase/database.types.ts`                       | Update TypeScript types      |
| `packages/supabase/seed.sql`                                | Create activity-files bucket |
| `packages/supabase/policies/fit_files_storage_policies.sql` | Add RLS policies             |
| `packages/supabase/config.toml`                             | Add Edge Function config     |

### Database Changes

```sql
-- Migration: 20260121_add_fit_file_support.sql
ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN processing_status TEXT DEFAULT 'PENDING';
ALTER TABLE activities ADD COLUMN processing_error TEXT;
ALTER TABLE activities ADD COLUMN ftp_at_time_of_activity INTEGER;
ALTER TABLE activities ADD COLUMN weight_at_time_of_activity NUMERIC(5,2);

CREATE INDEX idx_activities_fit_status ON public.activities USING btree (processing_status);
CREATE INDEX idx_activities_fit_path ON public.activities USING btree (fit_file_path);
```

---

## 8. Dependencies

### Mobile (React Native)

**Required:**

- `fit-file-parser` or similar FIT SDK compatible with React Native
- Check Expo compatibility before selecting library

**Existing (to leverage):**

- `expo-file-system` - Already used for file operations
- `pako` - Already used for compression
- `zustand` - State management

### Edge Function (Deno)

**Standard Deno imports:**

- `supabase-js` npm package
- FIT SDK/library for Deno

---

## 9. Key Integration Points

### 1. Recording Flow

```
startRecording()
    ↓
[StreamBuffer] accumulates JSON chunks (existing)
[StreamingFitEncoder] writes .fit file (new)
    ↓
finishRecording()
    ↓
[FitUploader] upload to Supabase Storage
    ↓
tRPC createWithFitFile mutation
    ↓
Database trigger → Edge Function
    ↓
process-activity-fit Edge Function
    ↓
Update activity with metrics
```

### 2. Data Consistency

- FIT file stored in Storage bucket
- Activity record created with `processing_status = 'PENDING'`
- Edge Function processes and updates record
- Mobile polls for status change

### 3. Error Handling

**Processing Status States:**

- `PENDING` - FIT file uploaded, awaiting processing
- `PROCESSING` - Edge Function actively processing
- `COMPLETED` - All metrics calculated
- `FAILED` - Error occurred (details in `processing_error`)

**Retry Flow:**

1. User taps retry button
2. Re-upload FIT file
3. Reset status to `PENDING`
4. Trigger re-processing

---

## 10. Research Gaps & Risks

### Gaps to Address

1. **FIT SDK Compatibility**
   - Need to verify React Native compatibility
   - May need to use native module or web view

2. **Performance Impact**
   - Real-time FIT encoding during recording
   - Test on lower-end devices

3. **Partial Recording Recovery**
   - Checkpoint approach needs verification
   - What data is lost if app crashes mid-recording

### Risks

| Risk                        | Impact | Mitigation                      |
| --------------------------- | ------ | ------------------------------- |
| FIT SDK not RN compatible   | High   | Research alternatives early     |
| Real-time encoding too slow | High   | Benchmark before implementation |
| Edge Function timeout       | Medium | Split processing if needed      |
| Large FIT files             | Low    | Size limits in bucket config    |
| Database trigger issues     | Medium | Test trigger separately         |

---

## 11. Next Steps

### Immediate (Week 1)

1. ✅ Research complete (this document)
2. Select FIT SDK/library for React Native
3. Create database migration file
4. Set up storage bucket and RLS policies

### Short-term (Week 2-3)

5. Implement `StreamingFitEncoder.ts`
6. Implement `FitUploader.ts`
7. Create `process-activity-fit` Edge Function
8. Update tRPC routers

### Medium-term (Week 4-5)

9. Update mobile upload flow
10. Add UI status indicators
11. Create data migration script
12. Testing and QA

---

## Appendices

### A. File Paths Reference

| Component        | Path                                         |
| ---------------- | -------------------------------------------- |
| Mobile Recording | `apps/mobile/lib/services/ActivityRecorder/` |
| tRPC             | `packages/trpc/src/routers/`                 |
| Database         | `packages/supabase/schemas/`                 |
| Migrations       | `packages/supabase/migrations/`              |
| Edge Functions   | `packages/supabase/functions/`               |
| Storage Policies | `packages/supabase/policies/`                |
| Mobile UI        | `apps/mobile/components/`                    |

### B. Related Documentation

- `FIT_FILE_PROJECT.md` - Original project plan
- `packages/supabase/schemas/init.sql` - Current schema
- `packages/trpc/src/routers/fit-files.ts` - Existing FIT patterns
- `packages/supabase/functions/analyze-fit-file/index.ts` - Existing Edge Function

### C. Key Contacts/Resources

- Garmin FIT SDK: https://developer.garmin.com/fit/
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- FIT Protocol: https://developer.garmin.com/fit/overview/
