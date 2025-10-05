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
import { LiveMetricsManager } from "./LiveMetricsManager";

import { localdb } from "@/lib/db";

import { LocationObject } from "expo-location";
import { AppState, AppStateStatus } from "react-native";
import { Device } from "react-native-ble-plx";
import { PlanManager } from "./plan";

import { EventEmitter } from "events";

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

export class ActivityRecorderService extends EventEmitter {
  // State
  public state: RecordingState = "pending";
  public selectedActivityType: PublicActivityType = "indoor_bike_trainer";
  public liveMetrics: Map<string, number> = new Map();
  public liveMetricsManager: LiveMetricsManager;
  public recording?: SelectActivityRecording;

  // Managers
  private locationManager = new LocationManager();
  private sensorsManager = new SensorsManager();
  public planManager?: PlanManager;
  public permissionsManager = new PermissionsManager();
  private notificationsManager?: NotificationsManager;

  // App state management
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: { remove: () => void };

  // Timing for plan progress
  private lastTimestamp?: number;

  // Activity timing
  private startTime?: number;
  private pausedTime: number = 0;
  private lastPauseTime?: number;
  private elapsedTimeInterval?: NodeJS.Timeout;

  // Distance tracking
  private totalDistance: number = 0;
  private lastLocation?: LocationObject;

  // Subscribers
  private subscribers = new Set<() => void>();

  // Profile
  private profile: PublicProfilesRow;

  constructor(profile: PublicProfilesRow) {
    super();
    this.profile = profile;

    // Initialize LiveMetricsManager
    this.liveMetricsManager = new LiveMetricsManager(profile);

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

    // Setup LiveMetricsManager event forwarding
    this.setupLiveMetricsEventForwarding();
  }

  private setupLiveMetricsEventForwarding(): void {
    // Forward LiveMetricsManager events to external listeners
    this.liveMetricsManager.on("metricsUpdate", (updateEvent) => {
      this.emit("liveMetricsUpdate", updateEvent);

      // Update live metrics map for backward compatibility
      const metrics = updateEvent.metrics;
      this.liveMetrics.set("elapsedTime", metrics.elapsedTime);
      this.liveMetrics.set("distance", metrics.distance);
      this.liveMetrics.set("avgPower", metrics.avgPower);
      this.liveMetrics.set("avgHeartRate", metrics.avgHeartRate);
      this.liveMetrics.set("calories", metrics.calories);
    });

    this.liveMetricsManager.on("persistenceError", (error) => {
      this.emit("liveMetricsError", error);
    });
  }

  // ================================
  // Event Emission (EventEmitter Pattern)
  // ================================

  public subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb());
  }

  private emitStateChange() {
    this.emit("stateChange", this.state);
  }

  private emitActivityTypeChange() {
    this.emit("activityTypeChange", this.selectedActivityType);
  }

  private emitMetricUpdate(metric: string, value: number) {
    this.emit("metricUpdate", { metric, value });
    this.emit(`metric:${metric}`, value);
  }

  private emitSensorUpdate() {
    const sensors = this.sensorsManager.getConnectedSensors();
    this.emit("sensorsUpdate", sensors);
    this.emit("sensorCountUpdate", sensors.length);
  }

  private emitPermissionUpdate(type: string) {
    const permission = this.permissionsManager.permissions[type];
    this.emit("permissionUpdate", { type, permission });
    this.emit(`permission:${type}`, permission);
  }

  private emitPlanProgressUpdate() {
    if (this.planManager) {
      this.emit("planProgressUpdate", this.planManager.planProgress);
    }
  }

  // ================================
  // Permissions
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
    this.emitPermissionUpdate(type);
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
    this.state = "recording";

    // Start LiveMetricsManager with recording ID
    this.liveMetricsManager.startRecording(recording.id);

    // Initialize timing
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.lastPauseTime = undefined;
    this.totalDistance = 0;
    this.lastLocation = undefined;
    this.startElapsedTimeUpdates();

    // Start location tracking (both foreground and background)
    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();

    // Start foreground service notification
    const activityName =
      this.planManager?.selectedActivityPlan.name ||
      this.selectedActivityType.replace(/_/g, " ");
    this.notificationsManager = new NotificationsManager(activityName);
    await this.notificationsManager.startForegroundService();

    this.emitStateChange();
    this.notify();
  }

  async pauseRecording() {
    if (this.state !== "recording") throw new Error("Not recording");

    const pauseTimestamp = Date.now();
    this.state = "paused";
    this.lastPauseTime = pauseTimestamp;

    // Pause LiveMetricsManager
    this.liveMetricsManager.pauseRecording();

    this.stopElapsedTimeUpdates();

    this.emitStateChange();
    this.notify();
  }

  async resumeRecording() {
    if (this.state !== "paused") throw new Error("Not paused");

    const resumeTimestamp = Date.now();
    this.state = "recording";

    // Resume LiveMetricsManager
    this.liveMetricsManager.resumeRecording();

    // Update paused time accumulator
    if (this.lastPauseTime) {
      const pauseDuration = resumeTimestamp - this.lastPauseTime;
      this.pausedTime += pauseDuration;
      this.lastPauseTime = undefined;
    }

    this.startElapsedTimeUpdates();

    this.emitStateChange();
    this.notify();
  }

  async finishRecording() {
    if (!this.recording) throw new Error("No active recording");

    // Finish LiveMetricsManager first (includes final DB write)
    await this.liveMetricsManager.finishRecording();

    await localdb
      .update(activityRecordings)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(activityRecordings.id, this.recording.id));

    // Stop foreground service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }

    this.state = "finished";
    this.emitStateChange();
    this.notify();
  }

  // ================================
  // Reset Service for New Activity
  // ================================

  // ================================
  // Activity Selection
  // ================================

  selectUnplannedActivity(type: PublicActivityType) {
    this.selectedActivityType = type;
    this.planManager = undefined;
    this.emitActivityTypeChange();
    this.notify();
  }

  selectPlannedActivity(
    plan: RecordingServiceActivityPlan,
    plannedId?: string,
  ) {
    this.planManager = new PlanManager(plan, plannedId);
    this.selectedActivityType = plan.activity_type;
    this.emitActivityTypeChange();
    this.emitPlanProgressUpdate();
    this.notify();
  }

  advanceStep() {
    if (!this.planManager) return;
    this.planManager.advanceStep();
    this.emitPlanProgressUpdate();
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
    this.emitSensorUpdate();
    this.notify();
  }

  async disconnectDevice(deviceId: string) {
    await this.sensorsManager.disconnectSensor(deviceId);
    this.emitSensorUpdate();
    this.notify();
  }

  getConnectedSensors() {
    return this.sensorsManager.getConnectedSensors();
  }

  subscribeConnection(cb: (sensor: any) => void) {
    return this.sensorsManager.subscribeConnection((sensor) => {
      cb(sensor);
      this.emitSensorUpdate();
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
    if (this.state !== "recording") return;

    // Track timing for plan progress
    const currentTimestamp = reading.timestamp || Date.now();
    const deltaMs = this.lastTimestamp
      ? currentTimestamp - this.lastTimestamp
      : 0;
    this.lastTimestamp = currentTimestamp;

    // Update plan progress
    if (deltaMs > 0 && this.planManager) {
      this.planManager.updatePlanProgress(deltaMs);
      this.emitPlanProgressUpdate();
    }

    // Send to LiveMetricsManager - it handles both buffer and accumulator
    this.liveMetricsManager.ingestSensorData({
      metric: reading.metric,
      value: reading.value,
      timestamp: reading.timestamp,
      metadata: reading.metadata,
    });

    // Update legacy live metrics map for compatibility
    if (typeof reading.value === "number") {
      const currentValue = this.liveMetrics.get(reading.metric);
      if (currentValue !== reading.value) {
        this.liveMetrics.set(reading.metric, reading.value);
        this.emitMetricUpdate(reading.metric, reading.value);

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
  }

  private handleLocationData(location: LocationObject) {
    if (this.state !== "recording" && this.state !== "paused") return;

    const timestamp = location.timestamp || Date.now();

    // Send to LiveMetricsManager - it handles both calculations and persistence
    this.liveMetricsManager.ingestLocationData({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude || undefined,
      accuracy: location.coords.accuracy || undefined,
      timestamp: timestamp,
    });

    // Update individual lat/lng in live metrics for UI display
    const currentLat = this.liveMetrics.get("latitude");
    const currentLng = this.liveMetrics.get("longitude");

    if (
      currentLat !== location.coords.latitude ||
      currentLng !== location.coords.longitude
    ) {
      this.liveMetrics.set("latitude", location.coords.latitude);
      this.liveMetrics.set("longitude", location.coords.longitude);
      this.emitMetricUpdate("latitude", location.coords.latitude);
      this.emitMetricUpdate("longitude", location.coords.longitude);
    }

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
      const speedKmh = location.coords.speed * 3.6; // m/s to km/h
      readings.push({
        metric: "speed",
        dataType: "float",
        value: speedKmh,
        timestamp,
      });
      this.liveMetrics.set("speed", speedKmh);
      this.emitMetricUpdate("speed", speedKmh);
    }

    if (location.coords.altitude) {
      readings.push({
        metric: "altitude",
        dataType: "float",
        value: location.coords.altitude,
        timestamp,
      });
      this.liveMetrics.set("altitude", location.coords.altitude);
      this.emitMetricUpdate("altitude", location.coords.altitude);
    }

    if (location.coords.heading) {
      readings.push({
        metric: "heading",
        dataType: "float",
        value: location.coords.heading,
        timestamp,
      });
      this.liveMetrics.set("heading", location.coords.heading);
      this.emitMetricUpdate("heading", location.coords.heading);
    }

    readings.forEach((r) => this.handleSensorData(r));
  }

  // ================================
  // Timing Methods
  // ================================

  private startElapsedTimeUpdates() {
    this.stopElapsedTimeUpdates(); // Clear any existing interval

    // Update elapsed time every second
    this.elapsedTimeInterval = setInterval(() => {
      this.updateElapsedTime();
    }, 1000);

    // Initial update
    this.updateElapsedTime();
  }

  private stopElapsedTimeUpdates() {
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
      this.elapsedTimeInterval = undefined;
    }
  }

  private updateElapsedTime() {
    if (!this.startTime) return;

    const now = Date.now();
    let elapsedMs: number;

    if (this.state === "paused" && this.lastPauseTime) {
      // When paused, calculate elapsed time up to pause
      elapsedMs = this.lastPauseTime - this.startTime - this.pausedTime;
    } else {
      // When recording, calculate current elapsed time
      elapsedMs = now - this.startTime - this.pausedTime;
    }

    // Convert to seconds and ensure positive
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

    // Only update if the elapsed time changed (avoid unnecessary updates)
    const currentElapsed = this.liveMetrics.get("elapsedTime");
    if (currentElapsed !== elapsedSeconds) {
      this.liveMetrics.set("elapsedTime", elapsedSeconds);
      this.emitMetricUpdate("elapsedTime", elapsedSeconds);
      // Notify subscribers only when time actually changes
      this.notify();
    }
  }

  public getElapsedTime(): number {
    return this.liveMetrics.get("elapsedTime") || 0;
  }

  // Calculate distance between two GPS coordinates using Haversine formula
  private calculateDistance(coord1: any, coord2: any): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
    const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.latitude * Math.PI) / 180) *
        Math.cos((coord2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  // ================================
  // Cleanup
  // ================================

  async cleanup() {
    console.log("Cleaning up ActivityRecorderService instance");

    // Stop any active recording
    if (this.state === "recording" || this.state === "paused") {
      await this.finishRecording();
    }

    // Cleanup LiveMetricsManager
    if (this.liveMetricsManager) {
      await this.liveMetricsManager.cleanup();
    }

    // Stop all background processes
    this.stopElapsedTimeUpdates();
    this.appStateSubscription?.remove();

    // Cleanup managers
    await this.locationManager.cleanup();
    await this.sensorsManager.disconnectAll();

    // Stop foreground service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }

    // Cleanup plan manager
    if (this.planManager) {
      this.planManager.cleanup();
    }

    // Clear all event listeners
    this.removeAllListeners();

    console.log(
      "ActivityRecorderService instance cleaned up and ready for deallocation",
    );
  }
}
