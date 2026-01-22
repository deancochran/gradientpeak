# Tasks: FIT File Implementation

## Task List by Phase

This document provides a granular checklist for implementing FIT file support in GradientPeak.

---

## Phase 1: Infrastructure Setup

**Duration:** 1-2 days  
**Goal:** Set up database schema, types, and edge function foundation

### Database Setup

- [ ] **T-101** Review existing migration file
  - Location: `packages/supabase/migrations/20240120_add_fit_file_support.sql`
  - Verify columns: `fit_file_path`, `processing_status`, `processing_error`, `fit_file_size`

- [ ] **T-102** Apply migration to init.sql
  - Add columns to `packages/supabase/schemas/init.sql`
  - Add indexes for `processing_status` and `fit_file_path`

- [ ] **T-103** Generate TypeScript types

  ```bash
  cd packages/supabase && supabase generate-types
  ```

- [ ] **T-104** Update Zod schemas
  - Add FIT columns to `publicActivitiesInsertSchema`
  - Add processing_status enum

### Edge Function Setup

- [ ] **T-105** Create process-activity-fit directory
  - Location: `packages/supabase/functions/process-activity-fit/`

- [ ] **T-106** Create deno.json

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

- [ ] **T-107** Implement Edge Function skeleton
  - Handle CORS preflight requests
  - Validate request method (POST only)
  - Validate activityId parameter

- [ ] **T-108** Connect to Supabase
  - Initialize Supabase client
  - Verify connection

- [ ] **T-109** Add Edge Function to config.toml

  ```toml
  [functions.process-activity-fit]
    uri = "packages/supabase/functions/process-activity-fit/index.ts"
  ```

- [ ] **T-110** Test Edge Function deployment
  - Deploy to staging
  - Verify function is accessible

### Infrastructure Deliverables

- [ ] Database migration applied
- [ ] TypeScript types generated
- [ ] Zod schemas updated
- [ ] Edge Function skeleton working
- [ ] Configuration updated

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

- [ ] **T-211** Update useActivitySubmission hook

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

## Phase 3: Automatic Processing

**Duration:** 4-5 days  
**Goal:** Implement real FIT file parsing and metrics calculation in Edge Function

### FIT File Download

- [ ] **T-301** Implement file download from storage

  ```typescript
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("fit-files")
    .download(activity.fit_file_path);
  ```

- [ ] **T-302** Handle download errors
  - Invalid file path
  - Permission errors
  - File not found

### FIT Parsing

- [ ] **T-303** Integrate @garmin/fitsdk decode

  ```typescript
  import { decode } from "@garmin/fitsdk";

  const arrayBuffer = await fileData.arrayBuffer();
  const fitData = decode(new Uint8Array(arrayBuffer));
  const records = fitData.records as FitRecord[];
  const session = fitData.sessions?.[0] as FitSession;
  ```

- [ ] **T-304** Handle parsing errors
  - Invalid FIT format
  - Corrupted data
  - Missing required messages

- [ ] **T-305** Validate parsed data
  - Check for required messages
  - Validate data ranges
  - Handle edge cases

### Metrics Calculation

- [ ] **T-306** Calculate TSS (Training Stress Score)

  ```typescript
  function calculateTSS(
    avgPower: number,
    np: number,
    duration: number,
    ftp: number,
  ): number {
    const intensityFactor = avgPower > 0 ? np / ftp : 0;
    return Math.round(
      intensityFactor * intensityFactor * (duration / 3600) * 100,
    );
  }
  ```

- [ ] **T-307** Calculate IF (Intensity Factor)

  ```typescript
  function calculateIF(np: number, ftp: number): number {
    return ftp > 0 ? Math.round((np / ftp) * 100) / 100 : 0;
  }
  ```

- [ ] **T-308** Calculate NP (Normalized Power)

  ```typescript
  function calculateNormalizedPower(powerReadings: number[]): number {
    if (powerReadings.length === 0) return 0;
    const fourthPowerSum = powerReadings.reduce(
      (sum, p) => sum + Math.pow(p, 4),
      0,
    );
    return Math.round(Math.pow(fourthPowerSum / powerReadings.length, 0.25));
  }
  ```

- [ ] **T-309** Calculate HR Zones

  ```typescript
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
  ```

- [ ] **T-310** Calculate Power Zones
  ```typescript
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
  ```

### GPS Polyline

- [ ] **T-311** Implement semicircles to degrees conversion

  ```typescript
  function semicirclesToDegrees(semicircles: number): number {
    return semicircles * (180 / Math.pow(2, 31));
  }
  ```

- [ ] **T-312** Generate GPS polyline

  ```typescript
  import { polyline } from "npm:@mapbox/polyline@^1.2.1";

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
  ```

### Activity Update

- [ ] **T-313** Update activity with results
  ```typescript
  await supabase
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
  ```

### Error Handling

- [ ] **T-314** Update processing status at start

  ```typescript
  await supabase
    .from("activities")
    .update({ processing_status: "PROCESSING" })
    .eq("id", activityId);
  ```

- [ ] **T-315** Handle errors gracefully

  ```typescript
  catch (error) {
    console.error("Processing error:", error);

    try {
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
      { status: 500 },
    );
  }
  ```

### Testing

- [ ] **T-316** Test with Garmin FIT files
- [ ] **T-317** Test with Wahoo FIT files
- [ ] **T-318** Test with COROS FIT files
- [ ] **T-319** Test with corrupted files
- [ ] **T-320** Test with incomplete files
- [ ] **T-321** Verify metrics accuracy
- [ ] **T-322** Measure processing time

### Processing Deliverables

- [ ] Edge Function fully implemented
- [ ] All metrics calculated correctly
- [ ] GPS polyline generation working
- [ ] Error handling implemented
- [ ] Testing complete

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

| Phase                         | Tasks          | Status  |
| ----------------------------- | -------------- | ------- |
| Phase 1: Infrastructure       | T-101 to T-110 | Pending |
| Phase 2: Mobile Recording     | T-201 to T-214 | Pending |
| Phase 3: Automatic Processing | T-301 to T-322 | Pending |
| Phase 4: User Interface       | T-401 to T-407 | Pending |
| Phase 5: Data Migration       | T-501 to T-516 | Pending |

---

## Blockers and Dependencies

### Current Blockers

1. **Database migration not applied**
   - Blocks: TypeScript types, Zod schemas
   - Resolution: Apply migration to init.sql

2. **Edge Function configuration**
   - Blocks: Edge Function deployment
   - Resolution: Update config.toml

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

**Document Version:** 2.0.0  
**Last Updated:** January 22, 2026  
**Next Review:** Before starting Phase 2
