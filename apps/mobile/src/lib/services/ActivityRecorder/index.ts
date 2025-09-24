/**
 * ActivityRecorderService - Single-session activity recorder
 *
 * Integrates BLE sensors, GPS/location, permissions, and live metrics.
 * Handles chunked data storage, summaries, and backend sync for a single active session.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  computeActivitySummary,
  PublicActivityType,
  PublicPlannedActivitiesRow,
  type ActivityStreamData,
  type ActivitySummary,
  type ProfileSnapshot,
} from "@repo/core";
import * as Location from "expo-location";
import { Device } from "react-native-ble-plx";

import {
  BleManagerService,
  type ConnectedSensor,
  type SensorReading,
} from "./ble";
import { LocationManager, type GPSReading } from "./location";
import {
  PermissionManager,
  type PermissionState,
  type PermissionType,
} from "./permissions";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

export interface LiveMetrics {
  totalTime?: number;
  movingTime?: number;
  distance?: number;
  total_ascent?: number;
  total_descent?: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  avgPower?: number;
  speed?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  normalizedPower?: number;
  intensityFactor?: number;
  trainingStressScore?: number;
  variabilityIndex?: number;
  grade?: number;
  hrZoneDistribution?: number[];
  powerZoneDistribution?: number[];
  aerobicDecoupling?: number;
  efficiencyIndex?: number;
  currentLatitude?: number;
  currentLongitude?: number;
  currentAltitude?: number;
  elevation?: number;
}

export interface RecordingSession {
  profileId: string;
  startedAt: Date;
  finishedAt?: Date;
  state: RecordingState;
  activityType: PublicActivityType;
  plannedActivity?: PublicPlannedActivitiesRow;
  currentMetrics: LiveMetrics;
  sensorDataBuffer: Record<string, { value: any; timestamp: number }[]>;
  chunkIndex: number;
  totalElapsedTime: number;
  movingTime: number;
  lastResumeTime: Date | null;
  lastCheckpointAt: Date;
  dataPointsRecorded: number;
  allValues: Map<string, number[]>;
  allCoordinates: [number, number][];
}

const BACKGROUND_LOCATION_TASK = "background-location-task";

export class ActivityRecorderService {
  private session: RecordingSession | null = null;
  private locationManager: LocationManager;
  private permissions: Record<PermissionType, PermissionState> = {};
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private lastGPSReading: GPSReading | null = null;
  private chunkInterval = 5000;
  private chunkTimer: NodeJS.Timeout | null = null;
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();
  private bleInitialized = false;

  constructor() {
    this.locationManager = new LocationManager(BACKGROUND_LOCATION_TASK);
    this.initializeDataHandling();
  }

  async initialize() {
    await BleManagerService.initialize();
    this.bleInitialized = true;
    await this.cleanupOldTasks();
    this.locationManager.defineBackgroundTask();
    await this.checkAllPermissions();
    console.log("ActivityRecorderService initialized");
  }

  private initializeDataHandling() {
    BleManagerService.subscribe((reading) => this.handleSensorData(reading));

    this.locationManager.addCallback((locationObj) => {
      const gpsReading: GPSReading = {
        latitude: locationObj.coords.latitude,
        longitude: locationObj.coords.longitude,
        altitude: locationObj.coords.altitude || undefined,
        speed: locationObj.coords.speed || undefined,
        heading: locationObj.coords.heading || undefined,
        accuracy: locationObj.coords.accuracy || undefined,
        timestamp: locationObj.timestamp,
      };

      const sensorReadings = processGPSReading(gpsReading, this.lastGPSReading);
      sensorReadings.forEach((reading) => this.handleSensorData(reading));
      this.lastGPSReading = gpsReading;
    });
  }

  private async cleanupOldTasks() {
    try {
      const oldTaskNames = [
        "ACTIVITY_LOCATION_TRACKING",
        BACKGROUND_LOCATION_TASK,
      ];
      for (const taskName of oldTaskNames) {
        const isStarted =
          await Location.hasStartedLocationUpdatesAsync(taskName);
        if (isStarted) await Location.stopLocationUpdatesAsync(taskName);
      }
      await AsyncStorage.removeItem("background_location_session");
    } catch (error) {
      console.warn("Error during task cleanup:", error);
    }
  }

  private async checkAllPermissions() {
    const types: PermissionType[] = [
      "bluetooth",
      "location",
      "location-background",
    ];
    for (const type of types) {
      try {
        const result = await PermissionManager.ensure(type);
        this.permissions[type] = {
          granted: result,
          canAskAgain: true,
          name: PermissionManager.permissionNames[type],
          description: PermissionManager.permissionDescriptions[type],
          loading: false,
        };
      } catch {
        this.permissions[type] = {
          granted: false,
          canAskAgain: true,
          name: PermissionManager.permissionNames[type],
          description: PermissionManager.permissionDescriptions[type],
          loading: false,
        };
      }
    }
  }

  getPermissionState(type: PermissionType): PermissionState | null {
    return this.permissions[type] || null;
  }

  async ensurePermission(type: PermissionType): Promise<boolean> {
    return await PermissionManager.ensure(type);
  }

  /** --- Single session management --- */
  async createActivityRecording(
    profileId: string,
    activityType: PublicActivityType,
    plannedActivity?: PublicPlannedActivitiesRow,
  ) {
    if (this.session) throw new Error("A session is already active");

    const startedAt = new Date();

    this.session = {
      profileId,
      startedAt,
      state: "pending",
      activityType,
      plannedActivity,
      currentMetrics: {},
      sensorDataBuffer: {},
      chunkIndex: 0,
      totalElapsedTime: 0,
      movingTime: 0,
      lastResumeTime: null,
      lastCheckpointAt: startedAt,
      dataPointsRecorded: 0,
      allValues: new Map(),
      allCoordinates: [],
    };

    return this.session;
  }

  async startRecording() {
    if (!this.session) throw new Error("No active session");
    this.session.state = "recording";
    this.session.lastResumeTime = new Date();

    await Promise.all([
      this.ensurePermission("location"),
      this.ensurePermission("location-background"),
      this.ensurePermission("bluetooth"),
    ]);

    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();
    this.startChunkProcessing();
  }

  async pauseRecording() {
    if (!this.session || this.session.state !== "recording") return;
    if (this.session.lastResumeTime) {
      this.session.movingTime +=
        Date.now() - this.session.lastResumeTime.getTime();
    }
    this.session.state = "paused";
    this.session.lastResumeTime = null;
  }

  async resumeRecording() {
    if (!this.session || this.session.state !== "paused") return;
    this.session.state = "recording";
    this.session.lastResumeTime = new Date();
  }

  async finishRecording() {
    if (!this.session) return;

    if (this.session.lastResumeTime) {
      this.session.movingTime +=
        Date.now() - this.session.lastResumeTime.getTime();
    }

    this.session.state = "finished";
    this.session.totalElapsedTime =
      Date.now() - this.session.startedAt.getTime();
    this.session.finishedAt = new Date();

    await this.stopSensors();
    await this.processChunk();
    const summary = await this.computeActivitySummary();

    this.session = null; // clear session
    return summary;
  }

  getLiveMetrics(): LiveMetrics | null {
    return this.session?.currentMetrics || null;
  }

  /** --- Sensors --- */
  async scanForDevices(): Promise<Device[]> {
    if (!this.bleInitialized || !(await this.ensurePermission("bluetooth")))
      throw new Error("Bluetooth not available");
    return await BleManagerService.scan();
  }

  async connectToDevice(deviceId: string): Promise<ConnectedSensor | null> {
    if (!this.bleInitialized) throw new Error("BLE not initialized");
    const sensor = await BleManagerService.connect(deviceId);
    if (sensor) this.connectedSensors.set(deviceId, sensor);
    return sensor;
  }

  async disconnectDevice(deviceId: string) {
    this.connectedSensors.delete(deviceId);
    await BleManagerService.disconnect(deviceId);
  }

  getConnectedSensors(): ConnectedSensor[] {
    return Array.from(this.connectedSensors.values());
  }

  private async stopSensors() {
    await this.locationManager.stopAllTracking();
    await BleManagerService.disconnectAll();
    this.stopChunkProcessing();
  }

  /** --- Sensor data handling --- */
  private handleSensorData(reading: SensorReading) {
    if (!this.session || this.session.state !== "recording") return;

    const { metric, value, timestamp } = reading;

    if (!this.session.sensorDataBuffer[metric])
      this.session.sensorDataBuffer[metric] = [];
    if (!this.session.allValues.has(metric))
      this.session.allValues.set(metric, []);

    if (metric === "latlng" && Array.isArray(value) && value.length === 2) {
      const coords: [number, number] = [value[0], value[1]];
      this.session.sensorDataBuffer[metric].push({ value: coords, timestamp });
      this.session.allCoordinates.push(coords);
      this.session.currentMetrics.currentLatitude = value[0];
      this.session.currentMetrics.currentLongitude = value[1];
    } else if (typeof value === "number") {
      this.session.sensorDataBuffer[metric].push({ value, timestamp });
      this.session.allValues.get(metric)!.push(value);

      switch (metric) {
        case "heartrate":
          this.session.currentMetrics.heartRate = value;
          break;
        case "power":
          this.session.currentMetrics.power = value;
          break;
        case "speed":
          this.session.currentMetrics.speed = value;
          break;
        case "cadence":
          this.session.currentMetrics.cadence = value;
          break;
        case "altitude":
          this.session.currentMetrics.currentAltitude = value;
          break;
      }
    }

    this.session.dataPointsRecorded++;
    this.dataCallbacks.forEach((cb) => cb(reading));
  }

  addDataCallback(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.add(cb);
  }

  removeDataCallback(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.delete(cb);
  }

  /** --- Chunk processing --- */
  private startChunkProcessing() {
    if (this.chunkTimer) clearInterval(this.chunkTimer);
    this.chunkTimer = setInterval(
      () => this.processChunk(),
      this.chunkInterval,
    );
  }

  private stopChunkProcessing() {
    if (this.chunkTimer) clearInterval(this.chunkTimer);
    this.chunkTimer = null;
  }

  private async processChunk() {
    if (!this.session || this.session.state !== "recording") return;

    const now = Date.now();
    const chunkStartTime = this.session.lastCheckpointAt.getTime();

    for (const [metric, buffer] of Object.entries(
      this.session.sensorDataBuffer,
    )) {
      if (buffer.length === 0) continue;
      buffer.length = 0; // clear buffer after processing
    }

    this.session.lastCheckpointAt = new Date(now);
    this.session.chunkIndex++;
  }

  private async computeActivitySummary(): Promise<ActivitySummary> {
    if (!this.session) throw new Error("No active session");

    const streamData: ActivityStreamData = {
      timestamps: [],
      heartrate: this.session.allValues.get("heartrate"),
      power: this.session.allValues.get("power"),
      speed: this.session.allValues.get("speed"),
      cadence: this.session.allValues.get("cadence"),
      altitude: this.session.allValues.get("altitude"),
      latlng: this.session.allCoordinates.length
        ? this.session.allCoordinates
        : undefined,
    };

    const profileSnapshot: ProfileSnapshot = {
      weightKg: 70,
      ftp: 250,
      thresholdHr: 165,
    };

    return computeActivitySummary(
      streamData,
      profileSnapshot,
      this.session.activityType,
    );
  }

  /** --- Cleanup --- */
  async cleanup() {
    await this.stopSensors();
    this.dataCallbacks.clear();
    this.locationManager.clearAllCallbacks();
    this.session = null;
    console.log("ActivityRecorderService cleaned up");
  }

  get activeSession() {
    return this.session;
  }
}
