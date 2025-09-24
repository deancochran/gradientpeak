import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  computeActivitySummary,
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicPlannedActivitiesRow,
  type ActivityStreamData,
  type ActivitySummary,
  type ProfileSnapshot,
  type SensorReading,
} from "@repo/core";
import * as Location from "expo-location";

import { LocationManager } from "./location";
import {
  PermissionsManager,
  type PermissionState,
  type PermissionType,
} from "./permissions";
import { SensorsManager } from "./sensors";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

export class ActivityRecorderService {
  // --- Session properties as class attributes ---
  profileId: string;
  startedAt?: Date;
  state: RecordingState = "pending";
  activityType: PublicActivityType = "indoor_treadmill";
  plannedActivity?: PublicPlannedActivitiesRow;
  chunkIndex = 0;
  totalElapsedTime = 0;
  movingTime = 0;
  lastResumeTime: Date | null = null;
  lastCheckpointAt?: Date;
  dataPointsRecorded = 0;
  allValues: Map<string, number[]> = new Map();
  allCoordinates: [number, number][] = [];

  // --- Service Managers ---
  private permissionsManager = new PermissionsManager();
  private locationManager = new LocationManager();
  private sensorsManager = new SensorsManager();

  // --- Other service properties ---
  private chunkTimer: NodeJS.Timeout | null = null;
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();

  constructor(profileId: string) {
    this.profileId = profileId;

    this.initializeDataHandling();
    await this.cleanupOldTasks();
    const types: PermissionType[] = [
      "bluetooth",
      "location",
      "location-background",
    ];
    for (const type of types) {
      try {
        const granted = await PermissionManager.ensure(type);
        this.permissions[type] = {
          granted,
          canAskAgain: true,
          name: PermissionManager.permissionNames[type],
          description: PermissionManager.permissionDescriptions[type],
          loading: false,
        };
      } catch (error) {
        this.permissions[type] = {
          granted: false,
          canAskAgain: true,
          name: PermissionManager.permissionNames[type],
          description: PermissionManager.permissionDescriptions[type],
          loading: false,
        };
      }
    }
    console.log("ActivityRecorderService initialized");
  }

  private initializeDataHandling() {
    // BLE data
    this.bluetoothManager.subscribe((reading) =>
      this.handleSensorData(reading),
    );

    // GPS data
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
      const tasks = ["ACTIVITY_LOCATION_TRACKING", "background-location-task"];
      for (const t of tasks) {
        const started = await Location.hasStartedLocationUpdatesAsync(t);
        if (started) await Location.stopLocationUpdatesAsync(t);
      }
      await AsyncStorage.removeItem("background_location_session_id");
    } catch (err) {
      console.warn("Error during task cleanup:", err);
    }
  }

  private async checkAllPermissions() {}

  getPermissionState(type: PermissionType): PermissionState | null {
    return this.permissions[type] || null;
  }

  async ensurePermission(type: PermissionType): Promise<boolean> {
    return await PermissionManager.ensure(type);
  }

  // --- Recording methods ---
  async startRecording() {
    if (this.state === "recording") throw new Error("Already recording");

    this.state = "recording";
    this.lastResumeTime = new Date();

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
    if (this.lastResumeTime) {
      this.movingTime += Date.now() - this.lastResumeTime.getTime();
    }
    this.state = "paused";
    this.lastResumeTime = null;
  }

  async resumeRecording() {
    if (this.state !== "paused") throw new Error("Session not paused");
    this.state = "recording";
    this.lastResumeTime = new Date();
  }

  async finishRecording() {
    if (this.lastResumeTime) {
      this.movingTime += Date.now() - this.lastResumeTime.getTime();
    }
    this.state = "finished";
    this.totalElapsedTime = Date.now() - this.startedAt.getTime();

    await this.processChunk();

    const summary = await this.computeActivitySummary();
    console.log("Activity finished. Summary:", summary);
  }

  // --- BLE methods ---
  async scanForDevices() {
    return this.bluetoothManager.scan();
  }

  private handleSensorData(reading: SensorReading) {
    this.updateWithSensorData(reading);
    this.dataCallbacks.forEach((cb) => {
      try {
        cb(reading);
      } catch (err) {
        console.warn("Sensor callback error:", err);
      }
    });
  }

  private updateWithSensorData(reading: SensorReading) {
    const { metric, value, timestamp } = reading;

    if (!this.sensorDataBuffer[metric]) this.sensorDataBuffer[metric] = [];
    if (!this.allValues.has(metric)) this.allValues.set(metric, []);

    switch (metric) {
      case "latlng":
        if (Array.isArray(value) && value.length === 2) {
          const coords: [number, number] = [value[0], value[1]];
          this.sensorDataBuffer[metric].push({ value: coords, timestamp });
          this.allCoordinates.push(coords);
          this.currentMetrics.currentLatitude = value[0];
          this.currentMetrics.currentLongitude = value[1];
          this.updateDistanceFromGPS();
        }
        break;
      default:
        if (typeof value === "number") {
          this.sensorDataBuffer[metric].push({ value, timestamp });
          this.allValues.get(metric)!.push(value);

          switch (metric) {
            case "heartrate":
              this.currentMetrics.heartRate = value;
              this.updateAggregateMetrics("heartrate", "HeartRate");
              break;
            case "power":
              this.currentMetrics.power = value;
              this.updateAggregateMetrics("power", "Power");
              break;
            case "speed":
              this.currentMetrics.speed = value;
              this.updateAggregateMetrics("speed", "Speed");
              break;
            case "cadence":
              this.currentMetrics.cadence = value;
              this.updateAggregateMetrics("cadence", "Cadence");
              break;
            case "altitude":
              this.currentMetrics.currentAltitude = value;
              this.updateElevationMetrics();
              break;
            case "distance":
              this.currentMetrics.distance =
                (this.currentMetrics.distance || 0) + value;
              break;
          }
        }
        break;
    }

    this.dataPointsRecorded++;
  }

  private updateAggregateMetrics(metric: string, suffix: string) {
    const values = this.allValues.get(metric)?.filter((v) => v > 0) || [];
    if (values.length > 0) {
      (this.currentMetrics as any)[`avg${suffix}`] =
        values.reduce((a, b) => a + b, 0) / values.length;
      (this.currentMetrics as any)[`max${suffix}`] = Math.max(...values);
    }
  }

  private updateDistanceFromGPS() {
    const coords = this.allCoordinates;
    if (coords.length >= 2) {
      const [lat1, lon1] = coords[coords.length - 2];
      const [lat2, lon2] = coords[coords.length - 1];
      const R = 6371000;
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const d = R * c;
      this.currentMetrics.distance = (this.currentMetrics.distance || 0) + d;
    }
  }

  private updateElevationMetrics() {
    const altitudes = this.allValues.get("altitude") || [];
    if (altitudes.length >= 2) {
      let gain = 0;
      for (let i = 1; i < altitudes.length; i++) {
        const change = altitudes[i] - altitudes[i - 1];
        if (change > 0) gain += change;
      }
      this.currentMetrics.elevation = gain;
    }
  }
  private getDataTypeForMetric(
    metric: PublicActivityMetric,
  ): PublicActivityMetricDataType {
    const dataTypes: Record<
      PublicActivityMetric,
      PublicActivityMetricDataType
    > = {
      heartrate: "integer",
      power: "integer",
      speed: "float",
      cadence: "integer",
      distance: "float",
      latlng: "latlng",
      altitude: "float",
      temperature: "float",
      gradient: "float",
      moving: "boolean",
    };
    return dataTypes[metric] || "float";
  }

  private async computeActivitySummary(): Promise<ActivitySummary> {
    const streamData: ActivityStreamData = {
      timestamps: Array.from(
        { length: Math.max(this.allCoordinates.length, 60) },
        (_, i) =>
          this.startedAt.getTime() +
          (i * this.totalElapsedTime) /
            Math.max(this.allCoordinates.length, 60),
      ),
      heartrate: this.allValues.get("heartrate"),
      power: this.allValues.get("power"),
      speed: this.allValues.get("speed"),
      cadence: this.allValues.get("cadence"),
      altitude: this.allValues.get("altitude"),
      latlng: this.allCoordinates.length > 0 ? this.allCoordinates : undefined,
    };

    const profile: ProfileSnapshot = {
      weightKg: 70,
      ftp: 250,
      thresholdHr: 165,
    };

    return computeActivitySummary(streamData, profile, this.activityType);
  }

  addDataCallback(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.add(cb);
  }

  removeDataCallback(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.delete(cb);
  }

  // --- Chunking ---
  private startChunkProcessing() {
    if (this.chunkTimer) clearInterval(this.chunkTimer);
    this.chunkTimer = setInterval(() => this.processChunk(), 5000);
  }

  private stopChunkProcessing() {
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }
  }

  private async processChunk() {
    if (this.state !== "recording") return;

    const now = Date.now();
    const startTime = this.lastCheckpointAt.getTime();

    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      if (buffer.length === 0) continue;

      const data = buffer.map((item) => item.value);
      const timestamps = buffer.map((item) => item.timestamp);

      // Insert into DB (pseudo)
      await db.insert(activityRecordingStreams).values({
        activityRecordingId: "current", // Single session
        metric: metric as PublicActivityMetric,
        dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
        chunkIndex: this.chunkIndex,
        startTime,
        endTime: now,
        data,
        timestamps,
        sampleCount: buffer.length,
      });

      buffer.length = 0;
    }

    this.lastCheckpointAt = new Date(now);
    this.chunkIndex++;
  }

  async cleanup() {
    await this.locationManager.stopAllTracking();
    await this.bluetoothManager.disconnectAll();
    this.stopChunkProcessing();
    this.dataCallbacks.clear();
    this.locationManager.clearAllCallbacks();
    console.log("ActivityRecorderService cleaned up");
  }
}
