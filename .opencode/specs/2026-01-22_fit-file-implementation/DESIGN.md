# FIT File Implementation Specification

**Version:** 1.0.0  
**Created:** January 22, 2026  
**Status:** Ready for Implementation  
**Owner:** Coordinator

---

## Executive Summary

This specification defines the implementation of FIT (Flexible and Interoperable Data Transfer) file support for GradientPeak. The FIT protocol, developed by Garmin, is the industry standard for fitness device data storage and is used by Garmin, Wahoo, Suunto, Polar, COROS, and Zwift.

**Key Decisions:**

- **Primary Library:** `@garmin/fitsdk` (official SDK)
- **Architecture:** Hybrid - server-side parsing with optional mobile preview
- **Integration:** JSON-first storage with Supabase backend
- **Testing:** 95% code coverage target

---

## 1. Technology Selection

### 1.1 Library Comparison

| Library                       | Bundle Size | TypeScript | Maintenance     | License  | Recommendation |
| ----------------------------- | ----------- | ---------- | --------------- | -------- | -------------- |
| `@garmin/fitsdk`              | ~400KB      | Excellent  | Garmin Official | MIT      | **Primary**    |
| `fit-parser` (jimmykane)      | ~200KB      | Excellent  | Active          | MIT      | Backup         |
| `fit-decoder`                 | ~50KB       | Basic      | Low             | MIT      | Mobile-light   |
| `@sports-alliance/sports-lib` | ~300KB      | Excellent  | Active          | AGPL-3.0 | Avoid          |

### 1.2 Recommendation: `@garmin/fitsdk`

**Rationale:**

- Official Garmin SDK with guaranteed profile updates
- Complete TypeScript definitions from source
- Encoder/Decoder capability (read/write)
- Active maintenance by protocol owner
- Cross-platform compatibility

**Installation:**

```bash
npm install @garmin/fitsdk
```

---

## 2. Architecture

### 2.1 Hybrid Parsing Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FIT File Sources                                   │
├───────────────┬───────────────────────┬─────────────────────────────────────┤
│   Mobile App  │   Web Upload          │   External Import (API)             │
│   Recording   │   (Garmin Connect)    │   (Third-party sync)                │
└───────┬───────┴───────────┬───────────┴─────────────────┬───────────────────┘
        │                   │                             │
        ▼                   ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STORAGE LAYER                                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │ Raw FIT Files   │    │ Parsed Metrics  │    │ Compressed Streams      │  │
│  │ (fit-files bucket)│  │ (activities table)│ │ (activity_streams table) │  │
│  └────────┬────────┘    └────────┬────────┘    └────────────┬────────────┘  │
└───────────┼──────────────────────┼───────────────────────────┼───────────────┘
            │                      │                           │
            ▼                      ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PARSING STRATEGY                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    SERVER-SIDE (Primary)                              │   │
│  │  Supabase Edge Function → @garmin/fitsdk → Full Analysis             │   │
│  │  - Session/Lap/Record extraction                                      │   │
│  │  - Performance metrics (TSS, IF, NP, HR zones, Power zones)          │   │
│  │  - Polyline generation                                                │   │
│  │  - Stream compression                                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    MOBILE (Optional Preview)                          │   │
│  │  Document Picker → @garmin/fitsdk (with memory guards)               │   │
│  │  - Quick preview of file info (duration, distance, type)             │   │
│  │  - Fallback to server parsing for full analysis                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 File Structure

```
packages/core/
├── fit/
│   ├── index.ts              # Main export
│   ├── types.ts              # FIT message type definitions
│   ├── parser.ts             # Core parsing utilities
│   ├── constants.ts          # FIT protocol constants
│   ├── transforms.ts         # Data transformation utilities
│   ├── errors.ts             # Error handling
│   └── __tests__/
│       ├── parser.test.ts
│       ├── transforms.test.ts
│       └── conversions.test.ts
│
apps/mobile/
├── lib/services/
│   └── FitParser/
│       ├── FitParser.ts      # Mobile wrapper with memory guards
│       ├── memoryGuards.ts   # Memory management
│       └── useFitParser.ts   # React hook for async parsing
│
packages/supabase/functions/analyze-fit-file/
└── index.ts                  # Refactored to use @repo/core/fit
```

---

## 3. Data Mapping

### 3.1 FIT Messages to GradientPeak Schema

| FIT Message | GradientPeak Entity          | Priority |
| ----------- | ---------------------------- | -------- |
| FILE_ID     | external_source, device_info | Critical |
| SESSION     | activity.metrics             | Critical |
| RECORD      | activity_streams             | Critical |
| LAP         | activity.splits              | High     |
| DEVICE_INFO | activity.devices             | Medium   |
| EVENT       | activity.events              | Low      |

### 3.2 Sport Mapping

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

### 3.3 Key Conversions

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

## 4. Implementation Details

### 4.1 Core Parser

```typescript
// packages/core/src/fit/parser.ts
import { Stream, Decoder, Profile } from "@garmin/fitsdk";

export interface FitActivity {
  fileId: FileIdMessage;
  sessions: SessionMessage[];
  laps: LapMessage[];
  records: RecordMessage[];
}

export class FitParser {
  constructor(private buffer: Uint8Array) {}

  decode(): FitActivity {
    const stream = Stream.fromBuffer(this.buffer);

    if (!Decoder.isFIT(stream)) {
      throw new FitValidationError("Invalid FIT file format");
    }

    const decoder = new Decoder(stream);

    if (!decoder.checkIntegrity()) {
      throw new FitValidationError("FIT file integrity check failed");
    }

    const { messages, errors } = decoder.read({
      applyScaleAndOffset: true,
      expandSubFields: true,
      convertTypesToStrings: true,
      convertDateTimesToDates: true,
    });

    return {
      fileId: messages.fileIdMesgs[0],
      sessions: messages.sessionMesgs || [],
      laps: messages.lapMesgs || [],
      records: messages.recordMesgs || [],
    };
  }
}
```

### 4.2 Mobile Memory Guards

```typescript
// apps/mobile/lib/services/FitParser/memoryGuards.ts
const MAX_MOBILE_FILE_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_RECORDS_PREVIEW = 100;

export async function validateFitFileForMobile(
  fileUri: string,
): Promise<{ valid: boolean; reason?: string }> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);

  if (!fileInfo.exists) {
    return { valid: false, reason: "File does not exist" };
  }

  if ((fileInfo.size || 0) > MAX_MOBILE_FILE_SIZE) {
    return {
      valid: false,
      reason: "File too large. Upload for full analysis.",
    };
  }

  return { valid: true };
}
```

### 4.3 Edge Function Integration

```typescript
// packages/supabase/functions/analyze-fit-file/index.ts
import { createClient } from "npm:supabase-js@2";
import { polyline } from "npm:@mapbox/polyline@^1.2.1";
import { parseFitFile } from "@repo/core/fit/parser";
import { fitSessionToMetrics } from "@repo/core/fit/transforms";

Deno.serve(async (req: Request) => {
  const { activityId, filePath, bucketName } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Download and parse
  const { data: fileData } = await supabase.storage
    .from(bucketName)
    .download(filePath);

  const arrayBuffer = await fileData.arrayBuffer();
  const result = await parseFitFile(new Uint8Array(arrayBuffer));

  // Calculate metrics and update activity
  const metrics = fitSessionToMetrics(result.session);
  // ... store in database

  return Response.json({ success: true, metrics });
});
```

---

## 5. Testing Strategy

### 5.1 Coverage Targets

| Category          | Target | Critical Fields             |
| ----------------- | ------ | --------------------------- |
| Message Types     | 95%    | FILE_ID, SESSION, RECORD    |
| Field Conversions | 100%   | timestamps, GPS, HR, power  |
| Error Handling    | 100%   | corrupt, truncated, invalid |
| Platform Tests    | 90%    | mobile, web, server         |

### 5.2 Test Data

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

### 5.3 Key Test Cases

```typescript
// packages/core/src/fit/__tests__/parser.test.ts
describe("FitParser", () => {
  it("valid activity FIT file - extracts session metadata correctly", async () => {
    const parser = new FitParser(
      await readTestFile("garmin-forerunner-265.fit"),
    );
    const result = parser.decode();

    expect(result.session).toBeDefined();
    expect(result.session.sport).toBe("running");
    expect(result.records.length).toBeGreaterThan(0);
  });

  it("file with corrupted header - rejects with validation error", () => {
    const parser = new FitParser(createCorruptedBuffer());

    expect(() => parser.decode()).toThrow(FitValidationError);
  });
});
```

---

## 6. Performance Requirements

### 6.1 Parsing Targets

| File Size | Target Time | Platform |
| --------- | ----------- | -------- |
| < 5MB     | < 500ms     | Mobile   |
| 5-20MB    | < 2s        | Mobile   |
| Any       | < 1s        | Server   |

### 6.2 Memory Limits

| Platform | Max File Size | Strategy                       |
| -------- | ------------- | ------------------------------ |
| Mobile   | 50MB          | Chunked parsing, memory guards |
| Server   | 250MB         | Streaming, async processing    |

---

## 7. Device Compatibility

### 7.1 Supported Manufacturers

| Manufacturer | Support Level | Notes                 |
| ------------ | ------------- | --------------------- |
| Garmin       | Full          | Primary target        |
| Wahoo        | Full          | Activity exports      |
| Suunto       | Full          | Developer fields      |
| COROS        | Full          | Consistent profile    |
| Polar        | Full          | Different dev fields  |
| Zwift        | Full          | Structured activities |

### 7.2 Protocol Versions

- **FIT v1.x**: Default compatibility
- **FIT v2.0**: Developer data fields supported

---

## 8. Error Handling

### 8.1 Error Types

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

### 8.2 User Messages

| Error          | User Message                                              |
| -------------- | --------------------------------------------------------- |
| CRC failed     | "File is corrupted. Please re-download from your device." |
| Invalid header | "Invalid FIT file format."                                |
| Missing data   | "File appears incomplete or from unsupported device."     |
| Too large      | "File exceeds size limit. Upload for server analysis."    |

---

## 9. Future Considerations

### 9.1 Export Capability

The SDK supports encoding (writing) FIT files for:

- Device data recovery
- Workout transfer to Garmin
- Third-party compatibility

### 9.2 Advanced Features

- Developer data fields for custom metrics
- Privacy zone support for location data
- Batch import from device dumps
- Garmin Connect API direct sync

---

## 10. Implementation Roadmap

### Phase 1: Core Parser (Week 1-2)

- [ ] Create `packages/core/fit/` directory structure
- [ ] Implement `parser.ts` with streaming support
- [ ] Create `transforms.ts` for metric mapping
- [ ] Add Zod schemas for validation
- [ ] Write unit tests (95% coverage)

### Phase 2: Server Integration (Week 2-3)

- [ ] Refactor edge function to use `@repo/core/fit`
- [ ] Implement stream compression/decompression
- [ ] Add metrics calculation (TSS, zones)
- [ ] Update tRPC router with new response types

### Phase 3: Mobile Preview (Week 3-4)

- [ ] Create `apps/mobile/lib/services/FitParser/`
- [ ] Implement memory guards for mobile
- [ ] Add `useFitParser` React hook
- [ ] Create file picker integration

### Phase 4: Documentation & Polish (Week 4)

- [ ] Document API in AGENTS.md
- [ ] Add integration tests
- [ ] Performance benchmarking
- [ ] Error handling improvements

---

## 11. Dependencies

```json
{
  "dependencies": {
    "@garmin/fitsdk": "^21.188.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

---

## 12. References

- Garmin FIT SDK Documentation: https://developer.garmin.com/fit/
- FIT Protocol Specification: https://developer.garmin.com/fit/protocol/
- Source Code: https://github.com/garmin/fit-javascript-sdk
- GradientPeak Architecture: See CLAUDE.md
- Existing FIT Implementation: `/packages/trpc/src/routers/fit-files.ts`

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

**Document Version:** 1.0.0  
**Last Updated:** January 22, 2026  
**Next Review:** Before implementation completion
