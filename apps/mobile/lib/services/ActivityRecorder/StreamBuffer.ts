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

import {
  AggregatedStream,
  PublicActivityMetric,
  PublicActivityMetricDataType,
} from "@repo/core";
import * as FileSystem from "expo-file-system";
import { LocationReading, SensorReading } from "./types";

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

// ================================
// StreamBuffer Class
// ================================

export class StreamBuffer {
  private readings: Map<PublicActivityMetric, Array<{ value: number; timestamp: number }>> = new Map();
  private locations: LocationReading[] = [];
  private chunkIndex = 0;
  private lastFlushTime: Date;
  private sessionId: string;
  private storageDir: string;

  constructor() {
    this.lastFlushTime = new Date();
    this.sessionId = `recording_${Date.now()}`;
    this.storageDir = `${FileSystem.cacheDirectory}${this.sessionId}/`;
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.storageDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.storageDir, {
          intermediates: true,
        });
      }
      console.log("[StreamBuffer] Initialized storage:", this.storageDir);
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

    this.readings.get(metric)!.push({
      value: reading.value,
      timestamp: reading.timestamp || Date.now(),
    });
  }

  /**
   * Add a location reading to the buffer
   */
  addLocation(location: LocationReading): void {
    this.locations.push({
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
    });
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

        await this.writeChunk(metric, chunk);
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

        await this.writeChunk("latlng", latlngChunk);

        // Write altitude separately if available
        const altitudes = this.locations.filter(
          (loc) => loc.altitude !== undefined
        );
        if (altitudes.length > 0) {
          const altitudeChunk: StreamChunk = {
            metric: "altitude",
            dataType: "float",
            values: altitudes.map((loc) => loc.altitude!),
            timestamps: altitudes.map((loc) => loc.timestamp),
            sampleCount: altitudes.length,
            startTime: this.lastFlushTime,
            endTime,
          };

          await this.writeChunk("altitude", altitudeChunk);
        }
      }

      console.log(
        `[StreamBuffer] Flushed chunk ${this.chunkIndex} (${this.readings.size} metrics, ${this.locations.length} locations) in ${Date.now() - flushStartTime}ms`
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
  private async writeChunk(
    metric: PublicActivityMetric,
    chunk: StreamChunk
  ): Promise<void> {
    const filename = `chunk_${this.chunkIndex}_${metric}.json`;
    const filepath = `${this.storageDir}${filename}`;

    try {
      await FileSystem.writeAsStringAsync(filepath, JSON.stringify(chunk));
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
      const files = await FileSystem.readDirectoryAsync(this.storageDir);
      const chunkFiles = files.filter((f) => f.startsWith("chunk_"));

      console.log(`[StreamBuffer] Found ${chunkFiles.length} chunk files`);

      // Group files by metric
      const filesByMetric = new Map<string, string[]>();
      for (const file of chunkFiles) {
        const metric = this.extractMetricFromFilename(file);
        if (!filesByMetric.has(metric)) {
          filesByMetric.set(metric, []);
        }
        filesByMetric.get(metric)!.push(file);
      }

      // Aggregate each metric
      const aggregated = new Map<string, AggregatedStream>();

      for (const [metric, files] of filesByMetric.entries()) {
        // Sort files by chunk index
        files.sort((a, b) => {
          const indexA = parseInt(a.split("_")[1]);
          const indexB = parseInt(b.split("_")[1]);
          return indexA - indexB;
        });

        const aggregatedStream = await this.aggregateMetricChunks(
          metric,
          files
        );
        aggregated.set(metric, aggregatedStream);
      }

      console.log(
        `[StreamBuffer] Aggregation complete in ${Date.now() - aggregateStartTime}ms (${aggregated.size} metrics)`
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
    filenames: string[]
  ): Promise<AggregatedStream> {
    const chunks: StreamChunk[] = [];

    // Read all chunk files
    for (const filename of filenames) {
      const filepath = `${this.storageDir}${filename}`;
      try {
        const content = await FileSystem.readAsStringAsync(filepath);
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
  private getDataTypeForMetric(
    metric: PublicActivityMetric
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

  /**
   * Get current buffer status
   */
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
      storageDir: this.storageDir,
    };
  }

  /**
   * Clear all accumulated data without writing
   */
  clear(): void {
    this.readings.clear();
    this.locations = [];
  }

  /**
   * Clean up all chunk files and storage directory
   * Called after successful upload
   */
  async cleanup(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.storageDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.storageDir, { idempotent: true });
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
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;

      const files = await FileSystem.readDirectoryAsync(cacheDir);
      const recordingDirs = files.filter((f) => f.startsWith("recording_"));

      console.log(
        `[StreamBuffer] Found ${recordingDirs.length} recording directories to clean up`
      );

      for (const dir of recordingDirs) {
        const dirPath = `${cacheDir}${dir}/`;
        try {
          await FileSystem.deleteAsync(dirPath, { idempotent: true });
        } catch (error) {
          console.warn(
            `[StreamBuffer] Failed to delete orphaned directory ${dir}:`,
            error
          );
        }
      }

      console.log("[StreamBuffer] Orphaned recordings cleanup complete");
    } catch (error) {
      console.error("[StreamBuffer] Failed to cleanup orphaned recordings:", error);
      // Don't throw - cleanup failure shouldn't prevent app startup
    }
  }
}
