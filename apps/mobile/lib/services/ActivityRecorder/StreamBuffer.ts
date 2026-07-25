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
import { Directory, Paths } from "expo-file-system";
import type { RecordingStreamJournalAdapter } from "./recordingEvidenceJournal";
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

  private journal: RecordingStreamJournalAdapter;

  constructor(
    storageDirUri?: string,
    journal: RecordingStreamJournalAdapter = {
      append: async () => {
        throw new Error("Recording stream is not bound to an evidence session");
      },
      recover: async () => {
        throw new Error("Recording stream is not bound to an evidence session");
      },
    },
  ) {
    this.lastFlushTime = new Date();
    this.sessionId = `recording_${Date.now()}`;
    this.storageDir = storageDirUri
      ? new Directory(storageDirUri)
      : new Directory(Paths.document ?? Paths.cache, this.sessionId);
    this.journal = journal;
  }

  /** Opens validated durable chunks and prepares the same directory for append-only continuation. */
  static async reopenForRecovery(
    storageDirUris: string | readonly string[],
    journal: RecordingStreamJournalAdapter,
  ): Promise<{
    streamBuffer: StreamBuffer;
    replay: DurableStreamReplay;
  }> {
    const paths = typeof storageDirUris === "string" ? [storageDirUris] : [...storageDirUris];
    const appendPath = paths.at(-1);
    if (!appendPath) throw new Error("Recording checkpoint has no stream directory");
    const streamBuffer = new StreamBuffer(appendPath, journal);
    const chunks = (await journal.recover()).map((envelope) => {
      const raw = JSON.parse(envelope.payload) as StreamChunk;
      if (
        !raw ||
        raw.sampleCount !== raw.values?.length ||
        raw.values.length !== raw.timestamps?.length
      ) {
        throw new Error("Corrupt SQLite recording stream chunk");
      }
      return {
        chunkIndex: envelope.order,
        chunk: { ...raw, startTime: new Date(raw.startTime), endTime: new Date(raw.endTime) },
      };
    });
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

  /** Deterministic foreground/headless GPS union used before FIT replay/finalization. */
  static mergeRecoveredLocations(
    replay: DurableStreamReplay,
    headless: readonly LocationReading[],
  ): DurableStreamReplay {
    const identity = (location: LocationReading) =>
      `${location.timestamp}:${location.latitude.toFixed(7)}:${location.longitude.toFixed(7)}`;
    const locations = new Map(replay.locations.map((location) => [identity(location), location]));
    for (const location of headless) locations.set(identity(location), location);
    const ordered = [...locations.values()].sort(
      (left, right) =>
        left.timestamp - right.timestamp || identity(left).localeCompare(identity(right)),
    );
    const fitByTimestamp = new Map(replay.fitRecords.map((record) => [record.timestamp, record]));
    for (const location of ordered) {
      fitByTimestamp.set(location.timestamp, {
        ...(fitByTimestamp.get(location.timestamp) ?? { timestamp: location.timestamp }),
        latitude: location.latitude,
        longitude: location.longitude,
        ...(location.altitude === undefined ? {} : { altitude: location.altitude }),
      });
    }
    return {
      ...replay,
      locations: ordered,
      fitRecords: [...fitByTimestamp.values()].sort(
        (left, right) => left.timestamp - right.timestamp,
      ),
    };
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
    // The URI remains a compatibility/checkpoint identifier only. Raw streams are SQLite-only.
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
      const envelopes: Array<{ streamKind: string; timestamp: number; payload: string }> = [];
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

        envelopes.push({
          streamKind: metric,
          timestamp: endTime.getTime(),
          payload: JSON.stringify(chunk),
        });
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

        envelopes.push({
          streamKind: "latlng",
          timestamp: endTime.getTime(),
          payload: JSON.stringify(latlngChunk),
        });

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

          envelopes.push({
            streamKind: "altitude",
            timestamp: endTime.getTime(),
            payload: JSON.stringify(altitudeChunk),
          });
        }
      }

      await this.journal.append(envelopes);

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
   * Read and aggregate all chunks for final processing
   * Called when recording finishes
   */
  async aggregateAllChunks(): Promise<Map<string, AggregatedStream>> {
    const aggregateStartTime = Date.now();
    console.log("[StreamBuffer] Starting aggregation...");

    try {
      const chunksByMetric = new Map<string, StreamChunk[]>();
      for (const envelope of await this.journal.recover()) {
        const chunk = JSON.parse(envelope.payload) as StreamChunk;
        if (
          !chunk ||
          chunk.metric !== envelope.streamKind ||
          chunk.values.length !== chunk.timestamps.length
        ) {
          throw new Error("Corrupt SQLite recording stream chunk");
        }
        const metricChunks = chunksByMetric.get(chunk.metric) ?? [];
        metricChunks.push(chunk);
        chunksByMetric.set(chunk.metric, metricChunks);
      }

      // Aggregate each metric
      const aggregated = new Map<string, AggregatedStream>();

      for (const [metric, chunks] of chunksByMetric.entries()) {
        const firstChunk = chunks[0];
        if (!firstChunk) continue;
        const values: Array<number | number[]> = [];
        for (const chunk of chunks) values.push(...(chunk.values as Array<number | number[]>));
        const timestamps = chunks.flatMap((chunk) => chunk.timestamps);
        if (firstChunk.dataType === "latlng") {
          aggregated.set(metric, {
            metric: metric as PublicActivityMetric,
            dataType: firstChunk.dataType,
            values: values as number[][],
            timestamps,
            sampleCount: values.length,
            minValue: undefined,
            maxValue: undefined,
            avgValue: undefined,
          });
        } else {
          const numeric = values as number[];
          const finite = numeric.filter(
            (value): value is number => typeof value === "number" && Number.isFinite(value),
          );
          if (finite.length !== numeric.length)
            throw new Error(`Corrupt numeric stream value for ${metric}`);
          aggregated.set(metric, {
            metric: metric as PublicActivityMetric,
            dataType: firstChunk.dataType,
            values: numeric,
            timestamps,
            sampleCount: numeric.length,
            minValue: finite.length ? Math.min(...finite) : undefined,
            maxValue: finite.length ? Math.max(...finite) : undefined,
            avgValue: finite.length
              ? finite.reduce((sum, value) => sum + value, 0) / finite.length
              : undefined,
          });
        }
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
