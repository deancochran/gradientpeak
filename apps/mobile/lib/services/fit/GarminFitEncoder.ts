/**
 * GarminFitEncoder - FIT File Encoding using Official Garmin SDK
 *
 * Production-grade FIT file encoder using Garmin's official SDK.
 * Follows industry standard pattern: buffer in memory → write once at finalization.
 *
 * Key Features:
 * - Official @garmin/fitsdk for guaranteed FIT protocol compliance
 * - Memory-efficient: SDK handles internal buffering (~50-200KB for typical activities)
 * - Single write operation at finalization (no intermediate flushes)
 * - iOS filesystem sync handling (1-second delay after write)
 * - Clean, simple architecture (~600 lines vs 1,100 in previous implementation)
 *
 * Architecture:
 * 1. initialize() - Set up encoder, write required header messages (FILE_ID, DEVICE_INFO, EVENT start)
 * 2. addRecord() - Write RECORD messages to SDK's internal buffer
 * 3. finalize() - Write footer messages (LAP, SESSION, ACTIVITY), close encoder, write to disk once
 *
 * This matches the pattern used by Garmin, Strava, and other major fitness platforms.
 *
 * @see https://developer.garmin.com/fit/
 * @package @garmin/fitsdk
 */

import { Encoder, Profile, Utils } from "@garmin/fitsdk";
import { Buffer } from "buffer";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { ConnectedSensor } from "../ActivityRecorder/sensors";

// ==================== Types ====================

export interface SwimLengthData {
  lengthIndex: number;
  startTime: Date;
  movingTime: number;
  strokeType: string;
  averageSpeed: number;
  strokeCount: number;
  totalActivityDistance: number;
}

export interface SwimLapData {
  lapIndex: number;
  startTime: Date;
  movingTime: number;
  firstLengthIndex: number;
  numberOfLengths: number;
  totalDistance: number;
  averageSpeed: number;
  dominantStroke: string;
}

export interface DrillData {
  lengthIndex: number;
  startTime: Date;
  totalActivityDistance: number;
}

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
  sport: string;
  subSport: string;
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
  manufacturer: string;
  deviceProduct: string;
  softwareVersion: string;
  hardwareVersion: number;
}

const DEFAULT_CONFIG: EncoderConfig = {
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
  private isInitialized: boolean = false;
  private isFinalized: boolean = false;

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
   * Creates directory if needed and writes required FIT header messages
   */
  async initialize(connectedSensors: ConnectedSensor[] = []): Promise<void> {
    try {
      const directory = new Directory(this.storageUri);
      if (!directory.exists) {
        directory.create({ intermediates: true });
      }

      await this.initializeEncoder(connectedSensors);
      this.startTime = Date.now();
      this.isInitialized = true;
      console.log(
        `[GarminFitEncoder] Initialized for recording ${this.recordingId}`,
      );
    } catch (error) {
      console.error(`[GarminFitEncoder] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Initialize the Garmin FIT encoder with required messages
   */
  private async initializeEncoder(
    connectedSensors: ConnectedSensor[] = [],
  ): Promise<void> {
    // Reset encoder
    this.encoder = new Encoder();

    const now = new Date();
    const fitNow = Utils.convertDateToDateTime(now);

    // 1. FILE_ID Message (Required, exactly one)
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.FILE_ID,
      type: 4, // Activity
      manufacturer: 255, // Development
      product: 1,
      timeCreated: fitNow,
      serialNumber: this.getSerialNumber(this.userId),
    });

    // 2. DEVICE_INFO Message (Creator)
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.DEVICE_INFO,
      deviceIndex: 0, // 0 is usually the creator
      manufacturer: 255, // Development
      product: 1,
      productName: "GradientPeak Mobile",
      softwareVersion: 1.0,
      timestamp: fitNow,
    });

    // 3. DEVICE_INFO Messages (Connected Sensors)
    if (connectedSensors && connectedSensors.length > 0) {
      connectedSensors.forEach((sensor, index) => {
        // Map sensor type if possible (heuristic based on services)
        // This is simplified; ideally we'd map BLE service UUIDs to FIT device types
        let deviceType = 0; // unknown
        if (sensor.services?.some((s: string) => s.includes("180d")))
          deviceType = 120; // Heart Rate
        else if (sensor.services?.some((s: string) => s.includes("1818")))
          deviceType = 122; // Cycling Power
        else if (sensor.services?.some((s: string) => s.includes("1816")))
          deviceType = 121; // Bike Speed/Cadence

        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.DEVICE_INFO,
          deviceIndex: index + 1, // Start from 1
          manufacturer: 0, // unknown/generic
          product: 0, // unknown
          productName: sensor.name || "Unknown Sensor",
          deviceType,
          timestamp: fitNow,
          batteryStatus: sensor.batteryLevel
            ? this.mapBatteryLevel(sensor.batteryLevel)
            : undefined,
        });
      });
    }

    // 4. EVENT Message (Timer Start) (Required for valid activities)
    // event enum: 0 = timer, eventType enum: 0 = start
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: fitNow,
      event: 0, // timer
      eventType: 0, // start
    });
  }

  private mapBatteryLevel(level: number): number {
    // FIT battery_status: 1=New, 2=Good, 3=Ok, 4=Low, 5=Critical
    if (level >= 80) return 1; // New
    if (level >= 50) return 2; // Good
    if (level >= 30) return 3; // Ok
    if (level >= 10) return 4; // Low
    return 5; // Critical
  }

  private getSerialNumber(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // ==================== Public Methods ====================

  /**
   * Add a single record to the FIT file
   * Writes to SDK's internal buffer (not to disk until finalize)
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
        fields.enhancedSpeed = record.speed; // m/s
      }
      if (record.distance !== undefined) {
        fields.distance = record.distance; // meters
      }
      if (record.latitude !== undefined && record.longitude !== undefined) {
        fields.positionLat = degreesToSemicircles(record.latitude);
        fields.positionLong = degreesToSemicircles(record.longitude);
      }
      if (record.altitude !== undefined) {
        fields.altitude = record.altitude; // meters
      }
      if (record.grade !== undefined) {
        fields.grade = record.grade;
      }
      if (record.temperature !== undefined) {
        fields.temperature = Math.round(record.temperature);
      }

      // Write RECORD message directly to encoder
      this.encoder.writeMesg({
        mesgNum: Profile.MesgNum.RECORD,
        ...fields,
      });

      this.recordCount++;
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
   * Add a swim length and its corresponding record message
   */
  async addSwimLength(lengthData: SwimLengthData): Promise<void> {
    const lengthEndTime = new Date();
    const fitLengthEndTime = Utils.convertDateToDateTime(lengthEndTime);

    // 1. Write the LENGTH message
    // lengthType enum: 0 = idle, 1 = active
    // swimStroke enum: 0=freestyle, 1=backstroke, 2=breaststroke, 3=butterfly, 4=drill, 5=mixed, etc.
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LENGTH,
      messageIndex: lengthData.lengthIndex,
      timestamp: fitLengthEndTime,
      startTime: Utils.convertDateToDateTime(lengthData.startTime),
      totalElapsedTime:
        (lengthEndTime.getTime() - lengthData.startTime.getTime()) / 1000,
      totalTimerTime: lengthData.movingTime,
      lengthType: 1, // active
      swimStroke: this.mapSwimStroke(lengthData.strokeType),
      avgSpeed: lengthData.averageSpeed,
      totalStrokes: lengthData.strokeCount,
    });

    // 2. Write the corresponding RECORD message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: fitLengthEndTime,
      distance: lengthData.totalActivityDistance,
    });
  }

  /**
   * Add a swim lap (a summary of a set of lengths)
   */
  async addSwimLap(lapData: SwimLapData): Promise<void> {
    const lapEndTime = new Date();
    const fitLapEndTime = Utils.convertDateToDateTime(lapEndTime);

    // swimStroke enum: 0=freestyle, 1=backstroke, 2=breaststroke, 3=butterfly, 4=drill, 5=mixed, etc.
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LAP,
      messageIndex: lapData.lapIndex,
      timestamp: fitLapEndTime,
      startTime: Utils.convertDateToDateTime(lapData.startTime),
      totalElapsedTime:
        (lapEndTime.getTime() - lapData.startTime.getTime()) / 1000,
      totalTimerTime: lapData.movingTime,
      firstLengthIndex: lapData.firstLengthIndex,
      numLengths: lapData.numberOfLengths,
      totalDistance: lapData.totalDistance,
      avgSpeed: lapData.averageSpeed,
      swimStroke: this.mapSwimStroke(lapData.dominantStroke),
    });
  }

  /**
   * Add a drill length for swim activities
   */
  async addDrillLength(drillData: DrillData): Promise<void> {
    const drillEndTime = new Date();
    const fitDrillEndTime = Utils.convertDateToDateTime(drillEndTime);

    // lengthType enum: 0 = idle, 1 = active
    // Note: "drill" is not a valid lengthType value - use idle (0) for drill lengths
    // The swimStroke should be set to drill (4) instead
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LENGTH,
      messageIndex: drillData.lengthIndex,
      timestamp: fitDrillEndTime,
      startTime: Utils.convertDateToDateTime(drillData.startTime),
      totalElapsedTime:
        (drillEndTime.getTime() - drillData.startTime.getTime()) / 1000,
      totalTimerTime:
        (drillEndTime.getTime() - drillData.startTime.getTime()) / 1000,
      lengthType: 0, // idle (drills are non-stroke lengths)
      swimStroke: 4, // drill
    });

    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: fitDrillEndTime,
      distance: drillData.totalActivityDistance,
    });
  }

  /**
   * Pause the recording timer
   */
  async pause(): Promise<void> {
    // event enum: 0 = timer, eventType enum: 1 = stop
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: Utils.convertDateToDateTime(new Date()),
      event: 0, // timer
      eventType: 1, // stop
    });
  }

  /**
   * Resume the recording timer
   */
  async resume(): Promise<void> {
    // event enum: 0 = timer, eventType enum: 0 = start
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: Utils.convertDateToDateTime(new Date()),
      event: 0, // timer
      eventType: 0, // start
    });
  }

  /**
   * Map sport string to FIT SDK enum value
   */
  private mapSport(sport: string): number {
    switch (sport) {
      case "cycling":
        return 2;
      case "running":
        return 1;
      case "swimming":
        return 5;
      case "training":
        return 3;
      case "walking":
        return 11;
      default:
        return 0; // Generic
    }
  }

  /**
   * Map subSport string to FIT SDK enum value
   */
  private mapSubSport(subSport: string): number {
    switch (subSport) {
      case "indoor_cycling":
        return 6;
      case "road":
        return 2; // Street/Road
      case "treadmill":
        return 1;
      case "lap_swimming":
        return 11;
      default:
        return 0; // Generic
    }
  }

  /**
   * Map swim stroke string to FIT SDK enum value
   */
  private mapSwimStroke(stroke: string): number {
    const strokeLower = stroke.toLowerCase();
    switch (strokeLower) {
      case "freestyle":
        return 0;
      case "backstroke":
        return 1;
      case "breaststroke":
        return 2;
      case "butterfly":
        return 3;
      case "drill":
        return 4;
      case "mixed":
        return 5;
      case "im":
        return 6;
      case "imbyround":
        return 7;
      case "rimo":
        return 8;
      default:
        return 0; // Default to freestyle
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

      const endTime = new Date();
      const fitEndTime = Utils.convertDateToDateTime(endTime);

      // 1. EVENT Message (Timer Stop)
      // event enum: 0 = timer
      // eventType enum: 1 = stop, 4 = stopAll
      try {
        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.EVENT,
          timestamp: fitEndTime,
          event: 0, // timer
          eventType: 4, // stopAll
        });
      } catch (e) {
        console.warn(
          "[GarminFitEncoder] Failed to write stopAll event, trying stop...",
        );
        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.EVENT,
          timestamp: fitEndTime,
          event: 0, // timer
          eventType: 1, // stop
        });
      }

      // 2. LAP Messages (at least one required if numLaps > 0)
      if (laps.length === 0) {
        // Create a default lap for the entire activity
        const fitStartTime = Utils.convertDateToDateTime(
          new Date(sessionData.startTime),
        );

        // LAP message - only include standard FIT Profile fields
        // Note: avgSpeed/maxSpeed are NOT standard LAP fields per Garmin FIT SDK
        // Speed data should only be in RECORD messages
        const lapFields: Record<string, any> = {
          messageIndex: 0,
          timestamp: fitEndTime,
          startTime: fitStartTime,
          totalElapsedTime: fitEndTime - fitStartTime,
          totalTimerTime: fitEndTime - fitStartTime,
          totalDistance: Math.round(sessionData.distance * 100) / 100, // Round to 2 decimals
        };

        console.log(
          `[GarminFitEncoder] Writing default LAP message:`,
          lapFields,
        );

        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.LAP,
          ...lapFields,
        });
      } else {
        // Encode provided laps
        for (const lap of laps) {
          const lapStartTime = Utils.convertDateToDateTime(
            new Date(lap.startTime),
          );
          const lapEndTime = Utils.convertDateToDateTime(
            new Date(lap.startTime + lap.totalTime),
          );

          // LAP message - only include standard FIT Profile fields
          // Note: avgSpeed/maxSpeed are NOT standard LAP fields per Garmin FIT SDK
          const lapFields: Record<string, any> = {
            messageIndex: lap.lapNumber - 1,
            timestamp: lapEndTime,
            startTime: lapStartTime,
            totalElapsedTime: lapEndTime - lapStartTime, // Duration in seconds (FIT timestamp difference)
            totalTimerTime: lapEndTime - lapStartTime,
            totalDistance: lap.distance,
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
      }

      // 3. SESSION Message (REQUIRED - must have messageIndex!)
      const fitStartTime = Utils.convertDateToDateTime(
        new Date(sessionData.startTime),
      );

      const sessionFields: Record<string, any> = {
        messageIndex: 0, // CRITICAL: Required field for SESSION messages
        timestamp: fitEndTime,
        startTime: fitStartTime,
        totalElapsedTime: fitEndTime - fitStartTime, // Duration in seconds (FIT timestamp difference)
        totalTimerTime: fitEndTime - fitStartTime, // Duration in seconds (FIT timestamp difference)
        totalDistance: Math.round(sessionData.distance * 100) / 100, // Round to 2 decimals
        sport: this.mapSport(sessionData.sport),
        subSport: this.mapSubSport(sessionData.subSport),
        firstLapIndex: 0,
        numLaps: laps.length > 0 ? laps.length : 1, // At least 1 lap
        trigger: 0, // sessionTrigger enum: 0 = activityEnd (REQUIRED for valid session)
      };

      // Only add optional fields if they have valid values
      // NOTE: avgSpeed and maxSpeed are omitted - use enhancedAvgSpeed/enhancedMaxSpeed if SDK supports them
      // For now, speed data is available in RECORD messages via enhancedSpeed
      // TODO: Research if SESSION supports enhanced speed fields
      if (sessionData.avgPower !== undefined && sessionData.avgPower > 0) {
        sessionFields.avgPower = Math.round(sessionData.avgPower);
      }
      if (sessionData.maxPower !== undefined && sessionData.maxPower > 0) {
        sessionFields.maxPower = Math.round(sessionData.maxPower);
      }
      if (
        sessionData.avgHeartRate !== undefined &&
        sessionData.avgHeartRate > 0
      ) {
        sessionFields.avgHeartRate = Math.round(sessionData.avgHeartRate);
      }
      if (
        sessionData.maxHeartRate !== undefined &&
        sessionData.maxHeartRate > 0
      ) {
        sessionFields.maxHeartRate = Math.round(sessionData.maxHeartRate);
      }
      if (sessionData.avgCadence !== undefined && sessionData.avgCadence > 0) {
        sessionFields.avgCadence = Math.round(sessionData.avgCadence);
      }
      if (
        sessionData.totalAscent !== undefined &&
        sessionData.totalAscent > 0
      ) {
        sessionFields.totalAscent = sessionData.totalAscent;
      }
      if (
        sessionData.totalDescent !== undefined &&
        sessionData.totalDescent > 0
      ) {
        sessionFields.totalDescent = sessionData.totalDescent;
      }
      if (sessionData.calories !== undefined && sessionData.calories > 0) {
        sessionFields.totalCalories = Math.round(sessionData.calories);
      }

      console.log(`[GarminFitEncoder] Writing SESSION message:`, sessionFields);

      try {
        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.SESSION,
          ...sessionFields,
        });
        console.log(`[GarminFitEncoder] SESSION message written successfully`);
      } catch (error) {
        console.error(
          `[GarminFitEncoder] Failed to write SESSION message:`,
          error,
        );
        console.error(
          `[GarminFitEncoder] SESSION fields that caused error:`,
          JSON.stringify(sessionFields, null, 2),
        );
        throw error;
      }

      // 4. ACTIVITY Message (REQUIRED - exactly one)
      // activity enum: 0 = manual, 1 = autoMultiSport
      // event enum: 26 = activity (Stop at end of activity)
      // eventType enum: 1 = stop
      const localTimestampOffset = endTime.getTimezoneOffset() * -60;
      const activityTotalTimerTime = fitEndTime - fitStartTime; // Duration in seconds

      this.encoder.writeMesg({
        mesgNum: Profile.MesgNum.ACTIVITY,
        timestamp: fitEndTime,
        totalTimerTime: activityTotalTimerTime,
        numSessions: 1,
        localTimestamp: fitEndTime + localTimestampOffset,
        type: 0, // manual
        event: 26, // activity
        eventType: 1, // stop
      });

      // Close encoder and get final data
      const uint8Array = this.encoder.close();
      console.log(
        `[GarminFitEncoder] Encoder closed, buffer size: ${uint8Array.length} bytes`,
      );

      const file = new File(this.fitFilePath);
      // Ensure write completes before proceeding
      await file.write(uint8Array);

      console.log(
        `[GarminFitEncoder] Wrote ${file.size ?? 0} bytes to ${this.fitFilePath}`,
      );

      // CRITICAL: iOS needs time to sync file to disk before reads
      if (Platform.OS === "ios") {
        console.log("[GarminFitEncoder] Applying iOS sync delay (1000ms)...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("[GarminFitEncoder] iOS sync delay complete");
      }

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
    const content = await file.base64();

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
  } {
    return {
      isInitialized: this.isInitialized,
      isFinalized: this.isFinalized,
      recordCount: this.recordCount,
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

  // ==================== Private Helper Methods ====================
  // SDK handles all encoding, buffering, CRC calculation internally
}
