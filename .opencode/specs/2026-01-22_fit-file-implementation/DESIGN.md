# FIT File Implementation Specification

**Version:** 6.0.0  
**Created:** January 22, 2026  
**Last Updated:** January 22, 2026  
**Status:** Ready for Implementation

---

## Executive Summary

This specification defines FIT file processing for GradientPeak using a **single synchronous tRPC mutation** that leverages all pre-existing `@repo/core` functions. No code duplication - only integration.

| Decision         | Choice                             | Rationale                                                    |
| ---------------- | ---------------------------------- | ------------------------------------------------------------ |
| **FIT Parser**   | `@repo/core/lib/fit-sdk-parser.ts` | Existing production parser using Garmin SDK                  |
| **Calculations** | `@repo/core` functions             | TSS, power curves, test detection all exist                  |
| **Processing**   | Next.js/tRPC mutation              | Single synchronous request                                   |
| **Database**     | Supabase client                    | Uses existing `activities` table with `fit_file_path` column |
| **Streams**      | `activity_streams` table           | Compressed stream storage already exists                     |

**Key Finding:** All 50+ calculation, parsing, and detection functions already exist in `@repo/core`. This spec only defines the integration layer.

---

## Part 1: Data Flow

### Synchronous Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FIT FILE PROCESSING FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Mobile uploads FIT to Supabase Storage                                   │
│  2. Mobile calls tRPC mutation `fitFiles.processFitFile`                     │
│  3. Mutation downloads file from Storage                                     │
│  4. Mutation parses using `parseFitFileWithSDK()` from @repo/core            │
│  5. Mutation calculates metrics using existing @repo/core functions          │
│  6. Mutation creates activity + streams in database                          │
│  7. Mutation returns activity with all computed metrics                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Already Exists

| Component            | Location                             | Status                                      |
| -------------------- | ------------------------------------ | ------------------------------------------- |
| FIT Parser           | `@repo/core/lib/fit-sdk-parser.ts`   | ✅ Production ready                         |
| TSS Calculation      | `@repo/core/calculations/tss.ts`     | ✅ `calculateTSSFromAvailableData()`        |
| Power Curves         | `@repo/core/calculations/curves.ts`  | ✅ `calculatePowerCurve()`                  |
| Test Detection       | `@repo/core/detection/`              | ✅ `detectPowerTestEfforts()`               |
| Stream Decompression | `@repo/core/utils/decompress.ts`     | ✅ `decompressAllStreams()`                 |
| Database Schema      | `packages/supabase/schemas/init.sql` | ✅ `activities` + `activity_streams` tables |

---

## Part 2: Database Schema

### Database Schema Simplification

We will **remove the `activity_streams` table** and store all data directly in the `activities` table to simplify the architecture.

```sql
-- activities table already has these columns:
-- - id, user_id, name, notes, activity_type
-- - metrics (JSONB)
-- - start_time, created_at, updated_at

-- activity_streams table - TO BE REMOVED
-- All stream data will be stored in activities.metrics.streams
```

### Required Schema Changes

**Add these columns to `activities` table:**

```sql
ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN processing_status TEXT DEFAULT 'pending';
```

**Remove the activity_streams table:**

```sql
DROP TABLE IF EXISTS activity_streams;
```

**Note:** All stream data (GPS points, power, heart rate, pace, etc.) will be stored in the `metrics` JSONB column under a `streams` sub-object. This eliminates the need for a separate table and simplifies queries.

---

## Part 3: tRPC Router Implementation

### FitFiles Router

**packages/trpc/src/routers/fit-files.ts:**

```typescript
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
  calculateIntensityFactor,
  calculateVariabilityIndex,
  detectPowerTestEfforts,
  detectRunningTestEfforts,
  detectHRTestEfforts,
  calculatePowerCurve,
  calculateHRCurve,
  calculatePaceCurve,
} from "@repo/core";

// Import existing utilities from @repo/core
import {
  extractNumericStream,
  compressStreamsForStorage,
  decompressStreamsFromStorage,
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
    .mutation(async ({ ctx, input }): Promise<ProcessFitFileResponse> => {
      const userId = ctx.session.user.id;

      // ===== STEP 1: Download FIT file from Supabase Storage =====
      const { data: fitFile, error: downloadError } = await ctx.supabase.storage
        .from("activity-files")
        .download(input.fitFilePath);

      if (downloadError || !fitFile) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to download FIT file from storage",
          cause: downloadError,
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

      const { activity, records, session } = parseResult.data;

      // ===== STEP 3: Extract activity summary using @repo/core =====
      const summary = extractActivitySummary(parseResult.data);

      // ===== STEP 4: Extract streams from FIT records =====
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

      // ===== STEP 5: Calculate metrics using existing @repo/core functions =====

      // Power metrics (if power data exists)
      const normalizedPower =
        rawStreams.power.length > 0
          ? calculateNormalizedPower(rawStreams.power)
          : null;

      // TSS calculation using universal function
      const tss =
        normalizedPower && summary.ftp && summary.duration
          ? calculateTSSFromAvailableData({
              normalizedPower,
              ftp: summary.ftp,
              duration: summary.duration,
              activityType: input.activityType,
            })
          : null;

      // Heart rate zones using @repo/core
      const hrZones =
        rawStreams.heart_rate.length > 0
          ? extractHeartRateZones(rawStreams.heart_rate)
          : null;

      // Power zones using @repo/core
      const powerZones =
        rawStreams.power.length > 0
          ? extractPowerZones(rawStreams.power)
          : null;

      // ===== STEP 6: Detect test efforts using @repo/core =====

      const powerTestEfforts = detectPowerTestEfforts({
        powerStream: rawStreams.power,
        duration: summary.duration,
        activityType: input.activityType,
      });

      const runningTestEfforts = detectRunningTestEfforts({
        paceStream: rawStreams.pace,
        distance: summary.distance,
        duration: summary.duration,
      });

      const hrTestEfforts = detectHRTestEfforts({
        hrStream: rawStreams.heart_rate,
        duration: summary.duration,
      });

      // ===== STEP 7: Calculate performance curves using @repo/core =====

      const powerCurve =
        rawStreams.power.length > 0
          ? calculatePowerCurve(rawStreams.power)
          : null;

      const hrCurve =
        rawStreams.heart_rate.length > 0
          ? calculateHRCurve(rawStreams.heart_rate)
          : null;

      const paceCurve =
        rawStreams.pace.length > 0 ? calculatePaceCurve(rawStreams.pace) : null;

      // ===== STEP 8: Create activity record =====

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
          avgSpeed: summary.avgSpeed,
          maxSpeed: summary.maxSpeed,
          elevationGain: summary.elevationGain,
          elevationLoss: summary.elevationLoss,
          avgCadence: summary.avgCadence,
          maxCadence: summary.maxCadence,
          avgPower: summary.avgPower,
          maxPower: summary.maxPower,

          // Power metrics
          normalizedPower,
          intensityFactor,
          tss,

          // Zone data
          heartRateZones: hrZones,
          powerZones,

          // Test efforts
          powerTestEfforts,
          runningTestEfforts,
          hrTestEfforts,

          // Performance curves
          powerCurve,
          hrCurve,
          paceCurve,

          // Raw stream data (compressed for storage)
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
          cause: insertError,
        });
      }

      // ===== STEP 9: No separate stream storage needed =====
      // All stream data is already stored in activity.metrics.streams
      }

      // ===== STEP 10: Return result =====

      return {
        success: true,
        activity: {
          id: createdActivity.id,
          name: createdActivity.name,
          activityType: createdActivity.activity_type,
          startTime: createdActivity.start_time,
          metrics: activityData.metrics,
        },
      };
    }),
});
```

### Response Types

```typescript
// Response types for processFitFile mutation

export interface ProcessFitFileResponse {
  success: true;
  activity: ProcessedActivity;
  error?: never;
}

export interface ProcessFitFileErrorResponse {
  success: false;
  activity?: never;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ProcessedActivity {
  id: string;
  name: string;
  activityType: string;
  startTime: Date;
  metrics: ActivityMetrics;
}

export interface ActivityMetrics {
  // Basic metrics
  duration: number;
  distance: number;
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  elevationGain?: number;
  elevationLoss?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgPower?: number;
  maxPower?: number;

  // Power metrics
  normalizedPower?: number;
  intensityFactor?: number;
  tss?: number;

  // Zone data
  heartRateZones?: ReturnType<typeof extractHeartRateZones>;
  powerZones?: ReturnType<typeof extractPowerZones>;

  // Test efforts
  powerTestEfforts: ReturnType<typeof detectPowerTestEfforts>;
  runningTestEfforts: ReturnType<typeof detectRunningTestEfforts>;
  hrTestEfforts: ReturnType<typeof detectHRTestEfforts>;

  // Performance curves
  powerCurve?: ReturnType<typeof calculatePowerCurve>;
  hrCurve?: ReturnType<typeof calculateHRCurve>;
  paceCurve?: ReturnType<typeof calculatePaceCurve>;

  // Raw stream data (compressed)
  streams?: {
    gps_points?: Array<{
      lat: number;
      lng: number;
      altitude: number | null;
      timestamp: Date;
    }>;
    power?: number[];
    heart_rate?: number[];
    pace?: number[];
    cadence?: number[];
    altitude?: number[];
    speed?: number[];
  };
}
```

---

## Part 4: What NOT to Implement

### Functions Already in `@repo/core`

**DO NOT implement these - import from `@repo/core`:**

```typescript
// FIT Parsing
import { parseFitFileWithSDK } from "@repo/core/lib/fit-sdk-parser.ts";
import { extractActivitySummary } from "@repo/core/lib/extract-activity-summary.ts";

// TSS and Power Calculations
import { calculateTSSFromAvailableData } from "@repo/core/calculations/tss.ts";
import {
  calculateNormalizedPower,
  calculateIntensityFactor,
} from "@repo/core/calculations.ts";
import {
  calculateVariabilityIndex,
  calculateTotalWork,
} from "@repo/core/calculations.ts";

// Zone Calculations
import {
  extractHeartRateZones,
  extractPowerZones,
} from "@repo/core/lib/extract-zones.ts";

// Test Detection
import { detectPowerTestEfforts } from "@repo/core/detection/power-test.ts";
import { detectRunningTestEfforts } from "@repo/core/detection/running-test.ts";
import { detectHRTestEfforts } from "@repo/core/detection/hr-test.ts";

// Performance Curves
import {
  calculatePowerCurve,
  analyzePowerCurve,
} from "@repo/core/calculations/curves.ts";
import {
  calculatePaceCurve,
  analyzePaceCurve,
} from "@repo/core/calculations/curves.ts";
import {
  calculateHRCurve,
  analyzeHRCurve,
} from "@repo/core/calculations/curves.ts";

// Stream Utilities
import { extractNumericStream } from "@repo/core/utils/extract-streams.ts";
import {
  compressStreamsForStorage,
  decompressStreamsFromStorage,
} from "@repo/core/utils/compression.ts";

// Formatting (if needed)
import {
  formatDuration,
  formatDistance,
  formatPace,
} from "@repo/core/utils/format.ts";
```

### Zod Schemas Already in `@repo/supabase`

**DO NOT define new schemas - import from `@repo/supabase`:**

```typescript
import { publicActivitiesInsertSchema, activityTypeEnum } from "@repo/supabase";
// Note: publicActivityStreamsInsertSchema removed - streams stored in activities.metrics
```

---

## Part 5: Mobile Implementation

### Upload and Process

**apps/mobile/src/utils/fit-processing.ts:**

```typescript
import { supabase } from "./supabase";
import { api } from "~/utils/api";
import * as FileSystem from "expo-file-system";

export async function uploadAndProcessFitFile(
  fileUri: string,
  userId: string,
  name: string,
  notes?: string,
  activityType: "run" | "bike" | "swim" | "walk" | "hike" = "run",
): Promise<ProcessedActivity> {
  // 1. Read file as base64
  const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2. Convert to blob
  const blob = base64ToBlob(fileBase64, "application/fit");

  // 3. Upload to Supabase Storage
  const fileName = `${userId}/${Date.now()}.fit`;
  const { error: uploadError } = await supabase.storage
    .from("activity-files")
    .upload(fileName, blob, {
      contentType: "application/fit",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // 4. Call tRPC mutation to process FIT file
  const client = api.fitFiles.processFitFile.useClient();
  const result = await client.mutate({
    fitFilePath: fileName,
    name,
    notes,
    activityType,
  });

  if (!result.success) {
    // Cleanup uploaded file on failure
    await supabase.storage.from("activity-files").remove([fileName]);
    throw new Error(result.error.message);
  }

  return result.activity;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArrays.push(byteCharacters.charCodeAt(i));
  }

  return new Blob([new Uint8Array(byteArrays)], { type: mimeType });
}
```

---

## Part 6: File Structure

```
packages/trpc/src/
├── routers/
│   ├── fit-files.ts          # NEW: FIT file processing router
│   ├── activities.ts         # Existing: Activity queries/mutations
│   └── ...
├── lib/
│   └── trpc.ts
└── root.ts                   # Register fitFilesRouter

apps/mobile/src/
├── utils/
│   └── fit-processing.ts     # NEW: Upload + process helper
└── screens/
    └── CreateActivity.tsx    # Existing: Activity creation UI
```

---

## Part 7: Testing Strategy

### Unit Tests for Integration Layer

```typescript
// packages/trpc/src/routers/__tests__/fit-files.test.ts

describe("fitFilesRouter", () => {
  describe("processFitFile", () => {
    it("should parse FIT file and create activity with all metrics", async () => {
      // Upload mock FIT file
      // Process with mutation
      // Assert activity created with metrics
      // Assert GPS points stored in activity.metrics.streams.gps_points
    });

    it("should handle missing power data gracefully", async () => {
      // Upload FIT file without power
      // Assert tss is null, no errors
      // Assert other metrics still calculated
    });

    it("should cleanup file on database failure", async () => {
      // Simulate database error
      // Assert uploaded file is deleted
    });

    it("should detect FTP test efforts from power data", async () => {
      // Upload FIT with sustained threshold effort
      // Assert powerTestEfforts contains FTP test
    });

    it("should compress stream data for efficient storage", async () => {
      // Upload FIT file with long recording
      // Assert streams are compressed in activity.metrics.streams
      // Assert decompression yields original data
    });
  });
});
```

---

## Part 8: Implementation Checklist

- [ ] Add `fit_file_path` column to `activities` table
- [ ] Add `processing_status` column to `activities` table
- [ ] Create `packages/trpc/src/routers/fit-files.ts`
- [ ] Register `fitFilesRouter` in root router
- [ ] Add `uploadAndProcessFitFile` helper to mobile app
- [ ] Write unit tests for FIT file processing
- [ ] Test with real FIT files from various devices

---

## Part 9: Summary

### What This Implementation Does

1. **Downloads** FIT file from Supabase Storage
2. **Parses** using existing `parseFitFileWithSDK()` from `@repo/core`
3. **Extracts** activity summary using existing `extractActivitySummary()` from `@repo/core`
4. **Extracts** raw streams from FIT records
5. **Calculates** TSS using existing `calculateTSSFromAvailableData()` from `@repo/core`
6. **Detects** test efforts using existing `detectPowerTestEfforts()` from `@repo/core`
7. **Creates** activity record with all metrics including compressed streams in `activities.metrics.streams`
8. **Returns** complete activity with all computed metrics
9. **Simplifies** architecture by removing the need for a separate `activity_streams` table

### What Already Exists (No Implementation Needed)

- ✅ FIT file parser (`@repo/core/lib/fit-sdk-parser.ts`)
- ✅ TSS calculator (`@repo/core/calculations/tss.ts`)
- ✅ Power metrics (`@repo/core/calculations.ts`)
- ✅ Test detection (`@repo/core/detection/`)
- ✅ Performance curves (`@repo/core/calculations/curves.ts`)
- ✅ Stream utilities (`@repo/core/utils/`)
- ✅ Database schema (`packages/supabase/schemas/init.sql`) - with modifications
- ✅ Zod schemas (`@repo/supabase`)

### What's Different (Simplification)

- ❌ **Removed:** `activity_streams` table
- ✅ **Added:** Stream data stored directly in `activities.metrics.streams`
- ✅ **Benefit:** Single table per activity, simpler queries, no JOINs needed
- ✅ **Benefit:** Stream data compressed for efficient storage
- ✅ **Benefit:** GPS points and all streams accessible with single activity query

---

## Part 8: Implementation Checklist

- [ ] Add `fit_file_path` column to `activities` table
- [ ] Add `processing_status` column to `activities` table
- [ ] **Remove** `activity_streams` table (DROP TABLE)
- [ ] Create `packages/trpc/src/routers/fit-files.ts`
- [ ] Register `fitFilesRouter` in root router
- [ ] Add `uploadAndProcessFitFile` helper to mobile app
- [ ] Write unit tests for FIT file processing
- [ ] Test with real FIT files from various devices
- [ ] Verify stream compression/decompression works correctly
- [ ] Update any existing queries that reference activity_streams table
