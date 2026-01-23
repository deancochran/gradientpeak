# Tasks: FIT File Implementation

## Task List by Phase

This document provides a granular checklist for implementing FIT file support in GradientPeak using a **simplified architecture** with raw FIT files stored in Supabase Storage.

---

## Phase 1: Infrastructure Setup

**Duration:** 1-2 days  
**Goal:** Set up database schema, types, and edge function foundation

### Database Setup

- [x] **T-101** Review existing migration file
  - Location: `packages/supabase/migrations/20240120_add_fit_file_support.sql`
  - Verify columns: `fit_file_path`, `processing_status`, `processing_error`, `fit_file_size`

- [x] **T-102** Apply migration to init.sql
  - Add columns to `packages/supabase/schemas/init.sql`
  - Add indexes for `processing_status` and `fit_file_path`

- [x] **T-102.1** **Remove activity_streams table**
  - Execute: `DROP TABLE IF EXISTS activity_streams;`
  - Raw FIT files will be stored in Supabase Storage
  - Verify no existing code references activity_streams table

- [x] **T-103** Generate TypeScript types

  ```bash
  cd packages/supabase && supabase generate-types
  ```

- [x] **T-104** Update Zod schemas
  - Add FIT columns to `publicActivitiesInsertSchema`
  - Add processing_status enum
  - Remove references to `publicActivityStreamsInsertSchema` (no longer needed)

### Infrastructure Deliverables

- [ ] Database migration applied
- [ ] TypeScript types generated
- [ ] Zod schemas updated

---

## Phase 2: Mobile Recording Integration

**Duration:** 3-5 days  
**Goal:** Integrate FIT encoding into the ActivityRecorder service

### Dependencies

- [ ] **T-201** Install @garmin/fitsdk on mobile
  ```bash
  cd apps/mobile && npm install @garmin/fitsdk@^21.188.0
  ```

### ActivityRecorder Integration

- [ ] **T-202** Review existing StreamingFitEncoder
  - Verify crash recovery implementation
  - Verify checkpoint mechanism (60s intervals)
  - Check memory usage during encoding

- [ ] **T-203** Add FIT encoder properties to ActivityRecorder

  ```typescript
  export class ActivityRecorderService extends EventEmitter<ServiceEvents> {
    public fitEncoder: StreamingFitEncoder | null = null;
    public fitFileBuffer: Uint8Array | null = null;
    public fitFilePath: string | null = null;
    // ...
  }
  ```

- [ ] **T-204** Initialize FIT encoder in startRecording()

  ```typescript
  async startRecording(): Promise<void> {
    // ... existing code ...

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
  ```

- [ ] **T-205** Feed sensor readings to FIT encoder

  ```typescript
  private handleSensorReading(reading: SensorReading): void {
    // ... existing code ...

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
  ```

- [ ] **T-206** Feed location updates to FIT encoder

  ```typescript
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
  ```

- [ ] **T-207** Finalize FIT file in finishRecording()

  ```typescript
  async finishRecording(): Promise<void> {
    // ... existing code ...

    if (this.fitEncoder) {
      this.fitFileBuffer = await this.fitEncoder.finish();
      this.fitFilePath = `${this.recordingMetadata?.profileId}/${Date.now()}.fit`;
    }
  }
  ```

### FIT Upload Service

- [ ] **T-208** Create FitUploader service
  - Location: `apps/mobile/lib/services/fit/FitUploader.ts`
  - Reuse existing upload logic
  - Upload to `fit-files` bucket
  - Implement retry logic with exponential backoff

- [ ] **T-209** Add progress tracking to FitUploader
  - Report upload progress
  - Handle upload errors

- [ ] **T-210** Add file size validation
  - Maximum: 50MB
  - Reject oversized files

### Activity Submission Update

- [ ] **T-211** Update useActivitySubmission hook to use new tRPC approach

  ```typescript
  const processRecording = useCallback(async () => {
    // ... existing code ...

    // Generate FIT file
    const fitBuffer = service.fitFileBuffer;
    const fitPath = service.fitFilePath;

    if (fitBuffer && fitPath) {
      // Upload FIT file to storage
      const fileName = `${userId}/${Date.now()}.fit`;
      const blob = base64ToBlob(
        uint8ArrayToBase64(fitBuffer),
        "application/fit",
      );

      const { error: uploadError } = await supabase.storage
        .from("activity-files")
        .upload(fileName, blob, {
          contentType: "application/fit",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Call tRPC mutation to process FIT file
      const client = api.fitFiles.processFitFile.useClient();
      const result = await client.mutate({
        fitFilePath: fileName,
        name: activityName,
        notes: activityNotes,
        activityType: activityType,
      });

      if (!result.success) {
        // Cleanup uploaded file on failure
        await supabase.storage.from("activity-files").remove([fileName]);
        throw new Error(result.error.message);
      }

      return result.activity;
    }
  }, [service, userId]);
  ```

### Performance Testing

- [ ] **T-212** Test real-time encoding performance
  - Monitor memory usage
  - Measure CPU impact
  - Check battery impact

- [ ] **T-213** Test crash recovery
  - Simulate crash during recording
  - Verify checkpoint recovery
  - Test FIT file integrity after recovery

- [ ] **T-214** Test with long recordings
  - 1+ hour activity
  - Verify file integrity
  - Check file size growth

### Mobile Deliverables

- [ ] @garmin/fitsdk installed
- [ ] FIT encoder integrated into ActivityRecorder
- [ ] FitUploader created/updated
- [ ] useActivitySubmission updated
- [ ] Performance testing complete

---

## Phase 3: tRPC Mutation Implementation

**Duration:** 3-4 days  
**Goal:** Implement FIT file processing using synchronous tRPC mutation with simplified storage

### tRPC Router Setup

- [ ] **T-301** Create `packages/trpc/src/routers/fit-files.ts`
  - Implement `processFitFile` protected procedure
  - Import existing functions from `@repo/core` (no duplication)
  - Use `publicActivitiesInsertSchema` from `@repo/supabase`

- [ ] **T-302** Implement file download from storage

  ```typescript
  const { data: fitFile, error: downloadError } = await ctx.supabase.storage
    .from("activity-files")
    .download(input.fitFilePath);
  ```

- [ ] **T-303** Handle download errors
  - Invalid file path
  - Permission errors
  - File not found

### FIT Parsing with @repo/core

- [ ] **T-304** Use existing FIT parser from @repo/core

  ```typescript
  import { parseFitFileWithSDK } from "@repo/core/lib/fit-sdk-parser.ts";

  const arrayBuffer = await fitFile.arrayBuffer();
  const parseResult = await parseFitFileWithSDK(arrayBuffer);
  ```

- [ ] **T-305** Handle parsing errors using existing validation
  - Invalid FIT format
  - Corrupted data
  - Missing required messages

- [ ] **T-306** Extract activity summary using existing @repo/core function

  ```typescript
  import { extractActivitySummary } from "@repo/core/lib/extract-activity-summary.ts";
  const summary = extractActivitySummary(parseResult.data);
  ```

### Metrics Calculation with @repo/core

- [ ] **T-307** Extract streams using existing @repo/core utility

  ```typescript
  import { extractNumericStream } from "@repo/core/utils/extract-streams.ts";

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
  ```

- [ ] **T-308** Calculate TSS using existing @repo/core function

  ```typescript
  import { calculateTSSFromAvailableData } from "@repo/core/calculations/tss.ts";

  const tss = calculateTSSFromAvailableData({
    normalizedPower,
    ftp: summary.ftp,
    duration: summary.duration,
    activityType: input.activityType,
  });
  ```

- [ ] **T-309** Calculate power metrics using existing @repo/core functions

  ```typescript
  import {
    calculateNormalizedPower,
    calculateIntensityFactor,
    calculateVariabilityIndex,
  } from "@repo/core/calculations.ts";
  ```

- [ ] **T-310** Extract zones using existing @repo/core functions

  ```typescript
  import {
    extractHeartRateZones,
    extractPowerZones,
  } from "@repo/core/lib/extract-zones.ts";
  ```

- [ ] **T-311** Detect test efforts using existing @repo/core functions

  ```typescript
  import {
    detectPowerTestEfforts,
    detectRunningTestEfforts,
    detectHRTestEfforts,
  } from "@repo/core/detection/";
  ```

- [ ] **T-312** Calculate performance curves using existing @repo/core functions

  ```typescript
  import {
    calculatePowerCurve,
    calculateHRCurve,
    calculatePaceCurve,
  } from "@repo/core/calculations/curves.ts";
  ```

### Activity Creation with Individual Metric Columns

- [ ] **T-313** Create activity record with individual metric columns

  ```typescript
  const activityData = {
    user_id: userId,
    name: input.name,
    notes: input.notes,
    activity_type: input.activityType,
    fit_file_path: input.fitFilePath,
    processing_status: "completed",
    start_time: new Date(summary.startTime),
    // Individual metric columns
    duration: summary.duration,
    distance: summary.distance,
    calories: summary.calories,
    elevation_gain: summary.elevationGain,
    avg_power: powerMetrics?.avgPower,
    normalized_power: powerMetrics?.normalizedPower,
    // ... all other individual metric columns
  };

  const { data: createdActivity, error: insertError } = await ctx.supabase
    .from("activities")
    .insert(activityData)
    .select()
    .single();
  ```

- [ ] **T-314** Handle database errors with file cleanup

  ```typescript
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
  ```

### tRPC Router Registration and Error Handling

- [ ] **T-315** Register fitFilesRouter in root router

  ```typescript
  // packages/trpc/src/root.ts
  import { fitFilesRouter } from "./routers/fit-files";

  export const appRouter = createTRPCRouter({
    // ... existing routers
    fitFiles: fitFilesRouter,
  });
  ```

- [ ] **T-316** Handle errors with proper TRPCError types

  ```typescript
  if (downloadError || !fitFile) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to download FIT file from storage",
      cause: downloadError,
    });
  }

  if (!parseResult.success || !parseResult.data) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: parseResult.error || "Failed to parse FIT file",
    });
  }
  ```

### Testing and Validation

- [ ] **T-317** Test tRPC mutation with various FIT files
  - Garmin FIT files
  - Wahoo FIT files
  - COROS FIT files

- [ ] **T-318** Test edge cases
  - Corrupted files
  - Incomplete files
  - Files without power data
  - Files without GPS data

- [ ] **T-319** Verify metrics accuracy
  - Spot check TSS calculations
  - Verify zone distributions
  - Check test effort detection
  - Validate stream compression/decompression

- [ ] **T-320** Measure processing performance
  - Processing time per file
  - Memory usage during processing
  - Database query performance

- [ ] **T-321** Verify FIT file storage in Supabase Storage
  - Test FIT files uploaded correctly
  - Test FIT files can be downloaded and parsed
  - Verify metrics accessible without JOINs

### Processing Deliverables

- [ ] tRPC fitFilesRouter fully implemented
- [ ] All metrics calculated using @repo/core functions
- [ ] Metrics stored in individual columns
- [ ] Raw FIT files stored in Supabase Storage
- [ ] Error handling implemented with proper TRPCError types
- [ ] Testing complete with FIT-file-only approach

---

## Phase 4: User Interface

**Duration:** 2 days  
**Goal:** Add processing status display and retry functionality

### Components

- [ ] **T-401** Create ProcessingStatusBadge component
  - Location: `apps/mobile/components/fit/ProcessingStatusBadge.tsx`
  - Implement PENDING state (gray badge)
  - Implement PROCESSING state (amber badge)
  - Implement COMPLETED state (green badge)
  - Implement FAILED state (red badge with error)
  - Add retry button for FAILED state

- [ ] **T-402** Add ProcessingStatusBadge to PastActivityCard

  ```tsx
  {
    activity.processing_status && (
      <ProcessingStatusBadge
        status={activity.processing_status}
        error={activity.processing_error}
      />
    );
  }
  ```

- [ ] **T-403** Add status display to ActivityDetailScreen
  - Show processing status badge
  - Show error message if failed
  - Show retry button if failed

- [ ] **T-404** Implement retry functionality
  - Create retry mutation
  - Call mutation on button press
  - Reset processing status to PENDING

- [ ] **T-405** Add loading states
  - Show spinner during processing
  - Disable retry button during processing
  - Show progress indicator

### Styling

- [ ] **T-406** Style ProcessingStatusBadge
  - Use consistent color scheme
  - Match app design language
  - Handle different screen sizes

- [ ] **T-407** Style retry button
  - Make button tappable
  - Add loading state styling
  - Add hover/press effects

### UI Deliverables

- [ ] ProcessingStatusBadge component created
- [ ] Status badges visible on activity cards
- [ ] Status display on activity detail screen
- [ ] Retry button functional
- [ ] Loading states implemented

---

## Phase 5: Data Migration

**Duration:** 2-3 days  
**Goal:** Migrate existing activities and verify system

### Migration Script

- [ ] **T-501** Create migration script

  ```typescript
  // Migration script to backfill processing_status
  const { data: activities } = await supabase
    .from("activities")
    .select("id")
    .is("processing_status", null);

  for (const activity of activities) {
    await supabase
      .from("activities")
      .update({ processing_status: "COMPLETED" })
      .eq("id", activity.id);
  }
  ```

- [ ] **T-502** Add error handling to migration
  - Log errors
  - Continue on individual failures
  - Report final status

- [ ] **T-503** Add dry-run option
  - Preview affected activities
  - Estimate processing time

### Testing

- [ ] **T-504** Test migration on staging
  - Run migration on staging database
  - Verify all activities processed
  - Check for performance issues

- [ ] **T-505** Verify metrics accuracy
  - Spot check TSS calculations
  - Verify HR zone distributions
  - Check power zone accuracy

### Production Migration

- [ ] **T-506** Schedule production migration
  - Choose low-traffic period
  - Notify users if needed
  - Prepare rollback plan

- [ ] **T-507** Execute production migration
  - Run migration script
  - Monitor progress
  - Handle errors

- [ ] **T-508** Verify migration success
  - Check all activities updated
  - Spot check metrics
  - Verify no data loss

### End-to-End Testing

- [ ] **T-509** Record new activity
  - Use FIT encoding
  - Complete recording
  - Submit activity

- [ ] **T-510** Verify server processing
  - Check processing status transitions
  - Verify metrics calculated
  - Check GPS polyline generated

- [ ] **T-511** Verify UI updates
  - Check status badge updates
  - Verify metrics display correctly
  - Test retry functionality

### Performance Testing

- [ ] **T-512** Test with large FIT files
  - Files > 30MB
  - Files > 50MB (should fail with error)

- [ ] **T-513** Measure processing time
  - Track average time
  - Identify slow files
  - Set up monitoring

### Documentation

- [ ] **T-514** Update API documentation
  - Document new endpoints
  - Update response types
  - Add error codes

- [ ] **T-515** Create troubleshooting guide
  - Common errors
  - Error messages and solutions
  - Retry procedures

- [ ] **T-516** Document known limitations
  - File size limits
  - Supported devices
  - Known issues

### Migration Deliverables

- [ ] Migration script tested
- [ ] Staging migration complete
- [ ] Production migration complete
- [ ] Metrics verified
- [ ] E2E tests passing
- [ ] Documentation updated

---

## Task Summary

| Phase                                 | Tasks          | Status  |
| ------------------------------------- | -------------- | ------- |
| Phase 1: Infrastructure Setup         | T-101 to T-104 | Pending |
| Phase 2: Mobile Recording Integration | T-201 to T-214 | Pending |
| Phase 3: tRPC Mutation Implementation | T-301 to T-321 | Pending |
| Phase 4: User Interface               | T-401 to T-407 | Pending |
| Phase 5: Data Migration               | T-501 to T-516 | Pending |

---

## Blockers and Dependencies

### Current Blockers

1. **Database migration not applied**
   - Blocks: TypeScript types, Zod schemas
   - Resolution: Apply migration to init.sql and remove activity_streams table

2. **tRPC router configuration**
   - Blocks: FIT file processing
   - Resolution: Create fitFilesRouter and register in root router

### Architecture Simplifications

1. **No activity_streams table needed**
   - Raw FIT files stored in Supabase Storage
   - Metrics stored in individual columns
   - Simplifies database schema

2. **No Edge Functions needed**
   - Single synchronous tRPC mutation handles all processing
   - Uses existing @repo/core functions (no code duplication)
   - Reduced implementation complexity

### Dependencies Between Phases

1. Phase 1 must complete before Phase 2 can start
2. Phase 2 must complete before Phase 3 can start
3. Phase 3 must complete before Phase 4 can start
4. Phase 4 must complete before Phase 5 can start

### Parallel Work

1. UI components (Phase 4) can be developed in parallel with Edge Function (Phase 3)
2. Migration script (Phase 5) can be developed in parallel with UI components (Phase 4)

---

## Testing Checklist

### Unit Tests

- [ ] FIT parsing tests
- [ ] Metrics calculation tests
- [ ] GPS polyline tests
- [ ] Error handling tests

### Integration Tests

- [ ] Database migration tests
- [ ] Edge Function tests
- [ ] tRPC procedure tests
- [ ] Upload/download tests

### End-to-End Tests

- [ ] Full recording flow
- [ ] Processing flow
- [ ] Retry flow
- [ ] UI display flow

### Performance Tests

- [ ] Large file processing
- [ ] Memory usage tests
- [ ] Processing time benchmarks

---

**Document Version:** 2.1.0  
**Last Updated:** January 23, 2026  
**Next Review:** Implementation Ready
