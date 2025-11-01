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
import {
  type AllPermissionsStatus,
  areAllPermissionsGranted,
  checkAllPermissions,
} from "../permissions-check";
import { LiveMetricsManager } from "./LiveMetricsManager";
import { LocationManager } from "./location";
import { NotificationsManager } from "./notification";
import { SensorsManager } from "./sensors";
import { SensorReading } from "./types";

import { localdb } from "@/lib/db";

import { EventEmitter } from "expo-modules-core";
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

export interface StepProgress {
  movingTime: number;
  duration: number;
  progress: number;
  requiresManualAdvance: boolean;
  canAdvance: boolean;
}

export interface StepInfo {
  index: number;
  total: number;
  current: FlattenedStep | undefined;
  progress: StepProgress | null;
  isLast: boolean;
  isFinished: boolean;
}

export interface TimeUpdate {
  elapsed: number;
  moving: number;
}

// ================================
// Core Events (minimal, focused)
// ================================
export interface ServiceEvents {
  // Recording state changed (pending/ready/recording/paused/finished)
  stateChanged: (state: RecordingState) => void;

  // Recording fully persisted and ready for processing
  recordingComplete: (recordingId: string) => void;

  // Unplanned activity was selected
  activitySelected: (type: PublicActivityType) => void;

  // Activity payload was processed
  payloadProcessed: (payload: import("@repo/core").ActivityPayload) => void;

  // Sensors connected/disconnected
  sensorsChanged: (sensors: any[]) => void;

  // Plan events
  planSelected: (data: {
    plan: RecordingServiceActivityPlan;
    plannedId?: string;
  }) => void;
  stepChanged: (info: StepInfo) => void;
  planCleared: () => void;
  planCompleted: () => void;

  // Time events
  timeUpdated: (time: TimeUpdate) => void;
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
  private _permissionsStatus: AllPermissionsStatus = {
    bluetooth: null,
    location: null,
    locationBackground: null,
  };

  // === Plan State (minimal tracking) ===
  private _plan?: RecordingServiceActivityPlan;
  private _plannedActivityId?: string;
  private _steps: FlattenedStep[] = [];
  private _stepIndex: number = 0;
  private _stepStartMovingTime: number = 0; // Moving time when current step started

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

    // Check permissions on initialization
    this.checkPermissions();

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

    // No permission listeners needed - permissions are checked independently

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

  async checkPermissions(): Promise<void> {
    this._permissionsStatus = await checkAllPermissions();
  }

  getPermissionsStatus(): AllPermissionsStatus {
    return this._permissionsStatus;
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
  // Plan Getters (simplified, moving-time based)
  // ================================

  get hasPlan(): boolean {
    return this._plan !== undefined;
  }

  get plan(): RecordingServiceActivityPlan | undefined {
    return this._plan;
  }

  get plannedActivityId(): string | undefined {
    return this._plannedActivityId;
  }

  get stepIndex(): number {
    return this._stepIndex;
  }

  get stepCount(): number {
    return this._steps.length;
  }

  get currentStep(): FlattenedStep | undefined {
    return this._steps[this._stepIndex];
  }

  get isFinished(): boolean {
    return this.hasPlan && this._stepIndex >= this._steps.length;
  }

  get stepProgress(): StepProgress {
    if (!this.hasPlan || !this.currentStep)
      throw new Error("No plan or current step");

    const step = this.currentStep;
    const movingTime = this.getMovingTime() - this._stepStartMovingTime;

    let durationMs = 0;
    let requiresManualAdvance = false;

    if (step.duration === "untilFinished") {
      requiresManualAdvance = true;
    } else if (step.duration) {
      if (step.duration.unit === "meters") {
        // Placeholder: Assuming 5 m/s (18 km/h) average speed for distance-based steps
        // This should ideally come from user profile or activity type for better accuracy
        const estimatedSpeedMPS = 5; // meters per second
        durationMs = (step.duration.value / estimatedSpeedMPS) * 1000;
      } else if (step.duration.unit === "km") {
        const estimatedSpeedMPS = 5; // meters per second
        durationMs = ((step.duration.value * 1000) / estimatedSpeedMPS) * 1000;
      } else {
        durationMs = getDurationMs(step.duration);
      }
    }

    if (requiresManualAdvance) {
      return {
        movingTime,
        duration: 0, // Duration is not applicable for untilFinished
        progress: 0,
        requiresManualAdvance: true,
        canAdvance: this._stepIndex < this._steps.length - 1,
      };
    }

    const progress = Math.min(1, movingTime / durationMs);

    return {
      movingTime,
      duration: durationMs,
      progress,
      requiresManualAdvance: false,
      canAdvance: progress >= 1 && this._stepIndex < this._steps.length - 1,
    };
  }

  getStepInfo(): StepInfo {
    return {
      index: this._stepIndex,
      total: this._steps.length,
      current: this.currentStep,
      progress: this.stepProgress,
      isLast: this._stepIndex >= this._steps.length - 1,
      isFinished: this.isFinished,
    };
  }
  get planTimeRemaining(): number {
    if (!this.hasPlan || this.isFinished) return 0;

    let totalRemainingMs = 0;

    // Add time remaining for the current step
    const currentStepProgress = this.stepProgress;
    if (currentStepProgress && !currentStepProgress.requiresManualAdvance) {
      totalRemainingMs += Math.max(
        0,
        currentStepProgress.duration - currentStepProgress.movingTime,
      );
    }

    // Add durations for all subsequent steps
    for (let i = this._stepIndex + 1; i < this._steps.length; i++) {
      const step = this._steps[i];
      if (step.duration === "untilFinished") {
        // If a step is "untilFinished", we cannot determine total remaining time
        // For simplicity, we'll return a large number or 0.
        // A more robust solution might involve user input or a different way to handle "untilFinished" in plan totals.
        return 0; // Or some other indicator like -1 to signify indefinite
      } else if (step.duration) {
        if (step.duration.unit === "meters") {
          const estimatedSpeedMPS = 5; // meters per second (placeholder)
          totalRemainingMs += (step.duration.value / estimatedSpeedMPS) * 1000;
        } else if (step.duration.unit === "km") {
          const estimatedSpeedMPS = 5; // meters per second (placeholder)
          totalRemainingMs +=
            ((step.duration.value * 1000) / estimatedSpeedMPS) * 1000;
        } else {
          totalRemainingMs += getDurationMs(step.duration);
        }
      }
    }

    return totalRemainingMs;
  }

  // ================================
  // Plan Actions
  // ================================

  selectPlan(plan: RecordingServiceActivityPlan, plannedId?: string): void {
    console.log("[Service] Selected plan:", plan.name);

    this._plan = plan;
    this._plannedActivityId = plannedId;
    this._steps = flattenPlanSteps(plan.structure.steps);
    this._stepIndex = 0;
    this._stepStartMovingTime = this.getMovingTime();
    this.selectedActivityType = plan.activity_type;

    this.emit("planSelected", { plan, plannedId });
    this.emit("stepChanged", this.getStepInfo());
  }

  clearPlan(): void {
    console.log("[Service] Clearing plan");

    this._plan = undefined;
    this._plannedActivityId = undefined;
    this._steps = [];
    this._stepIndex = 0;
    this._stepStartMovingTime = 0;

    this.emit("planCleared");
  }

  /**
   * Manually advance to the next step in the plan
   * This is the user-facing action for step advancement
   *
   * Only available when:
   * - A plan is active
   * - Current step requires manual advancement (duration === "untilFinished")
   * - Not on the last step
   *
   * Timed steps advance automatically when their duration is reached
   */
  advanceStep(): void {
    const progress = this.stepProgress;
    if (!progress?.canAdvance) {
      console.warn("[Service] Cannot advance step");
      return;
    }

    console.log(`[Service] Advancing to step ${this._stepIndex + 1}`);

    this._stepIndex++;
    this._stepStartMovingTime = this.getMovingTime();

    this.emit("stepChanged", this.getStepInfo());

    if (this.isFinished) {
      console.log("[Service] Plan completed!");
      this.emit("planCompleted");
    }
  }

  // ================================
  // Recording Lifecycle
  // ================================

  async startRecording() {
    console.log("[Service] Starting recording");

    // Clean up any stale recordings
    await localdb.delete(activityRecordings);

    // Check all necessary permissions
    const allGranted = await areAllPermissionsGranted();
    if (!allGranted) {
      console.error("[Service] Cannot start recording - missing permissions");
      throw new Error(
        "All permissions (Bluetooth, Location, and Background Location) are required to start recording",
      );
    }

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
    this._stepStartMovingTime = 0; // Reset step timer for plan
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
    const recordingId = this.recording.id;

    try {
      // Start the database transaction
      await localdb.transaction(async (tx) => {
        // 1. Finish LiveMetricsManager, passing the transaction object.
        //    This ensures stream data is flushed within this transaction.
        await this.liveMetricsManager.finishRecording(tx);

        // 2. Update the recording's endedAt timestamp using the same transaction.
        await tx
          .update(activityRecordings)
          .set({ endedAt: new Date().toISOString() })
          .where(eq(activityRecordings.id, recordingId));
      });

      // Transaction succeeded - update state
      this.state = "finished";
      this.emit("stateChanged", this.state);

      // Emit completion event to signal data is ready for processing
      this.emit("recordingComplete", recordingId);

      // Clean up non-database resources
      if (this.notificationsManager) {
        await this.notificationsManager.stopForegroundService();
      }

      console.log("[Service] Recording finished successfully");
    } catch (err) {
      // If the transaction fails, it will automatically roll back.
      console.error("[Service] Failed to finish recording transaction:", err);
      this.emit("error", "Failed to save recording data.");
      throw err;
    }
  }

  // ================================
  // Activity Selection
  // ================================

  /**
   * Select an unplanned activity type
   * Clears any existing plan and updates the activity type
   */
  selectUnplannedActivity(type: PublicActivityType): void {
    console.log("[Service] Selected unplanned activity:", type);
    this.selectedActivityType = type;
    this.clearPlan();
    this.emit("activitySelected", type);
  }

  /**
   * Initialize activity recording from an ActivityPayload.
   * Handles both planned activities (with structure) and quick-start activities.
   *
   * @param payload - ActivityPayload containing activity type and optional plan
   */
  selectActivityFromPayload(
    payload: import("@repo/core").ActivityPayload,
  ): void {
    console.log("[Service] Initializing from payload:", payload);

    try {
      if (payload.plan) {
        // Template or planned activity with structure
        const plan: RecordingServiceActivityPlan = {
          name: payload.plan.name,
          description: payload.plan.description || "",
          activity_type: payload.plan.activity_type,
          estimated_duration: payload.plan.estimated_duration,
          estimated_tss: payload.plan.estimated_tss,
          structure: payload.plan.structure,
        };

        console.log("[Service] Selecting plan from payload:", plan.name);
        this.selectPlan(plan, payload.plannedActivityId);
      } else {
        // Quick start activity
        console.log(
          "[Service] Selecting unplanned activity from payload:",
          payload.type,
        );
        this.selectUnplannedActivity(payload.type);
      }

      this.emit("payloadProcessed", payload);
    } catch (error) {
      console.error("[Service] Error processing payload:", error);
      throw new Error(`Failed to process activity payload: ${error}`);
    }
  }

  // ================================
  // Data Handling
  // ================================

  private handleSensorData(reading: SensorReading) {
    if (this.state !== "recording") return;

    // Send to LiveMetricsManager for processing
    this.liveMetricsManager.ingestSensorData(reading);

    // Update notification with key metrics
    if (
      ["heartrate", "power"].includes(reading.metric) &&
      this.notificationsManager &&
      typeof reading.value === "number"
    ) {
      const metrics = this.liveMetricsManager.getMetrics();
      const progress = this.stepProgress;
      this.notificationsManager
        .update({
          elapsedInStep: progress?.movingTime || 0,
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

    // Emit time update for UI
    this.emit("timeUpdated", {
      elapsed: this.getElapsedTime(),
      moving: this.getMovingTime(),
    });

    // Auto-advance plan steps when recording
    if (this.state === "recording" && this.hasPlan) {
      const progress = this.stepProgress;
      if (
        progress &&
        !progress.requiresManualAdvance &&
        progress.progress >= 1
      ) {
        this.advanceStep();
      }
    }
  }

  public getElapsedTime(): number {
    const metrics = this.liveMetricsManager.getMetrics();
    return metrics.elapsedTime;
  }

  /**
   * Get total moving time (excluding paused time)
   * This is the time used for plan step progression
   */
  public getMovingTime(): number {
    if (!this.startTime) return 0;

    const elapsed = Date.now() - this.startTime;
    const totalPaused =
      this.state === "paused"
        ? this.pausedTime + (Date.now() - (this.lastPauseTime || 0))
        : this.pausedTime;

    return Math.max(0, elapsed - totalPaused);
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
