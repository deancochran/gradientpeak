# FIT File Implementation Specification

**Version:** 2.0.0  
**Created:** January 22, 2026  
**Last Updated:** January 22, 2026  
**Status:** Ready for Implementation  
**Owner:** Coordinator

---

## Executive Summary

This specification defines the implementation of FIT (Flexible and Interoperable Data Transfer) file support for GradientPeak. The FIT protocol, developed by Garmin, is the industry standard for fitness device data storage and is used by Garmin, Wahoo, Suunto, Polar, COROS, and Zwift.

**Key Decisions:**

- **Primary Library:** `@garmin/fitsdk` (official SDK for encoding AND decoding)
- **Architecture:** Mobile-first encoding with server-side parsing
- **Processing Trigger:** tRPC mutation → Edge Function
- **Processing Status:** PENDING → PROCESSING → COMPLETED/FAILED workflow
- **Testing:** 95% message type coverage, 100% field conversion accuracy

---

## 1. Technology Selection

### 1.1 Library Selection

| Library                         | Bundle Size | TypeScript | Maintenance     | License | Recommendation |
| ------------------------------- | ----------- | ---------- | --------------- | ------- | -------------- |
| `@garmin/fitsdk`                | ~400KB      | Excellent  | Garmin Official | MIT     | **Primary**    |
| `@garmin/fitsdk` (Encoder only) | ~200KB      | Excellent  | Garmin Official | MIT     | Mobile         |
| `@mapbox/polyline`              | ~50KB       | Excellent  | Active          | ISC     | GPS encoding   |

**IMPORTANT:** The plan originally specified `fit-encoder-js` which does NOT exist on npm. We will use `@garmin/fitsdk`'s built-in `Encoder` class for mobile encoding.

### 1.2 @garmin/fitsdk Version

```json
// Correct version format (21.x.x, not 2.x.x)
"@garmin/fitsdk": "^21.188.0"
```

### 1.3 Dependencies by Platform

**Mobile (React Native):**

```json
{
  "dependencies": {
    "@garmin/fitsdk": "^21.188.0"
  }
}
```

**Edge Function (Deno):**

```json
{
  "imports": {
    "@garmin/fitsdk": "npm:@garmin/fitsdk@^21.188.0",
    "@mapbox/polyline": "npm:@mapbox/polyline@^1.2.1",
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2.4.1",
    "supabase": "npm:supabase@^2.0.0"
  }
}
```

---

## 2. Architecture

### 2.1 Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GRADIENTPEAK FIT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    TIER 1: MOBILE ENCODING                          │     │
│  │  ActivityRecorder → StreamingFitEncoder → FIT File → Upload        │     │
│  │                                                                      │     │
│  │  - Real-time encoding during recording                              │     │
│  │  - Checkpoint every 60s for crash recovery                          │     │
│  │  - Uses @garmin/fitsdk Encoder class                                │     │
│  │  - Upload to fit-files storage bucket                               │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    TIER 2: API LAYER (tRPC)                         │     │
│  │  createWithFitFile mutation                                         │     │
│  │                                                                      │     │
│  │  - Creates activity with fit_file_path reference                    │     │
│  │  - Sets processing_status to 'PENDING'                              │     │
│  │  - Invokes process-activity-fit edge function                       │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │               TIER 3: PROCESSING LAYER (Edge Function)               │     │
│  │  process-activity-fit edge function                                 │     │
│  │                                                                      │     │
│  │  - Downloads FIT file from storage                                  │     │
│  │  - Parses with @garmin/fitsdk decode()                              │     │
│  │  - Calculates metrics (TSS, IF, NP, zones)                          │     │
│  │  - Generates GPS polyline                                           │     │
│  │  - Updates activity with results                                    │     │
│  │  - Sets processing_status to 'COMPLETED' or 'FAILED'                │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
Record Activity → StreamBuffer (60s chunks) → aggregateAllChunks()
  → compressStreamData() (pako gzip) → FIT Encoding → Upload to Storage
  → createWithStreams + fit_file_path → tRPC
  → process-activity-fit (Edge Function)
  → Status: PENDING → PROCESSING → COMPLETED/FAILED
```

### 2.3 Processing Status Workflow

```sql
-- Database column definition
processing_status TEXT DEFAULT 'PENDING'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
processing_error TEXT
```

**State Transitions:**

```
PENDING → PROCESSING (when edge function starts)
PROCESSING → COMPLETED (on success)
PROCESSING → FAILED (on error, with error message)
FAILED → PENDING (on retry)
```

### 2.4 File Structure

```
packages/core/
├── lib/
│   ├── fit-parser.ts           # Existing: Basic FIT parser
│   └── fit-sdk-parser.ts       # Existing: Garmin SDK integration
│
apps/mobile/
├── lib/services/
│   ├── ActivityRecorder/
│   │   └── index.ts            # MODIFY: Add FIT encoder integration
│   │
│   └── FitParser/              # NEW: Mobile FIT parsing service
│       ├── FitParser.ts        # Wrapper with memory guards
│       ├── memoryGuards.ts     # Memory management
│       └── useFitParser.ts     # React hook for async parsing
│
packages/supabase/functions/
├── analyze-fit-file/           # DEPRECATED: Mock implementation
└── process-activity-fit/       # NEW: Real FIT processing function
    ├── index.ts
    └── deno.json
```

---

## 3. Database Schema

### 3.1 Activities Table Extensions

```sql
-- Migration: packages/supabase/migrations/20260121_add_fit_file_support.sql
-- NOTE: Migration exists but NOT yet applied to init.sql

ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN processing_status TEXT DEFAULT 'PENDING'
  CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));
ALTER TABLE activities ADD COLUMN processing_error TEXT;
ALTER TABLE activities ADD COLUMN fit_file_size INTEGER;

CREATE INDEX idx_activities_processing_status ON activities(processing_status);
CREATE INDEX idx_activities_fit_path ON activities(fit_file_path) WHERE fit_file_path IS NOT NULL;
```

### 3.2 Storage Bucket (Already Exists)

**Bucket:** `fit-files`

| Property     | Value                       |
| ------------ | --------------------------- |
| Path pattern | `{userId}/{activityId}.fit` |
| Max Size     | 50MB                        |
| Public       | false                       |

### 3.3 RLS Policies (Already Exist in `fit_files)

Defined_storage_policies.sql`:

- Users can upload their own FIT files
- Users can read their own FIT files
- Service role has full access

### 3.4 Schema Types Update Required

```typescript
// packages/supabase/supazod/schemas.ts
// Add to publicActivitiesInsertSchema:

fit_file_path: z.string().optional().nullable(),
processing_status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
processing_error: z.string().optional().nullable(),
fit_file_size: z.number().optional(),
```

---

## 4. Data Mapping

### 4.1 FIT Messages to GradientPeak Schema

| FIT Message | GradientPeak Entity          | Priority |
| ----------- | ---------------------------- | -------- |
| FILE_ID     | external_source, device_info | Critical |
| SESSION     | activity.metrics             | Critical |
| RECORD      | activity_streams             | Critical |
| LAP         | activity.splits              | High     |
| DEVICE_INFO | activity.devices             | Medium   |
| EVENT       | activity.events              | Low      |

### 4.2 Sport Mapping

```typescript
const SPORT_MAP: Record<string, ActivityType> = {
  running: "run",
  cycling: "bike",
  swimming: "swim",
  fitness_equipment: "bike",
  rowing: "bike",
  cross_country_skiing: "bike",
  trail_running: "run",
  virtual_activity: "bike",
};
```

### 4.3 Key Conversions

```typescript
// Semicircles to Degrees (GPS)
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}

// FIT Epoch (1989-12-31) to Unix
const FIT_EPOCH_OFFSET = 631065600;
function fitTimestampToUnix(fitTimestamp: number): number {
  return fitTimestamp + FIT_EPOCH_OFFSET;
}
```

---

## 5. Implementation Details

### 5.1 Edge Function: process-activity-fit

**Location:** `packages/supabase/functions/process-activity-fit/index.ts`

```typescript
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
  // CORS handling
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

    // Update status to PROCESSING
    await supabase
      .from("activities")
      .update({ processing_status: "PROCESSING" })
      .eq("id", activityId);

    // Download and parse FIT file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("fit-files") // FIXED: Was "activity-files" in mock
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

    // Get user profile for metrics calculation
    const { data: profile } = await supabase
      .from("profiles")
      .select("functional_threshold_power, max_heart_rate, weight")
      .eq("id", activity.profile_id)
      .single();

    // Calculate metrics
    const metrics = calculateMetrics(records, session, profile);

    // Generate GPS polyline
    const polylineStr = generatePolyline(records);

    // Update activity with results
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

    // Update status to FAILED
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

### 5.2 Mobile Recording Integration

**File:** `apps/mobile/lib/services/ActivityRecorder/index.ts`

Add FIT encoder integration:

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

### 5.3 tRPC: createWithFitFile Mutation

**File:** `packages/trpc/src/routers/activities.ts`

```typescript
createWithFitFile: protectedProcedure
  .input(
    z.object({
      activity: publicActivitiesInsertSchema.omit({
        id: true,
        idx: true,
        created_at: true,
      }),
      activity_streams: z
        .array(
          z.object({
            type: z.enum([/* stream types */]),
            data_type: z.enum(["float", "latlng", "boolean"]),
            compressed_values: z.string(),
            compressed_timestamps: z.string(),
            sample_count: z.number(),
            original_size: z.number(),
            min_value: z.number().optional(),
            max_value: z.number().optional(),
            avg_value: z.number().optional(),
          }),
        )
        .optional(),
      fit_file_path: z.string(),
      fit_file_size: z.number().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const { activity, activity_streams, fit_file_path, fit_file_size } =
      input;

    // Create activity with FIT file reference
    const { data, error } = await ctx.supabase
      .from("activities")
      .insert({
        ...activity,
        fit_file_path,
        fit_file_size,
        processing_status: "PENDING",
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create activity: ${error.message}`);
    }

    // Create streams if provided
    if (activity_streams && activity_streams.length > 0) {
      const streamsWithActivityId = activity_streams.map((s) => ({
        ...s,
        activity_id: data.id,
      }));

      const { error: streamsError } = await ctx.supabase
        .from("activity_streams")
        .insert(streamsWithActivityId);

      if (streamsError) {
        await ctx.supabase.from("activities").delete().eq("id", data.id);
        throw new Error(`Failed to create streams: ${streamsError.message}`);
      }
    }

    // Trigger FIT processing
    await ctx.supabase.functions.invoke("process-activity-fit", {
      body: { activityId: data.id },
    });

    return data;
  }),
```

---

## 6. UI Components

### 6.1 ProcessingStatusBadge

**File:** `apps/mobile/components/fit/ProcessingStatusBadge.tsx`

```tsx
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

### 6.2 PastActivityCard Integration

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

## 7. Testing Strategy

### 7.1 Coverage Targets

| Category          | Target | Critical Fields             |
| ----------------- | ------ | --------------------------- |
| Message Types     | 95%    | FILE_ID, SESSION, RECORD    |
| Field Conversions | 100%   | timestamps, GPS, HR, power  |
| Error Handling    | 100%   | corrupt, truncated, invalid |
| Platform Tests    | 90%    | iOS, Android, Server        |

### 7.2 Additional Success Criteria

| Metric                        | Target                   |
| ----------------------------- | ------------------------ |
| FIT file integrity            | 100% validated by SDK    |
| Upload success rate           | >95%                     |
| Processing success rate       | >98%                     |
| Processing time               | <30 seconds per activity |
| Error Recovery Success        | >99%                     |
| Retry Success Rate            | >95%                     |
| Large File Processing (<50MB) | <60 seconds              |

### 7.3 Test Data

```
packages/core/__fixtures__/fit/
├── garmin/
│   ├── forerunner-265/
│   └── fenix-7/
├── wahoo/
│   ├── elemnt-bolt/
│   └── kickr/
├── coros/
├── edge-cases/
├── corrupted/
└── synthetic/
```

---

## 8. Performance Requirements

### 8.1 Parsing Targets

| File Size | Target Time | Platform |
| --------- | ----------- | -------- |
| < 5MB     | < 500ms     | Mobile   |
| 5-20MB    | < 2s        | Mobile   |
| Any       | < 1s        | Server   |

### 8.2 Memory Limits

| Platform | Max File Size | Strategy                       |
| -------- | ------------- | ------------------------------ |
| Mobile   | 50MB          | Chunked parsing, memory guards |
| Server   | 250MB         | Streaming, async processing    |

---

## 9. Device Compatibility

### 9.1 Supported Manufacturers

| Manufacturer | Support Level | Notes                 |
| ------------ | ------------- | --------------------- |
| Garmin       | Full          | Primary target        |
| Wahoo        | Full          | Activity exports      |
| Suunto       | Full          | Developer fields      |
| COROS        | Full          | Consistent profile    |
| Polar        | Full          | Different dev fields  |
| Zwift        | Full          | Structured activities |

### 9.2 Protocol Versions

- **FIT v1.x**: Default compatibility
- **FIT v2.0**: Developer data fields supported

---

## 10. Error Handling

### 10.1 Error Types

```typescript
class FitDecodeError extends Error {
  constructor(
    message: string,
    public code: FitErrorCode,
    public recoverable: boolean,
  ) {
    super(message);
  }
}

enum FitErrorCode {
  INVALID_FORMAT = "INVALID_FORMAT",
  INTEGRITY_CHECK_FAILED = "INTEGRITY_CHECK_FAILED",
  MISSING_REQUIRED_MESSAGE = "MISSING_REQUIRED_MESSAGE",
  DECODE_ERROR = "DECODE_ERROR",
}
```

### 10.2 User Messages

| Error          | User Message                                              |
| -------------- | --------------------------------------------------------- |
| CRC failed     | "File is corrupted. Please re-download from your device." |
| Invalid header | "Invalid FIT file format."                                |
| Missing data   | "File appears incomplete or from unsupported device."     |
| Too large      | "File exceeds size limit. Upload for server analysis."    |

### 10.3 Retry Logic

1. User taps retry button
2. Re-upload FIT file to storage
3. Reset processing_status to 'PENDING'
4. Trigger re-processing via Edge Function

---

## 11. Implementation Roadmap

### Phase 1: Infrastructure (1-2 days)

- [ ] Apply/create database migration for FIT columns
- [ ] Regenerate TypeScript types (supabase generate-types)
- [ ] Regenerate Zod schemas (supazod)
- [ ] Create process-activity-fit Edge Function
- [ ] Add Edge Function config to config.toml

### Phase 2: Mobile Recording (3-5 days)

- [ ] Integrate StreamingFitEncoder into ActivityRecorder
- [ ] Create FitUploader service for FIT upload
- [ ] Update useActivitySubmission for FIT upload
- [ ] Test real-time encoding performance

### Phase 3: Automatic Processing (4-5 days)

- [ ] Implement real FIT file decoding in Edge Function
- [ ] Implement metrics calculation (TSS, IF, NP)
- [ ] Implement GPS polyline generation
- [ ] Implement activity record update
- [ ] Add error handling and retries

### Phase 4: User Interface (2 days)

- [ ] Create ProcessingStatusBadge component
- [ ] Add status badges to PastActivityCard
- [ ] Add status display to ActivityDetailScreen
- [ ] Add retry button for failed processing

### Phase 5: Data Migration (2-3 days)

- [ ] Create migration script for existing activities
- [ ] Test migration on staging data
- [ ] Run migration on production data
- [ ] Verify all metrics calculate correctly

**Total:** 12-17 days (approximately 2-3 weeks)

---

## 12. Files to Create/Modify

### New Files to Create

```
packages/supabase/migrations/20260121_add_fit_file_support.sql
apps/mobile/lib/services/fit/types.ts
apps/mobile/lib/services/fit/StreamingFitEncoder.ts
apps/mobile/lib/services/fit/FitUploader.ts
apps/mobile/lib/services/fit/index.ts
apps/mobile/components/fit/ProcessingStatusBadge.tsx
packages/supabase/functions/process-activity-fit/index.ts
packages/supabase/functions/process-activity-fit/deno.json
```

### Files to Modify

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

### Deprecated Files

```
packages/supabase/functions/analyze-fit-file/index.ts  # Mock implementation - replace
```

---

## 13. Key Decisions

| Decision               | Options                                       | Recommendation           |
| ---------------------- | --------------------------------------------- | ------------------------ |
| **Encoding Location**  | Mobile (fit-encoder-js) vs Server-side (Deno) | Mobile (true real-time)  |
| **FIT Parser**         | Use @garmin/fitsdk Encoder class              | Use built-in SDK encoder |
| **Processing Trigger** | Database trigger vs tRPC mutation             | tRPC mutation            |
| **Status Column**      | Use existing migration or create new          | Apply existing           |

---

## 14. Critical Fixes Required

### Fix 1: Remove non-existent dependency

```diff
- "fit-encoder-js": "^1.0.0"  # Does NOT exist on npm
+ # Use @garmin/fitsdk Encoder class instead
```

### Fix 2: Correct @garmin/fitsdk version

```diff
- "@garmin/fitsdk": "^2.0.0"  # Does NOT exist
+ "@garmin/fitsdk": "^21.188.0"  # Correct version
```

### Fix 3: Add @garmin/fitsdk to deno.json

```diff
+ "@garmin/fitsdk": "npm:@garmin/fitsdk@^21.188.0"
```

### Fix 4: Apply database migration

```diff
# Migration exists but NOT applied to init.sql
# Either apply migration OR add columns to init.sql
```

### Fix 5: Replace mock edge function

```diff
# analyze-fit-file generates synthetic data
# Replace with process-activity-fit using real @garmin/fitsdk
```

### Fix 6: Fix bucket name in edge function

```diff
- .from("activity-files")  # Wrong bucket
+ .from("fit-files")  # Correct bucket
```

---

## 15. Deprecations to Note

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
// Just update the metrics object
```

---

## 16. Future Considerations

### 16.1 Export Capability

The SDK supports encoding (writing) FIT files for:

- Device data recovery
- Workout transfer to Garmin
- Third-party compatibility

### 16.2 Advanced Features

- Developer data fields for custom metrics
- Privacy zone support for location data
- Batch import from device dumps
- Garmin Connect API direct sync

---

## Appendix A: Schema Definitions

### A.1 FitFileMetadataSchema

```typescript
export const FitFileMetadataSchema = z.object({
  fileId: z.object({
    type: z.string(),
    manufacturer: z.string(),
    product: z.number(),
    serialNumber: z.number().optional(),
    timeCreated: z.date(),
  }),
  deviceInfo: z
    .object({
      manufacturer: z.string().optional(),
      product: z.number().optional(),
      softwareVersion: z.number().optional(),
      hardwareVersion: z.number().optional(),
    })
    .optional(),
});
```

### A.2 FitSessionSchema

```typescript
export const FitSessionSchema = z.object({
  timestamp: z.date(),
  startTime: z.date(),
  totalElapsedTime: z.number(),
  totalTimerTime: z.number(),
  totalDistance: z.number(),
  avgPower: z.number().optional(),
  maxPower: z.number().optional(),
  avgHeartRate: z.number().optional(),
  maxHeartRate: z.number().optional(),
  avgCadence: z.number().optional(),
  sport: z.string(),
  subSport: z.string().optional(),
});
```

### A.3 FitRecordSchema

```typescript
export const FitRecordSchema = z.object({
  timestamp: z.date(),
  positionLat: z.number().optional(),
  positionLong: z.number().optional(),
  distance: z.number().optional(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  heartRate: z.number().optional(),
  cadence: z.number().optional(),
  power: z.number().optional(),
  temperature: z.number().optional(),
});
```

---

## Appendix B: Message Type Reference

| Global ID | Message Name      | Required | Description             |
| --------- | ----------------- | -------- | ----------------------- |
| 0         | FILE_ID           | Yes      | File identification     |
| 12        | SPORT             | No       | Sport information       |
| 18        | SESSION           | Yes      | Session summary         |
| 19        | LAP               | No       | Lap data                |
| 20        | RECORD            | Yes      | Time series data        |
| 21        | EVENT             | No       | Event markers           |
| 23        | DEVICE_INFO       | No       | Device information      |
| 34        | ACTIVITY          | Yes      | Activity summary        |
| 206       | DEVELOPER_DATA_ID | No       | Custom data definitions |
| 207       | FIELD_DESCRIPTION | No       | Field metadata          |

---

## Appendix C: Related Files Reference

| Component                     | Path                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| Database Schema               | `packages/supabase/schemas/init.sql`                        |
| Zod Schemas                   | `packages/supabase/supazod/schemas.ts`                      |
| Database Types                | `packages/supabase/database.types.ts`                       |
| Activities Router             | `packages/trpc/src/routers/activities.ts`                   |
| FIT Files Router              | `packages/trpc/src/routers/fit-files.ts`                    |
| Storage Router                | `packages/trpc/src/routers/storage.ts`                      |
| Existing (Mock) Edge Function | `packages/supabase/functions/analyze-fit-file/index.ts`     |
| Core FIT Parser               | `packages/core/lib/fit-sdk-parser.ts`                       |
| ActivityRecorder              | `apps/mobile/lib/services/ActivityRecorder/index.ts`        |
| useActivitySubmission         | `apps/mobile/lib/hooks/useActivitySubmission.ts`            |
| PastActivityCard              | `apps/mobile/components/PastActivityCard.tsx`               |
| ActivityDetailScreen          | `apps/mobile/app/(internal)/(standard)/activity-detail.tsx` |

---

**Document Version:** 2.0.0  
**Last Updated:** January 22, 2026  
**Next Review:** Before starting Phase 2

---

## Changelog

### Version 2.0.0 (2026-01-22)

**Major Changes:**

- Updated architecture to mobile-first encoding with server-side parsing
- Replaced `fit-encoder-js` with `@garmin/fitsdk` Encoder class (library doesn't exist on npm)
- Fixed `@garmin/fitsdk` version from `^2.0.0` to `^21.188.0`
- Added processing status workflow (PENDING → PROCESSING → COMPLETED/FAILED)
- Replaced `analyze-fit-file` edge function with `process-activity-fit`
- Added complete edge function implementation code
- Added mobile recording integration with StreamingFitEncoder
- Added UI components (ProcessingStatusBadge, retry button)
- Added tRPC `createWithFitFile` mutation
- Updated timeline to 5 phases over 12-17 days
- Added critical fixes section for blockers identified during review
- Added success criteria for error recovery and large file processing

**Testing Updates:**

- Added platform-specific performance benchmarks
- Added error recovery success criteria
- Updated timeline feasibility assessment

**Integration Updates:**

- Fixed bucket name in edge function ("activity-files" → "fit-files")
- Added schema updates for FIT columns
- Documented migration application requirement

### Version 1.0.0 (2026-01-22)

- Initial specification from research phase
