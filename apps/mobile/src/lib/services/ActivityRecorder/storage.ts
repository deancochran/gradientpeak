import { localdb } from "@/lib/db";
import {
  InsertActivityRecording,
  InsertRecordingStream,
  SelectActivityRecording,
  SelectRecordingStream,
  activityRecordingStreams,
  activityRecordings,
} from "@/lib/db/schemas";
import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  SensorReading,
  computeActivitySummary,
  ActivitySummary,
} from "@repo/core";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import * as pako from "pako";
import { RecordingState } from "./index";

// Buffer interface for accumulated sensor data
interface SensorDataBuffer {
  [metric: string]: Array<{
    value: number | [number, number];
    timestamp: number;
  }>;
}

// Chunk processing configuration
const CHUNK_INTERVAL_MS = 5000; // 5 seconds
const MAX_BUFFER_SIZE = 1000; // Max readings per metric before forced flush

/**
 * Manages local storage and chunking of activity recording data
 * Uses SQLite via Drizzle ORM for offline-first data persistence
 */
export class DataStorageManager {
  private currentRecordingId: string;
  private sensorDataBuffer: SensorDataBuffer;
  private chunkIndex: number;
  private lastCheckpointAt: Date;
  private chunkTimer: NodeJS.Timeout;

  constructor() {
    this.currentRecordingId = null;
    this.sensorDataBuffer = {};
    this.chunkIndex = 0;
    this.lastCheckpointAt = new Date();
    this.chunkTimer = null;
  }

  // ================================
  // Activity Recording Management
  // ================================

  /**
   * Create a new activity recording session
   */
  async createRecording(
    data: Omit<
      InsertActivityRecording,
      "id" | "createdAt" | "startedAt" | "synced"
    >,
  ): Promise<string> {
    const recordingData: InsertActivityRecording = {
      ...data,
      startedAt: new Date(),
      synced: false,
    };

    const [recording] = await localdb
      .insert(activityRecordings)
      .values(recordingData)
      .returning();

    this.currentRecordingId = recording.id;
    this.chunkIndex = 0;
    this.lastCheckpointAt = new Date();
    this.clearBuffer();

    console.log(`Created recording: ${recording.id}`);
    return recording.id;
  }

  /**
   * Update recording state (e.g., recording -> paused -> finished)
   */
  async updateRecordingState(
    recordingId: string,
    state: RecordingState,
  ): Promise<void> {
    await localdb
      .update(activityRecordings)
      .set({ state })
      .where(eq(activityRecordings.id, recordingId));

    console.log(`Updated recording ${recordingId} state to: ${state}`);
  }

  /**
   * Get current recording details
   */
  async getCurrentRecording(): Promise<SelectActivityRecording | null> {
    if (!this.currentRecordingId) return null;

    const [recording] = await localdb
      .select()
      .from(activityRecordings)
      .where(eq(activityRecordings.id, this.currentRecordingId))
      .limit(1);

    return recording || null;
  }

  /**
   * Get unsynced recordings
   */
  async getUnsyncedRecordings(): Promise<SelectActivityRecording[]> {
    return await localdb
      .select()
      .from(activityRecordings)
      .where(eq(activityRecordings.synced, false))
      .orderBy(desc(activityRecordings.startedAt));
  }

  // ================================
  // Sensor Data Buffering
  // ================================

  /**
   * Add sensor reading to buffer
   */
  addSensorReading(reading: SensorReading): void {
    if (!this.currentRecordingId) {
      console.warn("No active recording - dropping sensor reading");
      return;
    }

    const { metric, value, timestamp } = reading;

    // Initialize buffer for this metric if needed
    if (!this.sensorDataBuffer[metric]) {
      this.sensorDataBuffer[metric] = [];
    }

    // Add reading to buffer
    this.sensorDataBuffer[metric].push({ value, timestamp });

    // Check if we need to force flush due to buffer size
    if (this.sensorDataBuffer[metric].length >= MAX_BUFFER_SIZE) {
      console.log(`Buffer full for ${metric}, forcing chunk processing`);
      this.processChunk().catch(console.error);
    }
  }

  /**
   * Clear all sensor data buffers
   */
  private clearBuffer(): void {
    this.sensorDataBuffer = {};
  }

  /**
   * Get current buffer status for monitoring
   */
  getBufferStatus(): Record<string, number> {
    const status: Record<string, number> = {};
    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      status[metric] = buffer.length;
    }
    return status;
  }

  // ================================
  // Chunk Processing
  // ================================

  /**
   * Start automatic chunk processing
   */
  startChunkProcessing(): void {
    if (this.chunkTimer) {
      console.warn("Chunk processing already running");
      return;
    }

    this.chunkTimer = setInterval(() => {
      this.processChunk().catch(console.error);
    }, CHUNK_INTERVAL_MS);

    console.log(`Started chunk processing (${CHUNK_INTERVAL_MS}ms interval)`);
  }

  /**
   * Stop automatic chunk processing
   */
  stopChunkProcessing(): void {
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
      console.log("Stopped chunk processing");
    }
  }

  /**
   * Process current buffer into database chunks
   */
  async processChunk(): Promise<void> {
    if (!this.currentRecordingId) return;

    const now = Date.now();
    const startTime = this.lastCheckpointAt.getTime();
    const streamsToInsert: InsertRecordingStream[] = [];

    // Process each metric in the buffer
    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      if (buffer.length === 0) continue;

      const data = buffer.map((item) => item.value);
      const timestamps = buffer.map((item) => item.timestamp);

      const streamData: InsertRecordingStream = {
        activityRecordingId: this.currentRecordingId,
        metric: metric as PublicActivityMetric,
        dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
        chunkIndex: this.chunkIndex,
        startTime: new Date(startTime),
        endTime: new Date(now),
        data: JSON.stringify(data),
        timestamps: JSON.stringify(timestamps),
        sampleCount: buffer.length,
        synced: false,
      };

      streamsToInsert.push(streamData);

      // Clear this metric's buffer
      buffer.length = 0;
    }

    // Batch insert all streams
    if (streamsToInsert.length > 0) {
      await localdb.insert(activityRecordingStreams).values(streamsToInsert);

      console.log(
        `Processed chunk ${this.chunkIndex}: ${streamsToInsert.length} metrics, ` +
          `${streamsToInsert.reduce((sum, s) => sum + s.sampleCount, 0)} total samples`,
      );
    }

    // Update checkpoint and increment chunk index
    this.lastCheckpointAt = new Date(now);
    this.chunkIndex++;
  }

  /**
   * Force process any remaining buffered data (call on recording finish)
   */
  async flushBuffer(): Promise<void> {
    await this.processChunk();
    console.log("Buffer flushed");
  }

  // ================================
  // Stream Data Queries
  // ================================

  /**
   * Get all streams for a recording
   */
  async getRecordingStreams(
    recordingId: string,
  ): Promise<SelectRecordingStream[]> {
    return await localdb
      .select()
      .from(activityRecordingStreams)
      .where(eq(activityRecordingStreams.activityRecordingId, recordingId))
      .orderBy(
        activityRecordingStreams.metric,
        activityRecordingStreams.chunkIndex,
      );
  }

  /**
   * Get streams for a specific metric
   */
  async getMetricStreams(
    recordingId: string,
    metric: PublicActivityMetric,
  ): Promise<SelectRecordingStream[]> {
    return await localdb
      .select()
      .from(activityRecordingStreams)
      .where(
        and(
          eq(activityRecordingStreams.activityRecordingId, recordingId),
          eq(activityRecordingStreams.metric, metric),
        ),
      )
      .orderBy(activityRecordingStreams.chunkIndex);
  }

  /**
   * Get unsynced streams
   */
  async getUnsyncedStreams(): Promise<SelectRecordingStream[]> {
    return await localdb
      .select()
      .from(activityRecordingStreams)
      .where(eq(activityRecordingStreams.synced, false))
      .orderBy(
        activityRecordingStreams.activityRecordingId,
        activityRecordingStreams.chunkIndex,
      );
  }

  /**
   * Mark streams as synced
   */
  async markStreamsSynced(streamIds: string[]): Promise<void> {
    for (const id of streamIds) {
      await localdb
        .update(activityRecordingStreams)
        .set({ synced: true })
        .where(eq(activityRecordingStreams.id, id));
    }

    console.log(`Marked ${streamIds.length} streams as synced`);
  }

  /**
   * Mark recording as synced
   */
  async markRecordingSynced(recordingId: string): Promise<void> {
    await localdb
      .update(activityRecordings)
      .set({ synced: true })
      .where(eq(activityRecordings.id, recordingId));

    console.log(`Marked recording ${recordingId} as synced`);
  }

  // ================================
  // Data Aggregation Helpers
  // ================================

  /**
   * Reconstruct complete activity data from chunks
   */
  async reconstructActivityData(
    recordingId: string,
  ): Promise<Record<string, { values: any[]; timestamps: number[] }>> {
    const streams = await this.getRecordingStreams(recordingId);
    const reconstructed: Record<
      string,
      { values: any[]; timestamps: number[] }
    > = {};

    // Group streams by metric
    const streamsByMetric = streams.reduce(
      (acc, stream) => {
        if (!acc[stream.metric]) {
          acc[stream.metric] = [];
        }
        acc[stream.metric].push(stream);
        return acc;
      },
      {} as Record<string, SelectRecordingStream[]>,
    );

    // Reconstruct each metric's complete data
    for (const [metric, metricStreams] of Object.entries(streamsByMetric)) {
      const sortedStreams = metricStreams.sort(
        (a, b) => a.chunkIndex - b.chunkIndex,
      );
      const allValues: any[] = [];
      const allTimestamps: number[] = [];

      for (const stream of sortedStreams) {
        const chunkData = JSON.parse(stream.data as string);
        const chunkTimestamps = JSON.parse(stream.timestamps as string);

        allValues.push(...chunkData);
        allTimestamps.push(...chunkTimestamps);
      }

      reconstructed[metric] = {
        values: allValues,
        timestamps: allTimestamps,
      };
    }

    return reconstructed;
  }

  // ================================
  // Cleanup & Lifecycle
  // ================================

  /**
   * Clean up completed recording session
   */
  async finishRecording(): Promise<void> {
    // Final flush of any remaining data
    await this.flushBuffer();

    // Stop chunk processing
    this.stopChunkProcessing();

    // Update recording state to finished
    if (this.currentRecordingId) {
      await this.updateRecordingState(this.currentRecordingId, "finished");
    }

    // Reset state
    this.currentRecordingId = null;
    this.chunkIndex = 0;
    this.clearBuffer();

    console.log("Recording session finished and cleaned up");
  }

  /**
   * Abandon current recording and clean up
   */
  async discardRecording(): Promise<void> {
    if (this.currentRecordingId) {
      await this.updateRecordingState(this.currentRecordingId, "discarded");
      console.log(`Discarded recording: ${this.currentRecordingId}`);
    }

    this.stopChunkProcessing();
    this.currentRecordingId = null;
    this.chunkIndex = 0;
    this.clearBuffer();
  }

  /**
   * Delete old recordings and their streams
   */
  async deleteRecording(recordingId: string): Promise<void> {
    // Delete streams first (foreign key constraint)
    await localdb
      .delete(activityRecordingStreams)
      .where(eq(activityRecordingStreams.activityRecordingId, recordingId));

    // Delete recording
    await localdb
      .delete(activityRecordings)
      .where(eq(activityRecordings.id, recordingId));

    console.log(`Deleted recording: ${recordingId}`);
  }

  /**
   * Delete all unfinished recordings for a specific user/profile
   * This ensures a clean slate before starting a new recording
   */
  async deleteUnfinishedRecordings(profileId: string): Promise<void> {
    try {
      // Find all unfinished recordings for this profile
      const unfinishedRecordings = await localdb
        .select({ id: activityRecordings.id })
        .from(activityRecordings)
        .where(
          and(
            eq(activityRecordings.profileId, profileId),
            // Delete recordings that are not finished (pending, ready, recording, paused, discarded)
            // Only keep "finished" recordings
            ne(activityRecordings.state, "finished"),
          ),
        );

      if (unfinishedRecordings.length === 0) {
        console.log(`No unfinished recordings found for profile ${profileId}`);
        return;
      }

      const recordingIds = unfinishedRecordings.map((r) => r.id);

      // Delete associated streams first (foreign key constraint)
      await localdb
        .delete(activityRecordingStreams)
        .where(
          inArray(activityRecordingStreams.activityRecordingId, recordingIds),
        );

      // Delete the unfinished recordings
      await localdb
        .delete(activityRecordings)
        .where(
          and(
            eq(activityRecordings.profileId, profileId),
            ne(activityRecordings.state, "finished"),
          ),
        );

      console.log(
        `Deleted ${recordingIds.length} unfinished recordings for profile ${profileId}:`,
        recordingIds,
      );
    } catch (error) {
      console.error("Failed to delete unfinished recordings:", error);
      // Don't throw - we want recording to continue even if cleanup fails
    }
  }

  // ================================
  // Enhanced Stream Aggregation and Compression
  // ================================

  /**
   * Aggregate and compress all streams for a recording into upload-ready format
   * Creates one compressed stream per metric for backend upload
   */
  async prepareStreamsForUpload(recordingId: string): Promise<
    {
      type: PublicActivityMetric;
      data_type: PublicActivityMetricDataType;
      data: string; // Base64 encoded compressed data
      original_size: number;
      sample_count: number;
      start_time: string;
      end_time: string;
    }[]
  > {
    const streams = await this.getRecordingStreams(recordingId);
    if (streams.length === 0) return [];

    // Group streams by metric type
    const streamsByMetric = this.groupStreamsByMetric(streams);
    const compressedStreams: any[] = [];

    // Process each metric independently
    for (const [metric, metricStreams] of Object.entries(streamsByMetric)) {
      const aggregated = this.aggregateMetricStreams(metricStreams);
      const compressed = await this.compressStreamData(
        aggregated,
        metric as PublicActivityMetric,
      );
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
      totalSamples,
    };
  }

  /**
   * Compress aggregated stream data using pako gzip
   */
  private async compressStreamData(
    aggregated: any,
    metric: PublicActivityMetric,
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
        metric: metric,
      };

      // Convert to JSON string
      const jsonString = JSON.stringify(streamPayload);
      const originalSize = new TextEncoder().encode(jsonString).length;

      // Compress with pako
      const compressed = pako.gzip(jsonString);

      // Convert to base64 for JSON transport
      const base64Compressed = Buffer.from(compressed).toString("base64");

      console.log(
        `Compressed ${metric}: ${originalSize} bytes → ${base64Compressed.length} chars ` +
          `(${((1 - base64Compressed.length / originalSize) * 100).toFixed(1)}% reduction)`,
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
  async prepareSubmissionPayload(
    recordingId: string,
    activitySummary: ActivitySummary,
    recording: SelectActivityRecording,
  ): Promise<{
    activity: any; // PublicActivitiesInsertSchema format
    activity_streams: any[]; // PublicActivityStreamsInsertSchema[] format
  }> {
    // Prepare compressed streams
    const compressedStreams = await this.prepareStreamsForUpload(recordingId);

    // Prepare activity metadata
    const activityPayload = {
      // Core required fields
      name: recording.name || `${recording.activityType} Activity`,
      activity_type: recording.activityType,
      profile_id: recording.profileId,

      // Timing
      started_at: recording.startedAt.toISOString(),
      moving_time: Math.round(activitySummary.movingTime / 1000), // Convert to seconds

      // Performance metrics
      distance: activitySummary.distance || null,
      avg_heart_rate: activitySummary.averageHeartRate || null,
      max_heart_rate: activitySummary.maxHeartRate || null,
      avg_speed: activitySummary.averageSpeed || null,
      max_speed: activitySummary.maxSpeed || null,
      avg_power: activitySummary.averagePower || null,
      normalized_power: activitySummary.normalizedPower || null,
      avg_cadence: activitySummary.averageCadence || null,
      max_cadence: activitySummary.maxCadence || null,

      // Optional fields
      notes: recording.notes || null,
      local_file_path: recordingId, // Reference to local recording
      planned_activity_id: recording.plannedActivityId || null,
    };

    // Format streams for backend
    const activityStreamsPayload = compressedStreams.map((stream) => ({
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
      activity_streams: activityStreamsPayload,
    };
  }

  // ================================
  // Sync & Upload Methods
  // ================================

  /**
   * Upload completed activity using enhanced submission payload
   * Uses the new enhanced compression system
   */
  async uploadActivity(
    recordingId: string,
    activityData: any,
    summary: any,
  ): Promise<boolean> {
    try {
      // Get recording details
      const recording = await this.getCurrentRecording();
      if (!recording) {
        throw new Error("Recording not found");
      }

      // Use enhanced submission payload preparation
      const submissionPayload = await this.prepareSubmissionPayload(
        recordingId,
        summary,
        recording,
      );

      console.log("Enhanced upload payload prepared:", {
        activityName: submissionPayload.activity.name,
        streamCount: submissionPayload.activity_streams.length,
        totalOriginalSize: submissionPayload.activity_streams.reduce(
          (sum, s) => sum + s.original_size,
          0,
        ),
      });

      // TODO: Replace with actual tRPC client when available
      // const result = await trpc.activities.create.mutate(submissionPayload);

      // Placeholder success
      console.log("Enhanced activity upload would succeed");

      // Mark recording as synced
      await this.markRecordingSynced(recordingId);
      console.log(`Successfully uploaded activity using enhanced compression`);

      return true;
    } catch (error) {
      console.error("Failed to upload activity:", error);
      return false;
    }
  }

  /**
   * Group streams by metric for batch processing
   * Used by enhanced compression system
   */
  private groupStreamsByMetric(
    streams: SelectRecordingStream[],
  ): Record<string, SelectRecordingStream[]> {
    return streams.reduce(
      (acc, stream) => {
        if (!acc[stream.metric]) {
          acc[stream.metric] = [];
        }
        acc[stream.metric].push(stream);
        return acc;
      },
      {} as Record<string, SelectRecordingStream[]>,
    );
  }

  // ================================
  // Utility Methods
  // ================================

  /**
   * Get data type for metric (required for schema)
   */
  private getDataTypeForMetric(
    metric: PublicActivityMetric,
  ): PublicActivityMetricDataType {
    const dataTypes: Record<
      PublicActivityMetric,
      PublicActivityMetricDataType
    > = {
      heartrate: "integer",
      power: "integer",
      speed: "float",
      cadence: "integer",
      distance: "float",
      latlng: "latlng",
      altitude: "float",
      temperature: "float",
      gradient: "float",
      moving: "boolean",
    };

    return dataTypes[metric] || "float";
  }

  /**
   * Get current recording ID
   */
  getCurrentRecordingId(): string | null {
    return this.currentRecordingId;
  }

  /**
   * Check if actively recording
   */
  isRecording(): boolean {
    return this.currentRecordingId !== null && this.chunkTimer !== null;
  }

  /**
   * Get recording statistics
   */
  async getRecordingStats(recordingId?: string): Promise<{
    totalChunks: number;
    totalSamples: number;
    metrics: string[];
    unsyncedChunks: number;
  }> {
    const id = recordingId || this.currentRecordingId;
    if (!id) {
      return {
        totalChunks: 0,
        totalSamples: 0,
        metrics: [],
        unsyncedChunks: 0,
      };
    }

    const streams = await this.getRecordingStreams(id);
    const uniqueMetrics = [...new Set(streams.map((s) => s.metric))];
    const totalSamples = streams.reduce((sum, s) => sum + s.sampleCount, 0);
    const unsyncedChunks = streams.filter((s) => !s.synced).length;

    return {
      totalChunks: streams.length,
      totalSamples,
      metrics: uniqueMetrics,
      unsyncedChunks,
    };
  }
}
