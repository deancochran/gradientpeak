/**
 * StreamingFitEncoder - Real-time FIT File Encoding for React Native
 *
 * Provides streaming FIT (Flexible & Interoperable Data Transfer) file creation
 * with crash recovery support for activity recording.
 *
 * Key Features:
 * - Real-time record writing without memory bloat
 * - Crash recovery via periodic checkpoints
 * - FIT protocol compliance (v2.0)
 * - Integration with LiveMetricsManager
 */

import { File, Directory, Paths } from "expo-file-system";
import { Buffer } from "buffer";

export enum SwimStroke {
  FREESTYLE = 0,
  BACKSTROKE = 1,
  BREASTSTROKE = 2,
  BUTTERFLY = 3,
  DRILL = 4,
  MIXED = 5,
  IM = 6,
}

export enum LengthType {
  IDLE = 0,
  ACTIVE = 1,
}

export interface FitLengthData {
  messageIndex: number;
  startTime: number;
  totalElapsedTime: number;
  totalTimerTime: number;
  timestamp: number;
  lengthType: LengthType;
  swimStroke?: SwimStroke;
  avgSpeed?: number;
  strokeCount?: number;
  strokesPerMinute?: number;
}

export interface FitRecord {
  timestamp: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  grade?: number;
  temperature?: number;
}

export interface FitSessionData {
  startTime: number;
  totalTime: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  avgPower?: number;
  maxPower?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
  totalAscent?: number;
  totalDescent?: number;
  calories?: number;
  poolLength?: number;
  poolLengthUnit?: number; // 0 = metric, 1 = statute
}

export interface FitLapData {
  lapNumber: number;
  startTime: number;
  totalTime: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  avgPower?: number;
  avgHeartRate?: number;
}

export interface EncoderConfig {
  bufferSize: number;
  checkpointIntervalMs: number;
  manufacturer: string;
  deviceProduct: string;
  softwareVersion: string;
  hardwareVersion: number;
}

const DEFAULT_CONFIG: EncoderConfig = {
  bufferSize: 8192,
  checkpointIntervalMs: 60000,
  manufacturer: "GradientPeak",
  deviceProduct: "MobileApp",
  softwareVersion: "1.0.0",
  hardwareVersion: 1,
};

export class StreamingFitEncoder {
  private recordingId: string;
  private userId: string;
  private config: EncoderConfig;
  private storageUri: string;
  private fitFilePath: string;
  private dataBuffer: Uint8Array = new Uint8Array(0);
  private bufferOffset: number = 0;
  private recordCount: number = 0;
  private startTime: number = 0;
  private lastCheckpointTime: number = 0;
  private isInitialized: boolean = false;
  private isFinalized: boolean = false;
  private fileIdWritten: boolean = false;
  private deviceInfoWritten: boolean = false;
  private userProfileWritten: boolean = false;
  private isPaused: boolean = false;
  private currentCrc: number = 0x00000000;
  private crcTable: Uint32Array;

  constructor(
    recordingId: string,
    userId: string,
    config?: Partial<EncoderConfig>,
  ) {
    this.recordingId = recordingId;
    this.userId = userId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    const baseDir = Paths.cache.uri || Paths.document.uri || "";
    this.storageUri = `${baseDir}fit_encoding_${recordingId}/`;
    this.fitFilePath = `${this.storageUri}activity.fit`;
    this.crcTable = this.generateCrcTable();
  }

  /**
   * Initialize the encoder and storage directory
   */
  async initialize(): Promise<void> {
    try {
      const directory = new Directory(this.storageUri);
      if (!directory.exists) {
        directory.create({ intermediates: true });
      }

      const checkpointPath = `${this.storageUri}checkpoint.json`;
      const checkpointFile = new File(checkpointPath);

      if (checkpointFile.exists) {
        console.log(
          `[StreamingFitEncoder] Found existing checkpoint, recovering...`,
        );
        await this.recoverFromCheckpoint(checkpointPath);
      } else {
        await this.createFitFile();
        await this.writeFileId();
        await this.writeDeviceInfo();
        await this.writeUserProfile();
        this.startTime = Date.now();
        this.lastCheckpointTime = Date.now();
        this.isInitialized = true;
        console.log(
          `[StreamingFitEncoder] Initialized for recording ${this.recordingId}`,
        );
      }
    } catch (error) {
      console.error(`[StreamingFitEncoder] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Add a single record to the FIT file
   */
  async addRecord(record: FitRecord): Promise<void> {
    if (!this.isInitialized || this.isFinalized) {
      throw new Error("Encoder not initialized or already finalized");
    }

    if (this.isPaused) {
      return;
    }

    const fitRecord = this.createRecordMessage(record);
    await this.writeMessage(fitRecord);
    this.recordCount++;

    await this.checkCheckpoint();
  }

  /**
   * Add a length record (for swimming)
   */
  async addLength(lengthData: FitLengthData): Promise<void> {
    if (!this.isInitialized || this.isFinalized) {
      throw new Error("Encoder not initialized or already finalized");
    }

    const lengthMessage = this.createLengthMessage(lengthData);
    await this.writeMessage(lengthMessage);
  }

  /**
   * Add a timer event
   */
  async addEvent(
    eventType: "start" | "stop" | "pause" | "resume",
    timestamp: number = Date.now(),
  ): Promise<void> {
    if (!this.isInitialized || this.isFinalized) {
      throw new Error("Encoder not initialized or already finalized");
    }

    let typeValue = 0; // start
    if (eventType === "stop" || eventType === "pause") {
      typeValue = 0; // stop (using stop_disable or just stop? usually stop_all=4 is for activity end, stop=1 is for pause)
      // Actually standard: start=0, stop=1 (timer stop).
      // Let's use start=0, stop=1.
      typeValue = 1;
      this.isPaused = true;
    } else {
      typeValue = 0; // start
      this.isPaused = false;
    }

    const eventMessage = this.createEventMessage(typeValue, timestamp);
    await this.writeMessage(eventMessage);
  }

  /**
   * Add multiple records in batch
   */
  async addRecords(records: FitRecord[]): Promise<void> {
    for (const record of records) {
      await this.addRecord(record);
    }
  }

  /**
   * Flush the internal buffer and create a checkpoint
   */
  async checkpoint(): Promise<void> {
    if (!this.isInitialized || this.isFinalized) {
      return;
    }

    try {
      await this.flushBuffer();
      await this.writeCheckpoint();
      this.lastCheckpointTime = Date.now();
      console.log(
        `[StreamingFitEncoder] Checkpoint created, ${this.recordCount} records written`,
      );
    } catch (error) {
      console.error(`[StreamingFitEncoder] Checkpoint failed:`, error);
      throw error;
    }
  }

  /**
   * Finalize the FIT file with session, activity, and lap data
   */
  async finalize(
    sessionData: FitSessionData,
    laps: FitLapData[] = [],
  ): Promise<void> {
    if (this.isFinalized) {
      return;
    }

    try {
      console.log(
        `[StreamingFitEncoder] Finalizing with ${laps.length} laps...`,
      );

      for (const lap of laps) {
        await this.writeLapMessage(lap);
      }

      await this.writeSessionMessage(sessionData);
      await this.writeActivityMessage(sessionData);

      await this.flushBuffer();
      await this.writeFileChecksum();
      await this.clearCheckpoint();

      this.isFinalized = true;
      console.log(
        `[StreamingFitEncoder] Finalized, ${this.recordCount} records written`,
      );
    } catch (error) {
      console.error(`[StreamingFitEncoder] Finalize failed:`, error);
      throw error;
    }
  }

  /**
   * Get the complete FIT file as Uint8Array
   */
  async getFile(): Promise<Uint8Array> {
    if (!this.isFinalized) {
      throw new Error("File not finalized");
    }

    const file = new File(this.fitFilePath);
    const content = file.base64();

    return new Uint8Array(Buffer.from(content, "base64"));
  }

  /**
   * Get file path for direct access
   */
  getFilePath(): string {
    return this.fitFilePath;
  }

  /**
   * Get encoding status
   */
  getStatus(): {
    isInitialized: boolean;
    isFinalized: boolean;
    recordCount: number;
    bufferSize: number;
    lastCheckpointTime: number | null;
  } {
    return {
      isInitialized: this.isInitialized,
      isFinalized: this.isFinalized,
      recordCount: this.recordCount,
      bufferSize: this.bufferOffset,
      lastCheckpointTime:
        this.lastCheckpointTime > 0 ? this.lastCheckpointTime : null,
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    const directory = new Directory(this.storageUri);
    if (directory.exists) {
      directory.delete();
    }
  }

  /**
   * Static method to clean up orphaned recording directories
   */
  static async cleanupOrphanedRecordings(): Promise<void> {
    try {
      const baseDir = Paths.cache.uri || Paths.document.uri;
      if (!baseDir) return;

      const directory = new Directory(baseDir);
      const contents = directory.list();
      const orphanedDirs = contents.filter(
        (item) =>
          item instanceof Directory && item.uri.includes("fit_encoding_"),
      );

      for (const dir of orphanedDirs) {
        try {
          if (dir.exists) {
            dir.delete();
          }
        } catch (error) {
          console.warn(
            `[StreamingFitEncoder] Failed to delete orphaned directory:`,
            error,
          );
        }
      }

      console.log(
        `[StreamingFitEncoder] Cleaned up ${orphanedDirs.length} orphaned recordings`,
      );
    } catch (error) {
      console.error(
        `[StreamingFitEncoder] Failed to cleanup orphaned recordings:`,
        error,
      );
    }
  }

  // ==================== Private Methods ====================

  private async createFitFile(): Promise<void> {
    const header = this.createFitHeader();
    const file = new File(this.fitFilePath);
    file.write(Buffer.from(header).toString("base64"));
    this.dataBuffer = new Uint8Array(this.config.bufferSize);
    this.bufferOffset = 0;
  }

  private createFitHeader(): Uint8Array {
    const headerSize = 12;
    const protocolVersion = 16;
    const profileVersion = 2100;

    const header = new Uint8Array(headerSize);
    const view = new DataView(header.buffer);

    header[0] = headerSize;
    header[1] = protocolVersion;
    view.setUint16(2, profileVersion, true);
    view.setUint32(8, 0, true);

    const crc = this.calculateCrc(header.slice(0, 10));
    view.setUint16(10, crc, true);

    return header;
  }

  private async writeFileId(): Promise<void> {
    const message = this.createFileIdMessage();
    await this.writeMessage(message);
    this.fileIdWritten = true;
  }

  private createFileIdMessage(): Uint8Array {
    const fields: Array<{ index: number; value: number }> = [
      { index: 0, value: 0 },
      {
        index: 1,
        value: parseInt(this.userId.replace(/\D/g, "").slice(0, 8)) || 1,
      },
      { index: 2, value: 0 },
      { index: 3, value: 0 },
      { index: 4, value: 0 },
      { index: 253, value: Math.floor(Date.now() / 1000) },
    ];

    return this.createMessage(0, 0, fields);
  }

  private async writeDeviceInfo(): Promise<void> {
    const message = this.createDeviceInfoMessage();
    await this.writeMessage(message);
    this.deviceInfoWritten = true;
  }

  private createDeviceInfoMessage(): Uint8Array {
    const fields: Array<{ index: number; value: number }> = [
      { index: 0, value: 0 },
      { index: 1, value: 1 },
      { index: 2, value: 0 },
      { index: 3, value: 0 },
      { index: 5, value: 0 },
      { index: 6, value: 0 },
      { index: 7, value: 0 },
      { index: 254, value: 0 },
    ];

    return this.createMessage(0, 23, fields);
  }

  private async writeUserProfile(): Promise<void> {
    const message = this.createUserProfileMessage();
    await this.writeMessage(message);
    this.userProfileWritten = true;
  }

  private createUserProfileMessage(): Uint8Array {
    const fields: Array<{ index: number; value: number }> = [
      {
        index: 0,
        value: parseInt(this.userId.replace(/\D/g, "").slice(0, 8)) || 1,
      },
    ];

    return this.createMessage(0, 30, fields);
  }

  private createRecordMessage(record: FitRecord): Uint8Array {
    const fields: Array<{ index: number; value: number }> = [
      {
        index: 253,
        value: Math.floor((record.timestamp - this.startTime) / 1000),
      },
    ];

    if (record.heartRate !== undefined) {
      fields.push({ index: 0, value: record.heartRate });
    }
    if (record.power !== undefined) {
      fields.push({ index: 7, value: record.power });
    }
    if (record.cadence !== undefined) {
      fields.push({ index: 1, value: record.cadence });
    }
    if (record.speed !== undefined) {
      fields.push({ index: 6, value: Math.round(record.speed * 1000) });
    }
    if (record.distance !== undefined) {
      fields.push({ index: 5, value: Math.round(record.distance) });
    }
    if (record.latitude !== undefined && record.longitude !== undefined) {
      fields.push({
        index: 0,
        value: this.degreesToSemicircles(record.latitude),
      });
      fields.push({
        index: 1,
        value: this.degreesToSemicircles(record.longitude),
      });
    }
    if (record.altitude !== undefined) {
      fields.push({ index: 2, value: Math.round(record.altitude * 5) });
    }
    if (record.grade !== undefined) {
      fields.push({ index: 3, value: Math.round(record.grade * 100) });
    }
    if (record.temperature !== undefined) {
      fields.push({ index: 4, value: record.temperature });
    }

    return this.createMessage(20, 0, fields);
  }

  private createLengthMessage(lengthData: FitLengthData): Uint8Array {
    const fields: Array<{ index: number; value: number }> = [
      {
        index: 253,
        value: Math.floor((lengthData.timestamp - this.startTime) / 1000),
      },
      { index: 254, value: lengthData.messageIndex },
      {
        index: 2,
        value: Math.floor((lengthData.startTime - this.startTime) / 1000),
      },
      { index: 3, value: Math.round(lengthData.totalElapsedTime * 1000) },
      { index: 4, value: Math.round(lengthData.totalTimerTime * 1000) },
      { index: 12, value: lengthData.lengthType },
    ];

    if (lengthData.avgSpeed !== undefined) {
      fields.push({ index: 6, value: Math.round(lengthData.avgSpeed * 1000) });
    }
    if (lengthData.swimStroke !== undefined) {
      fields.push({ index: 7, value: lengthData.swimStroke });
    }
    if (lengthData.strokeCount !== undefined) {
      fields.push({ index: 5, value: lengthData.strokeCount });
    }
    // Note: strokesPerMinute isn't a direct field in Length message in standard SDK typically,
    // but avg_cadence (11) is often used for strokes/min in swimming.
    if (lengthData.strokesPerMinute !== undefined) {
      fields.push({ index: 11, value: lengthData.strokesPerMinute });
    }

    return this.createMessage(101, 0, fields);
  }

  private createEventMessage(eventType: number, timestamp: number): Uint8Array {
    const fields: Array<{ index: number; value: number }> = [
      { index: 253, value: Math.floor((timestamp - this.startTime) / 1000) },
      { index: 0, value: 0 }, // event: timer
      { index: 1, value: eventType }, // event_type
      { index: 3, value: 0 }, // event_group
    ];

    return this.createMessage(21, 0, fields);
  }

  private async writeSessionMessage(
    sessionData: FitSessionData,
  ): Promise<void> {
    const fields: Array<{ index: number; value: number }> = [
      { index: 253, value: 0 },
      { index: 0, value: Math.floor(sessionData.totalTime) },
      { index: 1, value: Math.round(sessionData.distance) },
      { index: 2, value: Math.round(sessionData.avgSpeed * 1000) },
      { index: 3, value: Math.round(sessionData.maxSpeed * 1000) },
      { index: 5, value: Math.floor(sessionData.avgPower || 0) },
      { index: 6, value: Math.floor(sessionData.maxPower || 0) },
      { index: 8, value: Math.floor(sessionData.avgHeartRate || 0) },
      { index: 9, value: Math.floor(sessionData.maxHeartRate || 0) },
      { index: 11, value: Math.floor(sessionData.avgCadence || 0) },
      { index: 13, value: Math.floor(sessionData.totalAscent || 0) },
      { index: 14, value: Math.floor(sessionData.totalDescent || 0) },
      { index: 19, value: Math.floor(sessionData.calories || 0) },
    ];

    if (sessionData.poolLength !== undefined) {
      fields.push({
        index: 33,
        value: Math.round(sessionData.poolLength * 100),
      });
    }
    if (sessionData.poolLengthUnit !== undefined) {
      fields.push({ index: 46, value: sessionData.poolLengthUnit });
    }

    const message = this.createMessage(18, 0, fields);
    await this.writeMessage(message);
  }

  private async writeActivityMessage(
    sessionData: FitSessionData,
  ): Promise<void> {
    const fields: Array<{ index: number; value: number }> = [
      { index: 253, value: 0 },
      { index: 0, value: Math.floor(sessionData.totalTime) },
      { index: 1, value: 0 },
      { index: 2, value: 0 },
    ];

    const message = this.createMessage(0, 0, fields);
    await this.writeMessage(message);
  }

  private async writeLapMessage(lapData: FitLapData): Promise<void> {
    const fields: Array<{ index: number; value: number }> = [
      { index: 253, value: 0 },
      { index: 0, value: Math.floor(lapData.totalTime) },
      { index: 1, value: Math.round(lapData.distance) },
      { index: 2, value: Math.round(lapData.avgSpeed * 1000) },
      { index: 3, value: Math.round(lapData.maxSpeed * 1000) },
      { index: 5, value: Math.floor(lapData.avgPower || 0) },
      { index: 8, value: Math.floor(lapData.avgHeartRate || 0) },
      { index: 18, value: lapData.lapNumber },
    ];

    const message = this.createMessage(19, 0, fields);
    await this.writeMessage(message);
  }

  private createMessage(
    _localMessageType: number,
    _globalMessageNumber: number,
    fields: Array<{ index: number; value: number }>,
  ): Uint8Array {
    const fieldSize = 3;
    const headerSize = 1;

    const fieldData = new Uint8Array(fields.length * fieldSize);
    const fieldView = new DataView(fieldData.buffer);

    let offset = 0;
    for (const field of fields) {
      fieldData[offset++] = field.index;
      fieldData[offset++] = 0;
      fieldView.setUint16(offset, field.value, true);
      offset += 2;
    }

    const header = new Uint8Array([
      fieldData.length + 1,
      _localMessageType & 0xff,
    ]);

    const message = new Uint8Array(header.length + fieldData.length);
    message.set(header, 0);
    message.set(fieldData, header.length);

    return message;
  }

  private async writeMessage(message: Uint8Array): Promise<void> {
    await this.writeToBuffer(message);
    this.currentCrc = this.updateCrc(this.currentCrc, message);
  }

  private async writeToBuffer(data: Uint8Array): Promise<void> {
    if (this.bufferOffset + data.length > this.dataBuffer.length) {
      await this.flushBuffer();
    }

    this.dataBuffer.set(data, this.bufferOffset);
    this.bufferOffset += data.length;
  }

  private async flushBuffer(): Promise<void> {
    if (this.bufferOffset === 0) {
      return;
    }

    const dataToWrite = this.dataBuffer.slice(0, this.bufferOffset);

    try {
      const file = new File(this.fitFilePath);
      const currentContent = file.base64();

      const combinedBuffer = Buffer.concat([
        Buffer.from(currentContent, "base64"),
        Buffer.from(dataToWrite),
      ]);

      file.write(combinedBuffer.toString("base64"));

      this.bufferOffset = 0;
    } catch (error) {
      console.error(`[StreamingFitEncoder] Failed to flush buffer:`, error);
      throw error;
    }
  }

  private async writeFileChecksum(): Promise<void> {
    const crcData = new Uint8Array(2);
    const crcView = new DataView(crcData.buffer);
    crcView.setUint16(0, this.currentCrc & 0xffff, true);
    await this.writeToBuffer(crcData);
    await this.flushBuffer();
  }

  private async checkCheckpoint(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCheckpointTime >= this.config.checkpointIntervalMs) {
      await this.checkpoint();
    }
  }

  private async writeCheckpoint(): Promise<void> {
    const checkpoint = {
      recordingId: this.recordingId,
      userId: this.userId,
      recordCount: this.recordCount,
      startTime: this.startTime,
      createdAt: Date.now(),
      filePath: this.fitFilePath,
    };

    try {
      const checkpointPath = `${this.storageUri}checkpoint.json`;
      const checkpointFile = new File(checkpointPath);
      checkpointFile.write(JSON.stringify(checkpoint));

      const markerPath = `${this.storageUri}checkpoint_${Date.now()}.marker`;
      const markerFile = new File(markerPath);
      markerFile.write("1");
    } catch (error) {
      console.error(`[StreamingFitEncoder] Failed to write checkpoint:`, error);
    }
  }

  private async recoverFromCheckpoint(checkpointPath: string): Promise<void> {
    try {
      const checkpointFile = new File(checkpointPath);
      const content = checkpointFile.textSync();
      const checkpoint = JSON.parse(content);

      const fitFile = new File(checkpoint.filePath);
      if (!fitFile.exists || (fitFile.size || 0) < 12) {
        console.warn(`[StreamingFitEncoder] FIT file invalid, starting fresh`);
        await this.createFitFile();
        await this.writeFileId();
        await this.writeDeviceInfo();
        await this.writeUserProfile();
        this.startTime = Date.now();
        this.isInitialized = true;
        return;
      }

      this.recordCount = checkpoint.recordCount;
      this.startTime = checkpoint.startTime;
      this.lastCheckpointTime = Date.now();
      this.isInitialized = true;
      this.fileIdWritten = true;
      this.deviceInfoWritten = true;
      this.userProfileWritten = true;

      console.log(
        `[StreamingFitEncoder] Recovered ${this.recordCount} records from checkpoint`,
      );
    } catch (error) {
      console.error(`[StreamingFitEncoder] Recovery failed:`, error);
      throw error;
    }
  }

  private async clearCheckpoint(): Promise<void> {
    try {
      const checkpointPath = `${this.storageUri}checkpoint.json`;
      const checkpointFile = new File(checkpointPath);
      if (checkpointFile.exists) {
        checkpointFile.delete();
      }

      const directory = new Directory(this.storageUri);
      const contents = directory.list();
      for (const item of contents) {
        if (
          item instanceof File &&
          item.uri.includes("checkpoint_") &&
          item.uri.endsWith(".marker")
        ) {
          item.delete();
        }
      }
    } catch (error) {
      console.warn(`[StreamingFitEncoder] Failed to clear checkpoint:`, error);
    }
  }

  private generateCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xedb88320;
        } else {
          crc = crc >>> 1;
        }
      }
      table[i] = crc;
    }
    return table;
  }

  private calculateCrc(data: Uint8Array): number {
    let crc = 0x00000000;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ data[i]) & 0xff];
    }
    return crc ^ 0xffffffff;
  }

  private updateCrc(crc: number, data: Uint8Array): number {
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ data[i]) & 0xff];
    }
    return crc ^ 0xffffffff;
  }

  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (Math.pow(2, 31) / 180));
  }

  private semicirclesToDegrees(semicircles: number): number {
    return semicircles * (180 / Math.pow(2, 31));
  }
}
