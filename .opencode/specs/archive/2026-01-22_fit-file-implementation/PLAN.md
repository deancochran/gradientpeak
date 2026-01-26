# Plan: FIT File Implementation

## Overview

This implementation plan covers the integration of FIT file support for GradientPeak using a **simplified architecture** with tRPC mutations and @repo/core integration. Key changes from previous versions:

- **activity_streams table removed** - Stream data remains only in raw FIT file in Supabase Storage
- **Single synchronous tRPC mutation** - no Edge Functions needed
- **All calculations use existing @repo/core functions** - no code duplication
- **No JOIN operations** - simplified database queries

**Timeline:** 6-9 days (1.5 weeks)  
**Phases:** 4 (Phase 5 removed - hard cut with no backward compatibility)

---

## Phases

### Phase 1: Infrastructure & Core Encoding

**Duration:** 2-3 days  
 **Goal:** Set up database schema, types, and implement core FIT encoding/decoding capabilities

#### Tasks

- [ ] **1.1** Apply database migration for FIT columns
  - Location: `packages/supabase/migrations/20260123131234_fit-file.sql`
  - Columns: `fit_file_path`, `fit_file_size`
  - Indexes: `idx_activities_fit_path`
  - **Remove activity_streams table** - `DROP TABLE IF EXISTS activity_streams;`
  - **Note:** No processing_status or processing_error columns - activities only created if FIT file successfully parsed

- [ ] **1.2** Implement FIT Encoder in `@repo/core`
  - Location: `packages/core/lib/fit-sdk-encoder.ts`
  - Define `StandardActivity` interface in `packages/core/types/normalization.ts`
  - Implement `encodeFitFile(data: StandardActivity): Uint8Array`
  - Logic:
    - Convert JS Dates to FIT Timestamps (seconds since 1989)
    - Convert Degrees to Semicircles for GPS
    - Generate synthetic `LAP` and `SESSION` messages from summary data
    - Write `RECORD` messages from streams
  - Use `@garmin/fitsdk` for encoding

- [ ] **1.3** Verify FIT Decoder in `@repo/core`
- Location: `packages/core/lib/fit-sdk-parser.ts`
- Ensure `parseFitFileWithSDK` handles all standard FIT files
- Verify compatibility with files from Storage bucket (Garmin, Wahoo, etc.)

- [ ] **1.4** Regenerate TypeScript types

  ```bash
  cd packages/supabase && supabase generate-types
  ```

- [ ] **1.5** Regenerate Zod schemas

  ```bash
  cd packages/supabase && supazod generate
  ```

- [ ] **1.6** Create tRPC router for FIT files
  - Location: `packages/trpc/src/routers/fit-files.ts`
  - Implement processFitFile protected procedure

- [ ] **1.7** Register fitFilesRouter in root router
  - Location: `packages/trpc/src/root.ts`
  - Add fitFiles: fitFilesRouter to router configuration

- [ ] **1.8** No Edge Function needed
  - Simplified architecture uses single tRPC mutation
  - All processing happens synchronously in the mutation

#### Deliverables

- [ ] Database migration applied (including activity_streams table removal, no processing_status columns)
- [ ] **FIT Encoder implemented in `@repo/core`**
- [ ] **FIT Decoder verified for storage bucket compatibility**
- [ ] TypeScript types regenerated
- [ ] Zod schemas regenerated (removing activity_streams and processing_status references)
- [ ] tRPC fitFilesRouter created and registered with error logging/notification
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

**Duration:** 1 day  
**Goal:** Update activity submission UI to handle FIT file upload errors gracefully

#### Tasks

- [ ] **4.1** Update activity submission error handling
  - Location: `apps/mobile/lib/hooks/useActivitySubmission.ts`
  - Show user-friendly error messages when FIT upload/processing fails
  - Clear error state on retry
  - Log errors for debugging

- [ ] **4.2** Add loading states during FIT upload
  - Show spinner while uploading FIT file
  - Show progress indicator if possible
  - Disable submit button during upload

- [ ] **4.3** Update ActivityDetailScreen for on-demand stream loading
  - Location: `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
  - Load stream data asynchronously when user views charts/maps
  - Show loading state while parsing FIT file
  - Handle parsing errors gracefully

- [ ] **4.4** Style loading and error states
  - Use consistent color scheme
  - Match app design language
  - Responsive to different screen sizes

#### Deliverables

- [ ] Error handling updated in activity submission
- [ ] Loading states implemented for FIT upload
- [ ] On-demand stream loading working in activity detail
- [ ] User-friendly error messages displayed

**Note:** No retry logic or processing status badges needed - activities only created if FIT file successfully parsed

---

### ~~Phase 5: Data Migration~~ (REMOVED)

**Status:** NOT IMPLEMENTED - Hard cut with no backward compatibility

**Rationale:**

- No processing_status column means no migration needed
- Activities are only created if FIT file is successfully stored and parsed
- Existing activities without FIT files remain unchanged
- New activities must have valid FIT files from the start

---

## Timeline Summary

| Phase                                 | Duration | Total Days |
| ------------------------------------- | -------- | ---------- |
| Phase 1: Infrastructure Setup         | 1-2 days | Day 1-2    |
| Phase 2: Mobile Recording Integration | 3-5 days | Day 3-7    |
| Phase 3: tRPC Mutation Implementation | 2-3 days | Day 8-10   |
| Phase 4: User Interface               | 1 day    | Day 11     |

**Total:** 6-9 days (approximately 1.5 weeks)

**Note:** Phase 5 (Data Migration) removed - hard cut with no backward compatibility

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
| **Encoding Accuracy**   | **100% round-trip fidelity**         |
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
packages/core/lib/fit-sdk-encoder.ts    # NEW: Core FIT encoder
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
| **Core Encoding**       | None vs @repo/core implementation | **Implement in @repo/core**      |
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
