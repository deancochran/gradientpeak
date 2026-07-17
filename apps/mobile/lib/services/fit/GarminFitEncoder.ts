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
import { fitTimerSeconds } from "./fit-time";

// ==================== Types ====================

export interface SwimLengthData {
  lengthIndex: number;
  startTime: Date;
  movingTime: number;
  strokeType: string;
  averageSpeed: number;
  strokeCount: number;
  totalActivityDistance: number;
  endedAt?: Date;
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
  endedAt?: Date;
}

export interface DrillData {
  lengthIndex: number;
  startTime: Date;
  totalActivityDistance: number;
  endedAt?: Date;
}

/**
 * Convert degrees to semicircles (FIT format for GPS coordinates)
 * Formula: semicircles = degrees × (2³¹ / 180)
 */
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (2 ** 31 / 180));
}

/**
 * Convert semicircles to degrees
 * Formula: degrees = semicircles × (180 / 2³¹)
 */
function _semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / 2 ** 31);
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
  endedAt?: number;
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
  sport: string | number;
  subSport: string | number;
  /** FIT cannot represent a rest segment as a sport session. */
  role?: "activity" | "transition" | "unknown" | "rest";
  movingTime?: number;
  poolLength?: number;
  poolLengthUnit?: "metric" | "statute" | number;
  totalStrokes?: number;
  numLengths?: number;
  numActiveLengths?: number;
  timerEvents?: FitSessionTimerEvent[];
  laps?: FitLapData[];
}

export interface FitSessionTimerEvent {
  type: "pause" | "resume";
  timestamp: number;
}

export interface FitFinalizeOptions {
  /** Manual means user-controlled sport changes; automatic emits autoMultiSport semantics. */
  multisportMode?: "manual" | "automatic";
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
  endedAt?: number;
  totalElapsedTime?: number;
  firstLengthIndex?: number;
  numLengths?: number;
  numActiveLengths?: number;
  swimStroke?: string;
}

export interface EncoderConfig {
  manufacturer: string;
  deviceProduct: string;
  softwareVersion: string;
  hardwareVersion: number;
}

type EmittedLength = {
  messageIndex: number;
  startTime: number;
  endTime: number;
  active: boolean;
};

const DEFAULT_CONFIG: EncoderConfig = {
  manufacturer: "GradientPeak",
  deviceProduct: "MobileApp",
  softwareVersion: "1.0.0",
  hardwareVersion: 1,
};

export class GarminFitEncoder {
  private recordingId: string;
  private userId: string;
  private storageUri: string;
  private outputFilePath: string;
  private encoder: Encoder;
  private config: EncoderConfig;
  private recordCount: number = 0;
  private startTime: number = 0;
  private isInitialized: boolean = false;
  private isFinalized: boolean = false;
  private finalizedBytes?: Uint8Array;
  private timerStartedAt: number = 0;
  private emittedLengths: EmittedLength[] = [];

  constructor(recordingId: string, userId: string, config?: Partial<EncoderConfig>) {
    this.recordingId = recordingId;
    this.userId = userId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    const baseDir = Paths.cache.uri || Paths.document.uri || "";
    this.storageUri = `${baseDir}fit_encoding_${recordingId}/`;
    this.outputFilePath = `${this.storageUri}activity.fit`;
    this.encoder = new Encoder();
  }

  /**
   * Initialize the encoder and storage directory
   * Creates directory if needed and writes required FIT header messages
   */
  async initialize(
    connectedSensors: ConnectedSensor[] = [],
    startedAt: Date = new Date(),
  ): Promise<void> {
    try {
      const directory = new Directory(this.storageUri);
      if (!directory.exists) {
        directory.create({ intermediates: true });
      }

      await this.initializeEncoder(connectedSensors, startedAt);
      this.startTime = startedAt.getTime();
      this.timerStartedAt = startedAt.getTime();
      this.isInitialized = true;
      console.log(`[GarminFitEncoder] Initialized for recording ${this.recordingId}`);
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
    startedAt: Date = new Date(),
  ): Promise<void> {
    // Reset encoder
    this.encoder = new Encoder();
    this.emittedLengths = [];
    this.recordCount = 0;

    const now = startedAt;
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
        else if (sensor.services?.some((s: string) => s.includes("1816"))) deviceType = 121; // Bike Speed/Cadence

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

  private assertNumeric(
    value: number,
    label: string,
    options: { min?: number; max?: number; integer?: boolean } = {},
  ): void {
    if (
      !Number.isFinite(value) ||
      (options.integer === true && !Number.isInteger(value)) ||
      (options.min !== undefined && value < options.min) ||
      (options.max !== undefined && value > options.max)
    ) {
      throw new Error(`${label} is outside the FIT field range.`);
    }
  }

  private validateRecord(record: FitRecord): void {
    this.assertNumeric(record.timestamp, "FIT record timestamp", { min: 0 });
    if (record.heartRate !== undefined)
      this.assertNumeric(record.heartRate, "FIT record heartRate", {
        min: 0,
        max: 254,
        integer: true,
      });
    if (record.cadence !== undefined)
      this.assertNumeric(record.cadence, "FIT record cadence", {
        min: 0,
        max: 254,
        integer: true,
      });
    if (record.power !== undefined)
      this.assertNumeric(record.power, "FIT record power", {
        min: 0,
        max: 65_534,
        integer: true,
      });
    if (record.speed !== undefined)
      this.assertNumeric(record.speed, "FIT record speed", { min: 0, max: 4_294_967.294 });
    if (record.distance !== undefined)
      this.assertNumeric(record.distance, "FIT record distance", { min: 0, max: 42_949_672.94 });
    if (record.latitude !== undefined)
      this.assertNumeric(record.latitude, "FIT record latitude", { min: -90, max: 90 });
    if (record.longitude !== undefined)
      this.assertNumeric(record.longitude, "FIT record longitude", { min: -180, max: 180 });
    if ((record.latitude === undefined) !== (record.longitude === undefined)) {
      throw new Error("FIT record coordinates must include both latitude and longitude.");
    }
    if (record.altitude !== undefined)
      this.assertNumeric(record.altitude, "FIT record altitude", { min: -500, max: 12_606.8 });
    if (record.grade !== undefined)
      this.assertNumeric(record.grade, "FIT record grade", { min: -327.68, max: 327.67 });
    if (record.temperature !== undefined)
      this.assertNumeric(record.temperature, "FIT record temperature", {
        min: -128,
        max: 127,
        integer: true,
      });
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
      this.validateRecord(record);
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
    const lengthEndTime =
      lengthData.endedAt ?? new Date(lengthData.startTime.getTime() + lengthData.movingTime * 1000);
    this.assertNumeric(lengthData.lengthIndex, "FIT length messageIndex", {
      min: 0,
      max: 65_534,
      integer: true,
    });
    this.assertNumeric(lengthData.startTime.getTime(), "FIT length startTime", { min: 0 });
    this.assertNumeric(lengthEndTime.getTime(), "FIT length endTime", {
      min: lengthData.startTime.getTime() + 1,
    });
    this.assertNumeric(lengthData.movingTime, "FIT length movingTime", { min: 0 });
    this.assertNumeric(lengthData.averageSpeed, "FIT length averageSpeed", {
      min: 0,
      max: 65.534,
    });
    this.assertNumeric(lengthData.strokeCount, "FIT length strokeCount", {
      min: 0,
      max: 65_534,
      integer: true,
    });
    this.assertNumeric(lengthData.totalActivityDistance, "FIT length distance", {
      min: 0,
      max: 42_949_672.94,
    });
    const swimStroke = this.mapSwimStroke(lengthData.strokeType);
    const fitLengthEndTime = Utils.convertDateToDateTime(lengthEndTime);

    // 1. Write the LENGTH message
    // lengthType enum: 0 = idle, 1 = active
    // swimStroke enum: 0=freestyle, 1=backstroke, 2=breaststroke, 3=butterfly, 4=drill, 5=mixed, etc.
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LENGTH,
      messageIndex: lengthData.lengthIndex,
      timestamp: fitLengthEndTime,
      startTime: Utils.convertDateToDateTime(lengthData.startTime),
      totalElapsedTime: (lengthEndTime.getTime() - lengthData.startTime.getTime()) / 1000,
      totalTimerTime: lengthData.movingTime,
      lengthType: 1, // active
      swimStroke,
      avgSpeed: lengthData.averageSpeed,
      totalStrokes: lengthData.strokeCount,
      event: 28, // length
      eventType: 1, // stop
    });

    // 2. Write the corresponding RECORD message
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: fitLengthEndTime,
      distance: lengthData.totalActivityDistance,
      enhancedSpeed: lengthData.averageSpeed,
    });
    this.recordCount++;
    this.emittedLengths.push({
      messageIndex: lengthData.lengthIndex,
      startTime: lengthData.startTime.getTime(),
      endTime: lengthEndTime.getTime(),
      active: true,
    });
  }

  /**
   * Add a swim lap (a summary of a set of lengths)
   */
  async addSwimLap(lapData: SwimLapData): Promise<void> {
    const lapEndTime =
      lapData.endedAt ?? new Date(lapData.startTime.getTime() + lapData.movingTime * 1000);
    this.assertNumeric(lapData.lapIndex, "FIT swim lap messageIndex", {
      min: 0,
      max: 65_534,
      integer: true,
    });
    this.assertNumeric(lapData.movingTime, "FIT swim lap movingTime", { min: 0 });
    this.assertNumeric(lapData.firstLengthIndex, "FIT swim lap firstLengthIndex", {
      min: 0,
      max: 65_534,
      integer: true,
    });
    this.assertNumeric(lapData.numberOfLengths, "FIT swim lap numberOfLengths", {
      min: 1,
      max: 65_534,
      integer: true,
    });
    this.assertNumeric(lapData.totalDistance, "FIT swim lap distance", { min: 0 });
    this.assertNumeric(lapData.averageSpeed, "FIT swim lap averageSpeed", {
      min: 0,
      max: 65.534,
    });
    const swimStroke = this.mapSwimStroke(lapData.dominantStroke);
    const fitLapEndTime = Utils.convertDateToDateTime(lapEndTime);

    // swimStroke enum: 0=freestyle, 1=backstroke, 2=breaststroke, 3=butterfly, 4=drill, 5=mixed, etc.
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LAP,
      messageIndex: lapData.lapIndex,
      timestamp: fitLapEndTime,
      startTime: Utils.convertDateToDateTime(lapData.startTime),
      totalElapsedTime: (lapEndTime.getTime() - lapData.startTime.getTime()) / 1000,
      totalTimerTime: lapData.movingTime,
      firstLengthIndex: lapData.firstLengthIndex,
      numLengths: lapData.numberOfLengths,
      totalDistance: lapData.totalDistance,
      avgSpeed: lapData.averageSpeed,
      swimStroke,
      event: 9, // lap
      eventType: 1, // stop
      sport: 5,
      subSport: 17,
    });
  }

  /**
   * Add a drill length for swim activities
   */
  async addDrillLength(drillData: DrillData): Promise<void> {
    const drillEndTime = drillData.endedAt ?? new Date();
    this.assertNumeric(drillData.lengthIndex, "FIT drill messageIndex", {
      min: 0,
      max: 65_534,
      integer: true,
    });
    this.assertNumeric(drillData.startTime.getTime(), "FIT drill startTime", { min: 0 });
    this.assertNumeric(drillEndTime.getTime(), "FIT drill endTime", {
      min: drillData.startTime.getTime() + 1,
    });
    this.assertNumeric(drillData.totalActivityDistance, "FIT drill distance", { min: 0 });
    const fitDrillEndTime = Utils.convertDateToDateTime(drillEndTime);

    // lengthType enum: 0 = idle, 1 = active
    // Note: "drill" is not a valid lengthType value - use idle (0) for drill lengths
    // The swimStroke should be set to drill (4) instead
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.LENGTH,
      messageIndex: drillData.lengthIndex,
      timestamp: fitDrillEndTime,
      startTime: Utils.convertDateToDateTime(drillData.startTime),
      totalElapsedTime: (drillEndTime.getTime() - drillData.startTime.getTime()) / 1000,
      totalTimerTime: (drillEndTime.getTime() - drillData.startTime.getTime()) / 1000,
      lengthType: 1, // active; drill is represented by swimStroke, not idle time
      swimStroke: 4, // drill
      event: 28,
      eventType: 1,
    });

    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: fitDrillEndTime,
      distance: drillData.totalActivityDistance,
    });
    this.recordCount++;
    this.emittedLengths.push({
      messageIndex: drillData.lengthIndex,
      startTime: drillData.startTime.getTime(),
      endTime: drillEndTime.getTime(),
      active: true,
    });
  }

  /**
   * Pause the recording timer
   */
  async pause(timestamp: Date = new Date()): Promise<void> {
    // event enum: 0 = timer, eventType enum: 1 = stop
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: Utils.convertDateToDateTime(timestamp),
      event: 0, // timer
      eventType: 1, // stop
    });
  }

  /**
   * Resume the recording timer
   */
  async resume(timestamp: Date = new Date()): Promise<void> {
    // event enum: 0 = timer, eventType enum: 0 = start
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: Utils.convertDateToDateTime(timestamp),
      event: 0, // timer
      eventType: 0, // start
    });
  }

  /**
   * Map sport string to FIT SDK enum value
   */
  private mapSport(sport: string | number): number {
    if (typeof sport === "number") {
      if (Number.isInteger(sport) && sport >= 0 && sport < 255) return sport;
      throw new Error(`FIT sport value is out of range: ${sport}`);
    }
    switch (sport) {
      case "cycling":
        return 2;
      case "running":
        return 1;
      case "swimming":
        return 5;
      case "training":
        return 10;
      case "walking":
        return 11;
      case "transition":
        return 3;
      case "generic":
        return 0;
      default:
        throw new Error(`Unsupported FIT sport: ${sport}`);
    }
  }

  /**
   * Map subSport string to FIT SDK enum value
   */
  private mapSubSport(subSport: string | number): number {
    if (typeof subSport === "number") {
      if (Number.isInteger(subSport) && subSport >= 0 && subSport < 255) return subSport;
      throw new Error(`FIT sub-sport value is out of range: ${subSport}`);
    }
    switch (subSport) {
      case "indoor_cycling":
        return 6;
      case "road":
        return 7;
      case "street":
        return 2;
      case "trail":
        return 3;
      case "track":
        return 4;
      case "treadmill":
        return 1;
      case "indoor_running":
      case "indoorRunning":
        return 45;
      case "lap_swimming":
      case "lapSwimming":
        return 17;
      case "open_water":
      case "openWater":
        return 18;
      case "bike_to_run_transition":
        return 32;
      case "run_to_bike_transition":
        return 33;
      case "swim_to_bike_transition":
        return 34;
      case "generic":
        return 0;
      default:
        throw new Error(`Unsupported FIT sub-sport: ${subSport}`);
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
        throw new Error(`Unsupported FIT swim stroke: ${stroke}`);
    }
  }

  private writeTimerEvent(timestamp: number, eventType: 0 | 1 | 4): void {
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: Utils.convertDateToDateTime(new Date(timestamp)),
      event: 0,
      eventType,
    });
  }

  private usesStandardsFirstFinalization(): boolean {
    return true;
  }

  private validateModernInputs(
    sessions: FitSessionData[],
    multisportMode: "manual" | "automatic",
  ): void {
    if (sessions.length === 0) throw new Error("A FIT activity requires at least one session.");
    if (multisportMode === "automatic" && sessions.length < 2) {
      throw new Error("Automatic multisport requires at least two sessions.");
    }
    const nonnegative = (value: number, label: string) =>
      this.assertNumeric(value, label, { min: 0 });
    for (const [index, length] of this.emittedLengths.entries()) {
      if (length.messageIndex !== index) {
        throw new Error("Emitted FIT length indexes must be unique and contiguous from zero.");
      }
    }
    const assignedLengthIndexes = new Set<number>();
    let previousSessionEnd = -1;
    for (const [sessionIndex, session] of sessions.entries()) {
      nonnegative(session.startTime, `FIT session ${sessionIndex} startTime`);
      nonnegative(session.totalTime, `FIT session ${sessionIndex} totalTime`);
      this.assertNumeric(session.distance, `FIT session ${sessionIndex} distance`, {
        min: 0,
        max: 42_949_672.94,
      });
      const endedAt = session.endedAt ?? session.startTime + session.totalTime;
      nonnegative(endedAt, `FIT session ${sessionIndex} endedAt`);
      const elapsedMs = endedAt - session.startTime;
      if (elapsedMs <= 0) throw new Error(`FIT session ${sessionIndex} has an invalid time range.`);
      if (session.totalTime > elapsedMs) {
        throw new Error(`FIT session ${sessionIndex} active time exceeds elapsed time.`);
      }
      if (session.movingTime !== undefined) {
        nonnegative(session.movingTime, `FIT session ${sessionIndex} movingTime`);
        if (session.movingTime > session.totalTime) {
          throw new Error(`FIT session ${sessionIndex} moving time exceeds active time.`);
        }
      }
      if (session.startTime < previousSessionEnd) {
        throw new Error("FIT sessions must be ordered and non-overlapping.");
      }
      previousSessionEnd = endedAt;
      if (session.role === "rest") {
        throw new Error("FIT activity files cannot represent a rest segment as a sport session.");
      }
      const sport = session.role === "transition" ? 3 : this.mapSport(session.sport);
      const subSport = this.mapSubSport(session.subSport);
      this.assertNumeric(session.avgSpeed, `FIT session ${sessionIndex} avgSpeed`, {
        min: 0,
        max: 65.534,
      });
      this.assertNumeric(session.maxSpeed, `FIT session ${sessionIndex} maxSpeed`, {
        min: 0,
        max: 65.534,
      });
      for (const [field, value, max] of [
        ["avgPower", session.avgPower, 65_534],
        ["maxPower", session.maxPower, 65_534],
        ["avgHeartRate", session.avgHeartRate, 254],
        ["maxHeartRate", session.maxHeartRate, 254],
        ["avgCadence", session.avgCadence, 254],
      ] as const) {
        if (value !== undefined)
          this.assertNumeric(value, `FIT session ${sessionIndex} ${field}`, {
            min: 0,
            max,
            integer: true,
          });
      }
      for (const [field, value] of [
        ["totalAscent", session.totalAscent],
        ["totalDescent", session.totalDescent],
        ["calories", session.calories],
      ] as const) {
        if (value !== undefined)
          this.assertNumeric(value, `FIT session ${sessionIndex} ${field}`, {
            min: 0,
            max: 65_534,
            integer: true,
          });
      }
      if (session.poolLength !== undefined)
        this.assertNumeric(session.poolLength, `FIT session ${sessionIndex} poolLength`, {
          min: 0.01,
          max: 655.34,
        });
      if (
        session.poolLengthUnit !== undefined &&
        !["metric", "statute", 0, 1].includes(session.poolLengthUnit)
      ) {
        throw new Error(`FIT session ${sessionIndex} poolLengthUnit is invalid.`);
      }
      if (session.totalStrokes !== undefined)
        this.assertNumeric(session.totalStrokes, `FIT session ${sessionIndex} totalStrokes`, {
          min: 0,
          max: 4_294_967_294,
          integer: true,
        });
      for (const [field, value] of [
        ["numLengths", session.numLengths],
        ["numActiveLengths", session.numActiveLengths],
      ] as const) {
        if (value !== undefined)
          this.assertNumeric(value, `FIT session ${sessionIndex} ${field}`, {
            min: 0,
            max: 65_534,
            integer: true,
          });
      }
      if (sport === 5 && subSport === 17 && !(session.poolLength && session.poolLength > 0)) {
        throw new Error("Lap-swimming FIT sessions require a positive poolLength.");
      }

      let pausedAt: number | undefined;
      let pausedMs = 0;
      let previousEventTime = session.startTime;
      for (const event of session.timerEvents ?? []) {
        nonnegative(event.timestamp, `FIT session ${sessionIndex} timer timestamp`);
        if (
          event.timestamp < session.startTime ||
          event.timestamp > endedAt ||
          event.timestamp < previousEventTime ||
          (event.type === "pause") === (pausedAt !== undefined)
        ) {
          throw new Error(`FIT session ${sessionIndex} has invalid timer event ordering.`);
        }
        if (event.type === "pause") pausedAt = event.timestamp;
        else {
          if (pausedAt !== undefined && event.timestamp <= pausedAt) {
            throw new Error(`FIT session ${sessionIndex} has an empty pause range.`);
          }
          pausedMs += event.timestamp - (pausedAt ?? event.timestamp);
          pausedAt = undefined;
        }
        previousEventTime = event.timestamp;
      }
      if (pausedAt !== undefined) {
        throw new Error(`FIT session ${sessionIndex} ends while its timer is paused.`);
      }
      if (
        session.timerEvents !== undefined &&
        Math.abs(elapsedMs - session.totalTime - pausedMs) > 1
      ) {
        throw new Error(`FIT session ${sessionIndex} pause time does not reconcile.`);
      }

      let previousLapEnd = session.startTime;
      for (const [lapIndex, lap] of (session.laps ?? []).entries()) {
        nonnegative(lap.startTime, `FIT session ${sessionIndex} lap ${lapIndex} startTime`);
        nonnegative(lap.totalTime, `FIT session ${sessionIndex} lap ${lapIndex} totalTime`);
        const lapEnd = lap.endedAt ?? lap.startTime + (lap.totalElapsedTime ?? lap.totalTime);
        const lapElapsedMs = lap.totalElapsedTime ?? lapEnd - lap.startTime;
        nonnegative(lapEnd, `FIT session ${sessionIndex} lap ${lapIndex} endedAt`);
        nonnegative(lapElapsedMs, `FIT session ${sessionIndex} lap ${lapIndex} elapsed time`);
        this.assertNumeric(lap.distance, `FIT session ${sessionIndex} lap ${lapIndex} distance`, {
          min: 0,
          max: 42_949_672.94,
        });
        this.assertNumeric(lap.avgSpeed, `FIT session ${sessionIndex} lap ${lapIndex} avgSpeed`, {
          min: 0,
          max: 65.534,
        });
        this.assertNumeric(lap.maxSpeed, `FIT session ${sessionIndex} lap ${lapIndex} maxSpeed`, {
          min: 0,
          max: 65.534,
        });
        if (lap.avgPower !== undefined)
          this.assertNumeric(lap.avgPower, `FIT session ${sessionIndex} lap ${lapIndex} avgPower`, {
            min: 0,
            max: 65_534,
            integer: true,
          });
        if (lap.avgHeartRate !== undefined)
          this.assertNumeric(
            lap.avgHeartRate,
            `FIT session ${sessionIndex} lap ${lapIndex} avgHeartRate`,
            { min: 0, max: 254, integer: true },
          );
        for (const [field, value] of [
          ["firstLengthIndex", lap.firstLengthIndex],
          ["numLengths", lap.numLengths],
          ["numActiveLengths", lap.numActiveLengths],
        ] as const) {
          if (value !== undefined)
            this.assertNumeric(value, `FIT session ${sessionIndex} lap ${lapIndex} ${field}`, {
              min: 0,
              max: 65_534,
              integer: true,
            });
        }
        if (lap.swimStroke !== undefined) this.mapSwimStroke(lap.swimStroke);
        if (
          lap.startTime < session.startTime ||
          lapEnd > endedAt ||
          lapEnd <= lap.startTime ||
          lap.totalTime > lapElapsedMs ||
          lap.startTime < previousLapEnd
        ) {
          throw new Error(`FIT session ${sessionIndex} contains invalid or overlapping laps.`);
        }
        previousLapEnd = lapEnd;
      }
      const actualLengths = this.emittedLengths.filter(
        (length) => length.startTime >= session.startTime && length.endTime <= endedAt,
      );
      for (const length of actualLengths) assignedLengthIndexes.add(length.messageIndex);
      const activeLengthCount = actualLengths.filter((length) => length.active).length;
      if (
        (session.numLengths ?? 0) !== actualLengths.length ||
        (session.numActiveLengths ?? 0) !== activeLengthCount
      ) {
        throw new Error(`FIT session ${sessionIndex} length counts do not match emitted lengths.`);
      }
      if (actualLengths.length > 0) {
        const firstIndex = actualLengths[0]?.messageIndex;
        const lastIndex = actualLengths.at(-1)?.messageIndex;
        if (
          firstIndex === undefined ||
          lastIndex === undefined ||
          lastIndex - firstIndex + 1 !== actualLengths.length
        ) {
          throw new Error(`FIT session ${sessionIndex} length indexes are not contiguous.`);
        }
        if ((session.laps?.length ?? 0) > 0) {
          const referenced = new Set<number>();
          for (const [lapIndex, lap] of session.laps?.entries() ?? []) {
            if (
              lap.firstLengthIndex === undefined ||
              lap.numLengths === undefined ||
              lap.numActiveLengths === undefined
            ) {
              throw new Error(
                `FIT session ${sessionIndex} lap ${lapIndex} is missing length indexes.`,
              );
            }
            const lapEnd = lap.endedAt ?? lap.startTime + (lap.totalElapsedTime ?? lap.totalTime);
            const lapLengths = actualLengths.filter(
              (length) => length.startTime >= lap.startTime && length.endTime <= lapEnd,
            );
            const expectedLast = lap.firstLengthIndex + lap.numLengths - 1;
            if (
              lapLengths.length !== lap.numLengths ||
              lapLengths.filter((length) => length.active).length !== lap.numActiveLengths ||
              lapLengths[0]?.messageIndex !== lap.firstLengthIndex ||
              lapLengths.at(-1)?.messageIndex !== expectedLast
            ) {
              throw new Error(
                `FIT session ${sessionIndex} lap ${lapIndex} length range is invalid.`,
              );
            }
            for (const length of lapLengths) {
              if (referenced.has(length.messageIndex)) {
                throw new Error(
                  `FIT session ${sessionIndex} length ${length.messageIndex} is duplicated.`,
                );
              }
              referenced.add(length.messageIndex);
            }
          }
          if (referenced.size !== actualLengths.length) {
            throw new Error(`FIT session ${sessionIndex} laps do not cover every emitted length.`);
          }
        }
      } else if (
        session.laps?.some(
          (lap) =>
            lap.firstLengthIndex !== undefined ||
            lap.numLengths !== undefined ||
            lap.numActiveLengths !== undefined,
        )
      ) {
        throw new Error(`FIT session ${sessionIndex} lap references missing emitted lengths.`);
      }
    }
    if (assignedLengthIndexes.size !== this.emittedLengths.length) {
      throw new Error("An emitted FIT length is outside every session range.");
    }
  }

  private async finalizeModern(
    sessions: FitSessionData[],
    options: FitFinalizeOptions,
  ): Promise<void> {
    const multisportMode = options.multisportMode ?? "manual";
    this.validateModernInputs(sessions, multisportMode);
    const ordered = sessions.map((session, index) => {
      if (session.role === "rest") {
        throw new Error("FIT activity files cannot represent a rest segment as a sport session.");
      }
      const endedAt = session.endedAt ?? session.startTime + session.totalTime;
      const elapsedMs = endedAt - session.startTime;
      if (!Number.isFinite(session.startTime) || !Number.isFinite(endedAt) || elapsedMs <= 0) {
        throw new Error(`FIT session ${index} has an invalid time range.`);
      }
      if (session.totalTime < 0 || session.totalTime > elapsedMs) {
        throw new Error(`FIT session ${index} active time exceeds elapsed time.`);
      }
      const previous = sessions[index - 1];
      const previousEnd =
        previous?.endedAt ?? (previous ? previous.startTime + previous.totalTime : undefined);
      if (previousEnd !== undefined && session.startTime < previousEnd) {
        throw new Error("FIT sessions must be ordered and non-overlapping.");
      }
      const sport = session.role === "transition" ? 3 : this.mapSport(session.sport);
      const subSport = this.mapSubSport(session.subSport);
      if (sport === 5 && subSport === 17 && !(session.poolLength && session.poolLength > 0)) {
        throw new Error("Lap-swimming FIT sessions require a positive poolLength.");
      }
      return { session, endedAt, elapsedMs, sport, subSport };
    });
    const firstOrderedSession = ordered[0];
    if (!firstOrderedSession) throw new Error("A FIT activity requires at least one session.");
    if (Math.abs(firstOrderedSession.session.startTime - this.timerStartedAt) > 1_000) {
      throw new Error("The first FIT session must start when the encoder timer starts.");
    }

    for (const [sessionIndex, entry] of ordered.entries()) {
      let paused = false;
      let previousTimestamp = entry.session.startTime;
      for (const timerEvent of entry.session.timerEvents ?? []) {
        if (
          timerEvent.timestamp < entry.session.startTime ||
          timerEvent.timestamp > entry.endedAt ||
          timerEvent.timestamp < previousTimestamp ||
          (timerEvent.type === "pause") === paused
        ) {
          throw new Error(`FIT session ${sessionIndex} has invalid timer event ordering.`);
        }
        this.writeTimerEvent(timerEvent.timestamp, timerEvent.type === "pause" ? 1 : 0);
        paused = timerEvent.type === "pause";
        previousTimestamp = timerEvent.timestamp;
      }
      if (paused) throw new Error(`FIT session ${sessionIndex} ends while its timer is paused.`);
      this.writeTimerEvent(entry.endedAt, sessionIndex === ordered.length - 1 ? 4 : 1);
      const next = ordered[sessionIndex + 1];
      if (next) this.writeTimerEvent(next.session.startTime, 0);
    }

    let nextLapIndex = 0;
    let nextLengthIndex = 0;
    const sessionLapRanges: Array<{ firstLapIndex: number; numLaps: number }> = [];
    for (const [sessionIndex, entry] of ordered.entries()) {
      const sourceLaps = entry.session.laps?.length
        ? entry.session.laps
        : [
            {
              lapNumber: 1,
              startTime: entry.session.startTime,
              endedAt: entry.endedAt,
              totalTime: entry.session.totalTime,
              totalElapsedTime: entry.elapsedMs,
              distance: entry.session.distance,
              avgSpeed: entry.session.avgSpeed,
              maxSpeed: entry.session.maxSpeed,
            },
          ];
      const firstLapIndex = nextLapIndex;
      for (const lap of sourceLaps) {
        const lapEnd = lap.endedAt ?? lap.startTime + (lap.totalElapsedTime ?? lap.totalTime);
        const lapElapsedMs = lap.totalElapsedTime ?? lapEnd - lap.startTime;
        if (
          lap.startTime < entry.session.startTime ||
          lapEnd > entry.endedAt ||
          lapEnd <= lap.startTime ||
          lap.totalTime < 0 ||
          lap.totalTime > lapElapsedMs
        ) {
          throw new Error(`FIT session ${sessionIndex} contains an invalid lap range.`);
        }
        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.LAP,
          messageIndex: nextLapIndex,
          timestamp: Utils.convertDateToDateTime(new Date(lapEnd)),
          startTime: Utils.convertDateToDateTime(new Date(lap.startTime)),
          totalElapsedTime: lapElapsedMs / 1000,
          totalTimerTime: fitTimerSeconds(lap.totalTime),
          totalDistance: Math.round(lap.distance * 100) / 100,
          avgSpeed: lap.avgSpeed,
          maxSpeed: lap.maxSpeed,
          event: 9,
          eventType: 1,
          sport: entry.sport,
          subSport: entry.subSport,
          ...(lap.avgPower === undefined ? {} : { avgPower: Math.round(lap.avgPower) }),
          ...(lap.avgHeartRate === undefined ? {} : { avgHeartRate: Math.round(lap.avgHeartRate) }),
          ...(lap.firstLengthIndex === undefined
            ? entry.session.numLengths !== undefined
              ? { firstLengthIndex: nextLengthIndex }
              : {}
            : { firstLengthIndex: lap.firstLengthIndex }),
          ...(lap.numLengths === undefined
            ? sourceLaps.length === 1 && entry.session.numLengths !== undefined
              ? { numLengths: entry.session.numLengths }
              : {}
            : { numLengths: lap.numLengths }),
          ...(lap.numActiveLengths === undefined
            ? sourceLaps.length === 1 && entry.session.numActiveLengths !== undefined
              ? { numActiveLengths: entry.session.numActiveLengths }
              : {}
            : { numActiveLengths: lap.numActiveLengths }),
          ...(lap.swimStroke === undefined
            ? {}
            : { swimStroke: this.mapSwimStroke(lap.swimStroke) }),
        });
        nextLapIndex++;
      }
      sessionLapRanges.push({ firstLapIndex, numLaps: sourceLaps.length });
      nextLengthIndex += entry.session.numLengths ?? 0;
    }

    for (const [index, entry] of ordered.entries()) {
      const lapRange = sessionLapRanges[index];
      if (!lapRange) throw new Error(`FIT session ${index} has no lap range.`);
      const session = entry.session;
      this.encoder.writeMesg({
        mesgNum: Profile.MesgNum.SESSION,
        messageIndex: index,
        timestamp: Utils.convertDateToDateTime(new Date(entry.endedAt)),
        startTime: Utils.convertDateToDateTime(new Date(session.startTime)),
        event: 8,
        eventType: 1,
        totalElapsedTime: entry.elapsedMs / 1000,
        totalTimerTime: fitTimerSeconds(session.totalTime),
        ...(session.movingTime === undefined
          ? {}
          : { totalMovingTime: fitTimerSeconds(session.movingTime) }),
        totalDistance: Math.round(session.distance * 100) / 100,
        avgSpeed: session.avgSpeed,
        maxSpeed: session.maxSpeed,
        sport: entry.sport,
        subSport: entry.subSport,
        firstLapIndex: lapRange.firstLapIndex,
        numLaps: lapRange.numLaps,
        trigger: index === ordered.length - 1 ? 0 : multisportMode === "automatic" ? 2 : 1,
        ...(session.avgPower === undefined ? {} : { avgPower: Math.round(session.avgPower) }),
        ...(session.maxPower === undefined ? {} : { maxPower: Math.round(session.maxPower) }),
        ...(session.avgHeartRate === undefined
          ? {}
          : { avgHeartRate: Math.round(session.avgHeartRate) }),
        ...(session.maxHeartRate === undefined
          ? {}
          : { maxHeartRate: Math.round(session.maxHeartRate) }),
        ...(session.avgCadence === undefined ? {} : { avgCadence: Math.round(session.avgCadence) }),
        ...(session.totalAscent === undefined ? {} : { totalAscent: session.totalAscent }),
        ...(session.totalDescent === undefined ? {} : { totalDescent: session.totalDescent }),
        ...(session.calories === undefined ? {} : { totalCalories: Math.round(session.calories) }),
        ...(session.poolLength === undefined ? {} : { poolLength: session.poolLength }),
        ...(session.poolLengthUnit === undefined
          ? {}
          : {
              poolLengthUnit:
                session.poolLengthUnit === "metric"
                  ? 0
                  : session.poolLengthUnit === "statute"
                    ? 1
                    : session.poolLengthUnit,
            }),
        ...(session.totalStrokes === undefined ? {} : { totalStrokes: session.totalStrokes }),
        ...(session.numLengths === undefined ? {} : { numLengths: session.numLengths }),
        ...(session.numActiveLengths === undefined
          ? {}
          : { numActiveLengths: session.numActiveLengths }),
      });
    }

    const first = ordered[0];
    const last = ordered.at(-1);
    if (!first || !last) throw new Error("A FIT activity requires at least one session.");
    const activityTimerSeconds = ordered.reduce(
      (total, entry) => total + fitTimerSeconds(entry.session.totalTime),
      0,
    );
    const fitEndTime = Utils.convertDateToDateTime(new Date(last.endedAt));
    const localTimestampOffset = new Date(last.endedAt).getTimezoneOffset() * -60;
    this.encoder.writeMesg({
      mesgNum: Profile.MesgNum.ACTIVITY,
      timestamp: fitEndTime,
      totalTimerTime: activityTimerSeconds,
      numSessions: ordered.length,
      localTimestamp: fitEndTime + localTimestampOffset,
      type: multisportMode === "automatic" ? 1 : 0,
      event: 26,
      eventType: 1,
    });

    const bytes = this.encoder.close();
    this.finalizedBytes = bytes;
    await this.writeFinalizedFile(bytes);
    this.isFinalized = true;
    this.startTime = first.session.startTime;
  }

  /**
   * Finalize the FIT file with session, activity, and lap data
   */
  async finalize(
    sessionData: FitSessionData | FitSessionData[],
    laps: FitLapData[] = [],
    options: FitFinalizeOptions = {},
  ): Promise<void> {
    if (this.isFinalized) {
      return;
    }

    try {
      if (this.finalizedBytes) {
        await this.writeFinalizedFile(this.finalizedBytes);
        this.isFinalized = true;
        return;
      }

      if (this.usesStandardsFirstFinalization()) {
        if (Array.isArray(sessionData)) {
          await this.finalizeModern(sessionData, options);
          return;
        }
        await this.finalizeModern([{ ...sessionData, laps: sessionData.laps ?? laps }], options);
        return;
      }
      if (Array.isArray(sessionData)) {
        throw new Error("Encoder is unavailable for multisession finalization.");
      }

      console.log(`[GarminFitEncoder] Finalizing with ${laps.length} laps...`);

      const endTime = new Date(sessionData.endedAt ?? Date.now());
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
      } catch (_e) {
        console.warn("[GarminFitEncoder] Failed to write stopAll event, trying stop...");
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
        const fitStartTime = Utils.convertDateToDateTime(new Date(sessionData.startTime));

        // LAP message - only include standard FIT Profile fields
        // Note: avgSpeed/maxSpeed are NOT standard LAP fields per Garmin FIT SDK
        // Speed data should only be in RECORD messages
        const lapFields: Record<string, any> = {
          messageIndex: 0,
          timestamp: fitEndTime,
          startTime: fitStartTime,
          totalElapsedTime: fitEndTime - fitStartTime,
          totalTimerTime: fitTimerSeconds(sessionData.totalTime),
          totalDistance: Math.round(sessionData.distance * 100) / 100, // Round to 2 decimals
        };

        console.log(`[GarminFitEncoder] Writing default LAP message:`, lapFields);

        this.encoder.writeMesg({
          mesgNum: Profile.MesgNum.LAP,
          ...lapFields,
        });
      } else {
        // Encode provided laps
        for (const lap of laps) {
          const lapStartTime = Utils.convertDateToDateTime(new Date(lap.startTime));
          const lapEndTime = Utils.convertDateToDateTime(new Date(lap.startTime + lap.totalTime));

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
      const fitStartTime = Utils.convertDateToDateTime(new Date(sessionData.startTime));

      const sessionFields: Record<string, any> = {
        messageIndex: 0, // CRITICAL: Required field for SESSION messages
        timestamp: fitEndTime,
        startTime: fitStartTime,
        totalElapsedTime: fitEndTime - fitStartTime, // Duration in seconds (FIT timestamp difference)
        totalTimerTime: fitTimerSeconds(sessionData.totalTime),
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
      if (sessionData.avgHeartRate !== undefined && sessionData.avgHeartRate > 0) {
        sessionFields.avgHeartRate = Math.round(sessionData.avgHeartRate);
      }
      if (sessionData.maxHeartRate !== undefined && sessionData.maxHeartRate > 0) {
        sessionFields.maxHeartRate = Math.round(sessionData.maxHeartRate);
      }
      if (sessionData.avgCadence !== undefined && sessionData.avgCadence > 0) {
        sessionFields.avgCadence = Math.round(sessionData.avgCadence);
      }
      if (sessionData.totalAscent !== undefined && sessionData.totalAscent > 0) {
        sessionFields.totalAscent = sessionData.totalAscent;
      }
      if (sessionData.totalDescent !== undefined && sessionData.totalDescent > 0) {
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
        console.error(`[GarminFitEncoder] Failed to write SESSION message:`, error);
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
      const activityTotalTimerTime = fitTimerSeconds(sessionData.totalTime);

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
      this.finalizedBytes = uint8Array;
      console.log(`[GarminFitEncoder] Encoder closed, buffer size: ${uint8Array.length} bytes`);

      await this.writeFinalizedFile(uint8Array);

      this.isFinalized = true;
      console.log(`[GarminFitEncoder] Finalized, ${this.recordCount} records written`);
    } catch (error) {
      console.error(`[GarminFitEncoder] Finalize failed:`, error);
      throw error;
    }
  }

  private async writeFinalizedFile(bytes: Uint8Array): Promise<void> {
    const file = new File(this.outputFilePath);
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
    }
    await file.write(bytes);
    console.log(`[GarminFitEncoder] Wrote ${file.size ?? 0} bytes to ${this.outputFilePath}`);

    if (Platform.OS === "ios") {
      console.log("[GarminFitEncoder] Applying iOS sync delay (1000ms)...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("[GarminFitEncoder] iOS sync delay complete");
    }
  }

  /**
   * Get the complete FIT file as Uint8Array
   */
  async getFile(): Promise<Uint8Array> {
    if (!this.isFinalized) {
      throw new Error("File not finalized");
    }

    const file = new File(this.outputFilePath);
    const content = await file.base64();

    return new Uint8Array(Buffer.from(content, "base64"));
  }

  /**
   * Get file path for direct access
   */
  getFilePath(): string {
    return this.outputFilePath;
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
        (item) => item instanceof Directory && item.uri.includes("fit_encoding_"),
      );

      for (const dir of orphanedDirs) {
        try {
          if (dir.exists) {
            dir.delete();
          }
        } catch (error) {
          console.warn(`[GarminFitEncoder] Failed to delete orphaned directory:`, error);
        }
      }

      console.log(`[GarminFitEncoder] Cleaned up ${orphanedDirs.length} orphaned recordings`);
    } catch (error) {
      console.error(`[GarminFitEncoder] Failed to cleanup orphaned recordings:`, error);
    }
  }

  // ==================== Private Helper Methods ====================
  // SDK handles all encoding, buffering, CRC calculation internally
}
