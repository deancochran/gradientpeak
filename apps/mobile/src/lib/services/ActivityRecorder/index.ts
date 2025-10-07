/**
 * ActivityRecorderService - Simplified
 *
 * Core responsibilities:
 * 1. Coordinate recording lifecycle (start/pause/resume/finish)
 * 2. Manage sub-systems (sensors, location, metrics, plan)
 * 3. Emit 4 core events for UI updates
 *
 * Key simplifications:
 * - Single event system (EventEmitter only)
 * - No redundant state (removed liveMetrics Map)
 * - Public managers (no method forwarding)
 * - 4 core events instead of 12+
 */

import {
  FlattenedStep,
  flattenPlanSteps,
  getDurationMs,
  PublicActivityType,
  PublicProfilesRow,
  RecordingServiceActivityPlan,
} from "@repo/core";

import { activityRecordings, SelectActivityRecording } from "@/lib/db/schemas";
import { eq } from "drizzle-orm";
import { LiveMetricsManager } from "./LiveMetricsManager";
import { LocationManager } from "./location";
import { NotificationsManager } from "./notification";
import {
  PermissionsManager,
  type PermissionState,
  type PermissionType,
} from "./permissions";
import { SensorsManager } from "./sensors";
import { SensorReading } from "./types";

import { localdb } from "@/lib/db";

import { EventEmitter } from "events";
import { LocationObject } from "expo-location";
import { AppState, AppStateStatus } from "react-native";

// ================================
// Types
// ================================

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "finished";

// ================================
// Core Events (minimal, focused)
// ================================
export interface ServiceEvents {
  // Recording state changed (pending/ready/recording/paused/finished)
  stateChanged: (state: RecordingState) => void;

  // Activity type or plan was selected/changed
  activitySelected: (type: PublicActivityType, planName?: string) => void;

  // Sensors connected/disconnected
  sensorsChanged: (sensors: any[]) => void;

  // Plan step changed (emits new step index)
  stepChanged: (stepIndex: number) => void;

  // Plan cleared
  planCleared: () => void;
}

// ================================
// Activity Recorder Service
// ================================

export class ActivityRecorderService extends EventEmitter {
  // === Public State ===
  public state: RecordingState = "pending";
  public selectedActivityType: PublicActivityType = "indoor_bike_trainer";
  public recording?: SelectActivityRecording;

  // === Public Managers (direct access - no forwarding) ===
  public readonly liveMetricsManager: LiveMetricsManager;
  public readonly locationManager: LocationManager;
  public readonly sensorsManager: SensorsManager;
  public readonly permissionsManager: PermissionsManager;

  // === Plan State (minimal tracking) ===
  private _plan?: RecordingServiceActivityPlan;
  private _plannedActivityId?: string;
  private _steps: FlattenedStep[] = [];
  private _stepIndex: number = 0;
  private _stepElapsed: number = 0;
  private _lastStepUpdate: number = 0;

  // === Private Managers ===
  private notificationsManager?: NotificationsManager;

  // === App State Management ===
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: { remove: () => void };

  // === Timing ===
  private startTime?: number;
  private pausedTime: number = 0;
  private lastPauseTime?: number;
  private elapsedTimeInterval?: number;

  // === Profile ===
  private profile: PublicProfilesRow;

  constructor(profile: PublicProfilesRow) {
    super();
    // Increase max listeners to prevent warning with multiple carousel cards
    // Each carousel card (x3 for infinite scroll) may add multiple event listeners
    this.setMaxListeners(30);
    this.profile = profile;

    // Initialize managers
    this.liveMetricsManager = new LiveMetricsManager(profile);
    this.locationManager = new LocationManager();
    this.sensorsManager = new SensorsManager();
    this.permissionsManager = new PermissionsManager();

    // Check permissions on initialization
    this.permissionsManager.checkAll();

    // Setup sensor data listeners
    this.sensorsManager.subscribe((reading) => this.handleSensorData(reading));

    // Setup sensor connection listeners
    this.sensorsManager.subscribeConnection((sensor) => {
      console.log(
        "[Service] Sensor connection changed:",
        sensor.name,
        sensor.connectionState,
      );
      this.emit("sensorsChanged", this.sensorsManager.getConnectedSensors());
    });

    // Setup location listeners
    this.locationManager.addCallback((location) =>
      this.handleLocationData(location),
    );

    // Setup permission update listeners
    this.permissionsManager.on("permissionUpdate", (data) => {
      console.log(
        "[Service] Permission updated:",
        data.type,
        data.permission.granted,
      );
      this.emit("permissionUpdate", data);
    });

    // Setup app state listener
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => this.handleAppStateChange(nextState),
    );

    console.log("[ActivityRecorderService] Initialized", {
      profileId: profile.id,
    });
  }

  // ================================
  // Permissions
  // ================================

  getPermissionState(type: PermissionType): PermissionState | null {
    return this.permissionsManager.permissions[type] || null;
  }

  async checkPermissions(): Promise<void> {
    await this.permissionsManager.checkAll();
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
  // App State Management
  // ================================

  private handleAppStateChange(nextState: AppStateStatus) {
    const prevState = this.appState;
    this.appState = nextState;

    // Returning to foreground - reconnect sensors
    if (prevState.match(/inactive|background/) && nextState === "active") {
      console.log("[Service] App foregrounded - reconnecting sensors");
      this.reconnectDisconnectedSensors();
    }
  }

  private async reconnectDisconnectedSensors() {
    const sensors = this.sensorsManager.getConnectedSensors();
    for (const sensor of sensors) {
      if (sensor.connectionState === "disconnected") {
        console.log(`[Service] Reconnecting ${sensor.name}`);
        await this.sensorsManager.connectSensor(sensor.id);
      }
    }
  }

  // ================================
  // Plan Getters (computed on-demand)
  // ================================

  get hasPlan(): boolean {
    return this._plan !== undefined;
  }

  get planStepIndex(): number {
    return this._stepIndex;
  }

  get planStepElapsed(): number {
    return this._stepElapsed;
  }

  get planStepCount(): number {
    return this._steps.length;
  }

  get isPlanActive(): boolean {
    return this.hasPlan && this.state === "recording" && !this.isPlanFinished;
  }

  get isPlanFinished(): boolean {
    return this.hasPlan && this._stepIndex >= this._steps.length;
  }

  get isLastPlanStep(): boolean {
    return this._stepIndex >= this._steps.length - 1;
  }

  getPlanStep(index: number): FlattenedStep | undefined {
    return this._steps[index];
  }

  get currentPlanStep(): FlattenedStep | undefined {
    return this._steps[this._stepIndex];
  }

  get currentStepDurationMs(): number {
    const step = this.currentPlanStep;
    if (!step || !step.duration || step.duration === "untilFinished") return 0;
    return getDurationMs(step.duration);
  }

  get canManuallyAdvanceStep(): boolean {
    const step = this.currentPlanStep;
    return step?.duration === "untilFinished" || false;
  }

  // ================================
  // Plan Actions
  // ================================

  selectPlan(plan: RecordingServiceActivityPlan, plannedId?: string): void {
    console.log("[Service] Selected planned activity:", plan.name);

    this._plan = plan;
    this._plannedActivityId = plannedId;
    this._steps = flattenPlanSteps(plan.structure.steps);
    this._stepIndex = 0;
    this._stepElapsed = 0;
    this._lastStepUpdate = 0;
    this.selectedActivityType = plan.activity_type;

    this.emit("activitySelected", plan.activity_type, plan.name);
    this.emit("stepChanged", 0);
  }

  clearPlan(): void {
    console.log("[Service] Clearing plan");

    this._plan = undefined;
    this._plannedActivityId = undefined;
    this._steps = [];
    this._stepIndex = 0;
    this._stepElapsed = 0;
    this._lastStepUpdate = 0;

    this.emit("planCleared");
  }

  advanceStep(): void {
    if (!this.hasPlan || this.isLastPlanStep) {
      console.log("[Service] Cannot advance step");
      return;
    }

    console.log(
      `[Service] Advancing from step ${this._stepIndex} to ${this._stepIndex + 1}`,
    );

    this._stepIndex++;
    this._stepElapsed = 0;
    this._lastStepUpdate = Date.now();

    this.emit("stepChanged", this._stepIndex);

    // Check if plan is now finished
    if (this.isPlanFinished) {
      console.log("[Service] Plan finished!");
    }
  }

  private updatePlanProgress(deltaMs: number): void {
    if (!this.isPlanActive) return;

    const step = this.currentPlanStep;
    if (!step) return;

    // Only update elapsed for timed steps
    if (step.duration === "untilFinished") return;

    this._stepElapsed += deltaMs;

    // Auto-advance if duration exceeded
    const duration = this.currentStepDurationMs;
    if (duration > 0 && this._stepElapsed >= duration) {
      this.advanceStep();
    }
  }

  // ================================
  // Recording Lifecycle
  // ================================

  async startRecording() {
    console.log("[Service] Starting recording");

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
        activityPlan: this._plan,
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
    this._lastStepUpdate = Date.now();
    this.startElapsedTimeUpdates();

    // Start location tracking
    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();

    // Start foreground service notification
    const activityName =
      this._plan?.name || this.selectedActivityType.replace(/_/g, " ");
    this.notificationsManager = new NotificationsManager(activityName);
    await this.notificationsManager.startForegroundService();

    // Emit initial sensor state
    this.emit("sensorsChanged", this.sensorsManager.getConnectedSensors());
    this.emit("stateChanged", this.state);
    console.log("[Service] Recording started successfully");
  }

  async pauseRecording() {
    if (this.state !== "recording") {
      throw new Error("Cannot pause - not recording");
    }

    console.log("[Service] Pausing recording");

    const pauseTimestamp = Date.now();
    this.state = "paused";
    this.lastPauseTime = pauseTimestamp;

    // Pause LiveMetricsManager
    this.liveMetricsManager.pauseRecording();

    this.stopElapsedTimeUpdates();

    this.emit("stateChanged", this.state);
  }

  async resumeRecording() {
    if (this.state !== "paused") {
      throw new Error("Cannot resume - not paused");
    }

    console.log("[Service] Resuming recording");

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

    this.emit("stateChanged", this.state);
  }

  async finishRecording() {
    if (!this.recording) {
      throw new Error("No active recording to finish");
    }

    console.log("[Service] Finishing recording");

    // Finish LiveMetricsManager first (includes final DB write)
    await this.liveMetricsManager.finishRecording();

    // Update recording end time
    await localdb
      .update(activityRecordings)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(activityRecordings.id, this.recording.id));

    // Stop foreground service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }

    this.state = "finished";
    this.emit("stateChanged", this.state);
    console.log("[Service] Recording finished successfully");
  }

  // ================================
  // Activity Selection
  // ================================

  selectUnplannedActivity(type: PublicActivityType) {
    console.log("[Service] Selected unplanned activity:", type);
    this.selectedActivityType = type;
    this.clearPlan();
    this.emit("activitySelected", type);
  }

  // ================================
  // Data Handling
  // ================================

  private handleSensorData(reading: SensorReading) {
    if (this.state !== "recording") return;

    // Send to LiveMetricsManager for processing
    this.liveMetricsManager.ingestSensorData(reading);

    // Update plan progress based on sensor data timing
    if (this.hasPlan && reading.timestamp) {
      const now = reading.timestamp;
      const deltaMs = this._lastStepUpdate ? now - this._lastStepUpdate : 0;
      if (deltaMs > 0) {
        this.updatePlanProgress(deltaMs);
        this._lastStepUpdate = now;
      }
    }

    // Update notification with key metrics
    if (
      ["heartrate", "power"].includes(reading.metric) &&
      this.notificationsManager &&
      typeof reading.value === "number"
    ) {
      const metrics = this.liveMetricsManager.getMetrics();
      this.notificationsManager
        .update({
          elapsedInStep: this._stepElapsed,
          heartRate: metrics.avgHeartRate || undefined,
          power: metrics.avgPower || undefined,
        })
        .catch(console.error);
    }
  }

  private handleLocationData(location: LocationObject) {
    if (this.state !== "recording" && this.state !== "paused") return;

    const timestamp = location.timestamp || Date.now();

    // Send to LiveMetricsManager for processing
    this.liveMetricsManager.ingestLocationData({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude || undefined,
      accuracy: location.coords.accuracy || undefined,
      timestamp: timestamp,
    });
  }

  // ================================
  // Timing Methods
  // ================================

  private startElapsedTimeUpdates() {
    this.stopElapsedTimeUpdates();

    // Update elapsed time every second
    this.elapsedTimeInterval = setInterval(() => {
      this.updateElapsedTime();
    }, 1000) as unknown as number;

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

    // Update plan progress (only when recording, not paused)
    if (this.hasPlan && this.state === "recording") {
      this.updatePlanProgress(1000);
    }
  }

  public getElapsedTime(): number {
    const metrics = this.liveMetricsManager.getMetrics();
    return metrics.elapsedTime;
  }

  // ================================
  // Cleanup
  // ================================

  async cleanup() {
    console.log("[Service] Cleaning up");

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

    // Clear plan state
    this.clearPlan();

    // Clear all event listeners
    this.removeAllListeners();

    console.log("[Service] Cleanup complete");
  }
}
