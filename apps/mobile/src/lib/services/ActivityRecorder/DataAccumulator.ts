/**
 * DataAccumulator - Simple Data Accumulation for Periodic Persistence
 *
 * Replaces the complex ChunkProcessor with a simple accumulator that:
 * - Collects sensor readings and location data as they arrive
 * - Writes everything to the database every 60 seconds
 * - No timers, no complex chunking logic
 * - Writes happen predictably during cleanup cycles
 */

import { localdb } from "@/lib/db";
import {
  InsertRecordingStream,
  activityRecordingStreams,
} from "@/lib/db/schemas";
import { PublicActivityMetric, PublicActivityMetricDataType } from "@repo/core";

export interface SensorReading {
  metric: PublicActivityMetric;
  value: number;
  timestamp: number;
  metadata?: {
    deviceId?: string;
    accuracy?: number;
    source?: string;
  };
}

export interface LocationReading {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
}

export class DataAccumulator {
  private readings: SensorReading[] = [];
  private locations: LocationReading[] = [];
  private chunkIndex = 0;
  private lastFlushTime: Date;

  constructor() {
    this.lastFlushTime = new Date();
  }

  /**
   * Add a sensor reading to the accumulator
   */
  add(reading: SensorReading): void {
    this.readings.push(reading);
  }

  /**
   * Add a location reading to the accumulator
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
   * Flush accumulated data to the database
   * Called every 60 seconds by LiveMetricsManager
   */
  async flushToDatabase(recordingId: string): Promise<void> {
    if (this.readings.length === 0 && this.locations.length === 0) {
      return;
    }

    const flushStartTime = Date.now();
    const endTime = new Date();
    const streamsToInsert: InsertRecordingStream[] = [];

    try {
      // Group sensor readings by metric
      const readingsByMetric = this.groupReadingsByMetric();

      // Create stream entries for each metric
      for (const [metric, readings] of Object.entries(readingsByMetric)) {
        if (readings.length === 0) continue;

        const data = readings.map((r) => r.value);
        const timestamps = readings.map((r) => r.timestamp);

        streamsToInsert.push({
          activityRecordingId: recordingId,
          metric: metric as PublicActivityMetric,
          dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
          chunkIndex: this.chunkIndex,
          startTime: this.lastFlushTime,
          endTime,
          data: JSON.stringify(data),
          timestamps: JSON.stringify(timestamps),
          sampleCount: readings.length,
        });
      }

      // Handle location data if present
      if (this.locations.length > 0) {
        const latlngData = this.locations.map((loc) => [
          loc.latitude,
          loc.longitude,
        ]);
        const timestamps = this.locations.map((loc) => loc.timestamp);
        const altitudes = this.locations
          .filter((loc) => loc.altitude !== undefined)
          .map((loc) => loc.altitude!);

        // Store lat/lng pairs
        streamsToInsert.push({
          activityRecordingId: recordingId,
          metric: "latlng" as PublicActivityMetric,
          dataType: "latlng",
          chunkIndex: this.chunkIndex,
          startTime: this.lastFlushTime,
          endTime,
          data: JSON.stringify(latlngData),
          timestamps: JSON.stringify(timestamps),
          sampleCount: this.locations.length,
        });

        // Store altitudes separately if available
        if (altitudes.length > 0) {
          streamsToInsert.push({
            activityRecordingId: recordingId,
            metric: "altitude" as PublicActivityMetric,
            dataType: "float",
            chunkIndex: this.chunkIndex,
            startTime: this.lastFlushTime,
            endTime,
            data: JSON.stringify(altitudes),
            timestamps: JSON.stringify(
              this.locations
                .filter((loc) => loc.altitude !== undefined)
                .map((loc) => loc.timestamp)
            ),
            sampleCount: altitudes.length,
          });
        }
      }

      // Write to database in a single batch
      if (streamsToInsert.length > 0) {
        await localdb.insert(activityRecordingStreams).values(streamsToInsert);

        console.log(
          `[DataAccumulator] Flushed ${this.readings.length} readings and ${this.locations.length} locations in ${Date.now() - flushStartTime}ms`
        );
      }

      // Clear accumulated data after successful write
      this.readings = [];
      this.locations = [];
      this.lastFlushTime = endTime;
      this.chunkIndex++;
    } catch (error) {
      console.error("[DataAccumulator] Failed to flush data:", error);
      // Don't clear data on error - will retry on next flush
      throw error;
    }
  }

  /**
   * Group readings by metric type
   */
  private groupReadingsByMetric(): Record<string, SensorReading[]> {
    const grouped: Record<string, SensorReading[]> = {};

    for (const reading of this.readings) {
      if (!grouped[reading.metric]) {
        grouped[reading.metric] = [];
      }
      grouped[reading.metric].push(reading);
    }

    return grouped;
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
  } {
    const readingSize = this.readings.length * 48; // Rough estimate: 48 bytes per reading
    const locationSize = this.locations.length * 40; // Rough estimate: 40 bytes per location
    const totalBytes = readingSize + locationSize;

    return {
      readingCount: this.readings.length,
      locationCount: this.locations.length,
      chunkIndex: this.chunkIndex,
      lastFlushTime: this.lastFlushTime,
      memoryEstimateMB: totalBytes / (1024 * 1024),
    };
  }

  /**
   * Clear all accumulated data without writing
   */
  clear(): void {
    this.readings = [];
    this.locations = [];
  }
}
