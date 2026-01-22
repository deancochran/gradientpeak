# FIT File Integration - Comprehensive Implementation Plan

**Status:** Ready for Implementation  
**Version:** 3.0 - Fact-Checked Edition  
**Created:** 2026-01-21  
**Last Updated:** 2026-01-21  
**Location:** `tasks/FIT_FILE_INTEGRATION_PLAN.md`

---

## Research Summary from Codebase Analysis

| Area                 | Current State                                           | Required Changes                             |
| -------------------- | ------------------------------------------------------- | -------------------------------------------- |
| **Database**         | Schema exists, FIT columns in migration NOT in init.sql | Add fit_file_path, processing_status columns |
| **Edge Functions**   | `analyze-fit-file` exists but is MOCK implementation    | Implement real FIT parsing, fix metrics      |
| **Mobile Recording** | StreamBuffer + pako gzip compression                    | Add parallel FIT encoding                    |
| **tRPC**             | `fit-files.ts` router exists with upload patterns       | Add createWithFitFile, enhance existing      |
| **UI**               | No processing status display                            | Add status badges and retry buttons          |
| **Core Package**     | Has `fit-parser.ts` and `fit-sdk-parser.ts`             | Can be leveraged for parsing                 |
| **Schemas**          | Activities schema uses metrics JSONB                    | Add FIT columns to schema                    |

---

## Critical Findings

### 1. Database Schema Status

**The migration `20240120_add_fit_file_support.sql` exists but columns are NOT in init.sql**

This means:

- Either apply the existing migration, OR
- Add columns to init.sql and regenerate types

**Columns already defined in migration:**

```sql
fit_file_path TEXT
processing_status TEXT DEFAULT 'pending' CHECK (...)
fit_file_size INTEGER
fit_file_version INTEGER
```

### 2. Edge Function is MOCK Implementation

**Critical:** The `analyze-fit-file` edge function (604 lines) does NOT actually parse FIT files. It generates synthetic data based on file size.

**What it does:**

- Validates file header (0x0E 0x10 0x09 0x0D)
- Generates sinusoidal mock data
- Calculates fake TSS, IF, NP

**What it doesn't do:**

- Real FIT binary parsing
- Extract actual GPS coordinates
- Parse real heart rate/power data

### 3. Core Package Has FIT Parsers

The core package already has:

- `packages/core/lib/fit-parser.ts` - Basic FIT parser
- `packages/core/lib/fit-sdk-parser.ts` - Garmin FIT SDK integration

These can be leveraged for the real implementation.

### 4. FIT Files Router is Ready

The `fit-files.ts` router already has:

- `uploadFitFile` mutation
- `analyzeFitFile` mutation
- `getFitFileStatus` query
- `getFitFileUrl` query
- `deleteFitFile` mutation

Only `listFitFiles` is incomplete.

---

## 1. Database Schema

### **ARCHITECTURAL SIMPLIFICATION**

**MAJOR CHANGE:** The `activity_streams` table is **REMOVED**. All stream data (GPS points, power, heart rate, pace, cadence, altitude, speed) is now stored in `activities.metrics.streams` as compressed data.

### Current Activities Table (from init.sql)

```sql
create table if not exists public.activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    notes text,
    type text not null,
    location text,
    is_private boolean not null default true,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    duration_seconds integer not null default 0,
    moving_seconds integer not null default 0,
    distance_meters integer not null default 0,
    metrics jsonb not null default '{}'::jsonb,
    hr_zone_seconds integer[5],
    power_zone_seconds integer[7],
    profile_snapshot jsonb,
    avg_target_adherence numeric(5,2),
    activity_plan_id uuid references public.activity_plans(id) on delete set null,
    provider integration_provider,
    external_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_times check (finished_at >= started_at),
    constraint chk_moving_time check (moving_seconds >= 0 and moving_seconds <= duration_seconds)
);
```

### Schema Changes Required

```sql
-- Migration: packages/supabase/migrations/20260121_add_fit_file_support.sql

-- Add FIT file support columns
ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN processing_status TEXT DEFAULT 'PENDING'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));
ALTER TABLE activities ADD COLUMN processing_error TEXT;
ALTER TABLE activities ADD COLUMN fit_file_size INTEGER;

-- REMOVE activity_streams table - data now in activities.metrics.streams
DROP TABLE IF EXISTS activity_streams;

-- Indexes for performance
CREATE INDEX idx_activities_processing_status ON activities(processing_status);
CREATE INDEX idx_activities_fit_path ON activities(fit_file_path) WHERE fit_file_path IS NOT NULL;
```

### **Benefits of Simplified Architecture**

✅ **Single table per activity** - All data accessible via one query  
✅ **No JOIN operations needed** - Stream data in `activities.metrics.streams`  
✅ **Better performance** - Eliminates complex multi-table queries  
✅ **Easier maintenance** - Single source of truth for activity data  
✅ **Simplified data model** - Stream data compressed for efficient storage

### Storage Bucket (already exists)

The `activity-files` bucket already exists. Structure:

- Path: `{userId}/{activityId}.fit`
- Max Size: 50MB
- Public: false

### RLS Policies (already exist)

Already defined in `fit_files_storage_policies.sql`:

- Users can upload their own FIT files
- Users can read their own FIT files
- Service role has full access

---

## 2. Edge Functions

### Current State: MOCK IMPLEMENTATION

**File:** `packages/supabase/functions/analyze-fit-file/index.ts`

**Issues:**

1. Uses mock FIT parser (generates synthetic data)
2. Hardcoded cycling sport (Sport.CYCLING = 2)
3. No real GPS coordinate parsing
4. Uses service role key without proper JWT verification

### Required Fixes

**New Edge Function Implementation:**

```typescript
// packages/supabase/functions/process-activity-fit/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:supabase@^2.0.0";
import { decode } from "@garmin/fitsdk";
import { polyline } from "npm:@mapbox/polyline@^1.2.1";

const FIT_EPOCH_OFFSET = 631065600;

interface FitRecord {
  timestamp?: number;
  position_lat?: number;
  position_long?: number;
  distance?: number;
  altitude?: number;
  speed?: number;
  heart_rate?: number;
  cadence?: number;
  power?: number;
  temperature?: number;
}

interface FitSession {
  sport?: number;
  start_time?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  total_calories?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const { activityId } = await req.json();

    if (!activityId) {
      throw new Error("activityId is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get activity with FIT file path
    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id, fit_file_path, profile_id, started_at")
      .eq("id", activityId)
      .single();

    if (activityError || !activity?.fit_file_path) {
      throw new Error("Activity not found or no FIT file");
    }

    // Update status
    await supabase
      .from("activities")
      .update({ processing_status: "PROCESSING" })
      .eq("id", activityId);

    // Download and parse FIT file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("activity-files")
      .download(activity.fit_file_path);

    if (downloadError) {
      throw new Error(`Failed to download FIT file: ${downloadError.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();

    // REAL FIT PARSING using Garmin SDK
    const fitData = decode(new Uint8Array(arrayBuffer));
    const records = fitData.records as FitRecord[];
    const session = fitData.sessions?.[0] as FitSession;

    if (!records || records.length === 0) {
      throw new Error("No record data found in FIT file");
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("functional_threshold_power, max_heart_rate, weight")
      .eq("id", activity.profile_id)
      .single();

    // Calculate metrics
    const metrics = calculateMetrics(records, session, profile);

    // Generate GPS polyline
    const polylineStr = generatePolyline(records);

    // Update activity
    const { error: updateError } = await supabase
      .from("activities")
      .update({
        processing_status: "COMPLETED",
        metrics: metrics,
        distance_meters: session?.total_distance || 0,
        duration_seconds: session?.total_elapsed_time || 0,
        hr_zone_seconds: metrics.hrZones,
        power_zone_seconds: metrics.powerZones,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activityId);

    if (updateError) {
      throw new Error(`Failed to update activity: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ success: true, metrics }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Processing error:", error);

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      await supabase
        .from("activities")
        .update({
          processing_status: "FAILED",
          processing_error: error.message,
        })
        .eq("id", activityId);
    } catch {}

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

function calculateMetrics(
  records: FitRecord[],
  session: FitSession,
  profile: any,
) {
  const powerReadings = records
    .map((r) => r.power)
    .filter((p) => p !== undefined) as number[];
  const hrReadings = records
    .map((r) => r.heart_rate)
    .filter((h) => h !== undefined) as number[];

  const avgPower =
    session?.avg_power ||
    (powerReadings.length > 0
      ? powerReadings.reduce((a, b) => a + b, 0) / powerReadings.length
      : 0);
  const normalizedPower = calculateNormalizedPower(powerReadings);
  const ftp = profile?.functional_threshold_power || 200;
  const intensityFactor = avgPower > 0 ? normalizedPower / ftp : 0;
  const duration = session?.total_elapsed_time || 0;
  const tss = Math.round(
    intensityFactor * intensityFactor * (duration / 3600) * 100,
  );

  return {
    tss,
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    normalizedPower,
    hrZones: calculateHRZones(hrReadings, profile?.max_heart_rate),
    powerZones: calculatePowerZones(powerReadings, ftp),
  };
}

function calculateNormalizedPower(powerReadings: number[]): number {
  if (powerReadings.length === 0) return 0;
  const fourthPowerSum = powerReadings.reduce(
    (sum, p) => sum + Math.pow(p, 4),
    0,
  );
  return Math.round(Math.pow(fourthPowerSum / powerReadings.length, 0.25));
}

function calculateHRZones(hrReadings: number[], maxHR?: number) {
  const zones = [0, 0, 0, 0, 0];
  if (hrReadings.length === 0) return zones;
  const actualMax = maxHR || Math.max(...hrReadings);
  hrReadings.forEach((hr) => {
    const pct = hr / actualMax;
    if (pct < 0.5) zones[0]++;
    else if (pct < 0.6) zones[1]++;
    else if (pct < 0.7) zones[2]++;
    else if (pct < 0.8) zones[3]++;
    else zones[4]++;
  });
  return zones;
}

function calculatePowerZones(powerReadings: number[], ftp: number) {
  const zones = [0, 0, 0, 0, 0, 0, 0];
  if (powerReadings.length === 0 || ftp === 0) return zones;
  powerReadings.forEach((power) => {
    const pct = power / ftp;
    if (pct < 0.55) zones[0]++;
    else if (pct < 0.75) zones[1]++;
    else if (pct < 0.9) zones[2]++;
    else if (pct < 1.05) zones[3]++;
    else if (pct < 1.2) zones[4]++;
    else if (pct < 1.5) zones[5]++;
    else zones[6]++;
  });
  return zones;
}

function generatePolyline(records: FitRecord[]): string | null {
  const gpsPoints = records
    .filter(
      (r) => r.position_lat !== undefined && r.position_long !== undefined,
    )
    .map((r) => [
      semicirclesToDegrees(r.position_lat!),
      semicirclesToDegrees(r.position_long!),
    ]);
  return gpsPoints.length > 0 ? polyline.encode(gpsPoints) : null;
}

function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

---

## 3. Mobile Recording Integration

### Current Flow

```
Record Activity → StreamBuffer (60s chunks) → aggregateAllChunks()
  → compressStreamData() (pako gzip) → tRPC createWithStreams → Server
```

### New Flow with FIT

```
Record Activity → StreamBuffer (60s chunks) → aggregateAllChunks()
  → compressStreamData() (pako gzip) → FIT Encoding → Upload to Storage
  → createWithStreams + fit_file_path → Server
```

### Files to Modify

**1. ActivityRecorder/index.ts**

Add FIT encoder initialization:

```typescript
export class ActivityRecorderService extends EventEmitter<ServiceEvents> {
  public fitEncoder: StreamingFitEncoder | null = null;
  public fitFileBuffer: Uint8Array | null = null;
  public fitFilePath: string | null = null;

  async startRecording(): Promise<void> {
    // ... existing code ...

    // Initialize FIT encoder
    const metadata = this.getRecordingMetadata();
    this.fitEncoder = new StreamingFitEncoder({
      activityType: metadata.activityCategory,
      startTime: new Date(metadata.startedAt),
      profileId: metadata.profileId,
      ftp: metadata.profile?.functional_threshold_power,
      weight: metadata.profile?.weight,
    });
    await this.fitEncoder.initialize();
  }

  private handleSensorReading(reading: SensorReading): void {
    // ... existing code ...

    // Add to FIT encoder
    if (this.fitEncoder && reading.timestamp) {
      this.fitEncoder.addRecord({
        timestamp: reading.timestamp / 1000,
        heartRate: reading.heartRate,
        power: reading.power,
        cadence: reading.cadence,
        speed: reading.speed,
      });
    }
  }

  private handleLocationUpdate(location: LocationReading): void {
    if (this.fitEncoder) {
      this.fitEncoder.addLocation(
        location.latitude,
        location.longitude,
        location.altitude,
        location.timestamp,
      );
    }
  }

  async finishRecording(): Promise<void> {
    // ... existing code ...

    if (this.fitEncoder) {
      this.fitFileBuffer = await this.fitEncoder.finish();
      this.fitFilePath = `${this.recordingMetadata?.profileId}/${Date.now()}.fit`;
    }
  }
}
```

**2. useActivitySubmission.ts**

Add FIT upload:

```typescript
const processRecording = useCallback(async () => {
  // ... existing code ...

  // Generate FIT file
  const fitBuffer = service.fitFileBuffer;
  const fitPath = service.fitFilePath;

  if (fitBuffer && fitPath) {
    // Upload FIT file to storage
    const { filePath, size } = await trpc.fitFiles.uploadFitFile.mutate({
      fileName: `${activityId}.fit`,
      fileSize: fitBuffer.length,
      fileType: "application/octet-stream",
      fileData: uint8ArrayToBase64(fitBuffer),
    });

    activity.fit_file_path = filePath;
    activity.processing_status = "PENDING";
  }

  // ... rest of processing ...
}, [service, createActivityWithStreamsMutation]);
```

---

## 4. UI Components

### Processing Status Badge

```tsx
// apps/mobile/components/fit/ProcessingStatusBadge.tsx

import { View, Text, Pressable } from "react-native";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react-native";

type ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface ProcessingStatusBadgeProps {
  status: ProcessingStatus;
  error?: string;
  onRetry?: () => void;
}

export function ProcessingStatusBadge({
  status,
  error,
  onRetry,
}: ProcessingStatusBadgeProps) {
  switch (status) {
    case "PENDING":
      return (
        <View className="flex-row items-center gap-2 px-3 py-1.5 bg-gray-500/10 border border-gray-500/30 rounded-full">
          <Text className="text-gray-500 text-xs font-medium">Pending</Text>
        </View>
      );
    case "PROCESSING":
      return (
        <View className="flex-row items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full">
          <Text className="text-amber-500 text-xs font-medium">
            Processing...
          </Text>
        </View>
      );
    case "COMPLETED":
      return (
        <View className="flex-row items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500 rounded">
          <CheckCircle2 size={12} className="text-green-500" />
          <Text className="text-green-500 text-xs font-medium">Complete</Text>
        </View>
      );
    case "FAILED":
      return (
        <View className="flex-row items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-full">
          <AlertCircle size={12} className="text-red-500" />
          <View className="flex-1">
            <Text className="text-red-500 text-xs font-medium">Failed</Text>
            {error && <Text className="text-red-500/70 text-xs">{error}</Text>}
          </View>
          {onRetry && (
            <Pressable onPress={onRetry} className="p-1">
              <RefreshCw size={14} className="text-red-500" />
            </Pressable>
          )}
        </View>
      );
    default:
      return null;
  }
}
```

### PastActivityCard Integration

```tsx
// In apps/mobile/components/PastActivityCard.tsx

import { ProcessingStatusBadge } from "./fit/ProcessingStatusBadge";

export function PastActivityCard({ activity, onPress }: PastActivityCardProps) {
  return (
    <Card>
      <CardContent>
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-lg font-semibold">{activity.name}</Text>
            <Text className="text-sm text-muted-foreground">
              {formatDate(activity.started_at)}
            </Text>
          </View>
          {activity.processing_status && (
            <ProcessingStatusBadge
              status={activity.processing_status}
              error={activity.processing_error}
            />
          )}
        </View>

        {/* Existing metrics */}
        <View className="flex-row gap-4 mt-4">
          <Metric value={activity.distance_meters} unit="km" label="Distance" />
          <Metric value={activity.duration_seconds} unit="time" label="Time" />
          <Metric value={activity.metrics?.tss} unit="" label="TSS" />
        </View>
      </CardContent>
    </Card>
  );
}
```

---

## 5. tRPC Router Changes

### **NEW** FitFiles Router - Simplified Single Table Architecture

```typescript
// packages/trpc/src/routers/fit-files.ts

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

// Import existing schemas from @repo/supabase
import { publicActivitiesInsertSchema } from "@repo/supabase";

// Import existing functions from @repo/core
import {
  parseFitFileWithSDK,
  extractActivitySummary,
  extractHeartRateZones,
  extractPowerZones,
  calculateTSSFromAvailableData,
  calculateNormalizedPower,
  detectPowerTestEfforts,
  compressStreamsForStorage,
} from "@repo/core";

export const fitFilesRouter = createTRPCRouter({
  processFitFile: protectedProcedure
    .input(
      z.object({
        fitFilePath: z.string(),
        name: z.string().min(1).max(100),
        notes: z.string().max(1000).optional(),
        activityType: z.enum(["run", "bike", "swim", "walk", "hike"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // ===== STEP 1: Download FIT file from Supabase Storage =====
      const { data: fitFile, error: downloadError } = await ctx.supabase.storage
        .from("activity-files")
        .download(input.fitFilePath);

      if (downloadError || !fitFile) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to download FIT file from storage",
        });
      }

      // ===== STEP 2: Parse FIT file using existing @repo/core function =====
      const arrayBuffer = await fitFile.arrayBuffer();
      const parseResult = await parseFitFileWithSDK(arrayBuffer);

      if (!parseResult.success || !parseResult.data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: parseResult.error || "Failed to parse FIT file",
        });
      }

      // ===== STEP 3: Extract streams and compress for storage =====
      const rawStreams = {
        power: extractNumericStream(records, "power"),
        heart_rate: extractNumericStream(records, "heart_rate"),
        pace: extractNumericStream(records, "pace"),
        cadence: extractNumericStream(records, "cadence"),
        altitude: extractNumericStream(records, "altitude"),
        speed: extractNumericStream(records, "speed"),
        gps_points: records
          .filter((r) => r.position_lat && r.position_long)
          .map((r) => ({
            lat: r.position_lat,
            lng: r.position_long,
            altitude: r.altitude || null,
            timestamp: r.timestamp,
          })),
      };

      // ===== STEP 4: Create activity with ALL data in single table =====
      const activityData = {
        user_id: userId,
        name: input.name,
        notes: input.notes,
        activity_type: input.activityType,
        fit_file_path: input.fitFilePath,
        processing_status: "completed",
        start_time: new Date(summary.startTime),
        metrics: {
          // Basic metrics from FIT file
          duration: summary.duration,
          distance: summary.distance,
          calories: summary.calories,
          avgHeartRate: summary.avgHeartRate,
          maxHeartRate: summary.maxHeartRate,
          avgPower: summary.avgPower,
          maxPower: summary.maxPower,

          // Power metrics
          normalizedPower,
          tss,

          // All stream data compressed in activities.metrics.streams
          streams: compressStreamsForStorage(rawStreams),
        },
      };

      const { data: createdActivity, error: insertError } = await ctx.supabase
        .from("activities")
        .insert(activityData)
        .select()
        .single();

      if (insertError || !createdActivity) {
        // Cleanup: Delete uploaded file if activity creation fails
        await ctx.supabase.storage
          .from("activity-files")
          .remove([input.fitFilePath]);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create activity record",
        });
      }

      return {
        success: true,
        activity: createdActivity,
      };
    }),
});
```

### **REMOVED** - No Longer Needed

❌ **createWithFitFile** in activities router - replaced by `processFitFile`  
❌ **activity_streams table operations** - streams now in `activities.metrics.streams`  
❌ **Edge function triggers** - processing now synchronous in tRPC mutation  
❌ **Complex stream management** - single table simplifies everything

---

## 6. Core Package Integration

### Leverage Existing FIT Parsers

The core package already has:

- `packages/core/lib/fit-parser.ts` - Basic FIT file parsing
- `packages/core/lib/fit-sdk-parser.ts` - Garmin FIT SDK integration

```typescript
// Use existing core package utilities
import {
  parseFitFile,
  extractActivitySummary,
  extractHeartRateZones,
  extractPowerZones,
} from "@repo/core/lib/fit-sdk-parser";
```

---

## 7. Supazod Schema Updates

### Update Activities Insert Schema

```typescript
// packages/supabase/supazod/schemas.ts

// Add to publicActivitiesInsertSchema
fit_file_path: z.string().optional().nullable(),
processing_status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
processing_error: z.string().optional().nullable(),
fit_file_size: z.number().optional(),
```

---

## 8. New Files to Create

```
tasks/FIT_FILE_INTEGRATION_PLAN.md                    # This plan
packages/supabase/migrations/20260121_add_fit_file_support.sql
apps/mobile/lib/services/fit/types.ts
apps/mobile/lib/services/fit/StreamingFitEncoder.ts
apps/mobile/lib/services/fit/FitUploader.ts
apps/mobile/lib/services/fit/index.ts
apps/mobile/components/fit/ProcessingStatusBadge.tsx
packages/supabase/functions/process-activity-fit/index.ts
packages/supabase/functions/process-activity-fit/deno.json
```

---

## 9. Files to Modify

```
apps/mobile/lib/services/ActivityRecorder/index.ts
apps/mobile/lib/hooks/useActivitySubmission.ts
apps/mobile/components/PastActivityCard.tsx
apps/mobile/app/(internal)/(standard)/activity-detail.tsx
packages/trpc/src/routers/activities.ts
packages/trpc/src/routers/fit-files.ts
packages/supabase/supazod/schemas.ts
packages/supabase/database.types.ts
packages/supabase/config.toml
```

---

## 10. Dependencies

### Mobile (React Native)

```json
{
  "dependencies": {
    "fit-encoder-js": "^1.0.0"
  }
}
```

### Edge Function (Deno)

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2.4.1",
    "@garmin/fitsdk": "npm:@garmin/fitsdk@^2.0.0",
    "@mapbox/polyline": "npm:@mapbox/polyline@^1.2.1",
    "supabase": "npm:supabase@^2.0.0"
  }
}
```

---

## 11. Error Handling

### Processing Status Flow

```
PENDING → PROCESSING → COMPLETED
                   → FAILED (with error message)
```

### Retry Logic

1. User taps retry button
2. Re-upload FIT file to storage
3. Reset processing_status to 'PENDING'
4. Trigger re-processing via Edge Function

---

## 12. Success Criteria

| Metric                  | Target                   |
| ----------------------- | ------------------------ |
| FIT file integrity      | 100% validated by SDK    |
| Upload success rate     | >95%                     |
| Processing success rate | >98%                     |
| Processing time         | <30 seconds per activity |

---

## 13. Timeline (UPDATED)

| Phase                         | Duration | Total     |
| ----------------------------- | -------- | --------- |
| Phase 1: Infrastructure       | 1 days   | Day 1     |
| Phase 2: Mobile Recording     | 3-4 days | Day 2-5   |
| Phase 3: Automatic Processing | 3-4 days | Day 6-9   |
| Phase 4: User Interface       | 2 days   | Day 10-11 |
| Phase 5: Data Migration       | 1-2 days | Day 12-13 |

**Total:** 10-13 days (approximately 2 weeks)  
**Reduced complexity due to simplified architecture:** -3-4 days from original estimate

### Timeline Reduction Reasons

- **No activity_streams table management** - Eliminated complex stream storage logic
- **Single activity query** - No JOIN operations needed for stream data
- **Simplified data model** - All stream data in `activities.metrics.streams`
- **Reduced testing complexity** - Fewer database interactions to test

---

## 14. Tasks Checklist

### Phase 1: Infrastructure Setup

- [ ] Apply/create database migration for FIT columns
- [ ] **REMOVE** activity_streams table (DROP TABLE)
- [ ] Regenerate TypeScript types (supabase generate-types)
- [ ] Regenerate Zod schemas (supazod)
- [ ] Create fit-files tRPC router (simpler than Edge Function)
- [ ] Register fitFilesRouter in root router

### Phase 2: Mobile Recording

- [ ] Add fit-encoder-js dependency
- [ ] Create StreamingFitEncoder class
- [ ] Create FitUploader service
- [ ] Integrate FIT encoder into ActivityRecorder
- [ ] Update useActivitySubmission for FIT upload
- [ ] Test real-time encoding performance

### Phase 3: Automatic Processing

- [ ] Implement real FIT file decoding in tRPC mutation (simpler than Edge Function)
- [ ] Implement stream compression for activities.metrics.streams storage
- [ ] Leverage existing @repo/core functions for metrics calculation (TSS, IF, NP)
- [ ] Implement GPS polyline generation using @repo/core utilities
- [ ] Implement single activity record update (no separate streams table)
- [ ] Add error handling and file cleanup on failure

### Phase 4: User Interface

- [ ] Create ProcessingStatusBadge component
- [ ] Add status badges to PastActivityCard
- [ ] Add status display to ActivityDetailScreen
- [ ] Add retry button for failed processing

### Phase 5: Data Migration

- [ ] Create migration script for existing activities
- [ ] Test migration on staging data
- [ ] Run migration on production data
- [ ] Verify all metrics calculate correctly

---

## 15. Key Decisions (UPDATED)

| Decision                | Options                                       | Recommendation          |
| ----------------------- | --------------------------------------------- | ----------------------- |
| **Stream Storage**      | activity_streams table vs activities.metrics  | activities.metrics      |
| **Data Architecture**   | Multi-table JOIN vs Single Table              | Single Table            |
| **Processing Location** | Edge Function vs tRPC mutation                | tRPC mutation           |
| **FIT Parser**          | Use core package fit-sdk-parser               | Leverage existing code  |
| **Encoding Location**   | Mobile (fit-encoder-js) vs Server-side (Deno) | Mobile (true real-time) |

### **Major Architectural Decision: Single Table Architecture**

**Chosen:** `activities.metrics.streams` instead of `activity_streams` table

**Benefits:**

- ✅ Single query retrieves all activity data + streams
- ✅ No JOIN operations needed for better performance
- ✅ Simplified data model and maintenance
- ✅ Stream data compressed for efficient storage
- ✅ All data accessible via `activities` table query
- ✅ Easier testing and debugging

**Trade-offs:**

- Larger JSONB payloads (mitigated by compression)
- Less granular access control (acceptable for this use case)

---

## 16. Related Files Reference

| Component              | Path                                                        |
| ---------------------- | ----------------------------------------------------------- |
| Database Schema        | `packages/supabase/schemas/init.sql`                        |
| Zod Schemas            | `packages/supabase/supazod/schemas.ts`                      |
| Database Types         | `packages/supabase/database.types.ts`                       |
| Activities Router      | `packages/trpc/src/routers/activities.ts`                   |
| FIT Files Router       | `packages/trpc/src/routers/fit-files.ts`                    |
| Storage Router         | `packages/trpc/src/routers/storage.ts`                      |
| Existing Edge Function | `packages/supabase/functions/analyze-fit-file/index.ts`     |
| Core FIT Parser        | `packages/core/lib/fit-sdk-parser.ts`                       |
| ActivityRecorder       | `apps/mobile/lib/services/ActivityRecorder/index.ts`        |
| useActivitySubmission  | `apps/mobile/lib/hooks/useActivitySubmission.ts`            |
| PastActivityCard       | `apps/mobile/components/PastActivityCard.tsx`               |
| ActivityDetailScreen   | `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` |

---

## 17. Deprecations to Note

### **REMOVED: activity_streams Table**

**DO NOT recreate** - All stream data now stored in `activities.metrics.streams`:

```sql
-- REMOVED:
DROP TABLE IF EXISTS activity_streams;

-- REPLACED BY:
-- activities.metrics.streams (JSONB with compressed data)
```

### Removed Columns (do NOT recreate)

These were removed in migration `20260120135511_removing_redundant_columns`:

- `profile_ftp`, `profile_threshold_hr`, `profile_weight_kg` → use `profile_snapshot`
- Individual metric columns → use `metrics` JSONB
- Zone time columns → use `hr_zone_seconds[]` and `power_zone_seconds[]`

### Use JSONB for New Metrics

```typescript
// Instead of:
ALTER TABLE activities ADD COLUMN new_metric FLOAT;

// Use:
-- activity.metrics already supports any JSON
-- Just update the metrics object

// For streams:
activities.metrics.streams = {
  gps_points: [...], // compressed
  power: [...],      // compressed
  heart_rate: [...], // compressed
  // etc.
}
```

### **Schema Migration Required**

Any existing code referencing `activity_streams` table must be updated:

```sql
-- OLD QUERY (no longer works):
SELECT a.*, s.* FROM activities a
JOIN activity_streams s ON s.activity_id = a.id;

-- NEW QUERY (simplified):
SELECT * FROM activities WHERE id = $1;
-- All stream data in activities.metrics.streams
```

---

**Document Version:** 4.0 - Simplified Architecture Edition  
**Created:** 2026-01-21  
**Updated:** 2026-01-22  
**Next Review:** Before starting Phase 1

### **Major Changes in v4.0**

- ✅ **Removed:** `activity_streams` table
- ✅ **Simplified:** All stream data in `activities.metrics.streams`
- ✅ **Reduced:** Timeline from 12-17 days to 10-13 days
- ✅ **Improved:** Single-table architecture for better performance
- ✅ **Updated:** Implementation approach to leverage @repo/core functions
