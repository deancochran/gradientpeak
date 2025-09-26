# Activity Recording Service — Enhanced Implementation Guide v2.1

## 1. Overview

This document provides a focused roadmap for evolving the TurboFit MVP into a production-ready Activity Recording Service. Based on the existing implementation in `apps/mobile/src/lib/services/ActivityRecorder/`, this guide prioritizes core gaps: **TRPC submission**, **structured workout execution**, and **enhanced hook API** while building on proven MVP patterns.

**Key Changes in v2.1:**
- Schema consistency with existing `@repo/core` types
- Direct integration paths for current service architecture
- Expo RN-specific implementation details
- Focused scope excluding out-of-scope features (retry logic, resilience, presets, telemetry)

## 2. Implementation Status & Priorities

### Current MVP Foundation ✅
- Core recording via `ActivityRecorderService` with background `expo-task-manager`
- GPS tracking through `LocationManager` with chunked persistence
- BLE sensors via `SensorsManager` using `react-native-ble-plx`
- SQLite storage with `DataStorageManager` (5s flush intervals)
- State management following `RecordingState` enum lifecycle
- Hook API in `useActivityRecorder.ts` with singleton pattern
- Planned activity support via `plannedActivityStructureSchema`

### Priority Implementation Gaps
1. **TRPC Submission Integration** - Connect `uploadCompletedActivity()` to actual endpoints
2. **Structured Workout Runtime** - Execute intervals during recording
3. **Enhanced Hook API** - Add planned activity and submission controls

## 3. Enhanced Functional Requirements

### 3.1 TRPC Submission System (Phase 1)

**Current State:** `uploadCompletedActivity()` computes summaries but only logs payloads.

**Target Implementation:**
```typescript
// Reuse existing summary computation from @repo/core
interface SubmissionPayload {
  sessionId: string;
  activityType: string;
  plannedActivityId?: string;
  metadata: {
    startTime: Date;
    endTime: Date;
    device: DeviceInfo;
  };
  summary: ActivitySummary; // from computeActivitySummary()
  streams: {
    gps?: CompressedStream;
    heartRate?: CompressedStream;
    power?: CompressedStream;
    // Use existing getRecordingStreams() query structure
  };
}

// Integrate with packages/supabase/ TRPC client
export const recordingsRouter = router({
  submit: publicProcedure
    .input(SubmissionPayloadSchema)
    .mutation(async ({ input }) => {
      // Store in activity_recordings table per existing schema
      return { success: true, activityId: string };
    }),
});
```

**Integration Points:**
- Extend `DataStorageManager.getRecordingStreams()` for payload assembly
- Use `pako` compression for streams to match Supabase `compressed_data bytea`
- Leverage existing `InsertActivityRecording` schema from Drizzle

### 3.2 Structured Workout Execution (Phase 2)

**Schema Alignment:**
```typescript
// Extend existing plannedActivityStructureSchema from @repo/core
import { plannedActivityStructureSchema } from '@repo/core/schemas/planned_activity';

export const structuredWorkoutSchema = plannedActivityStructureSchema.extend({
  runtime: z.object({
    currentIntervalIndex: z.number(),
    intervalStartTime: z.date().optional(),
    autoAdvanceEnabled: z.boolean().default(true),
  }).optional(),
});

export type StructuredWorkout = z.infer<typeof structuredWorkoutSchema>;
```

**Service Integration:**
```typescript
// Extend ActivityRecorderService state machine
export interface RecordingState {
  // ... existing fields
  structuredWorkout?: {
    workout: StructuredWorkout;
    currentInterval: WorkoutInterval;
    intervalProgress: number; // 0-1 for UI integration
    intervalElapsed: number;
    totalElapsed: number;
    nextInterval?: WorkoutInterval;
  };
}

// Add to ActivityRecorderService methods
public async startPlannedActivity(plannedActivityId: string): Promise<void> {
  // Load from existing planned_activities table
  const workout = await this.loadStructuredWorkout(plannedActivityId);
  this.state.structuredWorkout = {
    workout,
    currentInterval: workout.intervals[0],
    intervalProgress: 0,
    // ...
  };
  await this.startRecording();
}
```

**Runtime Execution:**
- Integrate with existing timer in `handleSensorData()` for interval progression
- Auto-advance based on duration when `autoAdvanceEnabled: true`
- Provide manual controls via hook API
- Use `computeActivitySummary()` for real-time target adherence feedback

### 3.3 Enhanced Hook API

**Extend Current useActivityRecorder.ts:**
```typescript
export function useActivityRecorder() {
  // ... existing state and methods

  return {
    // Current MVP methods (keep unchanged)
    startRecording,
    pauseRecording,
    finishRecording,
    connectToDevice,
    // ... existing

    // NEW: Planned activity controls
    startPlanned: async (plannedActivityId: string) => {
      try {
        await activityRecorderService.startPlannedActivity(plannedActivityId);
        return { success: true };
      } catch (error) {
        return { success: false, error };
      }
    },

    // NEW: Structured workout controls
    skipInterval: async () => {
      try {
        await activityRecorderService.skipCurrentInterval();
        return { success: true };
      } catch (error) {
        return { success: false, error };
      }
    },

    // NEW: Submission
    submit: async (metadata?: SubmissionMetadata) => {
      try {
        const result = await activityRecorderService.submitActivity(metadata);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error };
      }
    },

    // Enhanced state (backward compatible)
    state: {
      ...currentState,
      structuredWorkout: activityRecorderService.state.structuredWorkout,
      submissionStatus: activityRecorderService.state.submissionStatus,
    },
  };
}

// Result type for error handling consistency
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: RecordingError };
```

## 4. Implementation Phases

### Phase 1: TRPC Submission (Week 1-2)
**Goal:** Close the loop from recording to server persistence

1. **Setup TRPC Client Integration**
   ```typescript
   // In apps/mobile/src/lib/api/trpc.ts (if not exists)
   import { createTRPCReactQuery } from '@trpc/react-query';
   import { recordingsRouter } from '@repo/supabase/routers/recordings';

   export const api = createTRPCReactQuery<typeof recordingsRouter>({
     // ... configuration
   });
   ```

2. **Enhance uploadCompletedActivity()**
   ```typescript
   // In ActivityRecorderService
   async uploadCompletedActivity(): Promise<SubmissionResult> {
     const payload = await this.assembleSubmissionPayload();
     const result = await api.recordings.submit.mutate(payload);

     // Update local recording with submission status
     await this.updateRecordingStatus(result.activityId, 'submitted');
     return result;
   }
   ```

3. **Add Submission UI State**
   - Extend hook to expose submission progress
   - Add basic retry on failure (single retry, not complex logic)
   - Update recording screens to handle submission flow

### Phase 2: Structured Workouts (Week 3-4)
**Goal:** Execute planned activities with interval progression

1. **Phase 2a: Schema & Loading**
   - Align `StructuredWorkout` with `plannedActivityStructureSchema`
   - Implement `loadStructuredWorkout()` in service
   - Add `startPlanned()` method to hook

2. **Phase 2b: Runtime Progression**
   - Integrate interval timer with existing sensor loop
   - Add interval state to service and hook
   - Implement auto-advance logic based on duration

3. **Phase 2c: UI Integration**
   - Create `intervalProgress` state slice (0-1 float)
   - Add utility methods: `skipInterval()`, `getCurrentTargets()`
   - Update recording UI to show interval information

### Phase 2.5: Integration & Testing
1. **Add Service-Level README**
   ```
   apps/mobile/src/lib/services/ActivityRecorder/README.md
   - Service architecture overview
   - Entry points and key methods
   - Integration with @repo/core schemas
   - Testing and debugging tips
   ```

2. **Expo-Specific Testing Setup**
   - Mock GPS with `expo-location` test utils
   - Mock BLE with `react-native-ble-plx-mock` or custom mocks
   - App state simulation for background/foreground testing

## 5. Technical Implementation Details

### 5.1 Schema Consistency & Migrations

**Centralize in @repo/core:**
```typescript
// In packages/core/schemas/activity_recording.ts
export const submissionPayloadSchema = z.object({
  sessionId: z.string(),
  activityType: z.string(),
  plannedActivityId: z.string().optional(),
  metadata: activityMetadataSchema,
  summary: activitySummarySchema, // existing
  streams: compressedStreamsSchema,
});

export const structuredWorkoutRuntimeSchema = z.object({
  currentIntervalIndex: z.number(),
  intervalProgress: z.number().min(0).max(1),
  intervalElapsed: z.number(),
  totalElapsed: z.number(),
  canSkip: z.boolean(),
});
```

**Database Migrations:**
```sql
-- Add to existing activity_recordings schema
ALTER TABLE activity_recordings
ADD COLUMN submission_status TEXT DEFAULT 'pending',
ADD COLUMN submission_timestamp TIMESTAMP,
ADD COLUMN structured_workout_state JSONB;

-- Index for querying pending submissions
CREATE INDEX idx_activity_recordings_submission_status
ON activity_recordings(submission_status);
```

### 5.2 Compression & Payload Optimization

**Reuse Existing Chunking:**
```typescript
// Extend DataStorageManager.getRecordingStreams()
async assembleSubmissionPayload(): Promise<SubmissionPayload> {
  const streams = await this.dataStorageManager.getRecordingStreams(this.sessionId);

  // Compress using pako (already used in MVP?)
  const compressedStreams = {
    gps: streams.gps ? pako.gzip(JSON.stringify(streams.gps)) : undefined,
    heartRate: streams.heartRate ? pako.gzip(JSON.stringify(streams.heartRate)) : undefined,
    // ... other sensors
  };

  return {
    sessionId: this.sessionId,
    summary: computeActivitySummary(streams), // existing @repo/core function
    streams: compressedStreams,
    metadata: this.getSessionMetadata(),
  };
}
```

### 5.3 No-GPS Activity Handling

**Conditional Location Manager:**
```typescript
// In ActivityRecorderService.startRecording()
async startRecording(): Promise<void> {
  // ... existing setup

  // Skip LocationManager for indoor/gym activities
  if (this.activityType !== 'indoor_cycling' && this.activityType !== 'strength') {
    await this.locationManager.start();
  }

  // Always start sensor and storage managers
  await this.sensorsManager.start();
  await this.dataStorageManager.start();
}
```
---
## Out of Scope (Future Phases)

The following features are intentionally excluded from this implementation guide but may be valuable for future iterations:

- **Advanced Retry Logic:** Exponential backoff, offline queues
- **Session Recovery:** Auto-resume after app crashes
- **Auto-Pause:** Movement detection and automatic pause/resume
- **Configuration Presets:** Battery vs. accuracy trade-offs
- **Telemetry & Analytics:** Usage tracking and performance monitoring
- **Privacy Controls:** Route anonymization, data retention policies

---

**Version 2.1** - Refined based on TurboFit MVP codebase analysis
*Focused on actionable implementation with concrete integration points*
