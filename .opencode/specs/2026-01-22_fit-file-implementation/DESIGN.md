# FIT File Implementation Specification

**Version:** 6.1.0  
**Created:** January 22, 2026  
**Last Updated:** January 22, 2026  
**Status:** Ready for Implementation  
**Notes:** Version 6.1.0 incorporates VP feedback - metrics now use individual typed columns instead of JSONB

---

## Executive Summary

This specification defines FIT file processing for GradientPeak using a **single synchronous tRPC mutation** that leverages all pre-existing `@repo/core` functions. No code duplication - only integration.

| Decision         | Choice                             | Rationale                                                       |
| ---------------- | ---------------------------------- | --------------------------------------------------------------- |
| **FIT Parser**   | `@repo/core/lib/fit-sdk-parser.ts` | Existing production parser using Garmin SDK                     |
| **Calculations** | `@repo/core` functions             | TSS, power curves, test detection all exist                     |
| **Processing**   | Next.js/tRPC mutation              | Single synchronous request                                      |
| **Database**     | Supabase client                    | Uses existing `activities` table with individual metric columns |
| **Stream Data**  | Raw FIT file in Supabase Storage   | Stream data remains only in the original FIT file               |

**Key Finding:** All 50+ calculation, parsing, and detection functions already exist in `@repo/core`. This spec only defines the integration layer.

**Key Schema Change:** All metrics stored as individual typed columns (NOT JSONB) for type safety and query performance.

---

## Part 1: Data Flow

### Synchronous Processing Flow (Upload)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FIT FILE UPLOAD AND PROCESSING FLOW                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Mobile uploads FIT to Supabase Storage                                  │
│  2. Mobile calls tRPC mutation `fitFiles.processFitFile`                    │
│  3. Mutation downloads file from Storage                                    │
│  4. Mutation parses using `parseFitFileWithSDK()` from @repo/core           │
│  5. Mutation calculates metrics using existing @repo/core functions         │
│  6. Mutation creates activity with individual metric columns                │
│  7. Mutation returns activity with all computed metrics                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Asynchronous Stream Parsing (Activity Detail View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ACTIVITY DETAIL - FIT FILE PARSING                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User views activity detail page                                         │
│  2. Page loads activity with computed metrics (from columns)                │
│  3. If user requests GPS/charts/analysis:                                   │
│     a. Frontend requests FIT file from Supabase Storage                     │
│     b. Stream data parsed asynchronously on-demand                          │
│     c. Parsed streams cached locally for session                            │
│     d. Map/charts render with stream data                                   │
│                                                                              │
│  NOTE: Stream data NOT stored in database - only in raw FIT file            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Already Exists

| Component       | Location                             | Status                                    |
| --------------- | ------------------------------------ | ----------------------------------------- |
| FIT Parser      | `@repo/core/lib/fit-sdk-parser.ts`   | ✅ Production ready                       |
| TSS Calculation | `@repo/core/calculations/tss.ts`     | ✅ `calculateTSSFromAvailableData()`      |
| Power Curves    | `@repo/core/calculations/curves.ts`  | ✅ `calculatePowerCurve()`                |
| Test Detection  | `@repo/core/detection/`              | ✅ `detectPowerTestEfforts()`             |
| Database Schema | `packages/supabase/schemas/init.sql` | ✅ `activities` table with metric columns |

**Note:** `activity_streams` table removed. Stream data remains only in raw FIT file.

---

## Part 2: Database Schema

### Database Schema (Individual Metric Columns)

All metrics stored as individual typed columns for type safety and query performance. No JSONB columns.

```sql
-- activities table columns for FIT file support
-- All metrics are individual typed columns (NOT JSONB)

-- Core identification columns
-- id, user_id, name, notes, activity_type (existing)

-- FIT file tracking
ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN fit_file_size BIGINT;
ALTER TABLE activities ADD COLUMN processing_status TEXT DEFAULT 'pending';
ALTER TABLE activities ADD COLUMN processing_error TEXT;

-- Core metrics (duration, distance, elevation)
ALTER TABLE activities ADD COLUMN duration_seconds INTEGER;
ALTER TABLE activities ADD COLUMN distance_meters INTEGER;
ALTER TABLE activities ADD COLUMN calories INTEGER;
ALTER TABLE activities ADD COLUMN elevation_gain_meters INTEGER;
ALTER TABLE activities ADD COLUMN elevation_loss_meters INTEGER;

-- Heart rate metrics
ALTER TABLE activities ADD COLUMN avg_heart_rate INTEGER;
ALTER TABLE activities ADD COLUMN max_heart_rate INTEGER;

-- Power metrics
ALTER TABLE activities ADD COLUMN avg_power INTEGER;
ALTER TABLE activities ADD COLUMN max_power INTEGER;
ALTER TABLE activities ADD COLUMN normalized_power INTEGER;
ALTER TABLE activities ADD COLUMN intensity_factor DECIMAL(4,3);
ALTER TABLE activities ADD COLUMN training_stress_score DECIMAL(6,2);

-- Cadence metrics
ALTER TABLE activities ADD COLUMN avg_cadence INTEGER;
ALTER TABLE activities ADD COLUMN max_cadence INTEGER;

-- Speed metrics
ALTER TABLE activities ADD COLUMN avg_speed_mps DECIMAL(6,3);
ALTER TABLE activities ADD COLUMN max_speed_mps DECIMAL(6,3);

-- Time columns (existing: start_time, created_at, updated_at)
```

### Stream Data Storage

**Stream data remains ONLY in the raw FIT file in Supabase Storage.**

- No `activity_streams` table
- No stream data in database columns
- Stream data parsed on-demand when viewing activity detail
- Raw FIT file always available for re-parsing

**Rationale:**

- Eliminates data duplication (streams already in FIT file)
- No compression/decompression needed
- Smaller database footprint
- Always have original source for re-processing

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

      // ===== STEP 4: Calculate metrics using existing @repo/core functions =====

      // Power metrics (if power data exists)
      const normalizedPower =
        summary.avgPower && summary.avgPower > 0
          ? calculateNormalizedPower(summary.avgPower)
          : null;

      // Intensity Factor
      const intensityFactor =
        normalizedPower && summary.ftp
          ? calculateIntensityFactor(normalizedPower, summary.ftp)
          : null;

      // TSS calculation using universal function
      const trainingStressScore =
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
        summary.avgHeartRate && summary.avgHeartRate > 0
          ? extractHeartRateZones(summary.avgHeartRate)
          : null;

      // ===== STEP 5: Detect test efforts using @repo/core =====

      const powerTestEfforts = detectPowerTestEfforts({
        avgPower: summary.avgPower || 0,
        duration: summary.duration || 0,
        activityType: input.activityType,
      });

      const runningTestEfforts = detectRunningTestEfforts({
        avgPace: summary.avgPace || 0,
        distance: summary.distance || 0,
        duration: summary.duration || 0,
      });

      const hrTestEfforts = detectHRTestEfforts({
        avgHeartRate: summary.avgHeartRate || 0,
        duration: summary.duration || 0,
      });

      // ===== STEP 6: Calculate performance curves using @repo/core =====

      const powerCurve = summary.avgPower
        ? calculatePowerCurve(summary.avgPower)
        : null;

      const hrCurve = summary.avgHeartRate
        ? calculateHRCurve(summary.avgHeartRate)
        : null;

      const paceCurve = summary.avgPace
        ? calculatePaceCurve(summary.avgPace)
        : null;

      // ===== STEP 7: Create activity record with individual metric columns =====

      const activityData = {
        user_id: userId,
        name: input.name,
        notes: input.notes,
        activity_type: input.activityType,
        fit_file_path: input.fitFilePath,
        fit_file_size: fitFile.size || null,
        processing_status: "completed",
        start_time: new Date(summary.startTime),

        // Core metrics - individual columns
        duration_seconds: summary.duration || null,
        distance_meters: summary.distance || null,
        calories: summary.calories || null,
        elevation_gain_meters: summary.elevationGain || null,
        elevation_loss_meters: summary.elevationLoss || null,

        // Heart rate metrics
        avg_heart_rate: summary.avgHeartRate || null,
        max_heart_rate: summary.maxHeartRate || null,

        // Power metrics
        avg_power: summary.avgPower || null,
        max_power: summary.maxPower || null,
        normalized_power: normalizedPower,
        intensity_factor: intensityFactor,
        training_stress_score: trainingStressScore,

        // Cadence metrics
        avg_cadence: summary.avgCadence || null,
        max_cadence: summary.maxCadence || null,

        // Speed metrics
        avg_speed_mps: summary.avgSpeed || null,
        max_speed_mps: summary.maxSpeed || null,
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

      // ===== STEP 8: Return result =====

      return {
        success: true,
        activity: {
          id: createdActivity.id,
          name: createdActivity.name,
          activityType: createdActivity.activity_type,
          startTime: createdActivity.start_time,
          metrics: {
            duration_seconds: createdActivity.duration_seconds,
            distance_meters: createdActivity.distance_meters,
            calories: createdActivity.calories,
            elevation_gain_meters: createdActivity.elevation_gain_meters,
            elevation_loss_meters: createdActivity.elevation_loss_meters,
            avg_heart_rate: createdActivity.avg_heart_rate,
            max_heart_rate: createdActivity.max_heart_rate,
            avg_power: createdActivity.avg_power,
            max_power: createdActivity.max_power,
            normalized_power: createdActivity.normalized_power,
            intensity_factor: createdActivity.intensity_factor,
            training_stress_score: createdActivity.training_stress_score,
            avg_cadence: createdActivity.avg_cadence,
            max_cadence: createdActivity.max_cadence,
            avg_speed_mps: createdActivity.avg_speed_mps,
            max_speed_mps: createdActivity.max_speed_mps,
          },
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
  // Core metrics
  duration_seconds?: number | null;
  distance_meters?: number | null;
  calories?: number | null;
  elevation_gain_meters?: number | null;
  elevation_loss_meters?: number | null;

  // Heart rate metrics
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;

  // Power metrics
  avg_power?: number | null;
  max_power?: number | null;
  normalized_power?: number | null;
  intensity_factor?: number | null;
  training_stress_score?: number | null;

  // Cadence metrics
  avg_cadence?: number | null;
  max_cadence?: number | null;

  // Speed metrics
  avg_speed_mps?: number | null;
  max_speed_mps?: number | null;
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

// Stream Utilities (for on-demand parsing in activity detail)
import { extractNumericStream } from "@repo/core/utils/extract-streams.ts";

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
```

### What Was Removed

- ❌ `activity_streams` table - stream data remains only in raw FIT file
- ❌ `metrics` JSONB column - all metrics stored as individual columns
- ❌ Stream compression utilities - no longer needed
- ❌ `publicActivityStreamsInsertSchema` - schema removed

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

### Activity Detail - On-Demand FIT Parsing

**apps/mobile/src/hooks/useActivityStreams.ts:**

```typescript
import { useState, useCallback } from "react";
import { supabase } from "~/utils/supabase";
import { parseFitFileWithSDK } from "@repo/core";

export function useActivityStreams() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStreams = useCallback(async (fitFilePath: string) => {
    setLoading(true);
    setError(null);

    try {
      // Download FIT file from storage
      const { data: fitFile, error: downloadError } = await supabase.storage
        .from("activity-files")
        .download(fitFilePath);

      if (downloadError || !fitFile) {
        throw new Error("Failed to download FIT file");
      }

      // Parse FIT file
      const arrayBuffer = await fitFile.arrayBuffer();
      const parseResult = await parseFitFileWithSDK(arrayBuffer);

      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || "Failed to parse FIT file");
      }

      return parseResult.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loadStreams, loading, error };
}
```

### Mobile Activity Detail Page Integration

**apps/mobile/src/screens/activity-detail.tsx:**

```typescript
import { useLocalSearchParams } from "expo-router";
import { trpc } from "~/utils/api";
import { useActivityStreams } from "~/hooks/useActivityStreams";
import { StreamChart } from "~/components/StreamChart";
import { PastActivityCard } from "~/components/PastActivityCard";

export function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadStreams, loading: streamsLoading, error: streamsError } = useActivityStreams();

  // ===== STEP 1: Load activity data synchronously from database =====
  // Uses existing tRPC endpoint - loads activity with computed metrics (from columns)
  const { data: activity, isLoading: activityLoading } = trpc.activities.get.useQuery(
    { id },
    {
      enabled: !!id,
    }
  );

  // ===== STEP 2: Load streams asynchronously when needed =====
  const [streams, setStreams] = useState<FitParseResult | null>(null);

  const handleLoadStreams = useCallback(async () => {
    if (!activity?.fit_file_path) return;

    const result = await loadStreams(activity.fit_file_path);
    if (result) {
      setStreams(result);
    }
  }, [activity?.fit_file_path, loadStreams]);

  if (activityLoading) return <LoadingSpinner />;
  if (!activity) return <NotFound />;

  return (
    <ScrollView>
      {/* Activity summary - loads immediately from database */}
      <ActivitySummary activity={activity} />

      {/* GPS Map - loads immediately if pre-planned route, otherwise waits for streams */}
      <ActivityMap
        activity={activity}
        streams={streams}
        onLoadStreams={handleLoadStreams}
        streamsLoading={streamsLoading}
      />

      {/* Charts - show loading state until streams loaded */}
      {streams ? (
        <StreamChart
          streams={streams}
          activityType={activity.activity_type}
        />
      ) : (
        <ChartPlaceholder
          onLoad={handleLoadStreams}
          loading={streamsLoading}
          error={streamsError}
        />
      )}
    </ScrollView>
  );
}
```

**Key Integration Points:**

1. **Synchronous Load:** Uses `trpc.activities.get.useQuery()` to load activity data immediately from database columns (metrics, duration, etc.)

2. **Asynchronous Streams:** FIT file download and parsing happens only when user interacts with charts/maps or when streams are required for display

3. **Conditional Rendering:** Maps show immediately if activity has a pre-planned route; otherwise, display placeholder until streams load

4. **Error Handling:** Graceful fallbacks if FIT file is unavailable or parsing fails

5. **Performance:** Activity detail page loads instantly; stream data loads on-demand to keep initial page load fast

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
      // Assert activity created with all metric columns populated
    });

    it("should handle missing power data gracefully", async () => {
      // Upload FIT file without power
      // Assert power metrics are null, no errors
      // Assert other metrics still calculated
    });

    it("should cleanup file on database failure", async () => {
      // Simulate database error
      // Assert uploaded file is deleted
    });

    it("should detect FTP test efforts from power data", async () => {
      // Upload FIT with sustained threshold effort
      // Assert training_stress_score calculated correctly
    });

    it("should set processing_status correctly", async () => {
      // Upload FIT file
      // Assert processing_status = "completed"
    });
  });
});
```

---

## Part 8: Implementation Checklist

### Database Schema Setup

- [ ] Add `fit_file_path` TEXT column to `activities` table
- [ ] Add `fit_file_size` BIGINT column to `activities` table
- [ ] Add `processing_status` TEXT column to `activities` table
- [ ] Add `processing_error` TEXT column to `activities` table
- [ ] Add `duration_seconds` INTEGER column to `activities` table
- [ ] Add `distance_meters` INTEGER column to `activities` table
- [ ] Add `calories` INTEGER column to `activities` table
- [ ] Add `elevation_gain_meters` INTEGER column to `activities` table
- [ ] Add `elevation_loss_meters` INTEGER column to `activities` table
- [ ] Add `avg_heart_rate` INTEGER column to `activities` table
- [ ] Add `max_heart_rate` INTEGER column to `activities` table
- [ ] Add `avg_power` INTEGER column to `activities` table
- [ ] Add `max_power` INTEGER column to `activities` table
- [ ] Add `normalized_power` INTEGER column to `activities` table
- [ ] Add `intensity_factor` DECIMAL(4,3) column to `activities` table
- [ ] Add `training_stress_score` DECIMAL(6,2) column to `activities` table
- [ ] Add `avg_cadence` INTEGER column to `activities` table
- [ ] Add `max_cadence` INTEGER column to `activities` table
- [ ] Add `avg_speed_mps` DECIMAL(6,3) column to `activities` table
- [ ] Add `max_speed_mps` DECIMAL(6,3) column to `activities` table
- [ ] Add indexes for commonly queried columns (processing_status, user_id, start_time)

### tRPC Router

- [ ] Create `packages/trpc/src/routers/fit-files.ts`
- [ ] Register `fitFilesRouter` in root router
- [ ] Implement processFitFile mutation with individual metric columns

### Mobile App

- [ ] Add `uploadAndProcessFitFile` helper to mobile app
- [ ] Add `useActivityStreams` hook for on-demand FIT parsing
- [ ] Update ActivityDetailScreen to load streams asynchronously

### Testing

- [ ] Write unit tests for FIT file processing
- [ ] Test with real FIT files from various devices (Garmin, Wahoo, COROS)
- [ ] Verify all metric columns populate correctly
- [ ] Verify stream parsing works on-demand

---

## Part 9: Summary

### What This Implementation Does

1. **Downloads** FIT file from Supabase Storage
2. **Parses** using existing `parseFitFileWithSDK()` from `@repo/core`
3. **Extracts** activity summary using existing `extractActivitySummary()` from `@repo/core`
4. **Calculates** metrics using existing `@repo/core` functions (TSS, power, zones, etc.)
5. **Creates** activity record with all metrics as **individual typed columns**
6. **Stores** stream data only in raw FIT file (not in database)
7. **Returns** complete activity with all computed metrics
8. **Supports** on-demand stream parsing for activity detail view

### What Already Exists (No Implementation Needed)

- ✅ FIT file parser (`@repo/core/lib/fit-sdk-parser.ts`)
- ✅ TSS calculator (`@repo/core/calculations/tss.ts`)
- ✅ Power metrics (`@repo/core/calculations.ts`)
- ✅ Test detection (`@repo/core/detection/`)
- ✅ Performance curves (`@repo/core/calculations/curves.ts`)
- ✅ Database schema (`packages/supabase/schemas/init.sql`) - needs metric columns
- ✅ Zod schemas (`@repo/supabase`)

### What's Different (VP Feedback Incorporated)

- ✅ **Removed:** `metrics` JSONB column
- ✅ **Removed:** `activity_streams` table
- ✅ **Added:** 20 individual typed metric columns for type safety
- ✅ **Added:** Stream data remains only in raw FIT file in Supabase Storage
- ✅ **Added:** On-demand FIT parsing for activity detail view (async pattern)
- ✅ **Benefit:** Type-safe queries with individual columns
- ✅ **Benefit:** No data duplication - streams stay in original FIT file
- ✅ **Benefit:** Smaller database footprint
- ✅ **Benefit:** Always have original source for re-processing
