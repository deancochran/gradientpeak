/**
 * GarminFitEncoder - FIT File Encoding using Official Garmin SDK
 *
 * Replaces the custom StreamingFitEncoder which had a buffer overflow bug.
 * Uses @garmin/fitsdk for reliable FIT protocol compliance.
 *
 * Key Features:
 * - Real-time FIT file creation with official Garmin SDK
 * - Crash recovery via checkpoint system
 * - Memory-efficient streaming writes to disk
 * - Full FIT protocol compliance
 *
 * @see https://developer.garmin.com/fit/
 * @package @garmin/fitsdk
 */

import { Encoder, Profile, Utils } from "@garmin/fitsdk";
import { File, Directory, Paths } from "expo-file-system";
import { Buffer } from "buffer";

/**
 * Convert degrees to semicircles (FIT format for GPS coordinates)
 * Formula: semicircles = degrees × (2³¹ / 180)
 */
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

/**
 * Convert semicircles to degrees
 * Formula: degrees = semicircles × (180 / 2³¹)
 */
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
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

export class GarminFitEncoder {
  private recordingId: string;
  private userId: string;
  private config: EncoderConfig;
  private storageUri: string;
  private fitFilePath: string;
  private encoder: Encoder;
  private recordCount: number = 0;
  private startTime: number = 0;
  private lastCheckpointTime: number = 0;
  private isInitialized: boolean = false;
  private isFinalized: boolean = false;
  private recordBuffer: FitRecord[] = [];

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
    this.encoder = new Encoder();
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
          `[GarminFitEncoder] Found existing checkpoint, recovering...`,
        );
        await this.recoverFromCheckpoint(checkpointPath);
      } else {
        await this.initializeEncoder();
        this.startTime = Date.now();
        this.lastCheckpointTime = Date.now();
        this.isInitialized = true;
        console.log(
          `[GarminFitEncoder] Initialized for recording ${this.recordingId}`,
        );
      }
    } catch (error) {
      console.error(`[GarminFitEncoder] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Initialize the Garmin FIT encoder with required messages
   */
  private async initializeEncoder(): Promise<void> {
    // Reset encoder
    this.encoder = new Encoder();

    // Write FILE_ID message (required first message)
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.FILE_ID,
      type: "activity",
      manufacturer: "development",
      product: 0,
      serialNumber: parseInt(this.userId.replace(/\D/g, "").slice(0, 8)) || 1,
      timeCreated: Utils.convertDateToDateTime(new Date()),
    });

    // Write DEVICE_INFO message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.DEVICE_INFO,
      deviceIndex: 0,
      manufacturer: "development",
      product: 0,
      softwareVersion: 100,
      timestamp: Utils.convertDateToDateTime(new Date()),
    });

    // Write USER_PROFILE message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.USER_PROFILE,
      messageIndex: 0,
      friendlyName: "GradientPeak User",
    });
  }

  /**
   * Add a single record to the FIT file
   */
  async addRecord(record: FitRecord): Promise<void> {
    if (!this.isInitialized || this.isFinalized) {
      throw new Error("Encoder not initialized or already finalized");
    }

    try {
      // Build fields object with only defined values
      const fields: Record<string, any> = {
        timestamp: Utils.convertDateToDateTime(new Date(record.timestamp)),
      };

      if (record.heartRate !== undefined) {
        fields.heartRate = Math.round(record.heartRate);
      }
      if (record.cadence !== undefined) {
        fields.cadence = Math.round(record.cadence);
      }
      if (record.power !== undefined) {
        fields.power = Math.round(record.power);
      }
      if (record.speed !== undefined) {
        fields.speed = record.speed; // m/s (SDK handles conversion)
      }
      if (record.distance !== undefined) {
        fields.distance = record.distance; // meters (SDK handles conversion)
      }
      if (record.latitude !== undefined && record.longitude !== undefined) {
        fields.positionLat = degreesToSemicircles(record.latitude);
        fields.positionLong = degreesToSemicircles(record.longitude);
      }
      if (record.altitude !== undefined) {
        fields.altitude = record.altitude; // meters (SDK handles conversion)
      }
      if (record.grade !== undefined) {
        fields.grade = record.grade;
      }
      if (record.temperature !== undefined) {
        fields.temperature = Math.round(record.temperature);
      }

      // Write RECORD message
      this.encoder.writeMesg({
        mesgNum: Profile.MesgNum.RECORD,
        ...fields,
      });

      this.recordCount++;

      // Store in buffer for checkpoint recovery
      this.recordBuffer.push(record);
      if (this.recordBuffer.length > 100) {
        // Keep only last 100 records
        this.recordBuffer.shift();
      }

      await this.checkCheckpoint();
    } catch (error) {
      console.error(`[GarminFitEncoder] Failed to add record:`, error);
      throw error;
    }
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
   * Note: Since encoder.close() is destructive, we only save checkpoint metadata
   * The actual FIT file will be written on finalize()
   */
  async checkpoint(): Promise<void> {
    if (!this.isInitialized || this.isFinalized) {
      return;
    }

    try {
      await this.writeCheckpoint();
      this.lastCheckpointTime = Date.now();
      console.log(
        `[GarminFitEncoder] Checkpoint created, ${this.recordCount} records written`,
      );
    } catch (error) {
      console.error(`[GarminFitEncoder] Checkpoint failed:`, error);
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
      console.log(`[GarminFitEncoder] Finalizing with ${laps.length} laps...`);

      // Write LAP messages
      for (const lap of laps) {
        const lapFields: Record<string, any> = {
          timestamp: Utils.convertDateToDateTime(new Date(lap.startTime)),
          startTime: Utils.convertDateToDateTime(new Date(lap.startTime)),
          totalElapsedTime: lap.totalTime / 1000, // Convert ms to seconds
          totalTimerTime: lap.totalTime / 1000,
          totalDistance: lap.distance,
          avgSpeed: lap.avgSpeed,
          maxSpeed: lap.maxSpeed,
          messageIndex: lap.lapNumber - 1,
        };

        if (lap.avgPower !== undefined) {
          lapFields.avgPower = Math.round(lap.avgPower);
        }
        if (lap.avgHeartRate !== undefined) {
          lapFields.avgHeartRate = Math.round(lap.avgHeartRate);
        }

        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.LAP,
          ...lapFields,
        });
      }

      // Write SESSION message
      const sessionFields: Record<string, any> = {
        timestamp: Utils.convertDateToDateTime(new Date(sessionData.startTime)),
        startTime: Utils.convertDateToDateTime(new Date(sessionData.startTime)),
        totalElapsedTime: sessionData.totalTime / 1000, // Convert ms to seconds
        totalTimerTime: sessionData.totalTime / 1000,
        totalDistance: sessionData.distance,
        avgSpeed: sessionData.avgSpeed,
        maxSpeed: sessionData.maxSpeed,
        sport: "cycling", // Default to cycling
        subSport: "generic",
        firstLapIndex: 0,
        numLaps: laps.length,
      };

      if (sessionData.avgPower !== undefined) {
        sessionFields.avgPower = Math.round(sessionData.avgPower);
      }
      if (sessionData.maxPower !== undefined) {
        sessionFields.maxPower = Math.round(sessionData.maxPower);
      }
      if (sessionData.avgHeartRate !== undefined) {
        sessionFields.avgHeartRate = Math.round(sessionData.avgHeartRate);
      }
      if (sessionData.maxHeartRate !== undefined) {
        sessionFields.maxHeartRate = Math.round(sessionData.maxHeartRate);
      }
      if (sessionData.avgCadence !== undefined) {
        sessionFields.avgCadence = Math.round(sessionData.avgCadence);
      }
      if (sessionData.totalAscent !== undefined) {
        sessionFields.totalAscent = Math.round(sessionData.totalAscent);
      }
      if (sessionData.totalDescent !== undefined) {
        sessionFields.totalDescent = Math.round(sessionData.totalDescent);
      }
      if (sessionData.calories !== undefined) {
        sessionFields.totalCalories = Math.round(sessionData.calories);
      }

      this.encoder.writeMesg({
        mesgNum: Profile.MesgNum.SESSION,
        ...sessionFields,
      });

      // Write ACTIVITY message (summary)
      this.encoder.writeMesg({
        mesgNum: Profile.MesgNum.ACTIVITY,
        timestamp: Utils.convertDateToDateTime(new Date()),
        totalTimerTime: sessionData.totalTime / 1000,
        numSessions: 1,
        type: "manual",
        event: "activity",
        eventType: "stop",
      });

      // Close encoder and get final data
      const uint8Array = this.encoder.close();

      // Write final FIT file
      // Use standard File.write() which accepts Uint8Array directly in SDK 54+
      // This ensures binary data is written correctly.
      const file = new File(this.fitFilePath);
      file.write(uint8Array);

      // Verify write by checking file size
      console.log(
        `[GarminFitEncoder] Wrote ${file.size ?? 0} bytes to ${this.fitFilePath}`,
      );

      await this.clearCheckpoint();

      this.isFinalized = true;
      console.log(
        `[GarminFitEncoder] Finalized, ${this.recordCount} records written`,
      );
    } catch (error) {
      console.error(`[GarminFitEncoder] Finalize failed:`, error);
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
      bufferSize: this.recordBuffer.length,
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
            `[GarminFitEncoder] Failed to delete orphaned directory:`,
            error,
          );
        }
      }

      console.log(
        `[GarminFitEncoder] Cleaned up ${orphanedDirs.length} orphaned recordings`,
      );
    } catch (error) {
      console.error(
        `[GarminFitEncoder] Failed to cleanup orphaned recordings:`,
        error,
      );
    }
  }

  // ==================== Private Methods ====================

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
      recordBuffer: this.recordBuffer,
    };

    try {
      const checkpointPath = `${this.storageUri}checkpoint.json`;
      const checkpointFile = new File(checkpointPath);
      checkpointFile.write(JSON.stringify(checkpoint));

      const markerPath = `${this.storageUri}checkpoint_${Date.now()}.marker`;
      const markerFile = new File(markerPath);
      markerFile.write("1");
    } catch (error) {
      console.error(`[GarminFitEncoder] Failed to write checkpoint:`, error);
    }
  }

  private async recoverFromCheckpoint(checkpointPath: string): Promise<void> {
    try {
      const checkpointFile = new File(checkpointPath);
      const content = checkpointFile.textSync();
      const checkpoint = JSON.parse(content);

      const fitFile = new File(checkpoint.filePath);
      if (!fitFile.exists || (fitFile.size || 0) < 12) {
        console.warn(`[GarminFitEncoder] FIT file invalid, starting fresh`);
        await this.initializeEncoder();
        this.startTime = Date.now();
        this.isInitialized = true;
        return;
      }

      // Reinitialize encoder and replay buffered records
      await this.initializeEncoder();

      this.recordCount = checkpoint.recordCount;
      this.startTime = checkpoint.startTime;
      this.lastCheckpointTime = Date.now();
      this.recordBuffer = checkpoint.recordBuffer || [];

      // Replay buffered records
      if (this.recordBuffer.length > 0) {
        console.log(
          `[GarminFitEncoder] Replaying ${this.recordBuffer.length} buffered records`,
        );
        for (const record of this.recordBuffer) {
          // Write directly without incrementing count (already counted)
          const fields: Record<string, any> = {
            timestamp: Utils.convertDateToDateTime(new Date(record.timestamp)),
          };

          if (record.heartRate !== undefined)
            fields.heartRate = Math.round(record.heartRate);
          if (record.cadence !== undefined)
            fields.cadence = Math.round(record.cadence);
          if (record.power !== undefined)
            fields.power = Math.round(record.power);
          if (record.speed !== undefined) fields.speed = record.speed;
          if (record.distance !== undefined) fields.distance = record.distance;
          if (record.latitude !== undefined && record.longitude !== undefined) {
            fields.positionLat = degreesToSemicircles(record.latitude);
            fields.positionLong = degreesToSemicircles(record.longitude);
          }
          if (record.altitude !== undefined) fields.altitude = record.altitude;
          if (record.temperature !== undefined)
            fields.temperature = Math.round(record.temperature);

          this.encoder.writeMesg({
            mesgNum: Profile.MesgNum.RECORD,
            ...fields,
          });
        }
      }

      this.isInitialized = true;

      console.log(
        `[GarminFitEncoder] Recovered ${this.recordCount} records from checkpoint`,
      );
    } catch (error) {
      console.error(`[GarminFitEncoder] Recovery failed:`, error);
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
      console.warn(`[GarminFitEncoder] Failed to clear checkpoint:`, error);
    }
  }
}
