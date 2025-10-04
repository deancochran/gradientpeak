import { localdb } from "@/lib/db";
import {
  InsertRecordingStream,
  activityRecordingStreams,
} from "@/lib/db/schemas";
import { PublicActivityMetric, PublicActivityMetricDataType } from "@repo/core";
import { SensorReading } from "./sensors";

const CHUNKINTERVALMS = 5000;
const MAXBUFFER = 1000;

export class ChunkProcessor {
  private recordingId: string;
  private sensorDataBuffer: Record<string, SensorReading[]> = {};
  private chunkIndex = 0;
  private lastCheckpointAt?: Date;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(recordingId: string) {
    this.recordingId = recordingId;
  }

  public start() {
    if (this.timer) return;
    this.lastCheckpointAt = new Date();
    this.timer = setInterval(
      () => this.processChunk().catch(console.error),
      CHUNKINTERVALMS,
    );
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public addReading(reading: SensorReading) {
    if (!this.sensorDataBuffer[reading.metric]) {
      this.sensorDataBuffer[reading.metric] = [];
    }

    this.sensorDataBuffer[reading.metric].push(reading);

    if (this.sensorDataBuffer[reading.metric].length >= MAXBUFFER) {
      this.processChunk().catch(console.error);
    }
  }

  public getBufferStatus(): Record<string, number> {
    const status: Record<string, number> = {};
    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      status[metric] = buffer.length;
    }
    return status;
  }

  private async processChunk(): Promise<void> {
    if (!this.lastCheckpointAt) return;
    const endTime = new Date();

    const streamsToInsert: InsertRecordingStream[] = [];

    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      if (buffer.length === 0) continue;

      const data = buffer.map((r) => r.value);
      const timestamps = buffer.map((r) => r.timestamp);

      streamsToInsert.push({
        activityRecordingId: this.recordingId,
        metric: metric as PublicActivityMetric,
        dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
        chunkIndex: this.chunkIndex,
        startTime: this.lastCheckpointAt,
        endTime,
        data: JSON.stringify(data),
        timestamps: JSON.stringify(timestamps),
        sampleCount: buffer.length,
      });

      buffer.length = 0;
    }

    if (streamsToInsert.length > 0) {
      await localdb.insert(activityRecordingStreams).values(streamsToInsert);
    }

    this.lastCheckpointAt = endTime;
    this.chunkIndex++;
  }

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

  public async flush() {
    await this.processChunk();
  }
}
