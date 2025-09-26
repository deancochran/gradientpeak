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
} from "@repo/core";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
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
  // Sync & Upload Methods
  // ================================

  /**
   * Upload completed activity and streams to server
   */
  async uploadActivity(
    recordingId: string,
    activityData: any,
    summary: any,
  ): Promise<boolean> {
    try {
      // Create activity record first
      const activityPayload = {
        activity_type: activityData.activityType,
        started_at: activityData.startedAt.toISOString(),
        duration: summary.duration,
        distance: summary.distance,
        elevation: summary.elevation,
        calories: summary.calories,
        average_power: summary.averagePower,
        normalized_power: summary.normalizedPower,
        average_heart_rate: summary.averageHeartRate,
        max_heart_rate: summary.maxHeartRate,
        average_speed: summary.averageSpeed,
        max_speed: summary.maxSpeed,
        training_stress_score: summary.tss,
        planned_activity_id: activityData.plannedActivityId,
      };

      const activityResult =
        // TODO: Integrate with actual tRPC client when available
        // const activityResult = await trpc.activities.create.mutate(activityPayload);
        console.log(
          "Activity upload would be created with payload:",
          activityPayload,
        );

      // Upload streams would happen here
      // const success = await this.uploadActivityStreams(recordingId, activityResult.id);
      const success = true; // Placeholder for now

      if (success) {
        // Mark recording as synced
        await this.markRecordingSynced(recordingId);
        console.log(`Successfully uploaded activity (placeholder)`);
      }

      return success;
    } catch (error) {
      console.error("Failed to upload activity:", error);
      return false;
    }
  }

  /**
   * Upload activity streams in compressed batches
   */
  async uploadActivityStreams(
    recordingId: string,
    activityId: string,
  ): Promise<boolean> {
    try {
      const streams = await this.getRecordingStreams(recordingId);
      if (streams.length === 0) {
        console.log("No streams to upload");
        return true;
      }

      // Group streams by metric for efficient upload
      const streamsByMetric = this.groupStreamsByMetric(streams);

      // Upload each metric's streams as a batch
      for (const [metric, metricStreams] of Object.entries(streamsByMetric)) {
        const compressedStreams = this.compressStreamData(metricStreams);

        // TODO: Integrate with actual tRPC client when available
        // await trpc.activityStreams.batchCreate.mutate({
        //   activity_id: activityId,
        //   streams: compressedStreams,
        // });

        console.log(
          `Uploaded ${compressedStreams.length} ${metric} stream chunks`,
        );
      }

      // Mark all streams as synced
      const streamIds = streams.map((s) => s.id);
      await this.markStreamsSynced(streamIds);

      return true;
    } catch (error) {
      console.error("Failed to upload activity streams:", error);
      return false;
    }
  }

  /**
   * Group streams by metric for batch processing
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

  /**
   * Compress stream data using pako gzip
   */
  private compressStreamData(streams: SelectRecordingStream[]): any[] {
    return streams.map((stream) => {
      try {
        // Parse the JSON data
        const data = JSON.parse(stream.data as string);
        const timestamps = JSON.parse(stream.timestamps as string);

        // TODO: Add pako compression when available
        // const compressedData = pako.gzip(JSON.stringify(data));
        // const compressedTimestamps = pako.gzip(JSON.stringify(timestamps));

        return {
          type: stream.metric,
          data_type: stream.dataType,
          chunk_index: stream.chunkIndex,
          start_time: stream.startTime.toISOString(),
          end_time: stream.endTime.toISOString(),
          sample_count: stream.sampleCount,
          data: JSON.stringify(data), // Uncompressed for now
          timestamps: JSON.stringify(timestamps), // Uncompressed for now
          compressed: false,
        };
      } catch (error) {
        console.warn(
          "Failed to compress stream data, uploading uncompressed:",
          error,
        );
        return {
          type: stream.metric,
          data_type: stream.dataType,
          chunk_index: stream.chunkIndex,
          start_time: stream.startTime.toISOString(),
          end_time: stream.endTime.toISOString(),
          sample_count: stream.sampleCount,
          data: stream.data,
          timestamps: stream.timestamps,
          compressed: false,
        };
      }
    });
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
