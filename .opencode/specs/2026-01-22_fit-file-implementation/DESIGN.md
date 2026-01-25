# FIT File Implementation Specification

**Version:** 7.0.0
**Created:** January 22, 2026
**Last Updated:** January 25, 2026
**Status:** Ready for Implementation
**Notes:** Version 7.0.0 refactors the architecture for client-side FIT file generation. The mobile app is now a "smart recorder," encoding the FIT file in real-time. The server is the sole authority for parsing this file and calculating all metrics. This change simplifies the server's role and makes the FIT file the primary, client-generated artifact.

---

## Executive Summary

This specification defines a new architecture where the **mobile application acts as a smart recorder, generating and encoding the FIT file in real-time**. The server's role is to receive this client-generated FIT file and perform all metric calculations after parsing it. This establishes a clear separation of concerns: the client records, and the server analyzes. All calculations will leverage pre-existing `@repo/core` functions.

| Decision         | Choice                             | Rationale                                                                                                                        |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **FIT Encoder**  | **Mobile App (Real-time)**         | The mobile app is closest to the data source, enabling real-time, on-device FIT file creation without server dependency.         |
| **FIT Parser**   | `@repo/core/lib/fit-sdk-parser.ts` | Existing production parser using Garmin SDK. Centralized on the server.                                                          |
| **Calculations** | `@repo/core` functions             | **SERVER-SIDE ONLY:** TSS, power curves, etc., are calculated authoritatively by the server after parsing the uploaded FIT file. |
| **Processing**   | Next.js/tRPC mutation              | A single synchronous request to parse the FIT file and calculate metrics.                                                        |
| **Database**     | Supabase client                    | Uses existing `activities` table with individual metric columns.                                                                 |
| **Stream Data**  | Raw FIT file in Supabase Storage   | The uploaded FIT file is the source of truth. Stream data is not duplicated in the database.                                     |

**Key Finding:** The mobile app is now responsible for encoding, while the server is the sole authority for metric calculation. All parsing and calculation functions in `@repo/core` remain critical for the server-side implementation.

**Key Schema Change:** All metrics are stored as individual typed columns (NOT JSONB) for type safety and query performance, calculated exclusively by the server.

---

## Part 1: Data Flow

### Primary Data Flow (Client-Side Recording)

The mobile application is a "smart recorder." It generates the FIT file on-device during the activity. Upon completion, this file is the primary artifact uploaded to the server for processing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  CLIENT-SIDE FIT GENERATION & UPLOAD FLOW                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Mobile App acts as "Smart Recorder", encoding FIT file in real-time     │
│  2. On activity completion, the final FIT file is saved on-device           │
│  3. Mobile App uploads the generated FIT file to Supabase Storage           │
│  4. Mobile App calls tRPC mutation `fitFiles.processFitFile` with file path │
│  5. Server-side mutation downloads the file from Storage                    │
│  6. Server parses the file using `parseFitFileWithSDK()`                    │
│  7. Server calculates all metrics using `@repo/core` functions              │
│  8. Server creates an activity record with all calculated metrics           │
│  9. Server returns the final activity data to the mobile app                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Third-Party Data Import Flow (Server-Side Encoding)

For data from third-party services (Strava, Garmin Connect), we still utilize a **"Universal FIT File" strategy**. The server will transcode incoming JSON/API data into our standard FIT file format before processing it through the same pipeline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THIRD-PARTY DATA IMPORT FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PATH A: Direct FIT (Garmin, Wahoo)                                         │
│  1. Receive Webhook -> Fetch "Original File" URL                            │
│  2. Download FIT file                                                       │
│  3. Upload to Supabase Storage                                              │
│  4. Process via `fitFiles.processFitFile` (same as mobile flow)             │
│                                                                             │
│  PATH B: Transcoding (Strava, Apple Health, Google Fit)                     │
│  1. Receive Webhook/Query -> Fetch Activity Streams (JSON)                  │
│  2. Normalize to `StandardActivity` interface                               │
│  3. Encode to FIT binary using `encodeFitFile()` in @repo/core on SERVER    │
│  4. Upload generated FIT to Supabase Storage                                │
│  5. Process via `fitFiles.processFitFile`                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Standard Activity Interface (Normalization Layer)

This interface is used only for the **server-side transcoding** of third-party data (Path B). It is not used by the mobile application's recording flow.

```typescript
// packages/core/types/normalization.ts

export interface StandardActivity {
  metadata: {
    sourceId: string; // e.g., "strava_12345"
    sourceName: string; // e.g., "Strava", "Apple Health"
    startTime: Date;
    sport: "running" | "cycling" | "swimming" | "other";
    subSport?: string; // e.g., "indoor_cycling"
    deviceName?: string; // e.g., "Apple Watch Ultra"
  };

  // Summary data for SESSION and LAP messages
  summary: {
    totalTime: number; // seconds
    totalDistance: number; // meters
    totalAscent?: number; // meters
    avgHeartRate?: number; // bpm
    maxHeartRate?: number; // bpm
    avgPower?: number; // watts
    maxPower?: number; // watts
    calories?: number;
  };

  // Time-series data for RECORD messages
  // Arrays must be equal length
  streams: {
    timeOffsets: number[]; // Seconds from startTime
    latitude?: number[]; // Degrees
    longitude?: number[]; // Degrees
    altitude?: number[]; // Meters
    heartRate?: number[]; // BPM
    cadence?: number[]; // RPM
    power?: number[]; // Watts
    speed?: number[]; // m/s
    distance?: number[]; // Cumulative meters
  };
}
```

### Asynchronous Stream Parsing (Activity Detail View)

This flow remains unchanged. The frontend (web or mobile) will download the raw FIT file from storage and parse it on-demand to render charts and maps. The server does not send stream data to the client.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ACTIVITY DETAIL - FIT FILE PARSING                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User views activity detail page                                         │
│  2. Page loads activity with computed metrics (from database columns)       │
│  3. If user requests GPS/charts/analysis:                                   │
│     a. Frontend requests FIT file from Supabase Storage                     │
│     b. Stream data parsed asynchronously on-demand on the client            │
│     c. Parsed streams cached locally for session                            │
│     d. Map/charts render with stream data                                   │
│                                                                             │
│  NOTE: Stream data is NOT stored in the database—only in the raw FIT file.  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Already Exists

| Component       | Location                             | Status                                    |
| --------------- | ------------------------------------ | ----------------------------------------- |
| FIT Parser      | `@repo/core/lib/fit-sdk-parser.ts`   | ✅ Production ready (Server-side)         |
| TSS Calculation | `@repo/core/calculations/tss.ts`     | ✅ Production ready (Server-side)         |
| Power Curves    | `@repo/core/calculations/curves.ts`  | ✅ Production ready (Server-side)         |
| Test Detection  | `@repo/core/detection/`              | ✅ Production ready (Server-side)         |
| Database Schema | `packages/supabase/schemas/init.sql` | ✅ `activities` table with metric columns |

### What to Implement

| Component            | Location                                  | Description                                                       |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| **FIT Encoder**      | **`apps/mobile/src/lib/fit-recorder.ts`** | **NEW:** Real-time FIT file encoding during activity recording.   |
| FIT Encoder (Server) | `@repo/core/lib/fit-sdk-encoder.ts`       | **NEW:** For server-side encoding of third-party data only.       |
| tRPC Router          | `packages/trpc/src/routers/fit-files.ts`  | Integration layer for server-side parsing and metric calculation. |
| Mobile Uploader      | `apps/mobile/src/utils/fit-processing.ts` | Mobile logic to upload the locally generated FIT file.            |

**Note:** `activity_streams` table is removed. Stream data remains only in the raw FIT file.

---

## Part 2: Database Schema

### Database Schema (Individual Metric Columns)

This remains unchanged. All metrics are calculated by the server and stored in individual typed columns for performance and type safety.

```sql
-- activities table columns for FIT file support
-- All metrics are individual typed columns (NOT JSONB)

-- Core identification columns
-- id, user_id, name, notes, activity_type (existing)

-- FIT file tracking
ALTER TABLE activities ADD COLUMN fit_file_path TEXT;
ALTER TABLE activities ADD COLUMN fit_file_size BIGINT;

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

The tRPC router implementation remains largely the same, as its responsibility is to download, parse, and calculate metrics from an already-existing FIT file. The logic inside `processFitFile` is still valid.

**(Code from existing spec is unchanged here, as it correctly reflects the server's role)**

---

## Part 4: What NOT to Implement

### Functions Already in `@repo/core`

**DO NOT implement these - import from `@repo/core` for server-side use:**

```typescript
// FIT Parsing
import { parseFitFileWithSDK } from "@repo/core/lib/fit-sdk-parser.ts";
import { extractActivitySummary } from "@repo/core/lib/extract-activity-summary.ts";

// FIT Encoding (Server-side for third parties)
import { encodeFitFile } from "@repo/core/lib/fit-sdk-encoder.ts";

// All calculation, detection, and curve functions...
// (List of functions remains the same)
```

### Zod Schemas Already in `@repo/supabase`

**(This section remains unchanged)**

### What Was Removed

- ❌ `activity_streams` table - stream data remains only in raw FIT file
- ❌ `metrics` JSONB column - all metrics stored as individual columns
- ❌ Stream compression utilities removal - no longer needed as streams stay in FIT file
- ❌ `publicActivityStreamsInsertSchema` - schema removed

---

## Part 5: Mobile Implementation

### Role: Smart Recorder & Encoder

The mobile application's primary new role is to act as a **smart recorder**. It will use a new library, `apps/mobile/src/lib/fit-recorder.ts`, to handle the real-time generation of the FIT file during an activity. This library will be responsible for:

1.  Initializing the FIT file with session and device information.
2.  Appending sensor data (GPS, heart rate, power, etc.) as `RECORD` messages in real-time.
3.  Finalizing the file with `LAP` and `SESSION` summary messages upon activity completion.
4.  Saving the completed `.fit` file to the device's local file system.

### Upload and Process

Once the FIT file is generated and saved locally, the `uploadAndProcessFitFile` utility will be called. Its role is now simpler: upload the pre-existing file and trigger the server-side processing.

**apps/mobile/src/utils/fit-processing.ts:**

```typescript
import { supabase } from "./supabase";
import { api } from "~/utils/api";
import * as FileSystem from "expo-file-system";

// This function is now called AFTER the FIT file has been generated and saved locally
export async function uploadAndProcessFitFile(
  localFileUri: string, // URI to the locally generated FIT file
  userId: string,
  name: string,
  notes?: string,
  activityType: "run" | "bike" | "swim" | "walk" | "hike" = "run",
): Promise<ProcessedActivity> {
  // 1. Read the locally generated FIT file
  const fileBase64 = await FileSystem.readAsStringAsync(localFileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2. Convert to blob for uploading
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

  // 4. Call tRPC mutation to trigger SERVER-SIDE processing
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
// (base64ToBlob helper function remains the same)
```

### Activity Detail - On-Demand FIT Parsing

This remains unchanged. The detail screen will still download the FIT file from storage to parse streams for charts.

**(Code from existing spec is unchanged here)**

---

## Part 6: File Structure

```
packages/core/src/
└── lib/
    ├── fit-sdk-parser.ts       # SERVER: Parses FIT files
    └── fit-sdk-encoder.ts      # SERVER: Encodes 3rd-party data to FIT

packages/trpc/src/
└── routers/
    └── fit-files.ts          # SERVER: Processes uploaded FIT files

apps/mobile/src/
├── lib/
│   └── fit-recorder.ts       # NEW - CLIENT: Real-time FIT encoding
├── utils/
│   └── fit-processing.ts     # CLIENT: Uploads generated FIT file
└── screens/
    └── ActivityRecording.tsx # CLIENT: UI that uses fit-recorder.ts
```

---

## Part 7: Testing Strategy

Testing must now cover both client-side encoding and server-side processing.

### Client-Side Unit Tests

- **`apps/mobile/__tests__/fit-recorder.test.ts`**:
  - Verify that the `fit-recorder` correctly initializes a FIT file.
  - Test that sensor data is correctly appended as `RECORD` messages.
  - Ensure the generated FIT file can be successfully parsed by a reference parser.

### Server-Side Unit Tests for Integration Layer

- **`packages/trpc/src/routers/__tests__/fit-files.test.ts`**:
  - (Tests from existing spec remain valid, ensuring the server correctly parses and calculates metrics from a given FIT file).

---

## Part 8: Implementation Checklist

### Mobile App (Client-Side)

- [ ] **NEW:** Implement `fit-recorder.ts` for real-time FIT file generation.
- [ ] Integrate `fit-recorder.ts` into the activity recording screen.
- [ ] Update `fit-processing.ts` to upload the locally generated file.
- [ ] Add unit tests for the FIT file recorder.

### tRPC Router (Server-Side)

- [ ] Create `packages/trpc/src/routers/fit-files.ts`.
- [ ] Implement `processFitFile` mutation for parsing and metric calculation.
- [ ] Write unit tests for the tRPC router logic.

### Core Package (Server-Side)

- [ ] Implement `fit-sdk-encoder.ts` for third-party data transcoding.

### Database

- [ ] Ensure all metric columns are added to the `activities` table.
- [ ] Ensure no references to `activity_streams` exist.

---

## Part 9: Summary

### What This Implementation Does

1.  **Records & Encodes** a FIT file in real-time on the **mobile client**.
2.  **Uploads** the final FIT file from the client to Supabase Storage.
3.  **Downloads & Parses** the FIT file on the **server** using `@repo/core`.
4.  **Calculates** all metrics (TSS, power, zones, etc.) authoritatively on the **server**.
5.  **Creates** an activity record with all metrics as individual typed columns.
6.  **Stores** stream data only in the raw FIT file (not in the database).
7.  **Supports** on-demand, client-side stream parsing for activity detail views.

### Key Responsibilities

- **Mobile App:**
  - ✅ Real-time data capture.
  - ✅ FIT file encoding and generation.
  - ✅ Uploading the final FIT file.
- **Server:**
  - ✅ FIT file parsing.
  - ✅ Authoritative metric calculation.
  - ✅ Database interaction.
  - ✅ Transcoding third-party data into FIT files.
