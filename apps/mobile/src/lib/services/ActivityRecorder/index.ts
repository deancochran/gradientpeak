import {
  BLE_SERVICE_UUIDS,
  PublicActivityPlansRow,
  PublicActivityType,
  PublicPlannedActivitiesRow,
  PublicProfilesRow,
  Step,
} from "@repo/core";

import { activityRecordings, SelectActivityRecording } from "@/lib/db/schemas";
import { eq } from "drizzle-orm";
import { LocationManager } from "./location";
import {
  PermissionsManager,
  type PermissionState,
  type PermissionType,
} from "./permissions";
import { SensorReading, SensorsManager } from "./sensors";

import { localdb } from "@/lib/db";

import { AppState, AppStateStatus } from "react-native";
import { NotificationsManager } from "./notification";
import { PlanManager } from "./plan";
import { ChunkProcessor } from "./processor";

// ================================
// Plan Types
// ================================

export interface FlattenedStep extends Step {
  index: number;
  fromRepetition?: number;
}

export interface PlannedActivityProgress {
  state: "not_started" | "in_progress" | "finished";
  currentStepIndex: number;
  completedSteps: number;
  totalSteps: number;
  elapsedInStep: number;
  duration?: number;
  targets?: Step["targets"];
}

// ================================
// Recording Types
// ================================

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "finished";

export class ActivityRecorderService {
  // --- Recording session state ---
  public profile: PublicProfilesRow;
  public selectedActivityType: PublicActivityType = "indoor_bike_trainer";
  public state: RecordingState = "pending";
  public liveMetrics: Map<string, number> = new Map();
  public recording?: SelectActivityRecording;

  // AppState management
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: { remove: () => void };

  // --- Private state ---
  private lastTimestamp?: number;

  // --- Service Managers ---
  private chunkProcessor?: ChunkProcessor;
  public permissionsManager = new PermissionsManager();
  private locationManager = new LocationManager();
  private sensorsManager = new SensorsManager();
  private notificationsManager?: NotificationsManager;
  public planManager?: PlanManager;

  // --- Callbacks ---
  private changeCallbacks: Set<() => void> = new Set();

  constructor(profile: PublicProfilesRow) {
    this.profile = profile;
    this.permissionsManager.checkAll();

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
      this.handleSensorData(latlng);
      if (locationObj.coords.speed) {
        const speed: SensorReading = {
          metric: "speed",
          dataType: "float",
          value: locationObj.coords.speed * 3.6, // Convert m/s to km/h
          timestamp,
        };
        this.handleSensorData(speed);
      }
      if (locationObj.coords.altitude) {
        const altitude: SensorReading = {
          metric: "altitude",
          dataType: "float",
          value: locationObj.coords.altitude,
          timestamp,
        };
        this.handleSensorData(altitude);
      }
      if (locationObj.coords.heading) {
        const heading: SensorReading = {
          metric: "heading",
          dataType: "float",
          value: locationObj.coords.heading,
          timestamp,
        };
        this.handleSensorData(heading);
      }
    });
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        this.handleAppStateChange(nextState);
      },
    );
  }
  // ================================
  // App State
  // ================================

  private handleAppStateChange(nextState: AppStateStatus) {
    const prevState = this.appState;
    this.appState = nextState;

    // Entering background
    if (prevState === "active" && nextState.match(/inactive|background/)) {
      console.log("App backgrounded - maintaining services");
      // Services continue but we could reduce update frequency here
    }

    // Returning to foreground
    if (prevState.match(/inactive|background/) && nextState === "active") {
      console.log("App foregrounded - checking sensor states");
      this.reconnectDisconnectedSensors();
    }
  }

  // ================================
  // Change Notification System
  // ================================

  /**
   * Subscribe to ANY change in service state
   * This is what makes React components reactive
   */
  public subscribe(callback: () => void): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers that something changed
   * Call this after ANY state mutation
   */
  private notifyChange() {
    this.changeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.warn("Change callback error:", err);
      }
    });
  }

  // ================================
  // Permission Management
  // ================================

  getPermissionState(type: PermissionType): PermissionState | null {
    return this.permissionsManager.permissions[type] || null;
  }

  async ensurePermission(type: PermissionType): Promise<boolean> {
    const granted = await this.permissionsManager.ensure(type);
    this.permissionsManager.permissions[type] = {
      granted,
      canAskAgain: true,
      name: PermissionsManager.permissionNames[type],
      description: PermissionsManager.permissionDescriptions[type],
      loading: false,
    };
    return granted;
  }

  // ================================
  // Planned Activity Management
  // ================================

  public selectPlannedActivity(
    plannedActivity: PublicPlannedActivitiesRow & {
      activity_plan: PublicActivityPlansRow;
    },
  ) {
    this.planManager = new PlanManager(plannedActivity);
    this.selectedActivityType = plannedActivity.activity_plan.activity_type;

    this.notifyChange();
  }

  public clearPlannedActivity(activityType: PublicActivityType) {
    this.selectedActivityType = activityType;
    this.notifyChange();
  }

  public advanceStep() {
    if (!this.planManager) return;

    this.planManager.advanceStep();
    this.notifyChange();
  }

  // ================================
  // Recording Lifecycle
  // ================================

  async startRecording() {
    await localdb.delete(activityRecordings);

    const [recording] = await localdb
      .insert(activityRecordings)
      .values({
        profile: this.profile,
        startedAt: new Date().toISOString(),
        activityType: this.selectedActivityType,
        plannedActivity: this.planManager?.selectedPlannedActivity,
      })
      .returning();
    this.chunkProcessor = new ChunkProcessor(recording.id);
    this.chunkProcessor.start();
    this.recording = recording;
    this.state = "recording";

    this.notifyChange();

    await Promise.all([
      this.ensurePermission("location"),
      this.ensurePermission("location-background"),
      this.ensurePermission("bluetooth"),
    ]);

    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();

    const activityName =
      this.planManager?.selectedPlannedActivity.activity_plan.name ||
      this.selectedActivityType.replace(/_/g, " ");

    this.notificationsManager = new NotificationsManager(activityName);
    await this.notificationsManager.startForegroundService();
  }

  async pauseRecording() {
    if (this.state !== "recording") throw new Error("Not currently recording");
    if (!this.recording || !this.chunkProcessor)
      throw new Error("No active recording");

    this.state = "paused";
    this.notifyChange();

    this.chunkProcessor.stop();
    await this.chunkProcessor.flush();
  }

  async resumeRecording() {
    if (this.state !== "paused") throw new Error("Session not paused");
    if (!this.recording || !this.chunkProcessor)
      throw new Error("No active recording");

    this.state = "recording";
    this.notifyChange();
    this.chunkProcessor.start();
  }

  async finishRecording() {
    if (
      (this.state !== "recording" && this.state !== "paused") ||
      !this.chunkProcessor
    )
      throw new Error("Cannot finish non-active session");
    if (!this.recording) throw new Error("No active recording");

    this.chunkProcessor.stop();
    await this.chunkProcessor.flush();

    await localdb
      .update(activityRecordings)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(activityRecordings.id, this.recording.id));

    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }
    this.state = "finished";
    this.notifyChange();
  }

  // ================================
  // Plan Progress Internal Logic
  // ================================

  private updatePlanProgress(deltaMs: number) {
    if (!this.planManager) return;
    this.planManager.updatePlanProgress(deltaMs);

    this.notifyChange();
  }

  // ================================
  // Sensor Data Handling
  // ================================

  private handleSensorData(reading: SensorReading) {
    if (!this.recording || this.state !== "recording" || !this.chunkProcessor)
      return;

    const currentTimestamp = reading.timestamp || Date.now();
    const deltaMs = this.lastTimestamp
      ? currentTimestamp - this.lastTimestamp
      : 0;
    this.lastTimestamp = currentTimestamp;

    if (deltaMs > 0) {
      this.updatePlanProgress(deltaMs);
    }

    // Add to chunk processor
    this.chunkProcessor.addReading(reading);

    // Update live metrics - create new Map for React reactivity
    if (typeof reading.value === "number") {
      this.liveMetrics = new Map(this.liveMetrics);
      this.liveMetrics.set(reading.metric, reading.value);

      // Update foreground notification with key metrics
      if (
        ["heartrate", "power"].includes(reading.metric) &&
        this.notificationsManager
      ) {
        this.notificationsManager
          .update({
            elapsedInStep: this.planManager?.planProgress?.elapsedInStep ?? 0,
            heartRate: this.liveMetrics.get("heartRate"),
            power: this.liveMetrics.get("power"),
          })
          .catch(console.error);
      }

      this.notifyChange(); // Notify after metrics update
    }
  }

  // ================================
  // Buffer Status
  // ================================

  getBufferStatus(): Record<string, number> {
    if (!this.chunkProcessor) return {};
    return this.chunkProcessor.getBufferStatus();
  }

  // ================================
  // BLE Device Management
  // ================================

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
    const result = await this.sensorsManager.connectSensor(deviceId);
    this.notifyChange();
    return result;
  }

  async disconnectDevice(deviceId: string) {
    const result = await this.sensorsManager.disconnectSensor(deviceId);
    this.notifyChange();
    return result;
  }

  getConnectedSensors() {
    return this.sensorsManager.getConnectedSensors();
  }

  subscribeConnection(cb: (sensor: any) => void) {
    return this.sensorsManager.subscribeConnection((sensor) => {
      cb(sensor);
      this.notifyChange(); // Notify when connection state changes
    });
  }

  private async reconnectDisconnectedSensors() {
    const sensors = this.sensorsManager.getConnectedSensors();
    for (const sensor of sensors) {
      if (sensor.connectionState === "disconnected") {
        console.log(`Reconnecting ${sensor.name} after foreground`);
        await this.sensorsManager.connectSensor(sensor.id);
      }
    }
  }

  // ================================
  // Cleanup
  // ================================

  async cleanup() {
    if (this.state === "recording" || this.state === "paused") {
      await this.finishRecording();
    }
    this.appStateSubscription?.remove();
    if (this.chunkProcessor) {
      this.chunkProcessor.stop();
    }
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }
    await this.locationManager.stopAllTracking();
    await this.sensorsManager.disconnectAll();
    this.changeCallbacks.clear();
    this.locationManager.clearAllCallbacks();
    console.log("ActivityRecorderService cleaned up");
  }
}
