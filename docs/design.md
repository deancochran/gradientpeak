# FIT Integration Design Specification

**Generated:** January 22, 2026  
**Status:** Implementation Design  
**Based On:** FIT_IMPLEMENTATION_REVIEW.md

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Database Changes](#2-database-changes)
3. [Core Package Changes](#3-core-package-changes)
4. [TRPC Layer Changes](#4-trpc-layer-changes)
5. [Mobile App Changes](#5-mobile-app-changes)
6. [Garmin SDK Integration](#6-garmin-sdk-integration)
7. [Encoding/Decoding Changes](#7-encodingdecoding-changes)
8. [FIT File Storage Changes](#8-fit-file-storage-changes)
9. [Supabase Edge Function Changes](#9-supabase-edge-function-changes)
10. [Refactoring Changes](#10-refactoring-changes)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Verification Checklist](#12-verification-checklist)

---

## 1. Executive Summary

### Current State Assessment

The FIT implementation review revealed significant gaps between documented and actual implementation status:

| Metric                 | Value |
| ---------------------- | ----- |
| Total Deliverables     | 26    |
| Actually Complete      | 16    |
| Actually Partial       | 5     |
| Actually Missing       | 5     |
| Documentation Accuracy | ~38%  |

### Critical Findings

1. **CRITICAL-01:** Edge function uses mock parser generating fake data instead of real FIT parsing
2. **CRITICAL-02:** Database triggers for auto-invoking edge function are missing
3. **CRITICAL-03:** Backend FIT encoder (`packages/core/lib/fit-encoder.ts`) is not implemented
4. **Part 6:** `StreamingFitEncoder` and `FitUploader` are complete but NOT integrated into the recording/submission flow

### Design Goals

This design specification addresses:

- Replace mock parser with real Garmin FIT SDK
- Implement database triggers for automatic processing
- Create backend FIT encoder for server-side encoding
- Integrate existing mobile components into recording flow
- Add crash recovery and storage quota enforcement
- Implement dead letter queue for failed uploads

---

## 2. Database Changes

### 2.1 New Tables Required

#### 2.1.1 Failed Uploads Table (Dead Letter Queue)

**Purpose:** Track failed FIT file uploads with retry logic

```sql
CREATE TYPE public.upload_failure_reason AS ENUM (
  'network_error',
  'validation_failed',
  'parsing_error',
  'storage_error',
  'timeout',
  'quota_exceeded',
  'unknown'
);

CREATE TABLE IF NOT EXISTS public.failed_uploads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  idx serial UNIQUE NOT NULL,

  -- References
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Upload attempt metadata
  fit_file_path TEXT NOT NULL,
  fit_file_size INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,

  -- Failure details
  first_failure_at timestamptz NOT NULL DEFAULT now(),
  last_error_message TEXT,
  error_code TEXT,
  failure_reason upload_failure_reason,

  -- Resolution tracking
  resolved_at timestamptz,
  resolution_action TEXT,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_uploads_profile_id
  ON public.failed_uploads(profile_id);

CREATE INDEX IF NOT EXISTS idx_failed_uploads_next_retry
  ON public.failed_uploads(next_retry_at)
  WHERE resolved_at IS NULL AND next_retry_at <= now();

CREATE INDEX IF NOT EXISTS idx_failed_uploads_activity_id
  ON public.failed_uploads(activity_id);
```

#### 2.1.2 Activity Checkpoints Table

**Purpose:** Store crash recovery checkpoints for mobile recording sessions

```sql
CREATE TABLE IF NOT EXISTS public.activity_checkpoints (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  idx serial UNIQUE NOT NULL,

  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  checkpoint_sequence INTEGER NOT NULL DEFAULT 0,
  checkpoint_data JSONB NOT NULL,
  checkpoint_file_path TEXT,

  checkpoint_at timestamptz NOT NULL DEFAULT now(),
  is_recovered BOOLEAN NOT NULL DEFAULT FALSE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_activity_id
  ON public.activity_checkpoints(activity_id);

CREATE INDEX IF NOT EXISTS idx_checkpoints_unrecovered
  ON public.activity_checkpoints(activity_id)
  WHERE is_recovered = FALSE AND is_final = FALSE;
```

#### 2.1.3 Storage Quotas Table

**Purpose:** Track per-user storage usage for quota enforcement

```sql
CREATE TABLE IF NOT EXISTS public.storage_quotas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_name TEXT NOT NULL UNIQUE,
  max_storage_bytes BIGINT NOT NULL DEFAULT 10737418240,
  max_file_size_bytes BIGINT NOT NULL DEFAULT 524288000,
  max_activities INTEGER NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.storage_quotas (tier_name, max_storage_bytes, max_file_size_bytes, max_activities)
VALUES
  ('free', 5368709120, 104857600, 100),
  ('premium', 53687091200, 524288000, 10000)
ON CONFLICT (tier_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.storage_usage (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_usage_bytes BIGINT NOT NULL DEFAULT 0,
  activity_count INTEGER NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  tier_name TEXT NOT NULL DEFAULT 'free' REFERENCES public.storage_quotas(tier_name),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 2.2 Database Triggers

#### 2.2.1 FIT Processing Trigger

```sql
CREATE OR REPLACE FUNCTION public.update_fit_processing_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND
      (NEW.fit_file_path IS DISTINCT FROM OLD.fit_file_path)) THEN
    IF NEW.fit_file_path IS NOT NULL THEN
      NEW.processing_status := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_fit_file_upload_status
  BEFORE INSERT OR UPDATE OF fit_file_path ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fit_processing_status();
```

#### 2.2.2 Storage Usage Auto-Update

```sql
CREATE OR REPLACE FUNCTION public.update_storage_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.fit_file_path IS NOT NULL THEN
    UPDATE public.storage_usage
    SET
      current_usage_bytes = current_usage_bytes + COALESCE(NEW.fit_file_size, 0),
      activity_count = activity_count + 1,
      last_calculated_at = now()
    WHERE profile_id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_storage_on_activity_change
  AFTER INSERT OR UPDATE OF fit_file_path, fit_file_size ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_storage_usage();
```

### 2.3 New Views

#### 2.3.1 Activities with FIT Data View

```sql
CREATE OR REPLACE VIEW public.v_activities_with_fit_data AS
SELECT
  a.id AS activity_id,
  a.idx AS activity_idx,
  a.profile_id,
  a.name AS activity_name,
  a.type AS activity_type,
  a.started_at,
  a.finished_at,
  a.duration_seconds,
  a.distance_meters,
  a.fit_file_path,
  a.fit_file_size,
  a.fit_file_version,
  a.processing_status,
  a.metrics->>'avg_heart_rate' AS avg_heart_rate,
  a.metrics->>'normalized_power' AS normalized_power,
  a.metrics->>'tss' AS tss,
  a.metrics->>'if' AS intensity_factor,
  p.username,
  p.preferred_units
FROM public.activities a
LEFT JOIN public.profiles p ON a.profile_id = p.id;
```

### 2.4 Migration Files to Create

| File                                             | Priority | Purpose                       |
| ------------------------------------------------ | -------- | ----------------------------- |
| `YYYYMMDDHHMMSS_add_fit_processing_trigger.sql`  | Critical | Auto-update processing status |
| `YYYYMMDDHHMMSS_create_failed_uploads_queue.sql` | Medium   | Dead letter queue             |
| `YYYYMMDDHHMMSS_create_activity_checkpoints.sql` | Medium   | Crash recovery checkpoints    |
| `YYYYMMDDHHMMSS_create_storage_quotas.sql`       | Low      | Storage quota tracking        |
| `YYYYMMDDHHMMSS_create_activities_fit_view.sql`  | Medium   | Activity + FIT view           |

---

## 3. Core Package Changes

### 3.1 Backend FIT Encoder (CRITICAL-03)

**File:** `packages/core/lib/fit-encoder.ts`  
**Status:** MISSING - Must be implemented

#### 3.1.1 Architecture Overview

The backend encoder differs fundamentally from the mobile encoder:

| Aspect   | Mobile Encoder             | Backend Encoder        |
| -------- | -------------------------- | ---------------------- |
| Runtime  | React Native / Expo        | Node.js                |
| Storage  | FileSystem (disk)          | In-memory buffers      |
| Recovery | Checkpoints to disk        | Not needed (stateless) |
| Buffer   | `Uint8Array` + FileSystem  | Pure `Uint8Array`      |
| Polyfill | Requires `Buffer` polyfill | Native Node.js Buffer  |

#### 3.1.2 Interface Definition

```typescript
export interface FitRecord {
  timestamp: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  temperature?: number;
}

export interface FitSessionData {
  startTime: number;
  totalTime: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  avgPower?: number;
  maxPower?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
  totalAscent?: number;
  totalDescent?: number;
  calories?: number;
}

export interface FitEncoderConfig {
  manufacturer: string;
  deviceProduct: string;
  softwareVersion: string;
  hardwareVersion: number;
  userId: string;
}

export class BackendFitEncoder {
  constructor(config: Partial<FitEncoderConfig>);

  initialize(): Promise<void>;
  addRecord(record: FitRecord): Promise<void>;
  addRecords(records: FitRecord[]): Promise<void>;
  finalize(sessionData: FitSessionData, laps?: FitLapData[]): Promise<void>;
  getFile(): Promise<Uint8Array>;
  getFileSize(): number;
  getStatus(): EncoderStatus;
  destroy(): void;
}
```

#### 3.1.3 Implementation Structure

```typescript
import { CRC16 } from "./crc";
import { FitProtocol } from "./protocol";

export class BackendFitEncoder {
  private dataBuffer: Uint8Array;
  private currentCrc: number;
  private messageDefinitions: Map<number, any>;
  private recordCount: number;
  private fileId: FileIdMessage;

  constructor(config: Partial<FitEncoderConfig>) {
    this.dataBuffer = new Uint8Array(0);
    this.currentCrc = 0;
    this.messageDefinitions = new Map();
    this.recordCount = 0;
    this.fileId = this.createFileId(config);
  }

  async initialize(): Promise<void> {
    // Write file header
    const header = this.createFileHeader();
    this.appendToBuffer(header);
    // Write file_id message
    await this.writeMessage(this.fileId);
  }

  async addRecord(record: FitRecord): Promise<void> {
    const message = this.createRecordMessage(record);
    await this.writeMessage(message);
    this.recordCount++;
  }

  async finalize(
    sessionData: FitSessionData,
    laps?: FitLapData[],
  ): Promise<void> {
    // Write session message
    const session = this.createSessionMessage(sessionData);
    await this.writeMessage(session);

    // Write lap messages if provided
    if (laps) {
      for (const lap of laps) {
        await this.writeMessage(lap);
      }
    }

    // Write CRC
    this.appendCrc();

    // Write end of file
    this.writeEndOfFile();
  }

  async getFile(): Promise<Uint8Array> {
    return this.dataBuffer;
  }

  private async writeMessage(message: FitMessage): Promise<void> {
    // Check if definition exists
    if (!this.messageDefinitions.has(message.globalMessageNumber)) {
      await this.writeDefinition(message);
    }

    // Write data record
    const data = this.encodeMessage(message);
    this.appendToBuffer(data);
    this.updateCrc(data);
  }

  private appendToBuffer(data: Uint8Array): void {
    const newBuffer = new Uint8Array(this.dataBuffer.length + data.length);
    newBuffer.set(this.dataBuffer);
    newBuffer.set(data, this.dataBuffer.length);
    this.dataBuffer = newBuffer;
  }
}
```

### 3.2 Shared Type Definitions

**File:** `packages/core/lib/fit-types.ts` (NEW)

Extract shared types to avoid duplication:

```typescript
export const FIT_EPOCH_OFFSET = 631065600;

export enum FitSport {
  RUNNING = 1,
  CYCLING = 2,
  SWIMMING = 3,
  STRENGTH_TRAINING = 4,
  TRANSITION = 5,
  FITNESS_EQUIPMENT = 6,
  HIKING = 7,
  WALKING = 8,
}

export interface FitRecord {
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

export interface FitSession {
  sport?: number;
  start_time?: number;
  timestamp?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_ascent?: number;
  total_descent?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  max_cadence?: number;
  total_calories?: number;
  name?: string;
}

export function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}

export function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}
```

### 3.3 Core Package Exports Update

**File:** `packages/core/index.ts`

Add new exports:

```typescript
export * from "./lib/fit-encoder";
export * from "./lib/fit-types";
export * from "./lib/fit-parser";
export * from "./lib/fit-sdk-parser";
```

### 3.4 Files to Create/Modify

| File                               | Change Type | Purpose                           |
| ---------------------------------- | ----------- | --------------------------------- |
| `packages/core/lib/fit-encoder.ts` | Create      | Backend FIT encoder (CRITICAL-03) |
| `packages/core/lib/fit-types.ts`   | Create      | Shared type definitions           |
| `packages/core/lib/crc.ts`         | Create      | CRC16 calculation utility         |
| `packages/core/index.ts`           | Modify      | Add encoder export                |
| `apps/mobile/metro.config.js`      | Create      | Buffer polyfill configuration     |

---

## 4. TRPC Layer Changes

### 4.1 New Endpoints Required

#### 4.1.1 Failed Uploads Router

**File:** `packages/trpc/src/routers/failed-uploads.ts` (NEW)

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const failedUploadsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        status: z.enum(["pending", "retrying", "failed"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("failed_uploads")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      return { failedUploads: data || [] };
    }),

  retry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Re-queue failed upload for processing
      const { error } = await ctx.supabase
        .from("failed_uploads")
        .update({
          status: "retrying",
          attempt_count: 0,
          next_retry_at: new Date().toISOString(),
        })
        .eq("id", input.id);

      return { success: !error };
    }),

  resolve: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        action: z.enum(["retry", "ignore", "manual_intervention"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("failed_uploads")
        .update({
          resolved: true,
          resolution_action: input.action,
          resolved_by: ctx.session.user.id,
        })
        .eq("id", input.id);

      return { success: !error };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("failed_uploads")
      .select("status", { count: "exact" })
      .eq("profile_id", ctx.session.user.id)
      .eq("resolved", false);

    return { counts: data };
  }),
});
```

#### 4.1.2 Enhanced fit-files Router

**File:** `packages/trpc/src/routers/fit-files.ts`

Add dead letter queue integration:

```typescript
analyzeFitFile: protectedProcedure
  .input(analyzeFitFileInput)
  .mutation(async ({ ctx, input }) => {
    try {
      // Invoke edge function with retry
      const result = await invokeEdgeFunctionWithRetry(
        ctx.supabase,
        'analyze-fit-file',
        { activityId: input.activityId }
      );

      return { success: true, data: result };
    } catch (error) {
      // Store in dead letter queue if max retries exceeded
      await storeInDeadLetterQueue(ctx.supabase, {
        activityId: input.activityId,
        profileId: ctx.session.user.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }),
```

### 4.2 Error Handling Improvements

Add error categorization:

```typescript
// packages/trpc/src/errors.ts
export const FitUploadErrorCode = z.enum([
  "PARSE_ERROR",
  "VALIDATION_ERROR",
  "NETWORK_ERROR",
  "STORAGE_ERROR",
  "QUOTA_EXCEEDED",
  "EDGE_FUNCTION_ERROR",
]);

export type FitUploadErrorCode = z.infer<typeof FitUploadErrorCode>;

export class FitUploadError extends Error {
  constructor(
    message: string,
    public code: FitUploadErrorCode,
    public retryable: boolean = false,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "FitUploadError";
  }
}
```

### 4.3 Summary of TRPC Changes

| Change                                   | Priority | File                                          |
| ---------------------------------------- | -------- | --------------------------------------------- |
| Add failed-uploads router                | Medium   | `packages/trpc/src/routers/failed-uploads.ts` |
| Integrate dead letter queue in fit-files | Medium   | `packages/trpc/src/routers/fit-files.ts`      |
| Add error categorization                 | Low      | `packages/trpc/src/errors.ts`                 |
| Add batch processing endpoints           | Low      | `packages/trpc/src/routers/fit-files.ts`      |

---

## 5. Mobile App Changes

### 5.1 StreamBuffer Checkpoint Recovery (MEDIUM-03)

**File:** `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts`

Add checkpoint methods:

```typescript
export class StreamBuffer {
  private lastCheckpointTime: number = 0;
  private checkpointIntervalMs: number = 60000;
  private sessionId: string = "";

  async checkpoint(): Promise<void> {
    if (this.readings.size === 0 && this.locations.length === 0) {
      return;
    }

    await this.flushToFiles();

    const checkpoint = {
      sessionId: this.sessionId,
      chunkIndex: this.chunkIndex,
      lastFlushTime: this.lastFlushTime.toISOString(),
      readingsKeys: Array.from(this.readings.keys()),
      locationsCount: this.locations.length,
      createdAt: Date.now(),
    };

    const checkpointPath = `${this.storageDir.uri}/checkpoint.json`;
    await FileSystem.writeAsStringAsync(
      checkpointPath,
      JSON.stringify(checkpoint),
      { encoding: "utf8" },
    );

    this.lastCheckpointTime = Date.now();
  }

  static async recoverFromCheckpoint(
    sessionId: string,
  ): Promise<{ recovered: boolean; chunkIndex: number } | null> {
    const storageDir = new Directory(Paths.cache, sessionId);
    const checkpointPath = `${storageDir.uri}/checkpoint.json`;

    try {
      const checkpointInfo = await FileSystem.getInfoAsync(checkpointPath);
      if (!checkpointInfo.exists) {
        return null;
      }

      const checkpoint = JSON.parse(
        await FileSystem.readAsStringAsync(checkpointPath, {
          encoding: "utf8",
        }),
      );

      // Check if stale (>24 hours)
      if (Date.now() - checkpoint.createdAt > 24 * 60 * 60 * 1000) {
        return null;
      }

      return { recovered: true, chunkIndex: checkpoint.chunkIndex };
    } catch {
      return null;
    }
  }

  async clearCheckpoint(): Promise<void> {
    const checkpointPath = `${this.storageDir.uri}/checkpoint.json`;
    const checkpointInfo = await FileSystem.getInfoAsync(checkpointPath);
    if (checkpointInfo.exists) {
      await FileSystem.deleteAsync(checkpointPath);
    }
  }
}
```

### 5.2 Storage Quota Enforcement (MEDIUM-01)

**File:** `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts`

Add quota methods:

```typescript
export class StreamBuffer {
  private static readonly STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;
  private static readonly WARNING_THRESHOLD = 0.8;

  async getStorageUsage(): Promise<{
    totalBytes: number;
    recordingCount: number;
    oldestRecording: Date | null;
    newestRecording: Date | null;
  }> {
    const cacheDir = new Directory(Paths.cache);
    const contents = cacheDir.list();

    const recordingDirs = contents.filter(
      (item) => item instanceof Directory && item.uri.includes("recording_"),
    );

    let totalBytes = 0;
    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    for (const dir of recordingDirs) {
      const dirContents = (dir as Directory).list();
      for (const item of dirContents) {
        if (item instanceof File) {
          const info = await (item as File).getInfoAsync();
          totalBytes += info.size || 0;
        }
      }
    }

    return {
      totalBytes,
      recordingCount: recordingDirs.length,
      oldestRecording: oldestDate,
      newestRecording: newestDate,
    };
  }

  async enforceStorageQuota(): Promise<{
    freedBytes: number;
    deletedRecordings: number;
    isOverQuota: boolean;
  }> {
    const usage = await this.getStorageUsage();

    if (usage.totalBytes < StreamBuffer.STORAGE_QUOTA_BYTES) {
      return { freedBytes: 0, deletedRecordings: 0, isOverQuota: false };
    }

    // Delete oldest recordings until under quota
    // Implementation details...
  }

  async checkStorageQuota(): Promise<{
    shouldWarn: boolean;
    shouldEnforce: boolean;
    usagePercent: number;
  }> {
    const usage = await this.getStorageUsage();
    const usagePercent = usage.totalBytes / StreamBuffer.STORAGE_QUOTA_BYTES;

    return {
      shouldWarn: usagePercent >= StreamBuffer.WARNING_THRESHOLD,
      shouldEnforce: usagePercent >= 1.0,
      usagePercent,
    };
  }
}
```

### 5.3 FitUploader Dead Letter Queue Integration (MEDIUM-02)

**File:** `apps/mobile/lib/services/ActivityRecorder/FitUploader.ts`

Add dead letter queue methods:

```typescript
export class FitUploader {
  private failedUploadsTable: string = "failed_uploads";

  async uploadFile(
    filePath: string,
    userId: string,
    activityId: string,
  ): Promise<UploadResult> {
    // Existing retry logic...

    // After max retries exceeded, store in dead letter queue
    if (attempt > this.config.maxRetries) {
      await this.storeInDeadLetterQueue(filePath, userId, activityId, error);
    }

    return result;
  }

  private async storeInDeadLetterQueue(
    filePath: string,
    userId: string,
    activityId: string,
    errorMessage: string,
  ): Promise<void> {
    const fileInfo = await FileSystem.getInfoAsync(filePath);

    await this.supabaseClient.from(this.failedUploadsTable).insert({
      user_id: userId,
      activity_id: activityId,
      file_path: filePath,
      file_name: path.basename(filePath),
      file_size: fileInfo.size || 0,
      error_message: errorMessage,
      status: "pending",
    });
  }

  async retryFailedUpload(failedUploadId: string): Promise<UploadResult> {
    const { data: record } = await this.supabaseClient
      .from(this.failedUploadsTable)
      .select("*")
      .eq("id", failedUploadId)
      .single();

    if (!record) {
      return { success: false, error: "Record not found", attempts: 0 };
    }

    // Update status
    await this.supabaseClient
      .from(this.failedUploadsTable)
      .update({ status: "retrying", last_attempt_at: new Date().toISOString() })
      .eq("id", failedUploadId);

    // Retry upload
    const result = await this.uploadToStorage(
      record.file_path,
      record.user_id,
      record.activity_id,
    );

    if (result.success) {
      await this.supabaseClient
        .from(this.failedUploadsTable)
        .update({ status: "resolved" })
        .eq("id", failedUploadId);
    } else {
      await this.supabaseClient
        .from(this.failedUploadsTable)
        .update({ status: "pending", retry_count: record.retry_count + 1 })
        .eq("id", failedUploadId);
    }

    return result;
  }
}
```

### 5.4 StreamingFitEncoder Integration (Part 6)

**File:** `apps/mobile/lib/services/ActivityRecorder/index.ts`

Integrate FIT encoder into recording flow:

```typescript
export class ActivityRecorderService {
  private fitEncoder?: StreamingFitEncoder;

  async startRecording() {
    // ... existing setup ...

    // Initialize FIT encoder for parallel encoding
    if (this.recordingMetadata) {
      this.fitEncoder = new StreamingFitEncoder(
        this.recordingMetadata.id,
        this.profile.id,
      );
      await this.fitEncoder.initialize();
    }
  }

  private handleSensorData(reading: SensorReading) {
    // Existing: ingest for metrics display
    this.liveMetricsManager.ingestSensorData(reading);

    // New: also write to FIT encoder
    if (this.fitEncoder && this.state === "recording") {
      const record = this.mapSensorToFitRecord(reading);
      this.fitEncoder.addRecord(record).catch((err) => {
        console.warn("FIT encoder write failed:", err);
      });
    }
  }

  async finishRecording() {
    // ... existing finish logic ...

    if (this.fitEncoder) {
      const metrics = this.liveMetricsManager.getMetrics();

      await this.fitEncoder.finalize({
        startTime: new Date(this.recordingMetadata!.startedAt).getTime(),
        totalTime: metrics.movingTime / 1000,
        distance: metrics.distance || 0,
        avgSpeed: metrics.avgSpeed || 0,
        maxSpeed: metrics.maxSpeed || 0,
        avgPower: metrics.avgPower,
        maxPower: metrics.maxPower,
        avgHeartRate: metrics.avgHeartRate,
        maxHeartRate: metrics.maxHeartRate,
        avgCadence: metrics.avgCadence,
        totalAscent: metrics.totalAscent,
        totalDescent: metrics.totalDescent,
        calories: metrics.calories,
      });

      this.fitEncoder = undefined;
    }
  }

  private mapSensorToFitRecord(reading: SensorReading): FitRecord {
    return {
      timestamp: reading.timestamp,
      heartRate:
        reading.metric === "heartrate" ? (reading.value as number) : undefined,
      power: reading.metric === "power" ? (reading.value as number) : undefined,
      cadence:
        reading.metric === "cadence" ? (reading.value as number) : undefined,
    };
  }
}
```

### 5.5 Mobile Files Summary

| File              | Changes                         | Priority |
| ----------------- | ------------------------------- | -------- |
| `StreamBuffer.ts` | Add checkpoint/recovery methods | High     |
| `StreamBuffer.ts` | Add storage quota methods       | Medium   |
| `FitUploader.ts`  | Add dead letter queue methods   | Medium   |
| `index.ts`        | Integrate StreamingFitEncoder   | High     |
| `metro.config.js` | Create buffer polyfill config   | Low      |

---

## 6. Garmin SDK Integration

### 6.1 Edge Function SDK Integration

**File:** `packages/supabase/functions/analyze-fit-file/index.ts`

Replace mock parser with real SDK:

```typescript
import { Decoder, Stream } from "@garmin/fitsdk";

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
  timestamp?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_ascent?: number;
  total_descent?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  max_cadence?: number;
  total_calories?: number;
  name?: string;
}

interface ParseResult {
  session?: FitSession;
  records: FitRecord[];
  errors: string[];
  warnings: string[];
}

function parseFitFile(data: ArrayBuffer): ParseResult {
  const result: ParseResult = { records: [], errors: [], warnings: [] };

  try {
    const uint8Array = new Uint8Array(data);
    const stream = Stream.fromArrayBuffer(uint8Array.buffer);

    if (!Decoder.isFIT(stream)) {
      throw new Error("Invalid FIT file format");
    }

    const stream2 = Stream.fromArrayBuffer(uint8Array.buffer);
    const decoder = new Decoder(stream2);
    const { messages, errors } = decoder.read({
      applyScaleAndOffset: true,
      expandSubFields: true,
      expandComponents: true,
      convertTypesToStrings: true,
      convertDateTimesToDates: true,
    });

    if (errors?.length) {
      result.errors = errors.map((e: any) => e.message || String(e));
    }

    // Extract session
    if (messages.session?.length) {
      const s = messages.session[0];
      result.session = {
        sport: mapSportToNumber(s.sport),
        start_time: s.start_time?.getTime() / 1000 - FIT_EPOCH_OFFSET,
        timestamp: s.timestamp?.getTime() / 1000 - FIT_EPOCH_OFFSET,
        total_elapsed_time: s.total_elapsed_time,
        total_timer_time: s.total_timer_time,
        total_distance: s.total_distance,
        total_ascent: s.total_ascent,
        total_descent: s.total_descent,
        avg_heart_rate: s.avg_heart_rate,
        max_heart_rate: s.max_heart_rate,
        avg_power: s.avg_power,
        max_power: s.max_power,
        avg_cadence: s.avg_cadence,
        max_cadence: s.max_cadence,
        total_calories: s.total_calories,
        name: s.session_name,
      };
    }

    // Extract records
    if (messages.record?.length) {
      for (const r of messages.record) {
        result.records.push({
          timestamp: r.timestamp?.getTime() / 1000 - FIT_EPOCH_OFFSET,
          position_lat: r.position_lat,
          position_long: r.position_long,
          distance: r.distance,
          altitude: r.altitude,
          speed: r.speed,
          heart_rate: r.heart_rate,
          cadence: r.cadence,
          power: r.power,
          temperature: r.temperature,
        });
      }
    }
  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  return result;
}

function mapSportToNumber(sport?: string): number | undefined {
  if (!sport) return undefined;
  const sportMap: Record<string, number> = {
    running: 1,
    cycling: 2,
    swimming: 3,
    strength_training: 4,
    fitness_equipment: 6,
    hiking: 7,
    walking: 8,
  };
  return sportMap[sport.toLowerCase()];
}
```

### 6.2 Deno Configuration Update

**File:** `packages/supabase/functions/analyze-fit-file/deno.json`

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2.4.1",
    "@mapbox/polyline": "npm:@mapbox/polyline@^1.2.1",
    "supabase": "npm:supabase@2",
    "@garmin/fitsdk": "npm:@garmin/fitsdk@^21.188.0"
  }
}
```

### 6.3 Error Handling

```typescript
interface FitParsingError {
  category: "VALIDATION" | "DECODING" | "INTEGRITY" | "DATA_QUALITY";
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

function parseFitFile(data: ArrayBuffer): ParseResult {
  const result: ParseResult = { records: [], errors: [], warnings: [] };

  // Validate file size
  if (data.byteLength < 14) {
    result.errors.push("FIT file too small - minimum 14 bytes required");
    return result;
  }

  // Validate .FIT signature
  const bytes = new Uint8Array(data);
  const signature = String.fromCharCode(...bytes.slice(8, 12));
  if (signature !== ".FIT") {
    result.errors.push("Invalid FIT file signature - .FIT marker not found");
    return result;
  }

  // ... SDK parsing ...

  // Post-parsing validation
  const hasPosition = result.records.some((r) => r.position_lat !== undefined);
  if (!hasPosition) {
    result.warnings.push(
      "No GPS position data found - this may be an indoor activity",
    );
  }

  return result;
}
```

---

## 7. Encoding/Decoding Changes

### 7.1 Encoding Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIT ENCODING LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   BackendFitEncoder                      │   │
│  │  (packages/core/lib/fit-encoder.ts)                      │   │
│  │  - In-memory encoding                                    │   │
│  │  - Node.js native Buffer                                 │   │
│  │  - No file system dependencies                           │   │
│  │  - Stateless processing                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               StreamingFitEncoder                         │   │
│  │  (apps/mobile/lib/services/ActivityRecorder/              │   │
│  │   StreamingFitEncoder.ts)                                 │   │
│  │  - File-based encoding                                    │   │
│  │  - Expo FileSystem                                        │   │
│  │  - Checkpoint recovery                                    │   │
│  │  - Streaming writes                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   SDK Encoder (Optional)                  │   │
│  │  (@garmin/fitsdk - encoder module)                        │   │
│  │  - Official Garmin implementation                         │   │
│  │  - Better compatibility                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Decoding Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIT DECODING LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              analyze-fit-file Edge Function              │   │
│  │  (packages/supabase/functions/analyze-fit-file)          │   │
│  │  - Uses @garmin/fitsdk for parsing                       │   │
│  │  - Server-side processing                                │   │
│  │  - Metrics calculation                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   fit-sdk-parser.ts                       │   │
│  │  (packages/core/lib/fit-sdk-parser.ts)                   │   │
│  │  - SDK-based parsing for backend                         │   │
│  │  - Reusable parser utilities                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   fit-parser.ts                           │   │
│  │  (packages/core/lib/fit-parser.ts)                        │   │
│  │  - Minimal parser (fallback)                              │   │
│  │  - Extract basic metadata                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Data Flow

```mermaid
graph TD
    A[Mobile Recording] --> B[StreamBuffer]
    B --> C[LiveMetricsManager]
    C --> D[StreamingFitEncoder]
    D --> E[FIT File]

    E --> F[Upload to Storage]
    F --> G[Edge Function]

    G --> H[@garmin/fitsdk Parser]
    H --> I[ParseResult]
    I --> J[Metrics Calculation]
    J --> K[Activity Update]

    D -.->|Optional| L[BackendFitEncoder]
    L --> M[Server-side FIT]
    M --> N[Storage]
```

---

## 8. FIT File Storage Changes

### 8.1 Storage Bucket Configuration

**Bucket Name:** `fit-files`

**Structure:**

```
fit-files/
  {userId}/
    {activityId}/
      raw.fit           # Original uploaded file
      metadata.json     # Parsed metadata
```

### 8.2 Storage Policies

**File:** `packages/supabase/policies/fit_files_storage_policies.sql`

```sql
-- Bucket must be created via Supabase CLI or Dashboard
-- insert into storage.buckets (id, name, public, file_size_limit)
-- values ('fit-files', 'fit-files', false, 52428800);

-- Allow authenticated users to upload to their own folder
create policy "Users can upload FIT files to their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'fit-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to read their own files
create policy "Users can read their own FIT files"
  on storage.objects for select
  using (
    bucket_id = 'fit-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Service role can manage all files (for edge functions)
create policy "Service role can manage all FIT files"
  on storage.objects for all
  using (bucket_id = 'fit-files')
  with check (false);
```

### 8.3 File Upload Flow

```typescript
// In useActivitySubmission.ts
const submit = async () => {
  // 1. Create activity record
  const activity = await createActivityMutation.mutateAsync({...});

  // 2. Generate FIT file if needed
  if (shouldGenerateFit) {
    const encoder = new StreamingFitEncoder(activity.id, profileId);
    await encoder.initialize();

    // Add records from StreamBuffer
    const streams = await streamBuffer.aggregateAllChunks();
    for (const stream of streams) {
      for (let i = 0; i < stream.values.length; i++) {
        await encoder.addRecord(mapToFitRecord(stream, i));
      }
    }

    await encoder.finalize(sessionData);
    const fitBytes = await encoder.getFile();

    // 3. Save to temp file
    const tempPath = `${FileSystem.cacheDirectory}${activity.id}.fit`;
    await FileSystem.writeAsStringAsync(tempPath, uint8ArrayToBase64(fitBytes), { encoding: 'base64' });

    // 4. Upload to storage
    const uploader = new FitUploader(SUPABASE_URL, SUPABASE_ANON_KEY);
    const result = await uploader.uploadFile(tempPath, profileId, activity.id);

    // 5. Update activity with file path
    if (result.success) {
      await updateActivityMutation.mutateAsync({
        id: activity.id,
        fit_file_path: result.fileUrl,
      });
    }

    // Cleanup
    await FileSystem.deleteAsync(tempPath);
  }
};
```

---

## 9. Supabase Edge Function Changes

### 9.1 Function Overview

**File:** `packages/supabase/functions/analyze-fit-file/index.ts`

**Purpose:** Parse uploaded FIT files and calculate metrics

### 9.2 Updated Function Structure

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Decoder, Stream } from "@garmin/fitsdk";

interface ActivityAnalysisResult {
  activity_id: string;
  processing_status: string;
  session?: FitSession;
  records_count: number;
  metrics: ActivityMetrics;
  errors: string[];
  warnings: string[];
}

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const { activityId, filePath, bucketName } = await req.json();

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download FIT file: ${downloadError?.message}`);
    }

    // Parse FIT file
    const arrayBuffer = await fileData.arrayBuffer();
    const { session, records, errors, warnings } = parseFitFile(arrayBuffer);

    // Calculate metrics
    const metrics = calculateMetrics(records, session);

    // Update activity
    const { error: updateError } = await supabase
      .from("activities")
      .update({
        metrics,
        processing_status: errors.length > 0 ? "partial" : "completed",
        fit_parser_version: "2.0.0",
        updated_at: new Date().toISOString(),
      })
      .eq("id", activityId);

    if (updateError) {
      throw new Error(`Failed to update activity: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        activity_id: activityId,
        processing_status: "completed",
        records_count: records.length,
        metrics,
        errors,
        warnings,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);

    // Update status to failed
    if (activityId) {
      await supabase
        .from("activities")
        .update({ processing_status: "failed" })
        .eq("id", activityId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
```

### 9.3 Environment Variables Required

| Variable                    | Required | Description                           |
| --------------------------- | -------- | ------------------------------------- |
| `SUPABASE_URL`              | Yes      | Supabase project URL                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Service role key for admin operations |
| `GARMIN_SDK_ENABLED`        | No       | Enable SDK features (default: true)   |

---

## 10. Refactoring Changes

### 10.1 Path Updates

Update documentation and code references:

| Old Path                                   | New Path                                        | Files Affected      |
| ------------------------------------------ | ----------------------------------------------- | ------------------- |
| `packages/sdk/`                            | `packages/core/lib/`                            | Documentation files |
| `packages/backend/`                        | `packages/trpc/`                                | Documentation files |
| `supabase/functions/process-activity-fit/` | `packages/supabase/functions/analyze-fit-file/` | Documentation       |
| `mobile/src/`                              | `apps/mobile/`                                  | Documentation       |

### 10.2 Polyfill Configuration

**File:** `apps/mobile/metro.config.js` (CREATE)

```javascript
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs"];
config.resolver.alias = {
  ...config.resolver.alias,
  buffer: "buffer/",
};

config.watchFolders = ["../../packages"];

module.exports = config;
```

### 10.3 Component Integration

Integrate existing components that are complete but not connected:

| Component                | Current State            | Integration Required          |
| ------------------------ | ------------------------ | ----------------------------- |
| `StreamingFitEncoder.ts` | Complete, not used       | Integrate into recording flow |
| `FitUploader.ts`         | Complete, not integrated | Add to submit screen          |
| `LiveMetricsManager.ts`  | Complete, working        | Add quota checking            |
| `DataBuffer.ts`          | Complete, working        | Add checkpoint support        |

---

## 11. Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)

| Task                          | Owner   | Files                                    | Dependencies           |
| ----------------------------- | ------- | ---------------------------------------- | ---------------------- |
| Replace mock parser with SDK  | Backend | `analyze-fit-file/index.ts`, `deno.json` | @garmin/fitsdk package |
| Add database trigger          | DBA     | `migrations/*.sql`                       | -                      |
| Create backend FIT encoder    | Backend | `packages/core/lib/fit-encoder.ts`       | -                      |
| Integrate StreamingFitEncoder | Mobile  | `ActivityRecorder/index.ts`              | -                      |

### Phase 2: Data Safety (Week 2)

| Task                             | Owner  | Files              | Dependencies         |
| -------------------------------- | ------ | ------------------ | -------------------- |
| StreamBuffer checkpoint recovery | Mobile | `StreamBuffer.ts`  | FileSystem access    |
| Storage quota enforcement        | Mobile | `StreamBuffer.ts`  | -                    |
| Failed uploads table             | DBA    | `migrations/*.sql` | -                    |
| FitUploader dead letter queue    | Mobile | `FitUploader.ts`   | failed_uploads table |

### Phase 3: Error Handling (Week 3)

| Task                       | Owner   | Files                               | Dependencies         |
| -------------------------- | ------- | ----------------------------------- | -------------------- |
| tRPC failed-uploads router | Backend | `routers/failed-uploads.ts`         | failed_uploads table |
| Error categorization       | Backend | `packages/trpc/src/errors.ts`       | -                    |
| Batch processing endpoints | Backend | `routers/fit-files.ts`              | -                    |
| UI for failed uploads      | Mobile  | `app/(internal)/failed-uploads.tsx` | tRPC router          |

### Phase 4: Documentation & Cleanup (Week 4)

| Task                   | Owner  | Files                                | Dependencies            |
| ---------------------- | ------ | ------------------------------------ | ----------------------- |
| Update path references | All    | Documentation files                  | -                       |
| Fix polyfill config    | Mobile | `metro.config.js`, `babel.config.js` | -                       |
| Add tests              | QA     | Test files                           | Implementation complete |
| Integration testing    | QA     | -                                    | All phases complete     |

---

## 12. Verification Checklist

### Database

- [ ] `failed_uploads` table created with indexes
- [ ] `activity_checkpoints` table created
- [ ] `storage_quotas` and `storage_usage` tables created
- [ ] Database triggers functional
- [ ] Views created for activity + FIT data

### Core Package

- [ ] `packages/core/lib/fit-encoder.ts` implemented
- [ ] `packages/core/lib/fit-types.ts` created
- [ ] Exports added to `packages/core/index.ts`
- [ ] CRC16 calculation verified

### TRPC Layer

- [ ] `failed-uploads` router implemented
- [ ] Dead letter queue integration in `fit-files.ts`
- [ ] Error categorization implemented
- [ ] Batch processing endpoints working

### Mobile App

- [ ] StreamBuffer checkpoint recovery working
- [ ] Storage quota enforcement functional
- [ ] FitUploader dead letter queue integrated
- [ ] StreamingFitEncoder integrated into recording flow
- [ ] Polyfill configuration correct

### Garmin SDK

- [ ] @garmin/fitsdk integrated into edge function
- [ ] Mock parser completely replaced
- [ ] Data mapping functions verified
- [ ] Error handling comprehensive

### Edge Function

- [ ] Real FIT parsing working
- [ ] Metrics calculation accurate
- [ ] Status updates correct
- [ ] Retry logic implemented

### Integration

- [ ] Recording → FIT encoding → Upload flow complete
- [ ] Crash recovery tested
- [ ] Failed upload retry flow working
- [ ] All documentation paths updated

---

## Appendix A: File Reference

### New Files to Create

| File                                                                          | Purpose                     |
| ----------------------------------------------------------------------------- | --------------------------- |
| `packages/core/lib/fit-encoder.ts`                                            | Backend FIT encoder         |
| `packages/core/lib/fit-types.ts`                                              | Shared type definitions     |
| `packages/core/lib/crc.ts`                                                    | CRC16 utility               |
| `packages/trpc/src/routers/failed-uploads.ts`                                 | Failed uploads router       |
| `packages/trpc/src/errors.ts`                                                 | Error types                 |
| `apps/mobile/app/(internal)/failed-uploads.tsx`                               | Failed uploads UI           |
| `apps/mobile/metro.config.js`                                                 | Metro bundler config        |
| `packages/supabase/migrations/YYYYMMDDHHMMSS_add_fit_processing_trigger.sql`  | Trigger migration           |
| `packages/supabase/migrations/YYYYMMDDHHMMSS_create_failed_uploads_queue.sql` | Dead letter queue migration |
| `packages/supabase/migrations/YYYYMMDDHHMMSS_create_activity_checkpoints.sql` | Checkpoints migration       |
| `packages/supabase/migrations/YYYYMMDDHHMMSS_create_storage_quotas.sql`       | Storage quotas migration    |
| `docs/design.md`                                                              | This document               |

### Files to Modify

| File                                                        | Changes                           |
| ----------------------------------------------------------- | --------------------------------- |
| `packages/core/index.ts`                                    | Add encoder exports               |
| `packages/trpc/src/routers/fit-files.ts`                    | Add dead letter queue integration |
| `packages/trpc/src/routers/activities.ts`                   | Add batch processing              |
| `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts` | Add checkpoint/quota methods      |
| `apps/mobile/lib/services/ActivityRecorder/FitUploader.ts`  | Add dead letter queue methods     |
| `apps/mobile/lib/services/ActivityRecorder/index.ts`        | Integrate StreamingFitEncoder     |
| `packages/supabase/functions/analyze-fit-file/index.ts`     | Replace mock parser               |
| `packages/supabase/functions/analyze-fit-file/deno.json`    | Add SDK import                    |

### Files to Delete

| File                                   | Reason                    |
| -------------------------------------- | ------------------------- |
| `docs/FIT_IMPLEMENTATION_REVIEW.md`    | Superseded by design.md   |
| `docs/fit-integration-deliverables.md` | Update with correct paths |

---

## Appendix B: Dependencies

### npm Packages Required

```json
{
  "@garmin/fitsdk": "^21.188.0",
  "buffer": "^6.0.3"
}
```

### Deno Modules Required

```json
{
  "@supabase/functions-js": "jsr:@supabase/functions-js@^2.4.1",
  "@mapbox/polyline": "npm:@mapbox/polyline@^1.2.1",
  "supabase": "npm:supabase@2",
  "@garmin/fitsdk": "npm:@garmin/fitsdk@^21.188.0"
}
```

---

**Document Version:** 1.0  
**Last Updated:** January 22, 2026  
**Next Review:** After Phase 1 completion
