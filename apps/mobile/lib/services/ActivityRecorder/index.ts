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

import {
  type AllPermissionsStatus,
  areAllPermissionsGranted,
  checkAllPermissions,
} from "../permissions-check";
import { LiveMetricsManager } from "./LiveMetricsManager";
import { LocationManager } from "./location";
import { NotificationsManager } from "./notification";
import { SensorsManager } from "./sensors";
import { RecordingMetadata, SensorReading } from "./types";

import { EventEmitter } from "expo";
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
  recordingComplete: () => void;

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

  // Error events
  error: (message: string) => void;

  // Index signature for EventsMap
  [key: string]: (...args: any[]) => void;
}

// ================================
// Activity Recorder Service
// ================================

export class ActivityRecorderService extends EventEmitter<ServiceEvents> {
  // === Public State ===
  public state: RecordingState = "pending";
  public selectedActivityType: PublicActivityType = "indoor_bike_trainer";
  public recordingMetadata?: RecordingMetadata;

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

  // === Manual Control Override ===
  private manualControlOverride: boolean = false;

  // === GPS Availability Cache ===
  private _gpsAvailable: boolean = false;

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
    // Note: expo-modules-core EventEmitter doesn't have setMaxListeners
    // If you need more listeners, consider using Node.js EventEmitter instead
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

    // Setup plan-based trainer control
    this.setupPlanTrainerIntegration();

    console.log("[ActivityRecorderService] Initialized", {
      profileId: profile.id,
    });
  }

  // ================================
  // Permissions
  // ================================

  async checkPermissions(forceRefresh = false): Promise<void> {
    this._permissionsStatus = await checkAllPermissions(forceRefresh);
  }

  getPermissionsStatus(): AllPermissionsStatus {
    return this._permissionsStatus;
  }

  /**
   * Refresh permissions and return whether all are granted
   * Useful before starting a recording
   */
  async refreshAndCheckAllPermissions(): Promise<boolean> {
    await this.checkPermissions(true); // Force refresh
    return await areAllPermissionsGranted();
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
      progress: this.hasPlan && this.currentStep ? this.stepProgress : null,
      isLast: this._stepIndex >= this._steps.length - 1,
      isFinished: this.isFinished,
    };
  }
  get planTimeRemaining(): number {
    if (!this.hasPlan || this.isFinished || !this.currentStep) return 0;

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
    this.selectedActivityType = plan.activity_category;

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
    if (!this.hasPlan || !this.currentStep) {
      console.warn("[Service] Cannot advance step - no plan active");
      return;
    }

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

    // Prevent concurrent recordings
    if (this.state === "recording") {
      const error =
        "Cannot start recording: A recording is already in progress";
      console.error(`[Service] ${error}`);
      throw new Error(error);
    }

    if (this.state === "paused") {
      const error =
        "Cannot start recording: Please resume the paused recording first";
      console.error(`[Service] ${error}`);
      throw new Error(error);
    }

    // Check all necessary permissions
    const allGranted = await areAllPermissionsGranted();
    if (!allGranted) {
      console.error("[Service] Cannot start recording - missing permissions");
      throw new Error(
        "All permissions (Bluetooth, Location, and Background Location) are required to start recording",
      );
    }

    // Create recording metadata (in-memory)
    this.recordingMetadata = {
      startedAt: new Date().toISOString(),
      activityType: this.selectedActivityType,
      profileId: this.profile.id,
      profile: this.profile,
      plannedActivityId: this._plannedActivityId,
      activityPlan: this._plan,
    };

    this.state = "recording";

    // Start LiveMetricsManager (initializes StreamBuffer)
    await this.liveMetricsManager.startRecording();

    // Initialize timing
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.lastPauseTime = undefined;
    this._stepStartMovingTime = 0; // Reset step timer for plan
    this.startElapsedTimeUpdates();

    // Start location tracking
    await this.locationManager.startForegroundTracking();
    await this.locationManager.startBackgroundTracking();
    this._gpsAvailable = true;

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
    if (!this.recordingMetadata) {
      throw new Error("No active recording to finish");
    }

    console.log("[Service] Finishing recording");

    try {
      // Finish LiveMetricsManager (flushes final data to files)
      await this.liveMetricsManager.finishRecording();

      // Update recording metadata with end time
      this.recordingMetadata.endedAt = new Date().toISOString();

      // Update state
      this.state = "finished";
      this.emit("stateChanged", this.state);

      // Emit completion event to signal data is ready for processing
      this.emit("recordingComplete");

      // Clean up resources
      if (this.notificationsManager) {
        await this.notificationsManager.stopForegroundService();
      }

      console.log("[Service] Recording finished successfully");
    } catch (err) {
      console.error("[Service] Failed to finish recording:", err);
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
          activity_category: payload.plan.activity_category,
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
  // Manual Control Override
  // ================================

  /**
   * Enable or disable manual control override
   * When enabled, automatic plan-based trainer control is suspended
   * When disabled (back to auto), plan targets are reapplied
   */
  public setManualControlMode(enabled: boolean): void {
    this.manualControlOverride = enabled;
    console.log(
      `[Service] Manual control: ${enabled ? "enabled" : "disabled"}`,
    );

    if (!enabled && this.state === "recording" && this.currentStep) {
      // Re-apply plan targets when switching back to auto
      console.log(
        "[Service] Reapplying plan targets after manual override disabled",
      );
      this.applyStepTargets(this.currentStep);
    }
  }

  /**
   * Check if manual control override is currently active
   */
  public isManualControlActive(): boolean {
    return this.manualControlOverride;
  }

  // ================================
  // FTMS Trainer Control Integration
  // ================================

  /**
   * Setup automatic trainer control based on workout plan
   * Applies power/grade targets when steps change
   */
  private setupPlanTrainerIntegration(): void {
    // Apply targets when step changes
    this.addListener("stepChanged", async ({ current }) => {
      // Skip if manual control is active
      if (this.manualControlOverride) {
        console.log("[Service] Manual control active, skipping auto target");
        return;
      }

      if (!current || this.state !== "recording") return;

      const trainer = this.sensorsManager.getControllableTrainer();
      if (!trainer) return;

      console.log("[Service] Applying step targets:", current.name);
      await this.applyStepTargets(current);
    });

    // Apply initial target when recording starts
    this.addListener("stateChanged", async (state) => {
      // Skip if manual control is active
      if (this.manualControlOverride) {
        console.log("[Service] Manual control active, skipping auto target");
        return;
      }

      if (state !== "recording") return;

      const step = this.currentStep;
      if (!step) return;

      const trainer = this.sensorsManager.getControllableTrainer();
      if (!trainer) return;

      console.log("[Service] Applying initial targets");
      await this.applyStepTargets(step);
    });
  }

  /**
   * Apply targets from a plan step to the trainer
   */
  private async applyStepTargets(step: FlattenedStep): Promise<void> {
    if (!step.targets) {
      console.log("[Service] No targets for this step");
      return;
    }

    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) {
      console.log("[Service] No controllable trainer");
      return;
    }

    try {
      // Check for power targets (ERG mode)
      if (step.targets.power) {
        const powerTarget = this.resolvePowerTarget(step.targets.power);
        if (powerTarget) {
          console.log(`[Service] Applying power target: ${powerTarget}W`);
          const success = await this.sensorsManager.setPowerTarget(powerTarget);

          if (!success) {
            this.emit("error", `Failed to set power target: ${powerTarget}W`);
          }
        }
      }
      // Check for grade targets (SIM mode)
      else if (step.targets.grade !== undefined) {
        console.log(`[Service] Applying grade target: ${step.targets.grade}%`);
        const success = await this.sensorsManager.setSimulation({
          grade: step.targets.grade,
          windSpeed: 0,
          crr: 0.005,
          windResistance: 0.51,
        });

        if (!success) {
          this.emit(
            "error",
            `Failed to set grade target: ${step.targets.grade}%`,
          );
        }
      }
    } catch (error) {
      console.error("[Service] Failed to apply step targets:", error);
      this.emit("error", "Failed to apply workout targets to trainer");
    }
  }

  /**
   * Resolve power target from plan step to absolute watts
   */
  private resolvePowerTarget(target: any): number | null {
    // Handle absolute watts
    if (typeof target === "number") {
      return Math.round(target);
    }

    // Handle percentage of FTP
    if (target.type === "%FTP" || target.type === "ftp") {
      const ftp = this.profile.ftp || 200; // Fallback to 200W
      const percentage = target.intensity || target.value || 0;
      return Math.round((percentage / 100) * ftp);
    }

    // Handle watts object
    if (target.type === "watts") {
      return Math.round(target.intensity || target.value || 0);
    }

    console.warn("[Service] Unable to resolve power target:", target);
    return null;
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
      const progress =
        this.hasPlan && this.currentStep ? this.stepProgress : null;
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
    if (this.state === "recording" && this.hasPlan && this.currentStep) {
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

  /**
   * Get recording metadata for processing
   */
  getRecordingMetadata(): RecordingMetadata | undefined {
    return this.recordingMetadata;
  }

  /**
   * Get metrics in simplified format
   * This is the recommended way to access metrics for UI components
   */
  getSimplifiedMetrics(): SimplifiedMetrics {
    return this.liveMetricsManager.getSimplifiedMetrics();
  }

  /**
   * Get recording configuration - what features should be available/shown
   */
  getRecordingConfiguration(): import("@repo/core").RecordingConfiguration {
    const { RecordingConfigResolver } = require("@repo/core");

    const ftmsDevice = this.sensorsManager.getControllableTrainer();

    return RecordingConfigResolver.resolve({
      activityType: this.selectedActivityType,
      mode: this._plan ? "planned" : "unplanned",
      plan: this._plan
        ? {
            hasStructure: this._steps.length > 0,
            hasRoute: false, // TODO: Check if plan has route when route support is added
            stepCount: this._steps.length,
            requiresManualAdvance: this._steps.some(
              (step) => step.duration.type === "untilFinished",
            ),
          }
        : undefined,
      devices: {
        ftmsTrainer: ftmsDevice
          ? {
              deviceId: ftmsDevice.id,
              features: ftmsDevice.ftmsFeatures || {},
              autoControlEnabled: !this.manualControlOverride,
            }
          : undefined,
        hasPowerMeter: this.sensorsManager
          .getConnectedSensors()
          .some((s) => s.type === "power"),
        hasHeartRateMonitor: this.sensorsManager
          .getConnectedSensors()
          .some((s) => s.type === "heart_rate"),
        hasCadenceSensor: this.sensorsManager
          .getConnectedSensors()
          .some((s) => s.type === "cadence"),
      },
      gpsAvailable: this._gpsAvailable,
    });
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

    // Reset GPS availability
    this._gpsAvailable = false;

    // Stop foreground service
    if (this.notificationsManager) {
      await this.notificationsManager.stopForegroundService();
    }

    // Clear plan state
    this.clearPlan();

    // Clear recording metadata
    this.recordingMetadata = undefined;

    // Remove all listeners for each event type
    this.removeAllListeners("stateChanged");
    this.removeAllListeners("recordingComplete");
    this.removeAllListeners("activitySelected");
    this.removeAllListeners("payloadProcessed");
    this.removeAllListeners("sensorsChanged");
    this.removeAllListeners("planSelected");
    this.removeAllListeners("stepChanged");
    this.removeAllListeners("planCleared");
    this.removeAllListeners("planCompleted");
    this.removeAllListeners("timeUpdated");
    this.removeAllListeners("error");

    console.log("[Service] Cleanup complete");
  }
}

// ================================
// Re-exports for convenience
// ================================
export {
  getHRZone,
  getPowerZone,
  getZoneDistribution,
  HR_ZONE_NAMES,
  POWER_ZONE_NAMES,
} from "./SimplifiedMetrics";
export type { SimplifiedMetrics } from "./SimplifiedMetrics";
