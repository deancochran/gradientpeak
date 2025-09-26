# Activity Recording Service — Enhanced Implementation Guide v2.5

## 1. Overview & Enhanced Submission Architecture

This document provides a comprehensive implementation guide for the TurboFit mobile app's Activity Recording Service, featuring an **enhanced submission system** that compresses aggregated stream data and uploads both activity metadata and compressed sensor streams to the backend using a single TRPC `create_activity` function call.

**Key Enhancements in v2.5:**
- **Enhanced Submission Flow**: Activity + compressed streams uploaded in single TRPC call
- **Stream Compression**: Pako compression for aggregated activity_recording_stream chunks
- **Backend Integration**: Uses existing `create_activity` function with activity_streams payload
- **Mobile-Side Preparation**: All data compression and aggregation handled on device
- **One Activity_stream per Metric**: Compressed chunks create individual backend records

## 2. Enhanced Submission Architecture

### 2.1 Data Flow Overview

```
Local SQLite Chunks → Aggregate by Metric → Compress with Pako → Upload via TRPC
     ↓                    ↓                     ↓                  ↓
[Chunk 1: HR]        [Combined HR]         [Compressed]      [Backend Record]
[Chunk 2: HR]   →    [All Timestamps]  →   [Binary Data] →   [activity_streams]
[Chunk 3: HR]        [All Values]          [+ Metadata]      [Single HR Record]
```

**Key Principles:**
1. **Mobile Processing**: All aggregation and compression happens on the mobile device
2. **Metric Consolidation**: Multiple local chunks per metric → Single compressed backend record per metric
3. **Single TRPC Call**: Upload activity + all compressed streams in one request
4. **Backend Efficiency**: Server receives ready-to-store compressed data

### 2.2 TRPC Integration Structure

**Existing Backend Function:**
```typescript
// packages/trpc/src/routers/activities.ts
create: protectedProcedure
  .input(z.object({
    activity: PublicActivitiesInsertSchema,
    activity_streams: z.array(PublicActivityStreamsInsertSchema),
  }))
  .mutation(async ({ input, ctx }) => {
    const { data, error } = await ctx.supabase.rpc("create_activity", input);
    if (error) throw new Error(error.message);
    return data;
  })
```

**Backend Schema (activity_streams table):**
```typescript
publicActivityStreamsInsertSchema = z.object({
  activity_id: z.string(),
  type: publicActivityMetricSchema, // "heartrate", "power", "speed", etc.
  data_type: publicActivityMetricDataTypeSchema,
  data: jsonSchema, // Compressed binary data
  original_size: z.number(), // Uncompressed size for metrics
  chunk_index: z.number().optional(), // Always 0 for aggregated streams
  created_at: z.string().optional(),
  id: z.string().optional(),
})
```

## 3. Enhanced Stream Processing Implementation

### 3.1 Stream Aggregation and Compression (DataStorageManager)

**Add enhanced stream processing methods to storage manager:**

```typescript
// In apps/mobile/src/lib/services/ActivityRecorder/storage.ts
import * as pako from 'pako';

export class DataStorageManager {
  // ... existing methods

  /**
   * Aggregate and compress all streams for a recording into upload-ready format
   * Creates one compressed stream per metric for backend upload
   */
  async prepareStreamsForUpload(recordingId: string): Promise<{
    type: PublicActivityMetric;
    data_type: PublicActivityMetricDataType;
    data: string; // Base64 encoded compressed data
    original_size: number;
    sample_count: number;
    start_time: string;
    end_time: string;
  }[]> {
    const streams = await this.getRecordingStreams(recordingId);
    if (streams.length === 0) return [];

    // Group streams by metric type
    const streamsByMetric = this.groupStreamsByMetric(streams);
    const compressedStreams: any[] = [];

    // Process each metric independently
    for (const [metric, metricStreams] of Object.entries(streamsByMetric)) {
      const aggregated = this.aggregateMetricStreams(metricStreams);
      const compressed = await this.compressStreamData(aggregated, metric as PublicActivityMetric);
      compressedStreams.push(compressed);
    }

    return compressedStreams;
  }

  /**
   * Aggregate multiple chunks of same metric into single dataset
   */
  private aggregateMetricStreams(streams: SelectRecordingStream[]): {
    values: any[];
    timestamps: number[];
    startTime: Date;
    endTime: Date;
    totalSamples: number;
  } {
    // Sort streams by chunk index to maintain chronological order
    const sortedStreams = streams.sort((a, b) => a.chunkIndex - b.chunkIndex);

    const allValues: any[] = [];
    const allTimestamps: number[] = [];
    let startTime = sortedStreams[0]?.startTime;
    let endTime = sortedStreams[0]?.endTime;
    let totalSamples = 0;

    for (const stream of sortedStreams) {
      try {
        const chunkValues = JSON.parse(stream.data as string);
        const chunkTimestamps = JSON.parse(stream.timestamps as string);

        allValues.push(...chunkValues);
        allTimestamps.push(...chunkTimestamps);
        totalSamples += stream.sampleCount;

        // Update time bounds
        if (stream.startTime < startTime) startTime = stream.startTime;
        if (stream.endTime > endTime) endTime = stream.endTime;
      } catch (error) {
        console.warn(`Failed to parse stream chunk ${stream.id}:`, error);
      }
    }

    return {
      values: allValues,
      timestamps: allTimestamps,
      startTime,
      endTime,
      totalSamples
    };
  }

  /**
   * Compress aggregated stream data using pako gzip
   */
  private async compressStreamData(
    aggregated: any,
    metric: PublicActivityMetric
  ): Promise<{
    type: PublicActivityMetric;
    data_type: PublicActivityMetricDataType;
    data: string;
    original_size: number;
    sample_count: number;
    start_time: string;
    end_time: string;
  }> {
    try {
      // Create the data structure that will be compressed
      const streamPayload = {
        values: aggregated.values,
        timestamps: aggregated.timestamps,
        sample_count: aggregated.totalSamples,
        metric: metric
      };

      // Convert to JSON string
      const jsonString = JSON.stringify(streamPayload);
      const originalSize = new TextEncoder().encode(jsonString).length;

      // Compress with pako
      const compressed = pako.gzip(jsonString);

      // Convert to base64 for JSON transport
      const base64Compressed = Buffer.from(compressed).toString('base64');

      console.log(
        `Compressed ${metric}: ${originalSize} bytes → ${base64Compressed.length} chars ` +
        `(${((1 - base64Compressed.length / originalSize) * 100).toFixed(1)}% reduction)`
      );

      return {
        type: metric,
        data_type: this.getDataTypeForMetric(metric),
        data: base64Compressed,
        original_size: originalSize,
        sample_count: aggregated.totalSamples,
        start_time: aggregated.startTime.toISOString(),
        end_time: aggregated.endTime.toISOString(),
      };
    } catch (error) {
      console.error(`Failed to compress ${metric} stream:`, error);
      throw new Error(`Stream compression failed for ${metric}`);
    }
  }

  /**
   * Prepare complete submission payload for TRPC create_activity
   */
  async prepareSubmissionPayload(recordingId: string): Promise<{
    activity: any; // PublicActivitiesInsertSchema format
    activity_streams: any[]; // PublicActivityStreamsInsertSchema[] format
  }> {
    const recording = await this.getCurrentRecording();
    if (!recording) throw new Error("Recording not found");

    // Prepare compressed streams
    const compressedStreams = await this.prepareStreamsForUpload(recordingId);

    // Prepare activity metadata
    const summary = await this.computeActivitySummary(); // From service
    const activityPayload = {
      // Core required fields
      name: recording.name || `${recording.activityType} Activity`,
      activity_type: recording.activityType,
      profile_id: recording.profileId,

      // Timing
      started_at: recording.startedAt.toISOString(),
      moving_time: Math.round(summary.movingTime / 1000), // Convert to seconds

      // Performance metrics
      distance: summary.distance || null,
      avg_heart_rate: summary.averageHeartRate || null,
      max_heart_rate: summary.maxHeartRate || null,
      avg_speed: summary.averageSpeed || null,
      max_speed: summary.maxSpeed || null,
      avg_power: summary.averagePower || null,
      normalized_power: summary.normalizedPower || null,
      avg_cadence: summary.averageCadence || null,
      max_cadence: summary.maxCadence || null,

      // Optional fields
      notes: recording.notes || null,
      local_file_path: recordingId, // Reference to local recording
      planned_activity_id: recording.plannedActivityId || null,
    };

    // Format streams for backend
    const activityStreamsPayload = compressedStreams.map(stream => ({
      // activity_id will be set by backend after activity creation
      type: stream.type,
      data_type: stream.data_type,
      data: stream.data, // Base64 compressed
      original_size: stream.original_size,
      chunk_index: 0, // Always 0 for aggregated streams
      // created_at will be set by backend
    }));

    return {
      activity: activityPayload,
      activity_streams: activityStreamsPayload
    };
  }

  // ... existing methods
}
```

### 3.2 Enhanced Activity Submission (ActivityRecorderService)

**Update service to use enhanced submission:**

```typescript
// In apps/mobile/src/lib/services/ActivityRecorder/index.ts
import { api } from "@/lib/api"; // Existing TRPC client

export class ActivityRecorderService {
  // ... existing methods

  /**
   * Enhanced submission: Upload activity with compressed streams via TRPC create_activity
   */
  async uploadCompletedActivity(recordingId?: string): Promise<boolean> {
    const id = recordingId || this.storageManager.getCurrentRecordingId();
    if (!id) {
      console.error("No recording ID for upload");
      return false;
    }

    try {
      console.log("Starting enhanced activity upload...");

      // Prepare complete submission payload (activity + compressed streams)
      const submissionPayload = await this.storageManager.prepareSubmissionPayload(id);

      console.log("Submission payload prepared:", {
        activity: submissionPayload.activity.name,
        streamCount: submissionPayload.activity_streams.length,
        metrics: submissionPayload.activity_streams.map(s => s.type),
        totalOriginalSize: submissionPayload.activity_streams.reduce((sum, s) => sum + s.original_size, 0),
        totalCompressedSize: submissionPayload.activity_streams.reduce((sum, s) => sum + s.data.length, 0)
      });

      // Submit via TRPC create_activity function
      const result = await api.activities.create.mutate(submissionPayload);

      if (result) {
        console.log("Activity and streams uploaded successfully:", {
          activityId: result.activity_id || result.id,
          streamCount: submissionPayload.activity_streams.length
        });

        // Mark recording as synced
        await this.storageManager.markRecordingSynced(id);

        return true;
      } else {
        console.error("Upload failed: No result returned");
        return false;
      }
    } catch (error) {
      console.error("Enhanced activity upload failed:", error);

      // Log detailed error information
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }

      return false; // No retry - user must retry manually
    }
  }

  // ... existing methods
}
```

## 4. Enhanced Submission Modal Implementation

### 4.1 Updated Submission Modal with Stream Preview

**Enhanced modal showing compression details:**

```typescript
// In modals/activity-recording/[activityRecordingId].tsx

export default function ActivityRecordingSubmissionModal() {
  const { activityRecordingId } = useLocalSearchParams<{ activityRecordingId: string }>();
  const { submitActivity } = useActivityRecorder();

  const [submissionPayload, setSubmissionPayload] = useState<any>(null);
  const [compressionStats, setCompressionStats] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load submission payload on mount
  useEffect(() => {
    const loadSubmissionData = async () => {
      try {
        // Get prepared submission payload from storage manager
        const service = ActivityRecorderService.getInstance();
        const payload = await service.storageManager.prepareSubmissionPayload(activityRecordingId);

        setSubmissionPayload(payload);

        // Calculate compression statistics
        const stats = {
          streamCount: payload.activity_streams.length,
          metrics: payload.activity_streams.map(s => s.type),
          totalOriginalSize: payload.activity_streams.reduce((sum, s) => sum + s.original_size, 0),
          totalCompressedSize: payload.activity_streams.reduce((sum, s) => sum + s.data.length, 0),
          compressionRatio: payload.activity_streams.reduce((sum, s) => sum + s.original_size, 0) > 0
            ? (1 - payload.activity_streams.reduce((sum, s) => sum + s.data.length, 0) / payload.activity_streams.reduce((sum, s) => sum + s.original_size, 0)) * 100
            : 0
        };
        setCompressionStats(stats);
      } catch (error) {
        Alert.alert("Error", "Failed to prepare submission data");
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    if (activityRecordingId) {
      loadSubmissionData();
    }
  }, [activityRecordingId]);

  /** Enhanced submit with stream upload */
  const handleSubmitActivity = async () => {
    if (!submissionPayload) return;

    setIsSubmitting(true);
    try {
      console.log("Submitting enhanced activity with streams...");

      // Submit via hook (which calls enhanced uploadCompletedActivity)
      const result = await submitActivity(activityRecordingId);

      if (result.success) {
        Alert.alert(
          "Activity Submitted Successfully!",
          `Your ${submissionPayload.activity.activity_type} activity with ${compressionStats.streamCount} sensor streams has been uploaded to the cloud.`,
          [{ text: "OK", onPress: () => router.push("/(tabs)") }]
        );
      } else {
        Alert.alert("Submit Failed", result.error || "Please check your connection and try again");
      }
    } catch (error) {
      Alert.alert("Submit Failed", "Please check your connection and try again");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ... existing modal UI with these additions:

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 p-4">
        {/* ... existing activity summary sections ... */}

        {/* Enhanced: Stream Compression Stats */}
        {compressionStats && (
          <View className="mb-6">
            <Text className="text-lg font-semibold mb-4">Sensor Data Summary</Text>

            <View className="bg-card p-4 rounded-lg border">
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-muted-foreground">Recorded Metrics</Text>
                <Text className="text-sm font-medium">{compressionStats.streamCount} streams</Text>
              </View>

              <View className="flex-row flex-wrap gap-1 mb-3">
                {compressionStats.metrics.map(metric => (
                  <View key={metric} className="bg-primary/10 px-2 py-1 rounded">
                    <Text className="text-xs text-primary">{metric}</Text>
                  </View>
                ))}
              </View>

              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-muted-foreground">Original Size</Text>
                <Text className="text-sm">{(compressionStats.totalOriginalSize / 1024).toFixed(1)} KB</Text>
              </View>

              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-muted-foreground">Compressed Size</Text>
                <Text className="text-sm">{(compressionStats.totalCompressedSize / 1024).toFixed(1)} KB</Text>
              </View>

              <View className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Compression</Text>
                <Text className="text-sm text-green-600 font-medium">
                  {compressionStats.compressionRatio.toFixed(1)}% reduction
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Enhanced: Technical Submission Preview */}
        <View className="mb-6 p-4 bg-muted rounded-lg">
          <Text className="text-sm font-medium mb-2">Technical Submission Preview:</Text>
          <ScrollView horizontal className="max-h-32">
            <Text className="text-xs text-muted-foreground font-mono">
              {JSON.stringify({
                activity: submissionPayload?.activity || {},
                activity_streams_count: submissionPayload?.activity_streams?.length || 0,
                stream_metrics: submissionPayload?.activity_streams?.map(s => ({
                  type: s.type,
                  compressed_size: s.data.length,
                  original_size: s.original_size,
                  compression: `${(((s.original_size - s.data.length) / s.original_size) * 100).toFixed(1)}%`
                })) || []
              }, null, 2)}
            </Text>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Enhanced Action Buttons */}
      <View className="p-4 border-t border-border">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onPress={handleDiscardActivity}
            disabled={isSubmitting}
          >
            <Text>Discard</Text>
          </Button>

          <Button
            className="flex-1"
            onPress={handleSubmitActivity}
            disabled={isSubmitting || !submissionPayload}
          >
            <Text>
              {isSubmitting ? "Uploading..." : `Submit Activity + ${compressionStats?.streamCount || 0} Streams`}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
```

## 5. Backend Data Flow

### 5.1 How Mobile Data Becomes Backend Records

**Mobile Processing:**
```typescript
// Multiple local chunks per metric:
[
  { metric: "heartrate", chunkIndex: 0, data: [120, 125, 130], timestamps: [...] },
  { metric: "heartrate", chunkIndex: 1, data: [135, 140, 138], timestamps: [...] },
  { metric: "power", chunkIndex: 0, data: [250, 260, 255], timestamps: [...] }
]

// ↓ Aggregated by metric:
{
  heartrate: { values: [120, 125, 130, 135, 140, 138], timestamps: [...] },
  power: { values: [250, 260, 255], timestamps: [...] }
}

// ↓ Compressed per metric:
[
  { type: "heartrate", data: "base64CompressedHRData", original_size: 1200 },
  { type: "power", data: "base64CompressedPowerData", original_size: 800 }
]
```

**Backend Storage:**
```sql
-- activities table (1 record)
INSERT INTO activities (id, name, activity_type, distance, ...) VALUES (...);

-- activity_streams table (1 record per metric)
INSERT INTO activity_streams (activity_id, type, data, original_size) VALUES
  ('activity-id', 'heartrate', 'compressed-binary-data', 1200),
  ('activity-id', 'power', 'compressed-binary-data', 800);
```

### 5.2 Backend Function Expectations

**The `create_activity` RPC function expects:**
```typescript
{
  activity: {
    name: string,
    activity_type: string,
    profile_id: string, // Added by TRPC context
    distance: number,
    moving_time: number,
    avg_heart_rate: number,
    // ... all activity metadata
  },
  activity_streams: [
    {
      type: "heartrate",
      data_type: "integer",
      data: "base64-compressed-data",
      original_size: 1200,
      chunk_index: 0
    },
    {
      type: "power",
      data_type: "integer",
      data: "base64-compressed-data",
      original_size: 800,
      chunk_index: 0
    }
    // ... one record per recorded metric
  ]
}
```

## 6. Implementation Phases

### Phase 1: Enhanced Submission System (Week 1)
**Priority: Critical - Complete enhanced submission with stream compression**

1. ✅ **Stream Aggregation**: Implement `prepareStreamsForUpload()` in DataStorageManager
2. ✅ **Pako Compression**: Add `compressStreamData()` with base64 encoding
3. ✅ **Payload Assembly**: Implement `prepareSubmissionPayload()` for TRPC format
4. ✅ **Enhanced Service Upload**: Update `uploadCompletedActivity()` to use new payload
5. ✅ **Enhanced Modal**: Update submission modal to show compression stats

**Success Criteria:**
- Local chunks aggregated and compressed per metric
- Single TRPC call uploads activity + all compressed streams
- Backend receives one activity_streams record per recorded metric
- Compression reduces upload size by 40-80%

### Phase 2: Stream Quality & Error Handling (Week 2)
 **Progress Feedback**: Show upload progress for large activities

## 7. Technical Specifications

### 7.1 Compression Requirements
- **Library**: pako v2.1.0 (already installed)
- **Method**: gzip compression for optimal ratio
- **Encoding**: Base64 for JSON transport compatibility
- **Expected Ratio**: 40-80% size reduction for typical sensor data

### 7.2 Upload Payload Size Estimates
```typescript
// Typical 1-hour activity:
// - Heartrate: ~3600 samples × 4 bytes = 14.4KB → ~4KB compressed
// - Power: ~3600 samples × 4 bytes = 14.4KB → ~4KB compressed
// - GPS: ~720 points × 16 bytes = 11.5KB → ~3KB compressed
// Total: ~40KB → ~11KB (72% reduction)
```

### 7.3 Backend Integration Points
- **TRPC Endpoint**: `api.activities.create.mutate(payload)`
- **Supabase RPC**: `create_activity` function handles activity + streams
- **Database Tables**: `activities` (metadata) + `activity_streams` (compressed data)
- **Storage**: Compressed streams stored as `bytea` in PostgreSQL

---

**Version 2.5** - Enhanced submission with stream compression
*Complete mobile-to-backend data flow with pako compression and TRPC integration*
