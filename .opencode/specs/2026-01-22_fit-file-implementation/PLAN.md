# Plan: FIT File Implementation

## Overview

This implementation plan covers the integration of FIT file support for GradientPeak using a **simplified architecture** with tRPC mutations and @repo/core integration. Key changes from previous versions:

- **activity_streams table removed** - Stream data remains only in raw FIT file in Supabase Storage
- **Single synchronous tRPC mutation** - no Edge Functions needed
- **All calculations use existing @repo/core functions** - no code duplication
- **No JOIN operations** - simplified database queries

**Timeline:** 8-12 days (2 weeks)  
**Phases:** 5

---

## Phases

### Phase 1: Infrastructure Setup

**Duration:** 1-2 days  
**Goal:** Set up database schema, types, and edge function foundation

#### Tasks

- [ ] **1.1** Apply database migration for FIT columns
  - Location: `packages/supabase/migrations/20260121_add_fit_file_support.sql`
  - Columns: `fit_file_path`, `processing_status`, `processing_error`, `fit_file_size`
  - Indexes: `idx_activities_processing_status`, `idx_activities_fit_path`
  - **Remove activity_streams table** - `DROP TABLE IF EXISTS activity_streams;`

- [ ] **1.2** Regenerate TypeScript types

  ```bash
  cd packages/supabase && supabase generate-types
  ```

- [ ] **1.3** Regenerate Zod schemas

  ```bash
  cd packages/supabase && supazod generate
  ```

- [ ] **1.4** Create tRPC router for FIT files
  - Location: `packages/trpc/src/routers/fit-files.ts`
  - Implement processFitFile protected procedure

- [ ] **1.5** Register fitFilesRouter in root router
  - Location: `packages/trpc/src/root.ts`
  - Add fitFiles: fitFilesRouter to router configuration

- [ ] **1.6** No Edge Function needed
  - Simplified architecture uses single tRPC mutation
  - All processing happens synchronously in the mutation

#### Deliverables

- [ ] Database migration applied (including activity_streams table removal)
- [ ] TypeScript types regenerated
- [ ] Zod schemas regenerated (removing activity_streams references)
- [ ] tRPC fitFilesRouter created and registered
- [ ] No Edge Function configuration needed

---

### Phase 2: Mobile Recording Integration

**Duration:** 3-5 days  
**Goal:** Integrate FIT encoding into the ActivityRecorder service

#### Tasks

- [ ] **2.1** Add `@garmin/fitsdk` dependency to mobile app

  ```bash
  cd apps/mobile && npm install @garmin/fitsdk@^21.188.0
  ```

- [ ] **2.2** Review existing `StreamingFitEncoder` class
  - Location: `apps/mobile/lib/services/ActivityRecorder/StreamingFitEncoder.ts`
  - Verify crash recovery implementation
  - Verify checkpoint mechanism (60s intervals)

- [ ] **2.3** Integrate FIT encoder into ActivityRecorder

  ```typescript
  // In ActivityRecorder/index.ts

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

- [ ] **2.4** Create FitUploader service for FIT files
  - Location: `apps/mobile/lib/services/fit/FitUploader.ts`
  - Reuse existing upload logic from `FitUploader.ts`
  - Upload to `fit-files` bucket
  - Implement retry logic with exponential backoff
  - Track upload progress

- [ ] **2.5** Update useActivitySubmission hook for FIT upload

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

- [ ] **2.6** Test real-time encoding performance
  - Monitor memory usage during encoding
  - Verify checkpoint writes
  - Test crash recovery scenario

- [ ] **2.7** Add FIT file size validation
  - Maximum size: 50MB
  - Reject files exceeding limit

#### Deliverables

- [ ] `@garmin/fitsdk` installed on mobile
- [ ] FIT encoder integrated into ActivityRecorder
- [ ] FitUploader created/updated for FIT files
- [ ] useActivitySubmission updated for FIT upload
- [ ] Performance testing complete

---

### Phase 3: tRPC Mutation Implementation

**Duration:** 3-4 days  
**Goal:** Implement FIT file processing using synchronous tRPC mutation with @repo/core integration

#### Tasks

- [ ] **3.1** Implement processFitFile tRPC mutation
  - Download FIT file from Supabase Storage
  - Parse using existing `parseFitFileWithSDK()` from @repo/core
  - Extract activity summary using `extractActivitySummary()` from @repo/core

- [ ] **3.2** Use existing @repo/core functions (no implementation needed)
  - `calculateTSSFromAvailableData()` for TSS calculation
  - `calculateNormalizedPower()` and `calculateIntensityFactor()` for power metrics
  - `extractHeartRateZones()` and `extractPowerZones()` for zones
  - `detectPowerTestEfforts()`, `detectRunningTestEfforts()` for test detection
  - `calculatePowerCurve()`, `calculateHRCurve()`, `calculatePaceCurve()` for curves

- [ ] **3.3** Create activity record with all data
  - Single INSERT into activities table
  - All metrics in individual columns

- [ ] **3.5** Add proper error handling with TRPCError
  - Download errors
  - Parsing errors
  - Database errors with file cleanup

- [ ] **3.6** Test tRPC mutation with various FIT files
  - Garmin, Wahoo, COROS files
  - Edge cases (corrupted, incomplete, missing data types)
  - Confirm no JOIN operations needed for activity queries

#### Deliverables

- [ ] tRPC fitFilesRouter fully implemented
- [ ] All metrics calculated using existing @repo/core functions
- [ ] Error handling implemented with proper TRPCError types
- [ ] No JOIN operations needed for activity data retrieval

---

### Phase 4: User Interface

**Duration:** 2 days  
**Goal:** Add processing status display and retry functionality

#### Tasks

- [ ] **4.1** Create ProcessingStatusBadge component

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
    // Implementation from DESIGN.md
  }
  ```

- [ ] **4.2** Add status badges to PastActivityCard

  ```tsx
  import { ProcessingStatusBadge } from "./fit/ProcessingStatusBadge";

  export function PastActivityCard({
    activity,
    onPress,
  }: PastActivityCardProps) {
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
          {/* ... rest of component */}
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **4.3** Add status display to ActivityDetailScreen
  - Location: `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
  - Show processing status badge
  - Show error message if failed
  - Show retry button if failed

- [ ] **4.4** Implement retry button functionality
  - Call tRPC mutation to reset processing status
  - Re-trigger tRPC mutation processing

- [ ] **4.5** Add loading state for processing
  - Show spinner while processing
  - Disable retry button during processing

- [ ] **4.6** Style status components
  - Use consistent color scheme
  - Match app design language
  - Responsive to different screen sizes

#### Deliverables

- [ ] ProcessingStatusBadge component created
- [ ] Status badges visible on activity cards
- [ ] Status display on activity detail screen
- [ ] Retry button functional
- [ ] Loading states implemented

---

### Phase 5: Data Migration

**Duration:** 2-3 days  
**Goal:** Migrate existing activities and verify system

#### Tasks

- [ ] **5.1** Create migration script for existing activities

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

- [ ] **5.2** Test migration on staging data
  - Run migration on staging database
  - Verify all activities processed correctly
  - Check for performance issues

- [ ] **5.3** Run migration on production data
  - Schedule during low-traffic period
  - Monitor system performance
  - Have rollback plan ready

- [ ] **5.4** Verify all metrics calculate correctly
  - Spot check TSS calculations
  - Verify HR zone distributions
  - Check power zone accuracy
  - Validate GPS polyline encoding

- [ ] **5.5** End-to-end testing
  - Record new activity with FIT encoding
  - Upload to server
  - Verify processing completes
  - Check metrics in UI

- [ ] **5.6** Performance testing
  - Test with large FIT files (>30MB)
  - Measure processing time
  - Monitor server resource usage

- [ ] **5.7** Documentation update
  - Update API documentation
  - Add troubleshooting guide
  - Document known limitations

#### Deliverables

- [ ] Migration script tested
- [ ] Staging migration complete
- [ ] Production migration complete
- [ ] Metrics verified
- [ ] E2E tests passing
- [ ] Documentation updated

---

## Timeline Summary

| Phase                                 | Duration | Total Days |
| ------------------------------------- | -------- | ---------- |
| Phase 1: Infrastructure Setup         | 1-2 days | Day 1-2    |
| Phase 2: Mobile Recording Integration | 3-5 days | Day 3-7    |
| Phase 3: tRPC Mutation Implementation | 2-3 days | Day 8-10   |
| Phase 4: User Interface               | 2 days   | Day 11-12  |
| Phase 5: Data Migration               | 2-3 days | Day 13-15  |

**Total:** 8-12 days (approximately 2 weeks)

---

## Dependencies

### Package Dependencies

```json
{
  "dependencies": {
    "@garmin/fitsdk": "^21.188.0",
    "@mapbox/polyline": "^1.2.1"
  }
}
```

### No Deno Dependencies Needed

Simplified architecture uses tRPC mutations instead of Edge Functions. All processing uses existing @repo/core functions.

### Stream Storage Simplification

Stream data remains in the raw FIT file in Supabase Storage, eliminating the need for database storage of stream data. This simplifies the architecture by removing compression, decompression, and storage logic for streams.

### Build Dependencies

- TypeScript configuration updates
- Test runner configuration
- CI/CD pipeline updates

---

## Risks and Mitigations

| Risk                                     | Impact | Mitigation                                          |
| ---------------------------------------- | ------ | --------------------------------------------------- |
| SDK bundle size increases mobile app     | High   | Use only needed classes, lazy loading               |
| Large file memory on mobile              | High   | Memory guards, chunked processing                   |
| FIT profile changes breaking parsing     | Medium | SDK updates via npm, version pinning                |
| Processing time exceeding SLA            | Low    | Synchronous tRPC mutation is faster than async      |
| Migration affecting production           | Medium | Simplified migration (just remove activity_streams) |
| Real-time encoding impacting battery     | Medium | Benchmarking, optimization                          |
| Stream compression affecting performance | Low    | Existing @repo/core compression utilities tested    |

---

## Success Criteria

### Technical Criteria

| Metric                  | Target                               |
| ----------------------- | ------------------------------------ |
| FIT file integrity      | 100% validated by @repo/core SDK     |
| Upload success rate     | >95%                                 |
| Processing success rate | >98%                                 |
| Processing time         | <15 seconds per activity (tRPC sync) |
| Error Recovery Success  | >99%                                 |
| Query performance       | Single activity query (no JOINs)     |

### Testing Criteria

| Metric                               | Target |
| ------------------------------------ | ------ |
| Message Type Coverage                | ≥95%   |
| Field Conversion Accuracy            | 100%   |
| Platform Test Coverage (iOS/Android) | ≥90%   |
| Error Path Test Coverage             | 100%   |
| Integration Test Coverage            | ≥85%   |

### User Experience Criteria

| Metric                    | Target                 |
| ------------------------- | ---------------------- |
| Processing status visible | 100% of activities     |
| Retry button available    | For failed processing  |
| Error messages helpful    | User-friendly language |
| Upload progress visible   | During FIT upload      |

---

## Files Reference

### New Files to Create

```
packages/supabase/migrations/20260121_add_fit_file_support.sql
apps/mobile/lib/services/fit/types.ts
apps/mobile/lib/services/fit/StreamingFitEncoder.ts
apps/mobile/lib/services/fit/FitUploader.ts
apps/mobile/lib/services/fit/index.ts
apps/mobile/components/fit/ProcessingStatusBadge.tsx
packages/trpc/src/routers/fit-files.ts  # NEW: tRPC router for FIT processing
```

### Files to Modify

```
apps/mobile/lib/services/ActivityRecorder/index.ts
apps/mobile/lib/hooks/useActivitySubmission.ts
apps/mobile/components/PastActivityCard.tsx
apps/mobile/app/(internal)/(standard)/activity-detail.tsx
packages/trpc/src/routers/activities.ts
packages/trpc/src/root.ts              # Register fitFilesRouter
packages/supabase/supazod/schemas.ts   # Remove activity_streams references
packages/supabase/database.types.ts
```

### Deprecated Files

```
packages/supabase/functions/process-activity-fit/  # Not needed - use tRPC
```

---

## Key Decisions

| Decision                | Options                           | Recommendation                   |
| ----------------------- | --------------------------------- | -------------------------------- |
| **Encoding Library**    | fit-encoder-js vs @garmin/fitsdk  | Use @garmin/fitsdk Encoder class |
| **Processing Location** | Mobile vs Server                  | Mobile encoding, Server parsing  |
| **Processing Trigger**  | Database trigger vs tRPC mutation | tRPC mutation                    |
| **Status Column**       | Use existing migration            | Apply existing migration         |
| **Metrics Storage**     | Individual columns vs JSONB       | Use individual columns           |

---

## Post-Implementation

### Future Enhancements

1. **FIT File Export**
   - Allow users to download activity as FIT file
   - Support workout transfer to devices

2. **Developer Data Fields**
   - Support custom metrics in FIT files
   - Integration with third-party analysis tools

3. **Batch Import**
   - Import multiple FIT files at once
   - Device dump processing

4. **Privacy Zones**
   - Hide sensitive location data
   - Privacy-first GPS processing

### Monitoring

1. **Processing Time Metrics**
   - Track average processing time
   - Alert on SLA breaches

2. **Error Rate Monitoring**
   - Track failed processing rate
   - Identify common error patterns

3. **Storage Usage**
   - Monitor FIT file storage growth
   - Implement cleanup policies

---

**Document Version:** 2.0.0  
**Last Updated:** January 22, 2026  
**Next Review:** Before starting Phase 2
