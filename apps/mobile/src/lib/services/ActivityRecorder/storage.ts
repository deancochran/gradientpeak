import { localdb } from "@/lib/db";
import {
  InsertActivityRecording,
  InsertRecordingStream,
  SelectActivityRecording,
  SelectRecordingStream,
  activityRecordingStreams,
  activityRecordings,
} from "@/lib/db/schemas";
import { createId } from "@paralleldrive/cuid2";
import {
  PublicActivitiesInsert,
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityPlansRow,
  PublicActivityStreamsInsert,
  PublicPlannedActivitiesRow,
  PublicProfilesRow,
} from "@repo/core";
import { and, eq, inArray } from "drizzle-orm";
import pako from "pako";
import {
  AggregatedStream,
  calculateAge,
  calculateAverageGrade,
  calculateCalories,
  calculateDecoupling,
  calculateEfficiencyFactor,
  calculateElapsedTime,
  calculateElevationChanges,
  calculateElevationGainPerKm,
  calculateHRZones,
  calculateIntensityFactor,
  calculateMaxHRPercent,
  calculateMovingTime,
  calculateNormalizedPower,
  calculatePowerHeartRateRatio,
  calculatePowerWeightRatio,
  calculatePowerZones,
  calculateTSS,
  calculateTotalWork,
  calculateVariabilityIndex,
} from "./calculations";
import { SensorReading } from "./calculations/sensor-parsing";

// Type-safe parsed stream data
interface ParsedStreamData {
  data: number[];
  timestamps: number[];
}

// Buffer interface for accumulated sensor data
interface SensorDataBuffer {
  [metric: string]: SensorReading[];
}

// Recording state type
type RecordingState = "idle" | "recording" | "paused" | "finished";

// Chunk processing configuration
const CHUNK_INTERVAL_MS = 5000; // 5 seconds
const MAX_BUFFER_SIZE = 1000; // Max readings per metric before forced flush

/**
 * Manages local storage and chunking of activity recording data
 * Uses SQLite via Drizzle ORM for offline-first data persistence
 */
export class DataStorageManager {
  public profile: PublicProfilesRow;
  private recordingId: string | null = null;
  private sensorDataBuffer: SensorDataBuffer = {};
  private chunkIndex: number = 0;
  private lastCheckpointAt: Date | null = null;
  private chunkTimer: ReturnType<typeof setInterval> | null = null;
  private currentState: RecordingState = "idle";

  constructor(profile: PublicProfilesRow, recording?: SelectActivityRecording) {
    this.profile = profile;
    if (recording) {
      this.recordingId = recording.id;
      this.chunkIndex = 0;
      this.currentState = (recording.state as RecordingState) || "idle";
    }
  }

  async createRecording(
    profile: PublicProfilesRow,
  ): Promise<SelectActivityRecording> {
    const [recording] = await localdb
      .insert(activityRecordings)
      .values({
        profileId: profile.id,
        profileWeightKg: profile.weight_kg,
        profileFtp: profile.ftp,
        profileThresholdHr: profile.threshold_hr,
      })
      .returning();

    this.recordingId = recording.id;
    this.currentState = "idle";
    return recording;
  }

  async updateRecording(
    data: Partial<
      Omit<
        InsertActivityRecording,
        | "id"
        | "createdAt"
        | "version"
        | "profileId"
        | "profileWeightKg"
        | "profileFtp"
        | "profileThresholdHr"
      >
    >,
  ): Promise<SelectActivityRecording> {
    if (!this.recordingId) throw new Error("No recording ID");

    const [updatedRecording] = await localdb
      .update(activityRecordings)
      .set(data)
      .where(eq(activityRecordings.id, this.recordingId))
      .returning();

    if (!updatedRecording) throw new Error("Failed to update recording");

    if (data.state) {
      this.currentState = data.state as RecordingState;
    }

    return updatedRecording;
  }

  async getCurrentRecording(): Promise<SelectActivityRecording | null> {
    if (!this.recordingId) return null;

    const [recording] = await localdb
      .select()
      .from(activityRecordings)
      .where(eq(activityRecordings.id, this.recordingId))
      .limit(1);

    return recording || null;
  }

  // ================================
  // Sensor Data Buffering
  // ================================

  addSensorReading(reading: SensorReading): void {
    if (!this.recordingId)
      throw new Error("No active recording - dropping sensor reading");

    if (!this.sensorDataBuffer[reading.metric]) {
      this.sensorDataBuffer[reading.metric] = [];
    }

    this.sensorDataBuffer[reading.metric].push(reading);

    if (this.sensorDataBuffer[reading.metric].length >= MAX_BUFFER_SIZE) {
      this.processChunk().catch(console.error);
    }
  }

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

  startChunkProcessing(): void {
    if (this.chunkTimer) {
      console.warn("Chunk processing already running");
      return;
    }

    this.chunkTimer = setInterval(() => {
      this.processChunk().catch(console.error);
    }, CHUNK_INTERVAL_MS);
  }

  stopChunkProcessing(): void {
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }
  }

  async processChunk(): Promise<void> {
    if (!this.recordingId) throw new Error("No recording ID");
    if (!this.lastCheckpointAt) throw new Error("No last checkpoint");

    const endTime = Date.now();
    const streamsToInsert: InsertRecordingStream[] = [];

    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      if (buffer.length === 0) continue;

      const data = buffer.map((item) => item.value);
      const timestamps = buffer.map((item) => item.timestamp);

      const streamData: InsertRecordingStream = {
        activityRecordingId: this.recordingId,
        metric: metric as PublicActivityMetric,
        dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
        chunkIndex: this.chunkIndex,
        startTime: this.lastCheckpointAt,
        endTime: new Date(endTime),
        data: JSON.stringify(data),
        timestamps: JSON.stringify(timestamps),
        sampleCount: buffer.length,
        synced: false,
      };

      streamsToInsert.push(streamData);
      buffer.length = 0;
    }

    if (streamsToInsert.length > 0) {
      await localdb.insert(activityRecordingStreams).values(streamsToInsert);
    }

    this.lastCheckpointAt = new Date(endTime);
    this.chunkIndex++;
  }

  // ================================
  // Stream Data Queries
  // ================================

  async getRecordingStreams(): Promise<SelectRecordingStream[]> {
    if (!this.recordingId) {
      throw new Error("Recording ID is not set");
    }

    return await localdb
      .select()
      .from(activityRecordingStreams)
      .where(eq(activityRecordingStreams.activityRecordingId, this.recordingId))
      .orderBy(
        activityRecordingStreams.metric,
        activityRecordingStreams.chunkIndex,
      );
  }

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

  async markStreamsSynced(streamIds: string[]): Promise<void> {
    if (streamIds.length === 0) return;

    await localdb
      .update(activityRecordingStreams)
      .set({ synced: true })
      .where(inArray(activityRecordingStreams.id, streamIds));
  }

  async markRecordingSynced(recordingId: string): Promise<void> {
    await localdb
      .update(activityRecordings)
      .set({ synced: true })
      .where(eq(activityRecordings.id, recordingId));
  }

  // ================================
  // Lifecycle Methods
  // ================================

  async resetState(): Promise<void> {
    this.stopChunkProcessing();
    this.recordingId = null;
    this.chunkIndex = 0;
    this.sensorDataBuffer = {};
    this.lastCheckpointAt = null;
    this.currentState = "idle";
  }

  async startRecording(): Promise<SelectActivityRecording> {
    const recording = await this.updateRecording({
      startedAt: new Date().toISOString(),
      state: "recording",
    });

    this.lastCheckpointAt = new Date();
    this.startChunkProcessing();

    return recording;
  }

  async pauseRecording(): Promise<SelectActivityRecording> {
    this.stopChunkProcessing();
    if (this.lastCheckpointAt) {
      await this.processChunk();
    }

    const recording = await this.updateRecording({
      state: "paused",
    });
    return recording;
  }

  async resumeRecording(): Promise<SelectActivityRecording> {
    const recording = await this.updateRecording({
      state: "recording",
    });

    this.lastCheckpointAt = new Date();
    this.startChunkProcessing();

    return recording;
  }

  async finishRecording(): Promise<void> {
    if (!this.recordingId) throw new Error("No recording ID provided");

    this.stopChunkProcessing();

    if (
      this.lastCheckpointAt &&
      Object.values(this.sensorDataBuffer).some((buffer) => buffer.length > 0)
    ) {
      await this.processChunk();
    }

    await this.updateRecording({ state: "finished" });
  }

  async deleteLocalRecordings(): Promise<void> {
    await localdb.delete(activityRecordings);
    this.resetState();
  }

  // ================================
  // State Management Helpers
  // ================================

  isRecording(): boolean {
    return this.currentState === "recording";
  }

  isPaused(): boolean {
    return this.currentState === "paused";
  }

  isFinished(): boolean {
    return this.currentState === "finished";
  }

  getState(): RecordingState {
    return this.currentState;
  }

  // ================================
  // Helper Methods
  // ================================

  private getDataTypeForMetric(
    metric: PublicActivityMetric,
  ): PublicActivityMetricDataType {
    switch (metric) {
      case "latlng":
        return "latlng";
      case "moving":
        return "boolean";
      default:
        return "float";
    }
  }

  private parseStreamData(stream: SelectRecordingStream): ParsedStreamData {
    try {
      const data = JSON.parse(stream.data as string);
      const timestamps = JSON.parse(stream.timestamps as string);

      // Type guard
      if (!Array.isArray(data) || !Array.isArray(timestamps)) {
        throw new Error("Invalid stream data format");
      }

      return {
        data: data as number[],
        timestamps: timestamps as number[],
      };
    } catch (error) {
      throw new Error(`Failed to parse stream data: ${error}`);
    }
  }

  private groupStreamsByMetric(
    streams: SelectRecordingStream[],
  ): Map<string, SelectRecordingStream[]> {
    const grouped = new Map<string, SelectRecordingStream[]>();

    for (const stream of streams) {
      const existing = grouped.get(stream.metric);
      if (existing) {
        existing.push(stream);
      } else {
        grouped.set(stream.metric, [stream]);
      }
    }

    return grouped;
  }

  private aggregateMetricStreams(
    streams: SelectRecordingStream[],
  ): AggregatedStream {
    if (streams.length === 0) {
      throw new Error("Cannot aggregate empty stream array");
    }

    const firstStream = streams[0];
    const allValues: number[] = [];
    const allTimestamps: number[] = [];

    // Pre-allocate arrays if we know the total size
    let totalSize = 0;
    for (const stream of streams) {
      totalSize += stream.sampleCount;
    }

    allValues.length = totalSize;
    allTimestamps.length = totalSize;

    let offset = 0;
    for (const stream of streams) {
      const parsed = this.parseStreamData(stream);

      // Copy data into pre-allocated arrays
      for (let i = 0; i < parsed.data.length; i++) {
        allValues[offset + i] = parsed.data[i];
        allTimestamps[offset + i] = parsed.timestamps[i];
      }

      offset += parsed.data.length;
    }

    // Calculate statistics for numeric metrics in a single pass
    let minValue: number | undefined;
    let maxValue: number | undefined;
    let avgValue: number | undefined;

    if (firstStream.dataType === "float" && allValues.length > 0) {
      let sum = 0;
      minValue = allValues[0];
      maxValue = allValues[0];

      for (let i = 0; i < allValues.length; i++) {
        const val = allValues[i];
        sum += val;
        if (val < minValue) minValue = val;
        if (val > maxValue) maxValue = val;
      }

      avgValue = sum / allValues.length;
    }

    return {
      metric: firstStream.metric,
      dataType: firstStream.dataType,
      values: allValues,
      timestamps: allTimestamps,
      sampleCount: allValues.length,
      minValue,
      maxValue,
      avgValue,
    };
  }

  private async compressStreamData(
    activityId: string,
    aggregated: AggregatedStream,
    metric: PublicActivityMetric,
    dataType: PublicActivityMetricDataType,
  ): Promise<PublicActivityStreamsInsert> {
    // Convert to Float32Array for efficient compression
    const valuesArray = new Float32Array(aggregated.values);
    const timestampsArray = new Float32Array(aggregated.timestamps);

    // Compress using pako (gzip)
    const compressedValues = pako.gzip(new Uint8Array(valuesArray.buffer));
    const compressedTimestamps = pako.gzip(
      new Uint8Array(timestampsArray.buffer),
    );

    const originalSize = valuesArray.byteLength + timestampsArray.byteLength;

    return {
      activity_id: activityId,
      type: metric,
      data_type: dataType,
      compressed_values: Buffer.from(compressedValues).toString("base64"),
      compressed_timestamps:
        Buffer.from(compressedTimestamps).toString("base64"),
      sample_count: aggregated.sampleCount,
      original_size: originalSize,
      min_value: aggregated.minValue,
      max_value: aggregated.maxValue,
      avg_value: aggregated.avgValue,
    };
  }

  // ================================
  // Activity Payload Creation
  // ================================

  async createActivityPayload(
    recordingId: string,
    plannedActivity?: PublicPlannedActivitiesRow & {
      activity_plan: PublicActivityPlansRow;
    },
  ): Promise<{
    activity: PublicActivitiesInsert;
    activity_streams: PublicActivityStreamsInsert[];
  }> {
    if (!recordingId) throw new Error("Recording ID is required");

    const recording = await localdb
      .select()
      .from(activityRecordings)
      .where(eq(activityRecordings.id, recordingId))
      .limit(1);

    if (!recording[0]) throw new Error("Recording not found");

    const activity_id = createId();
    const streams = await localdb
      .select()
      .from(activityRecordingStreams)
      .where(eq(activityRecordingStreams.activityRecordingId, recordingId))
      .orderBy(
        activityRecordingStreams.metric,
        activityRecordingStreams.chunkIndex,
      );

    if (streams.length === 0) throw new Error("No streams found for recording");

    const activity_streams: PublicActivityStreamsInsert[] = [];
    const aggregatedStreams = new Map<string, AggregatedStream>();
    const streamsByMetric = this.groupStreamsByMetric(streams);

    // First pass: aggregate and store uncompressed data
    for (const [metric, metricStreams] of streamsByMetric.entries()) {
      const aggregated = this.aggregateMetricStreams(metricStreams);
      aggregatedStreams.set(metric, aggregated);

      // Then compress for storage
      const compressed_stream = await this.compressStreamData(
        activity_id,
        aggregated,
        metric as PublicActivityMetric,
        this.getDataTypeForMetric(metric as PublicActivityMetric),
      );
      activity_streams.push(compressed_stream);
    }

    // Create activity using the uncompressed aggregated streams
    const activity = this.createActivity(
      recording[0],
      aggregatedStreams,
      plannedActivity,
    );
    activity.id = activity_id;

    return {
      activity,
      activity_streams,
    };
  }

  private createActivity(
    recording: SelectActivityRecording,
    aggregatedStreams: Map<string, AggregatedStream>,
    plannedActivity?: PublicPlannedActivitiesRow & {
      activity_plan: PublicActivityPlansRow;
    },
  ): PublicActivitiesInsert {
    if (!recording.startedAt || !recording.endedAt) {
      throw new Error("Recording must have started and ended times");
    }

    // Calculate metrics from uncompressed streams
    const metrics = this.calculateActivityMetrics(recording, aggregatedStreams);

    const activity: PublicActivitiesInsert = {
      profile_id: this.profile.id,
      started_at: recording.startedAt,
      finished_at: recording.endedAt,
      name:
        plannedActivity?.activity_plan.name ||
        `Activity ${new Date().toLocaleDateString()}`,
      activity_type: plannedActivity?.activity_plan.activity_type || "other",
      ...metrics,
      planned_activity_id: plannedActivity?.id,
      profile_age: calculateAge(this.profile.dob),
      profile_ftp: this.profile.ftp,
      profile_threshold_hr: this.profile.threshold_hr,
      profile_weight_kg: this.profile.weight_kg,
    };

    return activity;
  }

  calculateActivityMetrics(
    recording: SelectActivityRecording,
    aggregatedStreams: Map<string, AggregatedStream>,
    profileDob?: string,
  ): Omit<
    PublicActivitiesInsert,
    | "name"
    | "notes"
    | "activity_type"
    | "started_at"
    | "finished_at"
    | "planned_activity_id"
    | "profile_id"
    | "profile_age"
    | "profile_ftp"
    | "profile_threshold_hr"
    | "profile_weight_kg"
  > {
    // ============================================
    // 1. Extract stream references (O(1) lookups)
    // ============================================
    const hrStream = aggregatedStreams.get("heartrate");
    const powerStream = aggregatedStreams.get("power");
    const distanceStream = aggregatedStreams.get("distance");
    const speedStream = aggregatedStreams.get("speed");
    const cadenceStream = aggregatedStreams.get("cadence");
    const elevationStream = aggregatedStreams.get("elevation");
    const gradientStream = aggregatedStreams.get("gradient");

    // ============================================
    // 2. Base calculations (no dependencies)
    // ============================================
    const elapsed_time = calculateElapsedTime(recording);
    const moving_time = calculateMovingTime(recording, aggregatedStreams);
    const profile_age = calculateAge(profileDob || null);

    // ============================================
    // 3. Simple aggregated values (already computed)
    // ============================================
    const distance = distanceStream?.maxValue || 0;
    const avg_heart_rate = hrStream?.avgValue
      ? Math.round(hrStream.avgValue)
      : undefined;
    const max_heart_rate = hrStream?.maxValue
      ? Math.round(hrStream.maxValue)
      : undefined;
    const avg_power = powerStream?.avgValue
      ? Math.round(powerStream.avgValue)
      : undefined;
    const max_power = powerStream?.maxValue
      ? Math.round(powerStream.maxValue)
      : undefined;
    const avg_speed = speedStream?.avgValue;
    const max_speed = speedStream?.maxValue;
    const avg_cadence = cadenceStream?.avgValue
      ? Math.round(cadenceStream.avgValue)
      : undefined;
    const max_cadence = cadenceStream?.maxValue
      ? Math.round(cadenceStream.maxValue)
      : undefined;

    // ============================================
    // 4. Power-derived metrics (compute NP once, reuse)
    // ============================================
    const normalized_power = calculateNormalizedPower(powerStream);
    const intensity_factor = calculateIntensityFactor(
      powerStream,
      recording.profileFtp,
    );
    const training_stress_score = calculateTSS(powerStream, recording);
    const variability_index = calculateVariabilityIndex(
      powerStream,
      normalized_power,
    );
    const total_work = calculateTotalWork(powerStream, elapsed_time);

    // ============================================
    // 5. Zone calculations (iterate streams once per zone type)
    // ============================================
    const hr_zones = calculateHRZones(hrStream, recording.profileThresholdHr);
    const power_zones = calculatePowerZones(powerStream, recording.profileFtp);
    const max_hr_percent = calculateMaxHRPercent(
      hrStream,
      recording.profileThresholdHr,
    );

    // ============================================
    // 6. Multi-stream advanced metrics
    // ============================================
    const efficiency_factor = calculateEfficiencyFactor(powerStream, hrStream);
    const decoupling = calculateDecoupling(powerStream, hrStream);
    const power_heart_rate_ratio = calculatePowerHeartRateRatio(
      powerStream,
      hrStream,
    );
    const power_weight_ratio = calculatePowerWeightRatio(
      powerStream,
      recording.profileWeightKg,
    );

    // ============================================
    // 7. Elevation calculations (single pass through elevation data)
    // ============================================
    const { totalAscent, totalDescent } =
      calculateElevationChanges(elevationStream);
    const avg_grade = calculateAverageGrade(gradientStream);
    const elevation_gain_per_km = calculateElevationGainPerKm(
      totalAscent,
      distanceStream,
    );

    // ============================================
    // 8. Calories (last since it has multiple fallback paths)
    // ============================================
    const calories = calculateCalories(
      recording,
      powerStream,
      hrStream,
      profileDob,
    );

    // ============================================
    // Return complete metrics object
    // ============================================
    return {
      // Time
      elapsed_time,
      moving_time,

      // Distance & Speed
      distance,
      avg_speed,
      max_speed,

      // Heart Rate
      avg_heart_rate,
      max_heart_rate,
      hr_zone_1_time: hr_zones.zone1,
      hr_zone_2_time: hr_zones.zone2,
      hr_zone_3_time: hr_zones.zone3,
      hr_zone_4_time: hr_zones.zone4,
      hr_zone_5_time: hr_zones.zone5,

      // Power
      avg_power,
      max_power,
      normalized_power,
      intensity_factor,
      training_stress_score,
      variability_index,
      total_work,
      power_zone_1_time: power_zones.zone1,
      power_zone_2_time: power_zones.zone2,
      power_zone_3_time: power_zones.zone3,
      power_zone_4_time: power_zones.zone4,
      power_zone_5_time: power_zones.zone5,
      power_zone_6_time: power_zones.zone6,
      power_zone_7_time: power_zones.zone7,

      // Cadence
      avg_cadence,
      max_cadence,

      // Elevation
      total_ascent: totalAscent,
      total_descent: totalDescent,
      avg_grade,
      elevation_gain_per_km,

      // Advanced Metrics
      efficiency_factor,
      decoupling,
      power_heart_rate_ratio,
      power_weight_ratio,

      // Energy
      calories,
    };
  }
  // ================================
  // Utility Methods
  // ================================

  async getRecordingStats(): Promise<{
    totalChunks: number;
    sample_count: number;
    metrics: string[];
  }> {
    if (!this.recordingId) {
      return {
        totalChunks: 0,
        sample_count: 0,
        metrics: [],
      };
    }

    const streams = await this.getRecordingStreams();
    const uniqueMetrics = [...new Set(streams.map((s) => s.metric))];
    const sample_count = streams.reduce((sum, s) => sum + s.sampleCount, 0);

    return {
      totalChunks: streams.length,
      sample_count,
      metrics: uniqueMetrics,
    };
  }
}
