/**
 * StreamBuffer - File-based Stream Storage for Activity Recording
 *
 * Replaces SQLite/DataAccumulator with FileSystem-based storage:
 * - Accumulates sensor readings and location data in memory
 * - Writes chunks to FileSystem every 60 seconds
 * - Reads and aggregates all chunks on recording finish
 * - Cleans up temp files after successful upload
 *
 * Benefits:
 * - No database overhead
 * - No CUID dependency
 * - Simpler architecture
 * - Better for long recordings (automatic memory management)
 */

import type {
  AggregatedStream,
  PublicActivityMetric,
  PublicActivityMetricDataType,
} from "@repo/core";
import { Directory, File, Paths } from "expo-file-system";
import type { LocationReading, SensorReading } from "./types";

// ================================
// Types
// ================================

interface StreamChunk {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[] | number[][];
  timestamps: number[];
  sampleCount: number;
  startTime: Date;
  endTime: Date;
}

interface StreamChunkCommit {
  version: 1;
  chunkIndex: number;
  files: string[];
  committedAt: string;
}

export interface DurableStreamReplay {
  sensorReadings: SensorReading[];
  locations: LocationReading[];
  fitRecords: Array<{
    timestamp: number;
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
    distance?: number;
    latitude?: number;
    longitude?: number;
    altitude?: number;
    temperature?: number;
  }>;
}

// ================================
// StreamBuffer Class
// ================================

export class StreamBuffer {
  private readings: Map<PublicActivityMetric, Array<{ value: number; timestamp: number }>> =
    new Map();
  private locations: LocationReading[] = [];
  private allLocations: LocationReading[] = []; // Keep ALL locations for GPS path display
  private chunkIndex = 0;
  private lastFlushTime: Date;
  private sessionId: string;
  private storageDir: Directory;

  constructor(storageDirUri?: string) {
    this.lastFlushTime = new Date();
    this.sessionId = `recording_${Date.now()}`;
    this.storageDir = storageDirUri
      ? new Directory(storageDirUri)
      : new Directory(Paths.cache, this.sessionId);
  }

  /** Opens validated durable chunks and prepares the same directory for append-only continuation. */
  static async reopenForRecovery(storageDirUris: string | readonly string[]): Promise<{
    streamBuffer: StreamBuffer;
    replay: DurableStreamReplay;
  }> {
    const paths = typeof storageDirUris === "string" ? [storageDirUris] : [...storageDirUris];
    const appendPath = paths.at(-1);
    if (!appendPath) throw new Error("Recording checkpoint has no stream directory");
    const streamBuffer = new StreamBuffer(appendPath);
    const chunks: Array<{ chunkIndex: number; chunk: StreamChunk }> = [];
    for (const path of paths) {
      const source = path === appendPath ? streamBuffer : new StreamBuffer(path);
      if (!source.storageDir.exists) throw new Error("Recording stream directory is missing");
      chunks.push(...source.readValidatedChunks());
    }
    const maxChunkIndex = chunks.reduce((max, item) => Math.max(max, item.chunkIndex), -1);
    streamBuffer.chunkIndex = maxChunkIndex + 1;
    streamBuffer.lastFlushTime = chunks.reduce(
      (latest, item) => (item.chunk.endTime > latest ? item.chunk.endTime : latest),
      new Date(0),
    );
    const replay = StreamBuffer.buildReplay(chunks.map((item) => item.chunk));
    streamBuffer.allLocations = replay.locations.slice(-1000);
    return { streamBuffer, replay };
  }

  static deleteDurableDirectories(paths: readonly string[]): void {
    for (const path of new Set(paths)) {
      const directory = new Directory(path);
      if (directory.exists) directory.delete();
    }
  }

  private readValidatedChunks(): Array<{ chunkIndex: number; chunk: StreamChunk }> {
    const contents = this.storageDir.list();
    const files = contents.filter(
      (item): item is File => item instanceof File && item.uri.includes("chunk_"),
    );
    const committedFiles = new Set<string>();
    const committedIndices = new Set<number>();
    const commits = contents.filter(
      (item): item is File => item instanceof File && item.uri.includes("commit_"),
    );
    for (const commitFile of commits) {
      const filename = commitFile.uri.split("/").at(-1) ?? "";
      const raw = JSON.parse(commitFile.textSync()) as Partial<StreamChunkCommit>;
      if (
        raw.version !== 1 ||
        typeof raw.chunkIndex !== "number" ||
        !Number.isInteger(raw.chunkIndex) ||
        !Array.isArray(raw.files) ||
        raw.files.length === 0 ||
        raw.files.some((file) => typeof file !== "string")
      ) {
        throw new Error(`Corrupt recording stream commit: ${filename}`);
      }
      committedIndices.add(raw.chunkIndex);
      for (const file of raw.files) committedFiles.add(file);
    }
    const maxCommittedIndex = committedIndices.size > 0 ? Math.max(...committedIndices) : -1;
    for (const orphan of files.filter(
      (file) => !committedFiles.has(file.uri.split("/").at(-1) ?? ""),
    )) {
      const orphanIndex = Number((orphan.uri.split("/").at(-1) ?? "").split("_")[1]);
      if (!Number.isInteger(orphanIndex) || orphanIndex <= maxCommittedIndex) {
        throw new Error(`Corrupt uncommitted recording stream chunk: ${orphan.uri}`);
      }
      orphan.delete();
    }
    for (const filename of committedFiles) {
      if (!new File(this.storageDir.uri, filename).exists) {
        throw new Error(`Incomplete recording stream commit: ${filename}`);
      }
    }
    return files
      .filter((file) => committedFiles.has(file.uri.split("/").at(-1) ?? ""))
      .map((file) => {
        const filename = file.uri.split("/").at(-1) ?? "";
        const chunkIndex = Number(filename.split("_")[1]);
        const raw = JSON.parse(file.textSync()) as Partial<StreamChunk>;
        if (
          !Number.isInteger(chunkIndex) ||
          typeof raw.metric !== "string" ||
          !Array.isArray(raw.values) ||
          !Array.isArray(raw.timestamps) ||
          raw.values.length !== raw.timestamps.length ||
          raw.timestamps.some((timestamp) => !Number.isFinite(timestamp)) ||
          raw.sampleCount !== raw.values.length ||
          typeof raw.startTime !== "string" ||
          typeof raw.endTime !== "string"
        ) {
          throw new Error(`Corrupt recording stream chunk: ${filename}`);
        }
        const startTime = new Date(raw.startTime);
        const endTime = new Date(raw.endTime);
        if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
          throw new Error(`Corrupt recording stream chunk timing: ${filename}`);
        }
        return {
          chunkIndex,
          chunk: {
            metric: raw.metric as PublicActivityMetric,
            dataType: raw.dataType as PublicActivityMetricDataType,
            values: raw.values as number[] | number[][],
            timestamps: raw.timestamps,
            sampleCount: raw.sampleCount,
            startTime,
            endTime,
          },
        };
      })
      .sort((left, right) => left.chunkIndex - right.chunkIndex);
  }

  private static buildReplay(chunks: StreamChunk[]): DurableStreamReplay {
    const sensorReadings: SensorReading[] = [];
    const locationsByTimestamp = new Map<number, LocationReading>();
    const altitudeByTimestamp = new Map<number, number>();
    const fitByTimestamp = new Map<number, DurableStreamReplay["fitRecords"][number]>();
    for (const chunk of chunks) {
      chunk.timestamps.forEach((timestamp, index) => {
        const value = chunk.values[index];
        if (chunk.metric === "latlng" && Array.isArray(value)) {
          const latitude = value[0];
          const longitude = value[1];
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error("Corrupt latitude/longitude stream value");
          }
          locationsByTimestamp.set(timestamp, {
            latitude,
            longitude,
            timestamp,
            ...(altitudeByTimestamp.has(timestamp)
              ? { altitude: altitudeByTimestamp.get(timestamp) }
              : {}),
          });
          fitByTimestamp.set(timestamp, {
            ...(fitByTimestamp.get(timestamp) ?? { timestamp }),
            latitude,
            longitude,
          });
          return;
        }
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(`Corrupt numeric stream value for ${chunk.metric}`);
        }
        if (chunk.metric === "altitude") {
          altitudeByTimestamp.set(timestamp, value);
          const location = locationsByTimestamp.get(timestamp);
          if (location) location.altitude = value;
        } else {
          sensorReadings.push({
            metric: chunk.metric,
            dataType: chunk.dataType,
            value,
            timestamp,
          });
        }
        const fitField = (() => {
          switch (chunk.metric) {
            case "heart_rate":
              return "heartRate";
            case "power":
              return "power";
            case "cadence":
              return "cadence";
            case "speed":
              return "speed";
            case "distance":
              return "distance";
            case "altitude":
              return "altitude";
            case "temperature":
              return "temperature";
            default:
              return null;
          }
        })();
        if (fitField) {
          fitByTimestamp.set(timestamp, {
            ...(fitByTimestamp.get(timestamp) ?? { timestamp }),
            [fitField]: value,
          });
        }
      });
    }
    return {
      sensorReadings: sensorReadings.sort((left, right) => left.timestamp - right.timestamp),
      locations: [...locationsByTimestamp.values()].sort(
        (left, right) => left.timestamp - right.timestamp,
      ),
      fitRecords: [...fitByTimestamp.values()].sort(
        (left, right) => left.timestamp - right.timestamp,
      ),
    };
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    try {
      if (!this.storageDir.exists) {
        this.storageDir.create({ intermediates: true });
      }
      console.log("[StreamBuffer] Initialized storage:", this.storageDir.uri);
    } catch (error) {
      console.error("[StreamBuffer] Failed to initialize storage:", error);
      throw error;
    }
  }

  /**
   * Add a sensor reading to the buffer
   */
  add(reading: SensorReading): void {
    if (typeof reading.value !== "number") return; // Only numeric readings

    const metric = reading.metric as PublicActivityMetric;
    if (!this.readings.has(metric)) {
      this.readings.set(metric, []);
    }

    this.readings.get(metric)?.push({
      value: reading.value,
      timestamp: reading.timestamp || Date.now(),
    });
  }

  /**
   * Add a location reading to the buffer
   */
  addLocation(location: LocationReading): void {
    const locationData = {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
    };
    this.locations.push(locationData);
    this.allLocations.push(locationData); // Also keep in persistent array for GPS path

    // MEMORY LEAK FIX: Cap allLocations at MAX_GPS_PATH_POINTS
    // This prevents unbounded growth during long recordings
    const MAX_GPS_PATH_POINTS = 1000;
    if (this.allLocations.length > MAX_GPS_PATH_POINTS) {
      // Remove oldest points to maintain rolling window
      this.allLocations.splice(0, this.allLocations.length - MAX_GPS_PATH_POINTS);
    }
  }

  /**
   * Flush accumulated data to FileSystem
   * Called every 60 seconds by LiveMetricsManager
   */
  async flushToFiles(): Promise<void> {
    if (this.readings.size === 0 && this.locations.length === 0) {
      return;
    }

    const flushStartTime = Date.now();
    const endTime = new Date();

    try {
      const committedFilenames: string[] = [];
      // Write sensor readings by metric
      for (const [metric, readings] of this.readings.entries()) {
        if (readings.length === 0) continue;

        const chunk: StreamChunk = {
          metric,
          dataType: this.getDataTypeForMetric(metric),
          values: readings.map((r) => r.value),
          timestamps: readings.map((r) => r.timestamp),
          sampleCount: readings.length,
          startTime: this.lastFlushTime,
          endTime,
        };

        committedFilenames.push(await this.writeChunk(metric, chunk));
      }

      // Write location data
      if (this.locations.length > 0) {
        const latlngChunk: StreamChunk = {
          metric: "latlng",
          dataType: "latlng",
          values: this.locations.map((loc) => [loc.latitude, loc.longitude]),
          timestamps: this.locations.map((loc) => loc.timestamp),
          sampleCount: this.locations.length,
          startTime: this.lastFlushTime,
          endTime,
        };

        committedFilenames.push(await this.writeChunk("latlng", latlngChunk));

        // Write altitude separately if available
        const altitudes = this.locations.filter(
          (loc): loc is LocationReading & { altitude: number } => loc.altitude !== undefined,
        );
        if (altitudes.length > 0) {
          const altitudeChunk: StreamChunk = {
            metric: "altitude",
            dataType: "float",
            values: altitudes.map((loc) => loc.altitude),
            timestamps: altitudes.map((loc) => loc.timestamp),
            sampleCount: altitudes.length,
            startTime: this.lastFlushTime,
            endTime,
          };

          committedFilenames.push(await this.writeChunk("altitude", altitudeChunk));
        }
      }

      const commit: StreamChunkCommit = {
        version: 1,
        chunkIndex: this.chunkIndex,
        files: committedFilenames,
        committedAt: endTime.toISOString(),
      };
      new File(this.storageDir.uri, `commit_${this.chunkIndex}.json`).write(JSON.stringify(commit));

      console.log(
        `[StreamBuffer] Flushed chunk ${this.chunkIndex} (${this.readings.size} metrics, ${this.locations.length} locations) in ${Date.now() - flushStartTime}ms`,
      );

      // Clear memory after successful write
      this.readings.clear();
      this.locations = [];
      this.lastFlushTime = endTime;
      this.chunkIndex++;
    } catch (error) {
      console.error("[StreamBuffer] Failed to flush data:", error);
      // Don't clear data on error - will retry on next flush
      throw error;
    }
  }

  /**
   * Write a single chunk to file
   */
  private async writeChunk(metric: PublicActivityMetric, chunk: StreamChunk): Promise<string> {
    const filename = `chunk_${this.chunkIndex}_${metric}.json`;
    const file = new File(this.storageDir.uri, filename);

    try {
      file.write(JSON.stringify(chunk));
      console.log(`[StreamBuffer] Wrote chunk ${filename} (${chunk.sampleCount} samples)`);
      return filename;
    } catch (error) {
      console.error(`[StreamBuffer] Failed to write chunk ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Read and aggregate all chunks for final processing
   * Called when recording finishes
   */
  async aggregateAllChunks(): Promise<Map<string, AggregatedStream>> {
    const aggregateStartTime = Date.now();
    console.log("[StreamBuffer] Starting aggregation...");

    try {
      // List all chunk files
      const chunkFiles = this.readValidatedChunks().map(
        ({ chunkIndex, chunk }) => `chunk_${chunkIndex}_${chunk.metric}.json`,
      );

      console.log(`[StreamBuffer] Found ${chunkFiles.length} chunk files`);

      // Group files by metric
      const filesByMetric = new Map<string, string[]>();
      for (const file of chunkFiles) {
        const metric = this.extractMetricFromFilename(file);
        if (!filesByMetric.has(metric)) {
          filesByMetric.set(metric, []);
        }
        filesByMetric.get(metric)?.push(file);
      }

      // Aggregate each metric
      const aggregated = new Map<string, AggregatedStream>();

      for (const [metric, files] of filesByMetric.entries()) {
        // Sort files by chunk index
        files.sort((a, b) => {
          const indexA = parseInt(a.split("_")[1], 10);
          const indexB = parseInt(b.split("_")[1], 10);
          return indexA - indexB;
        });

        const aggregatedStream = await this.aggregateMetricChunks(metric, files);
        aggregated.set(metric, aggregatedStream);
      }

      console.log(
        `[StreamBuffer] Aggregation complete in ${Date.now() - aggregateStartTime}ms (${aggregated.size} metrics)`,
      );

      return aggregated;
    } catch (error) {
      console.error("[StreamBuffer] Aggregation failed:", error);
      throw error;
    }
  }

  /**
   * Aggregate all chunks for a single metric
   */
  private async aggregateMetricChunks(
    metric: string,
    filenames: string[],
  ): Promise<AggregatedStream> {
    const chunks: StreamChunk[] = [];

    // Read all chunk files
    for (const filename of filenames) {
      try {
        const file = new File(this.storageDir.uri, filename);
        const content = file.textSync();
        const chunk = JSON.parse(content) as StreamChunk;
        chunks.push(chunk);
      } catch (error) {
        console.error(`[StreamBuffer] Failed to read chunk ${filename}:`, error);
        throw error;
      }
    }

    if (chunks.length === 0) {
      throw new Error(`No chunks found for metric: ${metric}`);
    }

    const firstChunk = chunks[0];

    // Handle latlng data differently
    if (firstChunk.dataType === "latlng") {
      const allLatLngPairs: number[][] = [];
      const allTimestamps: number[] = [];

      for (const chunk of chunks) {
        allLatLngPairs.push(...(chunk.values as number[][]));
        allTimestamps.push(...chunk.timestamps);
      }

      return {
        metric: metric as PublicActivityMetric,
        dataType: firstChunk.dataType,
        values: allLatLngPairs,
        timestamps: allTimestamps,
        sampleCount: allLatLngPairs.length,
        minValue: undefined,
        maxValue: undefined,
        avgValue: undefined,
      };
    }

    // Handle regular numeric data
    const allValues: number[] = [];
    const allTimestamps: number[] = [];

    for (const chunk of chunks) {
      allValues.push(...(chunk.values as number[]));
      allTimestamps.push(...chunk.timestamps);
    }

    // Calculate statistics
    let minValue: number | undefined;
    let maxValue: number | undefined;
    let avgValue: number | undefined;

    if (allValues.length > 0) {
      let sum = 0;
      minValue = allValues[0];
      maxValue = allValues[0];

      for (const val of allValues) {
        sum += val;
        if (val < minValue) minValue = val;
        if (val > maxValue) maxValue = val;
      }

      avgValue = sum / allValues.length;
    }

    return {
      metric: metric as PublicActivityMetric,
      dataType: firstChunk.dataType,
      values: allValues,
      timestamps: allTimestamps,
      sampleCount: allValues.length,
      minValue,
      maxValue,
      avgValue,
    };
  }

  /**
   * Extract metric name from chunk filename
   */
  private extractMetricFromFilename(filename: string): string {
    // Format: chunk_{index}_{metric}.json
    const parts = filename.split("_");
    const metricWithExt = parts.slice(2).join("_"); // Handle metrics with underscores
    return metricWithExt.replace(".json", "");
  }

  /**
   * Determine data type for a metric
   */
  private getDataTypeForMetric(metric: PublicActivityMetric): PublicActivityMetricDataType {
    switch (metric) {
      case "latlng":
        return "latlng";
      case "moving":
        return "boolean";
      default:
        return "float";
    }
  }

  /**
   * Get current buffer status
   */
  /**
   * Check if there is any data pending flush
   */
  hasPendingData(): boolean {
    return this.readings.size > 0 || this.locations.length > 0;
  }

  getBufferStatus(): {
    readingCount: number;
    locationCount: number;
    chunkIndex: number;
    lastFlushTime: Date;
    memoryEstimateMB: number;
    storageDir: string;
  } {
    let totalReadings = 0;
    for (const readings of this.readings.values()) {
      totalReadings += readings.length;
    }

    const readingSize = totalReadings * 16; // Rough estimate: 16 bytes per reading
    const locationSize = this.locations.length * 40; // Rough estimate: 40 bytes per location
    const totalBytes = readingSize + locationSize;

    return {
      readingCount: totalReadings,
      locationCount: this.locations.length,
      chunkIndex: this.chunkIndex,
      lastFlushTime: this.lastFlushTime,
      memoryEstimateMB: totalBytes / (1024 * 1024),
      storageDir: this.storageDir.uri,
    };
  }

  /**
   * Get all recorded locations for GPS path display
   * This persists throughout the recording session
   */
  getAllLocations(): LocationReading[] {
    return this.allLocations;
  }

  /**
   * Clear all accumulated data without writing
   */
  clear(): void {
    this.readings.clear();
    this.locations = [];
    this.allLocations = [];
  }

  /**
   * Clean up all chunk files and storage directory
   * Called after successful upload
   */
  async cleanup(): Promise<void> {
    try {
      if (this.storageDir.exists) {
        this.storageDir.delete();
        console.log("[StreamBuffer] Cleaned up storage directory");
      }
    } catch (error) {
      console.error("[StreamBuffer] Failed to cleanup storage:", error);
      // Don't throw - cleanup failure shouldn't break the flow
    }
  }

  /**
   * Static method to clean up old/orphaned recording directories
   * Should be called on app startup
   */
  static async cleanupOrphanedRecordings(): Promise<void> {
    try {
      const cacheDir = new Directory(Paths.cache);
      const contents = cacheDir.list();
      const recordingDirs = contents.filter(
        (item) => item instanceof Directory && item.uri.includes("recording_"),
      );

      console.log(`[StreamBuffer] Found ${recordingDirs.length} recording directories to clean up`);

      for (const dir of recordingDirs) {
        try {
          (dir as Directory).delete();
        } catch (error) {
          console.warn(`[StreamBuffer] Failed to delete orphaned directory:`, error);
        }
      }

      console.log("[StreamBuffer] Orphaned recordings cleanup complete");
    } catch (error) {
      console.error("[StreamBuffer] Failed to cleanup orphaned recordings:", error);
      // Don't throw - cleanup failure shouldn't prevent app startup
    }
  }
}
