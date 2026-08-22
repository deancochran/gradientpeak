/**
 * StreamBuffer - File-based Stream Storage for Activity Recording
 *
 * Replaces SQLite/DataAccumulator with FileSystem-based storage:
 * - Accumulates numeric sensor readings in memory
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
import type { SensorReading } from "./types";

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
  fitRecords: Array<{
    timestamp: number;
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
    distance?: number;
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
    return { streamBuffer, replay };
  }

  static deleteDurableDirectories(paths: readonly string[]): void {
    for (const path of new Set(paths)) {
      const directory = new Directory(path);
      if (directory.exists) directory.delete();
    }
  }

  private static buildReplay(chunks: StreamChunk[]): DurableStreamReplay {
    const sensorReadings: SensorReading[] = [];
    const fitByTimestamp = new Map<number, DurableStreamReplay["fitRecords"][number]>();
    for (const chunk of chunks) {
      if (chunk.metric === "latlng" || chunk.dataType === "latlng") {
        throw new Error("coordinate-stream-recovery-forbidden");
      }
      chunk.timestamps.forEach((timestamp, index) => {
        const value = chunk.values[index];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(`Corrupt numeric stream value for ${chunk.metric}`);
        }
        sensorReadings.push({
          metric: chunk.metric,
          dataType: chunk.dataType,
          value,
          timestamp,
        } as SensorReading);
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
    if (
      reading.metric === ("latlng" as SensorReading["metric"]) ||
      reading.dataType === ("latlng" as SensorReading["dataType"]) ||
      typeof reading.value !== "number"
    ) {
      throw new Error("coordinate-stream-ingestion-forbidden");
    }

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
   * Flush accumulated data to FileSystem
   * Called every 60 seconds by LiveMetricsManager
   */
  async flushToFiles(): Promise<void> {
    if (this.readings.size === 0) {
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

      await this.journal.append(envelopes);

      console.log(
        `[StreamBuffer] Flushed chunk ${this.chunkIndex} (${this.readings.size} metrics) in ${Date.now() - flushStartTime}ms`,
      );

      // Clear memory after successful write
      this.readings.clear();
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
          envelope.streamKind === "latlng" ||
          chunk.metric === "latlng" ||
          chunk.dataType === "latlng" ||
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
          ...(finite.length === 0
            ? {}
            : {
                minValue: Math.min(...finite),
                maxValue: Math.max(...finite),
                avgValue: finite.reduce((sum, value) => sum + value, 0) / finite.length,
              }),
        });
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
    return this.readings.size > 0;
  }

  getBufferStatus(): {
    readingCount: number;
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
    const totalBytes = readingSize;

    return {
      readingCount: totalReadings,
      chunkIndex: this.chunkIndex,
      lastFlushTime: this.lastFlushTime,
      memoryEstimateMB: totalBytes / (1024 * 1024),
      storageDir: this.storageDir.uri,
    };
  }

  /**
   * Clear all accumulated data without writing
   */
  clear(): void {
    this.readings.clear();
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
