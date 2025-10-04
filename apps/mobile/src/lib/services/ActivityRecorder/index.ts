import {
  PublicActivityType,
  PublicProfilesRow,
  RecordingServiceActivityPlan,
  Step,
} from "@repo/core";

import { activityRecordings, SelectActivityRecording } from "@/lib/db/schemas";
import { eq } from "drizzle-orm";
import { LocationManager } from "./location";
import { NotificationsManager } from "./notification";
import {
  PermissionsManager,
  type PermissionState,
  type PermissionType,
} from "./permissions";
import { SensorReading, SensorsManager } from "./sensors";

import { localdb } from "@/lib/db";

import { LocationObject } from "expo-location";
import { AppState, AppStateStatus } from "react-native";
import { Device } from "react-native-ble-plx";
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

// ================================
// Activity Recorder Service
// ================================

export class ActivityRecorderService {
  // State
  public state: RecordingState = "pending";
  public selectedActivityType: PublicActivityType = "indoor_bike_trainer";
  public liveMetrics: Map<string, number> = new Map();
  public recording?: SelectActivityRecording;

  // Managers
  private locationManager = new LocationManager();
  private sensorsManager = new SensorsManager();
  private chunkProcessor?: ChunkProcessor;
  public planManager?: PlanManager;
  public permissionsManager = new PermissionsManager();
  private notificationsManager?: NotificationsManager;

  // App state management
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: { remove: () => void };

  // Timing for plan progress
  private lastTimestamp?: number;

  // Subscribers
  private subscribers = new Set<() => void>();

  // Profile
  private profile: PublicProfilesRow;

  constructor(profile: PublicProfilesRow) {
    this.profile = profile;

    // Initialize permissions check
    this.permissionsManager.checkAll();

    // Setup sensor listeners
    this.sensorsManager.subscribe((reading) => this.handleSensorData(reading));

    // Setup location listeners
    this.locationManager.addCallback((location) =>
      this.handleLocationData(location),
    );

    // Setup app state listener
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => this.handleAppStateChange(nextState),
    );
  }

  // ================================
  // Subscription (for Context)
  // ================================

  public subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb());
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
    this.notify();
    return granted;
  }

  // ================================
  // App State Management
  // ================================

  private handleAppStateChange(nextState: AppStateStatus) {
    const prevState = this.appState;
    this.appState = nextState;

    // Returning to foreground - reconnect sensors
    if (prevState.match(/inactive|background/) && nextState === "active") {
      console.log("App foregrounded - reconnecting sensors");
      this.reconnectDisconnectedSensors();
    }
  }

  private async reconnectDisconnectedSensors() {
    const sensors = this.sensorsManager.getConnectedSensors();
    for (const sensor of sensors) {
      if (sensor.connectionState === "disconnected") {
        console.log(`Reconnecting ${sensor.name}`);
        await this.sensorsManager.connectSensor(sensor.id);
      }
    }
  }

  // ================================
  // Recording Lifecycle
  // ================================

  async startRecording() {
    // Clean up any stale recordings
    await localdb.delete(activityRecordings);

    // Request all necessary permissions
    await Promise.all([
      this.ensurePermission("location"),
      this.ensurePermission("location-background"),
      this.ensurePermission("bluetooth"),
    ]);

    // Create recording
    const [recording] = await localdb
      .insert(activityRecordings)
      .values({
        profile: this.profile,
        startedAt: new Date().toISOString(),
        activityType: this.selectedActivityType,
        activityPlan: this.planManager?.selectedActivityPlan,
      })
      .returning();

    this.recording = recording;
    this.chunkProcessor = new ChunkProcessor(recording.id);
    this.chunkProcessor.start();
    this.state = "recording";

    // Start location tracking (both foreground and background)
    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();

    // Start foreground service notification
    const activityName =
      this.planManager?.selectedActivityPlan.name ||
      this.selectedActivityType.replace(/_/g, " ");
    this.notificationsManager = new NotificationsManager(activityName);
    await this.notificationsManager.startForegroundService();

    this.notify();
  }

  async pauseRecording() {
    if (this.state !== "recording") throw new Error("Not recording");

    this.state = "paused";
    this.chunkProcessor?.stop();
    await this.chunkProcessor?.flush();

    this.notify();
  }

  async resumeRecording() {
    if (this.state !== "paused") throw new Error("Not paused");

    this.state = "recording";
    this.chunkProcessor?.start();

    this.notify();
  }

  async finishRecording() {
    if (!this.recording) throw new Error("No active recording");

    this.chunkProcessor?.stop();
    await this.chunkProcessor?.flush();

    await localdb
      .update(activityRecordings)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(activityRecordings.id, this.recording.id));

    // Stop foreground service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }

    this.state = "finished";
    this.notify();
  }

  // ================================
  // Activity Selection
  // ================================

  selectUnplannedActivity(type: PublicActivityType) {
    this.selectedActivityType = type;
    this.planManager = undefined;
    this.notify();
  }

  selectPlannedActivity(
    plan: RecordingServiceActivityPlan,
    plannedId?: string,
  ) {
    this.planManager = new PlanManager(plan, plannedId);
    this.selectedActivityType = plan.activity_type;
    this.notify();
  }

  advanceStep() {
    if (!this.planManager) return;
    this.planManager.advanceStep();
    this.notify();
  }

  // ================================
  // Device Management
  // ================================

  async scanForDevices(): Promise<Device[]> {
    return await this.sensorsManager.scan();
  }

  async connectToDevice(deviceId: string) {
    await this.sensorsManager.connectSensor(deviceId);
    this.notify();
  }

  async disconnectDevice(deviceId: string) {
    await this.sensorsManager.disconnectSensor(deviceId);
    this.notify();
  }

  getConnectedSensors() {
    return this.sensorsManager.getConnectedSensors();
  }

  subscribeConnection(cb: (sensor: any) => void) {
    return this.sensorsManager.subscribeConnection((sensor) => {
      cb(sensor);
      this.notify();
    });
  }

  // ================================
  // Buffer Status
  // ================================

  getBufferStatus(): Record<string, number> {
    if (!this.chunkProcessor) return {};
    return this.chunkProcessor.getBufferStatus();
  }

  // ================================
  // Data Handling (Private)
  // ================================

  private handleSensorData(reading: SensorReading) {
    if (this.state !== "recording" || !this.chunkProcessor) return;

    // Track timing for plan progress
    const currentTimestamp = reading.timestamp || Date.now();
    const deltaMs = this.lastTimestamp
      ? currentTimestamp - this.lastTimestamp
      : 0;
    this.lastTimestamp = currentTimestamp;

    // Update plan progress
    if (deltaMs > 0 && this.planManager) {
      this.planManager.updatePlanProgress(deltaMs);
    }

    // Store in chunk processor
    this.chunkProcessor.addReading(reading);

    // Update live metrics
    if (typeof reading.value === "number") {
      this.liveMetrics.set(reading.metric, reading.value);

      // Update notification with key metrics
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

      this.notify();
    }
  }

  private handleLocationData(location: LocationObject) {
    const timestamp = location.timestamp || Date.now();

    // Convert location to sensor readings
    const readings: SensorReading[] = [
      {
        metric: "latlng",
        dataType: "latlng",
        value: [location.coords.latitude, location.coords.longitude],
        timestamp,
      },
    ];

    // Add optional GPS metrics
    if (location.coords.speed) {
      readings.push({
        metric: "speed",
        dataType: "float",
        value: location.coords.speed * 3.6, // m/s to km/h
        timestamp,
      });
    }

    if (location.coords.altitude) {
      readings.push({
        metric: "altitude",
        dataType: "float",
        value: location.coords.altitude,
        timestamp,
      });
    }

    if (location.coords.heading) {
      readings.push({
        metric: "heading",
        dataType: "float",
        value: location.coords.heading,
        timestamp,
      });
    }

    readings.forEach((r) => this.handleSensorData(r));
  }

  // ================================
  // Cleanup
  // ================================

  async cleanup() {
    if (this.state === "recording" || this.state === "paused") {
      await this.finishRecording();
    }

    // Remove app state listener
    this.appStateSubscription?.remove();

    // Stop all services
    await this.locationManager.stopAllTracking();
    await this.sensorsManager.disconnectAll();
    this.chunkProcessor?.stop();

    // Stop foreground service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }

    // Clear callbacks
    this.subscribers.clear();
    this.locationManager.clearAllCallbacks();

    console.log("ActivityRecorderService cleaned up");
  }
}
