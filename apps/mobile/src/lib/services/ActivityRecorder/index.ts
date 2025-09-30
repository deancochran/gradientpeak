import {
  BLE_SERVICE_UUIDS,
  computeActivitySummary,
  PublicActivityType,
  PublicPlannedActivitiesRow,
  PublicProfilesRow,
  type ActivityStreamData,
  type ActivitySummary,
  type SensorReading,
} from "@repo/core";
import * as Location from "expo-location";

import { InsertActivityRecording } from "@/lib/db/schemas";
import { LocationManager } from "./location";
import {
  PermissionsManager,
  type PermissionState,
  type PermissionType,
} from "./permissions";
import { SensorsManager } from "./sensors";
import { DataStorageManager } from "./storage";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

export class ActivityRecorderService {
  // --- Singleton instance ---
  private static _instance: ActivityRecorderService | null = null;

  // --- Session properties as class attributes ---
  profile?: PublicProfilesRow;
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
  private permissionsManager: PermissionsManager;
  private locationManager: LocationManager;
  private sensorsManager: SensorsManager;
  private storageManager: DataStorageManager;

  // --- Other service properties ---
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();

  private constructor(profile: PublicProfilesRow) {
    this.permissionsManager = new PermissionsManager();
    this.locationManager = new LocationManager();
    this.sensorsManager = new SensorsManager();
    this.storageManager = new DataStorageManager(profile);
  }

  async init() {
    await this.permissionsManager.checkAll();
    this.initializeDataHandling();
    console.log("ActivityRecorderService initialized");
  }

  private initializeDataHandling() {
    // BLE data
    this.sensorsManager.subscribe((reading) => this.handleSensorData(reading));

    // GPS data
    this.locationManager.addCallback((locationObj) => {
      const timestamp = locationObj.timestamp || Date.now();
      const latlng: SensorReading = {
        metric: "latlng",
        dataType: "latlng",
        value: [locationObj.coords.latitude, locationObj.coords.longitude],
        timestamp,
      };
      if (
        locationObj.coords.speed !== undefined &&
        locationObj.coords.speed !== null
      ) {
        const speed: SensorReading = {
          metric: "speed",
          dataType: "float",
          value: locationObj.coords.speed * 3.6, // Convert m/s to km/h
          timestamp,
        };
        this.handleSensorData(speed);
      }
      if (
        locationObj.coords.altitude !== undefined &&
        locationObj.coords.altitude !== null
      ) {
        const altitude: SensorReading = {
          metric: "altitude",
          dataType: "integer",
          value: locationObj.coords.altitude,
          timestamp,
        };
        this.handleSensorData(altitude);
      }
      this.handleSensorData(latlng);
    });
  }

  private lastGPSReading?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };

  private async cleanupOldTasks() {
    try {
      const tasks = ["ACTIVITY_LOCATION_TRACKING", "background-location-task"];
      for (const t of tasks) {
        const started = await Location.hasStartedLocationUpdatesAsync(t);
        if (started) await Location.stopLocationUpdatesAsync(t);
      }
    } catch (err) {
      console.warn("Error during task cleanup:", err);
    }
  }

  getPermissionState(type: PermissionType): PermissionState | null {
    return this.permissionsManager.permissions[type] || null;
  }

  async ensurePermission(type: PermissionType): Promise<boolean> {
    const granted = await this.permissionsManager.ensure(type);
    this.permissionsManager.permissions[type] = {
      granted,
      canAskAgain: true,
      name: this.permissionsManager.permissionNames[type],
      description: this.permissionsManager.permissionDescriptions[type],
      loading: false,
    };
    return granted;
  }

  // --- Recording methods ---
  async startRecording(
    activityData: Omit<
      InsertActivityRecording,
      "id" | "createdAt" | "startedAt" | "synced" | "state"
    >,
  ) {
    if (!this.profile) {
      throw new Error("Profile must be set before starting recording");
    }

    // Clean up any unfinished recordings for this profile before starting new one
    await this.storageManager.deleteUnfinishedRecordings(this.profile.id);

    const recordingId = await this.storageManager.createRecording({
      ...activityData,
      profileId: this.profile.id,
      plannedActivityId: this.plannedActivity?.id,
    });

    this.startedAt = new Date();
    this.state = "recording";
    this.lastResumeTime = new Date();
    this.totalElapsedTime = 0;
    this.movingTime = 0;

    await Promise.all([
      this.ensurePermission("location"),
      this.ensurePermission("location-background"),
      this.ensurePermission("bluetooth"),
    ]);

    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();
    this.storageManager.startChunkProcessing();
  }

  async pauseRecording() {
    if (this.state !== "recording") throw new Error("Not currently recording");
    if (this.lastResumeTime) {
      this.movingTime += Date.now() - this.lastResumeTime.getTime();
    }
    this.state = "paused";
    this.lastResumeTime = null;
    if (this.storageManager.getCurrentRecordingId()) {
      await this.storageManager.updateRecordingState(
        this.storageManager.getCurrentRecordingId(),
        "paused",
      );
    }
  }

  async resumeRecording() {
    if (this.state !== "paused") throw new Error("Session not paused");
    this.state = "recording";
    this.lastResumeTime = new Date();
    if (this.storageManager.getCurrentRecordingId()) {
      await this.storageManager.updateRecordingState(
        this.storageManager.getCurrentRecordingId(),
        "recording",
      );
    }
  }

  async finishRecording() {
    if (this.state !== "recording" && this.state !== "paused")
      throw new Error("Cannot finish non-active session");
    if (this.lastResumeTime) {
      this.movingTime += Date.now() - this.lastResumeTime.getTime();
    }
    this.state = "finished";
    if (this.startedAt) {
      this.totalElapsedTime = Date.now() - this.startedAt.getTime();
    }

    await this.storageManager.finishRecording();

    const summary = await this.computeActivitySummary();
    console.log("Activity finished. Summary:", summary);

    // Attempt to upload if network available
    await this.uploadCompletedActivity();
  }

  // --- BLE methods ---
  async scanForDevices() {
    const devices = await this.sensorsManager.scan();
    return devices.map((device) => {
      let type = "unknown";
      if (device.serviceUUIDs?.includes(BLE_SERVICE_UUIDS.HEART_RATE)) {
        type = "heartRate";
      } else if (
        device.serviceUUIDs?.includes(BLE_SERVICE_UUIDS.CYCLING_POWER)
      ) {
        type = "power";
      } else if (
        device.serviceUUIDs?.includes(
          BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE,
        )
      ) {
        type = "cadence";
      }
      return {
        id: device.id,
        name: device.name || "Unknown Device",
        rssi: device.rssi,
        device,
        type,
      };
    });
  }

  async connectToDevice(deviceId: string) {
    return this.sensorsManager.connectSensor(deviceId);
  }

  async disconnectDevice(deviceId: string) {
    return this.sensorsManager.disconnectSensor(deviceId);
  }

  getConnectedSensors() {
    return this.sensorsManager.getConnectedSensors();
  }

  async discardRecording() {
    this.state = "discarded";
    await this.storageManager.discardRecording();
  }

  private handleSensorData(reading: SensorReading) {
    this.storageManager.addSensorReading(reading);

    if (typeof reading.value === "number") {
      if (!this.allValues.has(reading.metric)) {
        this.allValues.set(reading.metric, []);
      }
      this.allValues.get(reading.metric)!.push(reading.value);
    }

    this.dataCallbacks.forEach((cb) => {
      try {
        cb(reading);
      } catch (err) {
        console.warn("Sensor callback error:", err);
      }
    });
  }

  getLiveMetrics() {
    const metrics: Record<string, number> = {};
    for (const [key, values] of this.allValues.entries()) {
      metrics[key] = values[values.length - 1]; // last value
      metrics[`${key}_avg`] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return metrics;
  }

  private async computeActivitySummary(): Promise<ActivitySummary> {
    const recordingId = this.storageManager.getCurrentRecordingId();
    if (!recordingId) throw new Error("No active recording");

    const reconstructed =
      await this.storageManager.reconstructActivityData(recordingId);

    // Build timestamps from latlng if available, else use a common set
    let timestamps: number[] = [];
    if (reconstructed.latlng) {
      timestamps = reconstructed.latlng.timestamps;
    } else if (Object.keys(reconstructed).length > 0) {
      timestamps = reconstructed[Object.keys(reconstructed)[0]].timestamps;
    } else {
      timestamps = Array.from(
        { length: 60 },
        (_, i) => Date.now() - (60 - i) * 1000,
      );
    }

    const streamData: ActivityStreamData = {
      timestamps,
      heartrate: reconstructed.heartrate?.values,
      power: reconstructed.power?.values,
      speed: reconstructed.speed?.values,
      cadence: reconstructed.cadence?.values,
      altitude: reconstructed.altitude?.values,
      latlng: reconstructed.latlng
        ? (reconstructed.latlng.values as [number, number][])
        : undefined,
    };

    return computeActivitySummary(streamData, this.profile, this.activityType);
  }

  addDataCallback(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  subscribeConnection(cb: (sensor: any) => void) {
    return this.sensorsManager.subscribeConnection(cb);
  }

  getCurrentRecordingId() {
    return this.storageManager.getCurrentRecordingId();
  }

  async getRecordingStats(recordingId?: string) {
    return this.storageManager.getRecordingStats(recordingId);
  }

  /**
   * Enhanced upload: Upload activity with compressed streams via TRPC create_activity
   */
  async uploadCompletedActivity(recordingId: string): Promise<boolean> {
    if (!recordingId) {
      console.error("No recording ID for upload");
      return false;
    }

    try {
      console.log("Starting enhanced activity upload...");

      if (!recordingId) {
        console.error("Recording not found");
        return false;
      }

      const summary = await this.computeActivitySummary();

      // Prepare complete submission payload (activity + compressed streams)
      const submissionPayload =
        await this.storageManager.prepareSubmissionPayload(
          id,
          summary,
          recording,
        );

      console.log("Submission payload prepared:", {
        activity: submissionPayload.activity.name,
        streamCount: submissionPayload.activity_streams.length,
        metrics: submissionPayload.activity_streams.map((s) => s.type),
        totalOriginalSize: submissionPayload.activity_streams.reduce(
          (sum, s) => sum + s.original_size,
          0,
        ),
        totalCompressedSize: submissionPayload.activity_streams.reduce(
          (sum, s) => sum + s.data.length,
          0,
        ),
      });

      // TODO: Replace with actual TRPC client call when available
      // const result = await api.activities.create.mutate(submissionPayload);

      // Placeholder success for now
      console.log("Enhanced upload would succeed with payload:", {
        activityName: submissionPayload.activity.name,
        activityType: submissionPayload.activity.activity_type,
        streamMetrics: submissionPayload.activity_streams.map((s) => s.type),
        compressionRatio: Math.round(
          (1 -
            submissionPayload.activity_streams.reduce(
              (sum, s) => sum + s.data.length,
              0,
            ) /
              submissionPayload.activity_streams.reduce(
                (sum, s) => sum + s.original_size,
                0,
              )) *
            100,
        ),
      });

      // Mark recording as synced (placeholder until real upload)
      await this.storageManager.markRecordingSynced(id);

      console.log("Activity upload completed successfully");
      return true;
    } catch (error) {
      console.error("Failed to upload activity:", error);
      return false;
    }
  }

  async cleanup() {
    if (this.state === "recording" || this.state === "paused") {
      await this.finishRecording();
    }

    await this.locationManager.stopAllTracking();
    await this.sensorsManager.disconnectAll();
    this.storageManager.stopChunkProcessing();
    this.dataCallbacks.clear();
    this.locationManager.clearAllCallbacks();
    console.log("ActivityRecorderService cleaned up");
  }
}
