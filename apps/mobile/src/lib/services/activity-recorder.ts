import { PublicActivityType, PublicPlannedActivitiesRow } from "@repo/core";
// ===== CONSOLIDATED CONSTANTS =====

// ===== CONSOLIDATED TYPES =====

export interface GpsDataPoint {
  timestamp: Date;
  positionLat?: number; // Semicircles
  positionLong?: number; // Semicircles
  altitude?: number;
  speed?: number;
  gpsAccuracy?: number;
  distance?: number;
}

export interface SensorDataPoint {
  timestamp: Date;
  messageType: string;
  data: any;
  heartRate?: number;
  power?: number;
  cadence?: number;
  temperature?: number;
}

export interface RecordingSession {
  id: string;
  profileId: string;
  startedAt: Date;
  state: RecordingState;
  activityType: PublicActivityType;
  plannedActivity?: PublicPlannedActivitiesRow;
  // Real-time metrics only (not persisted arrays)
  currentMetrics: LiveMetrics;
  // Timing state
  totalElapsedTime: number; // Wall clock time
  movingTime: number; // Active recording time
  lastResumeTime: Date | null;
  // Minimal recovery data
  lastCheckpointAt: Date;
  dataPointsRecorded: number;
}

// Live metrics during recording - simplified
export interface LiveMetrics {
  // Current instantaneous values
  currentSpeed?: number;
  currentHeartRate?: number;
  currentPower?: number;
  currentCadence?: number;
  currentAltitude?: number;

  // GPS status
  gpsAccuracy?: number;
  lastGpsUpdate?: Date;
}

// ===== STREAMLINED SERVICE INTERFACE =====
export class ActivityRecordingService {
  // Session management
  static async createActivityRecording(): Promise<any> {
    /* insert activityRecordings row */
  }
  static async startActivityRecording(): Promise<any> {
    /* set state=recording */
  }
  static async pauseActivityRecording(): Promise<any> {
    /* set state=paused */
  }
  static async resumeActivityRecording(): Promise<any> {
    /* set state=recording */
  }
  static async finishActivityRecording(): Promise<any> {
    /* set state=finished */
  }
  static async removeActivityRecording(): Promise<any> {
    /* delete activity & cascaded streams */
  }
  static async listActivityRecordings(): Promise<any> {
    /* return all recordings */
  }

  // Stream management
  static async createActivityRecordingStream(chunk: {
    activityRecordingId: string;
    metric: PublicActivityMetric;
    dataType: PublicActivityMetricDataType;
    chunkIndex: number;
    startTime: number;
    endTime: number;
    data: number[] | [number, number][];
    timestamps: number[];
    moving: boolean[];
    sampleCount: number;
  }): Promise<any> {
    /* insert chunk into activityRecordingStreams */
  }

  static async removeActivityRecordingStream(streamId: string): Promise<any> {
    /* delete one chunk */
  }
  static async listActivityRecordingStreams(activityId: string): Promise<any> {
    /* return all chunks for an activity */
  }

  // Optional: compress and upload all streams to backend
  static async uploadCompletedActivity(activityId: string) {
    const chunks = await this.listActivityRecordingStreams(activityId);
    const groupedByMetric = groupBy(chunks, (c) => c.metric);

    for (const [metric, metricChunks] of Object.entries(groupedByMetric)) {
      const combinedData = metricChunks.flatMap((c) => c.data);
      const combinedTimestamps = metricChunks.flatMap((c) => c.timestamps);

      const compressed = gzipEncode({
        data: combinedData,
        timestamps: combinedTimestamps,
      }); // pseudocode

      await trpcClient.uploadStream.mutate({
        activityId,
        metric,
        seriesType: "time",
        resolution: "high",
        originalSize: combinedData.length,
        compressedData: compressed,
      });
    }
  }
}
