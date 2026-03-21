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
  type CurrentMetricValue,
  type FTMSFeatures,
  GLOBAL_DEFAULTS,
  type IntervalStepV2,
  type MetricFamily,
  type MetricSourceCandidate,
  type MetricSourceSelection,
  type MetricSourceType,
  type PerformanceMetrics,
  RecordingConfigResolver,
  type RecordingConfiguration,
  type RecordingLaunchIntent,
  RecordingServiceActivityPlan,
  resolveMetricSources as resolveCoreMetricSources,
} from "@repo/core";
import type { PublicActivityCategory, PublicProfilesRow } from "@repo/supabase";
import { EventEmitter } from "expo";
import { LocationObject } from "expo-location";
import { AppState, AppStateStatus } from "react-native";
import { FitRecord, GarminFitEncoder } from "../fit/GarminFitEncoder";
import {
  type AllPermissionsStatus,
  areAllPermissionsGranted,
  checkAllPermissions,
} from "../permissions-check";
import { persistPendingFinalizedArtifact } from "./finalizedArtifactStorage";
import { getNextGpsRecordingEnabled, shouldStartGpsTracking } from "./gpsRuntime";
import { LiveMetricsManager } from "./LiveMetricsManager";
import { LocationManager } from "./location";
import { NotificationsManager } from "./notification";
import {
  PlanExecution,
  type PlanExecutionProgress,
  type PlanExecutionStepInfo,
} from "./planExecution";
import { type PlanValidationResult, validatePlanRequirements } from "./planValidation";
import { SimplifiedMetrics } from "./SimplifiedMetrics";
import { type ConnectedSensor, SensorsManager } from "./sensors";
import { RecordingSessionController } from "./sessionController";
import { inferTrainerMachineType, TrainerControl } from "./trainerControl";
import {
  type RecordingMetadata,
  type RecordingPlanView,
  type RecordingRuntimeSourceState,
  type RecordingSessionArtifact,
  type RecordingSessionOverride,
  type RecordingSessionOverrideState,
  type RecordingSessionSnapshot,
  type RecordingSessionView,
  type RecordingSourceChangeEvent,
  type RecordingTrainerView,
  SensorReading,
} from "./types";

export { SimplifiedMetrics };

// ================================
// Types
// ================================

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "finishing"
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
  current: IntervalStepV2 | undefined;
  progress: StepProgress | null;
  isLast: boolean;
  isFinished: boolean;
}

export interface TimeUpdate {
  elapsed: number;
  moving: number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }

  return value;
}

// ================================
// Core Events (minimal, focused)
// ================================
export interface ServiceEvents {
  // Recording state changed (pending/ready/recording/paused/finished)
  stateChanged: (state: RecordingState) => void;

  // Recording fully persisted and ready for processing
  recordingComplete: () => void;

  // Canonical finalized artifact is ready for submit/retry
  artifactReady: (artifact: RecordingSessionArtifact) => void;

  lapRecorded: () => void;

  // Unplanned activity was selected
  activitySelected: (data: {
    category: PublicActivityCategory;
    gpsRecordingEnabled: boolean;
  }) => void;

  // Activity payload was processed
  payloadProcessed: (payload: import("@repo/core").ActivityPayload) => void;

  // Sensors connected/disconnected
  sensorsChanged: (sensors: ConnectedSensor[]) => void;

  // Plan events
  planSelected: (data: { plan: RecordingServiceActivityPlan; eventId?: string }) => void;
  stepChanged: (info: StepInfo) => void;
  planCleared: () => void;
  planCompleted: () => void;

  // Time events
  timeUpdated: (time: TimeUpdate) => void;

  // Error events
  error: (message: string) => void;

  // GPS tracking events
  gpsTrackingChanged: (enabled: boolean) => void;

  // Performance metrics updated (base values or scale)
  metricsUpdated: () => void;

  // Canonical session view changed
  sessionUpdated: (view: RecordingSessionView) => void;

  // Immutable snapshot changed (created/reset)
  snapshotUpdated: (snapshot: RecordingSessionSnapshot | null) => void;

  // Index signature for EventsMap
  [key: string]: (...args: any[]) => void;
}

type LoadedRoute = {
  id: string;
  name: string;
  coordinates: Array<{
    latitude: number;
    longitude: number;
    elevation?: number;
  }>;
  polyline?: string | null;
  elevation_profile?: Array<{
    distance: number;
    elevation: number;
  }>;
};

// ================================
// Activity Recorder Service
// ================================

export class ActivityRecorderService extends EventEmitter<ServiceEvents> {
  // === Public State ===
  public state: RecordingState = "pending";
  public selectedActivityCategory: PublicActivityCategory = "bike";
  private _gpsRecordingEnabled: boolean = true;
  public recordingMetadata?: RecordingMetadata;
  private finalizedArtifact: RecordingSessionArtifact | null = null;
  private readonly sessionController = new RecordingSessionController();

  // === Public Managers (direct access - no forwarding) ===
  public readonly liveMetricsManager: LiveMetricsManager;
  public readonly locationManager: LocationManager;
  public readonly sensorsManager: SensorsManager;
  private readonly planExecution = new PlanExecution();
  private readonly trainerControl: TrainerControl;
  private _permissionsStatus: AllPermissionsStatus = {
    bluetooth: null,
    location: null,
    locationBackground: null,
  };

  // === Plan State (minimal tracking) ===
  private _plan?: RecordingServiceActivityPlan;
  private _eventId?: string;

  // === GPS Availability Cache ===
  private _gpsAvailable: boolean = false;

  // === Route State ===
  private _currentRoute: LoadedRoute | null = null;
  private _routeDistance: number = 0; // Total route distance in meters
  private _currentRouteDistance: number = 0; // User's current distance along route

  // === Private Managers ===
  private notificationsManager?: NotificationsManager;
  private fitEncoder?: GarminFitEncoder;

  // === App State Management ===
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: { remove: () => void };

  // === Timing ===
  private startTime?: number;
  private pausedTime: number = 0;
  private lastPauseTime?: number;
  private elapsedTimeInterval?: number;

  // === Lap Tracking ===
  private laps: number[] = []; // Array of lap times (moving time in seconds)
  private lastLapTime: number = 0; // Moving time when last lap was recorded

  // === Profile ===
  private profile: PublicProfilesRow;
  private ftp?: number;
  private _baseFtp?: number;
  private _ftpScale: number = 1.0;

  private thresholdHr?: number;
  private _baseThresholdHr?: number;

  private weightKg?: number;
  private _baseWeightKg?: number;

  private thresholdPaceSecondsPerKm?: number;
  private _baseThresholdPaceSecondsPerKm?: number;

  constructor(
    profile: PublicProfilesRow,
    metrics?: {
      ftp?: number;
      thresholdHr?: number;
      weightKg?: number;
      thresholdPaceSecondsPerKm?: number;
    },
  ) {
    super();
    // Note: expo-modules-core EventEmitter doesn't have setMaxListeners
    // If you need more listeners, consider using Node.js EventEmitter instead
    this.profile = profile;

    // Initialize base values from passed metrics or defaults
    this._baseFtp = metrics?.ftp ?? GLOBAL_DEFAULTS.ftp;
    this._baseThresholdHr = metrics?.thresholdHr ?? GLOBAL_DEFAULTS.thresholdHr;
    this._baseWeightKg = metrics?.weightKg ?? GLOBAL_DEFAULTS.weightKg;
    this._baseThresholdPaceSecondsPerKm =
      metrics?.thresholdPaceSecondsPerKm ?? GLOBAL_DEFAULTS.thresholdPaceSecondsPerKm;

    this._ftpScale = 1.0;

    // Apply initial scale to FTP
    this.ftp = Math.round((this._baseFtp || 0) * this._ftpScale);
    this.thresholdHr = this._baseThresholdHr;
    this.weightKg = this._baseWeightKg;
    this.thresholdPaceSecondsPerKm = this._baseThresholdPaceSecondsPerKm;

    // Initialize managers
    this.liveMetricsManager = new LiveMetricsManager(profile, {
      ftp: this.ftp,
      thresholdHr: this.thresholdHr,
      weightKg: this.weightKg,
      thresholdPaceSecondsPerKm: this.thresholdPaceSecondsPerKm,
    });
    this.liveMetricsManager.addListener("sensorUpdate", () => {
      this.publishSessionUpdate();
    });
    this.liveMetricsManager.addListener("statsUpdate", () => {
      this.publishSessionUpdate();
    });
    this.liveMetricsManager.addListener("metricsUpdated", () => {
      this.publishSessionUpdate();
    });
    this.locationManager = new LocationManager();
    this.sensorsManager = new SensorsManager();
    this.trainerControl = new TrainerControl({
      sensorsManager: this.sensorsManager,
      getCurrentReadings: () => this.getCurrentReadings(),
      getSessionOverrideState: () => this.getSessionOverrideState(),
      getSessionSnapshot: () => this.getSessionSnapshot(),
      onCommandStatus: () => this.publishSessionUpdate(),
      onError: (message) => this.emit("error", message),
    });

    // Note: Location tracking is started conditionally when GPS recording is enabled

    // Check permissions on initialization
    this.checkPermissions();

    // Setup sensor data listeners
    this.sensorsManager.subscribe((reading) => this.handleSensorData(reading));

    // Setup sensor connection listeners
    this.sensorsManager.subscribeConnection((sensor) => {
      console.log("[Service] Sensor connection changed:", sensor.name, sensor.connectionState);
      this.emit("sensorsChanged", this.sensorsManager.getConnectedSensors());
      this.publishSessionUpdate();

      if (
        sensor.isControllable &&
        sensor.connectionState === "connected" &&
        this.state === "recording" &&
        this.currentStep
      ) {
        this.trainerControl
          .applyStepTargets(this.currentStep, "reconnect_recovery")
          .catch(console.error);
      }
    });

    // Setup location listeners
    this.locationManager.addCallback((location) => this.handleLocationData(location));

    // No permission listeners needed - permissions are checked independently

    // Setup app state listener
    this.appStateSubscription = AppState.addEventListener("change", (nextState) =>
      this.handleAppStateChange(nextState),
    );

    console.log("[ActivityRecorderService] Initialized", {
      profileId: profile.id,
    });
    this.sessionController.setLifecycle(this.state);
    this.publishSessionUpdate();
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

  public getSimplifiedMetrics(): SimplifiedMetrics {
    return this.liveMetricsManager.getSimplifiedMetrics();
  }

  /**
   * Update performance metrics reactively
   * Updates internal values and LiveMetricsManager calculations.
   * If recording with a plan, re-applies ERG targets to trainer.
   */
  public updateMetrics(metrics: Partial<PerformanceMetrics>): void {
    console.log("[Service] Updating metrics:", metrics);

    if (metrics.ftp !== undefined) {
      this._baseFtp = metrics.ftp;
      this.ftp = Math.round(this._baseFtp * this._ftpScale);
    }
    if (metrics.thresholdHr !== undefined) {
      this._baseThresholdHr = metrics.thresholdHr;
      this.thresholdHr = metrics.thresholdHr;
    }
    if (metrics.weightKg !== undefined) {
      this._baseWeightKg = metrics.weightKg;
      this.weightKg = metrics.weightKg;
    }
    if (metrics.thresholdPaceSecondsPerKm !== undefined) {
      this._baseThresholdPaceSecondsPerKm = metrics.thresholdPaceSecondsPerKm;
      this.thresholdPaceSecondsPerKm = Math.round(
        this._baseThresholdPaceSecondsPerKm / this._ftpScale,
      );
    }

    // Update LiveMetricsManager
    this.liveMetricsManager.updateMetrics({
      ftp: this.ftp,
      thresholdHr: this.thresholdHr,
      weightKg: this.weightKg,
      thresholdPaceSecondsPerKm: this.thresholdPaceSecondsPerKm,
    });

    // If recording and has a plan, re-apply targets (e.g. for %FTP targets in ERG mode)
    if (this.state === "recording" && this.hasPlan && this.currentStep) {
      console.log("[Service] Re-applying targets with new metrics");
      this.trainerControl
        .applyStepTargets(this.currentStep, "periodic_refinement")
        .catch(console.error);
    }

    this.emit("metricsUpdated");
    this.publishSessionUpdate();
  }

  /**
   * Scale the workout intensity for this session.
   * Affects FTP and Threshold Pace reactively.
   */
  public setIntensityScale(scale: number): void {
    console.log(`[Service] Setting intensity scale: ${scale * 100}%`);
    this._ftpScale = scale;
    this.sessionController.updateOverrideState((state) => ({
      ...state,
      intensityScale: scale,
    }));

    const updates: Partial<PerformanceMetrics> = {};

    if (this._baseFtp) {
      this.ftp = Math.round(this._baseFtp * scale);
      updates.ftp = this.ftp;
    }

    if (this._baseThresholdPaceSecondsPerKm) {
      // Pace is seconds per km. Higher intensity = lower pace (faster).
      this.thresholdPaceSecondsPerKm = Math.round(this._baseThresholdPaceSecondsPerKm / scale);
      updates.thresholdPaceSecondsPerKm = this.thresholdPaceSecondsPerKm;
    }

    // Update LiveMetricsManager
    if (Object.keys(updates).length > 0) {
      this.liveMetricsManager.updateMetrics(updates);

      // Re-apply targets if recording with plan
      if (this.state === "recording" && this.hasPlan && this.currentStep) {
        this.trainerControl
          .applyStepTargets(this.currentStep, "periodic_refinement")
          .catch(console.error);
      }
    }

    if (this.getSessionSnapshot()) {
      this.applySessionOverride({
        type: "intensity_scale",
        value: scale,
        scope: "until_changed",
        recordedAt: new Date().toISOString(),
      });
    }

    this.emit("metricsUpdated");
    this.publishSessionUpdate();
  }

  public getIntensityScale(): number {
    return this._ftpScale;
  }

  public getBaseFtp(): number | undefined {
    return this._baseFtp;
  }

  public getBaseThresholdPace(): number | undefined {
    return this._baseThresholdPaceSecondsPerKm;
  }

  public getBaseThresholdHr(): number | undefined {
    return this._baseThresholdHr;
  }

  public getBaseWeight(): number | undefined {
    return this._baseWeightKg;
  }

  public getSessionSnapshot(): RecordingSessionSnapshot | null {
    return this.sessionController.getSnapshot();
  }

  public getSessionOverrides(): RecordingSessionOverride[] {
    return this.sessionController.getOverrides();
  }

  public getFinalizedArtifact(): RecordingSessionArtifact | null {
    return this.finalizedArtifact;
  }

  public getCurrentReadings() {
    return this.liveMetricsManager.getCurrentReadings();
  }

  public getSessionStats() {
    const stats = this.liveMetricsManager.getSessionStats();

    return {
      ...stats,
      duration: Math.floor(this.getElapsedTime() / 1000),
      movingTime: Math.floor(this.getMovingTime() / 1000),
      pausedTime: Math.floor(this.pausedTime / 1000),
    };
  }

  public getSessionOverrideState(): RecordingSessionOverrideState {
    return this.sessionController.getOverrideState();
  }

  public getTrainerControlPolicy(): RecordingSessionSnapshot["policies"]["controlPolicy"] {
    return {
      trainerMode: this.getSessionOverrideState().trainerMode,
      autoAdvanceSteps: !this.planExecution.hasManualAdvanceSteps(),
    };
  }

  public getAvailableMetricSources(metricFamily?: MetricFamily): MetricSourceCandidate[] {
    const candidates = this.buildMetricSourceCandidates();

    if (!metricFamily) {
      return candidates;
    }

    return candidates.filter((candidate) => candidate.metricFamily === metricFamily);
  }

  public setPreferredMetricSource(metricFamily: MetricFamily, sourceId: string): void {
    this.applySessionOverride({
      type: "preferred_source",
      metricFamily,
      sourceId,
      scope: "until_changed",
      recordedAt: new Date().toISOString(),
    });
  }

  public clearPreferredMetricSource(metricFamily: MetricFamily): void {
    const { [metricFamily]: _removed, ...remainingPreferredSources } =
      this.getSessionOverrideState().preferredSources;
    this.sessionController.updateOverrideState((state) => ({
      ...state,
      preferredSources: remainingPreferredSources,
    }));

    this.publishSessionUpdate();
  }

  public getSessionView(): RecordingSessionView {
    return this.sessionController.buildView({
      trainerControlPolicy: this.getTrainerControlPolicy(),
      trainer: this.buildTrainerView(),
      currentReadings: this.getCurrentReadings(),
      sessionStats: this.getSessionStats(),
      recordingConfiguration: this.getRecordingConfiguration(),
      plan: this.buildPlanView(),
    });
  }

  private buildTrainerView(): RecordingTrainerView {
    const trainer = this.sensorsManager.getControllableTrainer();
    const controller = trainer?.ftmsController;

    return {
      machineType: inferTrainerMachineType(trainer) ?? null,
      currentControlMode: controller?.getCurrentMode() ?? null,
      recoveryState: this.trainerControl.getRecoveryState(),
      lastCommandStatus: this.sensorsManager.getLastTrainerCommandStatus(),
    };
  }

  private publishSnapshotUpdate(): void {
    this.emit("snapshotUpdated", this.sessionController.getSnapshot());
  }

  private publishSessionUpdate(): void {
    this.syncRuntimeSourceState({ recordChanges: true });
    this.emit("sessionUpdated", this.getSessionView());
  }

  private isMetricSelectionDegraded(selection: MetricSourceSelection): boolean {
    return (
      selection.provenance !== "actual" ||
      selection.selectionMethod === "fallback" ||
      selection.selectionMethod === "defaulted" ||
      selection.selectionMethod === "unavailable"
    );
  }

  private buildCurrentMetricValue(
    metricFamily: MetricFamily,
    selection: MetricSourceSelection | undefined,
  ): CurrentMetricValue {
    const readings = this.getCurrentReadings();
    const stats = this.getSessionStats();

    switch (metricFamily) {
      case "heart_rate":
        return {
          value: readings.heartRate ?? null,
          sourceId: selection?.sourceId ?? null,
          provenance: selection?.provenance ?? "unavailable",
          recordedAt: readings.lastUpdated?.heartRate
            ? new Date(readings.lastUpdated.heartRate).toISOString()
            : null,
        };
      case "power":
        return {
          value: readings.power ?? null,
          sourceId: selection?.sourceId ?? null,
          provenance: selection?.provenance ?? "unavailable",
          recordedAt: readings.lastUpdated?.power
            ? new Date(readings.lastUpdated.power).toISOString()
            : null,
        };
      case "cadence":
        return {
          value: readings.cadence ?? null,
          sourceId: selection?.sourceId ?? null,
          provenance: selection?.provenance ?? "unavailable",
          recordedAt: readings.lastUpdated?.cadence
            ? new Date(readings.lastUpdated.cadence).toISOString()
            : null,
        };
      case "speed":
        return {
          value: readings.speed ?? null,
          sourceId: selection?.sourceId ?? null,
          provenance: selection?.provenance ?? "unavailable",
          recordedAt: readings.lastUpdated?.speed
            ? new Date(readings.lastUpdated.speed).toISOString()
            : readings.lastUpdated?.position
              ? new Date(readings.lastUpdated.position).toISOString()
              : null,
        };
      case "distance":
        return {
          value: Number.isFinite(stats.distance) ? stats.distance : null,
          sourceId: selection?.sourceId ?? null,
          provenance: selection?.provenance ?? "unavailable",
          recordedAt: readings.lastUpdated?.speed
            ? new Date(readings.lastUpdated.speed).toISOString()
            : readings.lastUpdated?.position
              ? new Date(readings.lastUpdated.position).toISOString()
              : null,
        };
      default:
        return {
          value: null,
          sourceId: selection?.sourceId ?? null,
          provenance: selection?.provenance ?? "unavailable",
          recordedAt: null,
        };
    }
  }

  private buildMetricSourceCandidates(): MetricSourceCandidate[] {
    const connectedSensors = this.sensorsManager.getConnectedSensors();
    const candidates: MetricSourceCandidate[] = connectedSensors.flatMap((sensor) =>
      this.getMetricSourceTypesForSensor(sensor).flatMap((sourceType) =>
        this.getMetricFamiliesForSourceType(sourceType).map((metricFamily) => ({
          metricFamily,
          sourceId: sensor.id,
          sourceType,
          provenance: "actual" as const,
          isAvailable: sensor.connectionState === "connected",
        })),
      ),
    );

    if (this._gpsRecordingEnabled) {
      candidates.push(
        {
          metricFamily: "speed",
          sourceId: "gps-runtime",
          sourceType: "gps",
          provenance: "actual",
          isAvailable: this._gpsAvailable,
        },
        {
          metricFamily: "distance",
          sourceId: "gps-runtime",
          sourceType: "gps",
          provenance: "actual",
          isAvailable: this._gpsAvailable,
        },
        {
          metricFamily: "position",
          sourceId: "gps-runtime",
          sourceType: "gps",
          provenance: "actual",
          isAvailable: this._gpsAvailable,
        },
        {
          metricFamily: "elevation",
          sourceId: "gps-runtime",
          sourceType: "gps",
          provenance: "actual",
          isAvailable: this._gpsAvailable,
        },
      );
    }

    if (!this._gpsRecordingEnabled) {
      candidates.push(
        {
          metricFamily: "speed",
          sourceId: "derived-runtime",
          sourceType: "derived",
          provenance: "derived",
          isAvailable: true,
        },
        {
          metricFamily: "distance",
          sourceId: "derived-runtime",
          sourceType: "derived",
          provenance: "derived",
          isAvailable: true,
        },
      );
    }

    return candidates;
  }

  private getMetricFamiliesForSourceType(sourceType: MetricSourceType): MetricFamily[] {
    switch (sourceType) {
      case "manual":
        return [];
      case "chest_strap":
      case "optical":
      case "trainer_passthrough":
        return ["heart_rate"];
      case "power_meter":
        return ["power", "cadence"];
      case "trainer_power":
        return ["power"];
      case "cadence_sensor":
      case "trainer_cadence":
        return ["cadence"];
      case "speed_sensor":
      case "trainer_speed":
        return ["speed", "distance"];
      case "gps":
        return ["speed", "distance", "position", "elevation"];
      case "derived":
        return ["speed", "distance", "elevation"];
      default:
        return [];
    }
  }

  private resolveMetricSources(selectedAt = new Date().toISOString()): MetricSourceSelection[] {
    return resolveCoreMetricSources(
      ["heart_rate", "power", "cadence", "speed", "distance", "position", "elevation"],
      this.buildMetricSourceCandidates(),
      {
        isIndoor: !this._gpsRecordingEnabled,
        preferredSourceIds: this.getSessionOverrideState().preferredSources,
        selectedAt,
      },
    );
  }

  private syncRuntimeSourceState(options: { recordChanges: boolean }): void {
    const nextSelections = this.resolveMetricSources();
    const currentRuntimeSourceState = this.sessionController.getRuntimeSourceState();
    const previousSelectionsByMetric = new Map(
      currentRuntimeSourceState.selectedSources.map((selection) => [
        selection.metricFamily,
        selection,
      ]),
    );
    const nextSelectionsByMetric = new Map(
      nextSelections.map((selection) => [selection.metricFamily, selection]),
    );

    const sourceChanges: RecordingSourceChangeEvent[] = options.recordChanges
      ? [...currentRuntimeSourceState.sourceChanges]
      : currentRuntimeSourceState.sourceChanges;

    if (options.recordChanges) {
      for (const nextSelection of nextSelections) {
        const previousSelection = previousSelectionsByMetric.get(nextSelection.metricFamily);

        if (
          previousSelection &&
          previousSelection.sourceId === nextSelection.sourceId &&
          previousSelection.provenance === nextSelection.provenance &&
          previousSelection.selectionMethod === nextSelection.selectionMethod
        ) {
          continue;
        }

        if (!previousSelection) {
          continue;
        }

        sourceChanges.push({
          metricFamily: nextSelection.metricFamily,
          previousSourceId: previousSelection.sourceId,
          nextSourceId: nextSelection.sourceId,
          previousProvenance: previousSelection.provenance,
          nextProvenance: nextSelection.provenance,
          recordedAt: nextSelection.selectedAt ?? new Date().toISOString(),
        });
      }
    }

    const degradedMetrics = nextSelections
      .filter((selection) => this.isMetricSelectionDegraded(selection))
      .map((selection) => selection.metricFamily);

    this.sessionController.setRuntimeSourceState({
      selectedSources: nextSelections,
      currentMetrics: {
        heart_rate: this.buildCurrentMetricValue(
          "heart_rate",
          nextSelectionsByMetric.get("heart_rate"),
        ),
        power: this.buildCurrentMetricValue("power", nextSelectionsByMetric.get("power")),
        cadence: this.buildCurrentMetricValue("cadence", nextSelectionsByMetric.get("cadence")),
        speed: this.buildCurrentMetricValue("speed", nextSelectionsByMetric.get("speed")),
        distance: this.buildCurrentMetricValue("distance", nextSelectionsByMetric.get("distance")),
      },
      degradedState: {
        isDegraded: degradedMetrics.length > 0,
        metrics: degradedMetrics,
      },
      sourceChanges,
    });
  }

  private getRuntimeSourceState(): RecordingRuntimeSourceState {
    this.syncRuntimeSourceState({ recordChanges: false });
    return this.sessionController.getRuntimeSourceState();
  }

  private buildPlanView(): RecordingPlanView {
    if (!this.hasPlan) {
      return {
        hasPlan: false,
        stepIndex: 0,
        stepCount: 0,
        progress: null,
        isLast: false,
        isFinished: false,
        canAdvance: false,
        planTimeRemaining: 0,
      };
    }

    const info = this.getStepInfo();

    return {
      hasPlan: true,
      name: this._plan?.name,
      description: this._plan?.description,
      activityType: this._plan?.activity_category,
      stepIndex: info.index,
      stepCount: info.total,
      currentStep: info.current,
      progress: info.progress,
      isLast: info.isLast,
      isFinished: info.isFinished,
      canAdvance: info.progress?.canAdvance ?? false,
      planTimeRemaining: this.planTimeRemaining,
    };
  }

  private isTrainerManualMode(): boolean {
    return this.getSessionOverrideState().trainerMode === "manual";
  }

  private isSessionIdentityLocked(): boolean {
    return this.sessionController.hasLockedSnapshot();
  }

  private ensureMutableSessionIdentity(action: string): boolean {
    if (!this.isSessionIdentityLocked()) {
      return true;
    }

    const message = `${action} is locked after recording starts for the active session.`;
    console.warn(`[Service] ${message}`);
    this.emit("error", message);
    return false;
  }

  private buildRecordingLaunchIntent(): RecordingLaunchIntent {
    return {
      activityCategory: this.selectedActivityCategory,
      mode: this.hasPlan ? "planned" : "free",
      gpsMode: this._gpsRecordingEnabled ? "on" : "off",
      eventId: this._eventId ?? null,
      activityPlanId: this._plan?.id ?? null,
      routeId: this._plan?.route_id ?? this._currentRoute?.id ?? null,
      sourcePreferences: Object.entries(this.getSessionOverrideState().preferredSources).map(
        ([metricFamily, sourceId]) => ({
          metricFamily: metricFamily as MetricFamily,
          sourceId,
        }),
      ),
      controlPolicy: this.getTrainerControlPolicy(),
    };
  }

  private buildConnectedDevicesSnapshot(): RecordingSessionSnapshot["devices"] {
    const connectedSensors = this.sensorsManager.getConnectedSensors();
    const trainer = this.sensorsManager.getControllableTrainer();

    return {
      connected: connectedSensors.map((sensor) => this.buildConnectedDeviceDescriptor(sensor)),
      controllableTrainer: trainer
        ? {
            deviceId: trainer.id,
            deviceName: trainer.name,
            sourceTypes: this.getMetricSourceTypesForSensor(trainer),
            supportsAutoControl: Boolean(trainer.ftmsFeatures),
            supportsManualControl: true,
          }
        : null,
      selectedSources: this.resolveMetricSources(),
    };
  }

  private buildConnectedDeviceDescriptor(
    sensor: ConnectedSensor,
  ): RecordingSessionSnapshot["devices"]["connected"][number] {
    const sourceTypes = this.getMetricSourceTypesForSensor(sensor);

    return {
      deviceId: sensor.id,
      deviceName: sensor.name,
      role: this.getConnectedDeviceRole(sensor),
      sourceTypes,
      controllable: Boolean(sensor.isControllable),
    };
  }

  private getConnectedDeviceRole(
    sensor: ConnectedSensor,
  ): RecordingSessionSnapshot["devices"]["connected"][number]["role"] {
    const sourceTypes = this.getMetricSourceTypesForSensor(sensor);

    if (sensor.isControllable) return "trainer";
    if (sourceTypes.includes("power_meter")) return "power_meter";
    if (sourceTypes.includes("cadence_sensor")) return "cadence_sensor";
    if (sourceTypes.includes("speed_sensor")) return "speed_sensor";
    if (sourceTypes.includes("chest_strap") || sourceTypes.includes("optical")) {
      return "heart_rate_monitor";
    }

    return "gps";
  }

  private getMetricSourceTypesForSensor(sensor: ConnectedSensor): MetricSourceType[] {
    const sourceTypes = new Set<MetricSourceType>();

    if (sensor.characteristics.has("00002a37-0000-1000-8000-00805f9b34fb")) {
      sourceTypes.add("chest_strap");
    }
    if (sensor.characteristics.has("00002a63-0000-1000-8000-00805f9b34fb")) {
      sourceTypes.add("power_meter");
    }
    if (sensor.characteristics.has("00002a5b-0000-1000-8000-00805f9b34fb")) {
      sourceTypes.add("cadence_sensor");
      sourceTypes.add("speed_sensor");
    }
    if (sensor.characteristics.has("00002a53-0000-1000-8000-00805f9b34fb")) {
      sourceTypes.add("speed_sensor");
      sourceTypes.add("cadence_sensor");
    }
    if (sensor.characteristics.has("00002ad2-0000-1000-8000-00805f9b34fb")) {
      sourceTypes.add("trainer_power");
      sourceTypes.add("trainer_cadence");
      sourceTypes.add("trainer_speed");
      sourceTypes.add("trainer_passthrough");
    }

    return [...sourceTypes];
  }

  private buildProfileSnapshot(): RecordingSessionSnapshot["profileSnapshot"] {
    const defaultsApplied: string[] = [];

    if (!this._baseFtp) defaultsApplied.push("ftp");
    if (!this._baseThresholdHr) defaultsApplied.push("thresholdHr");
    if (!this._baseThresholdPaceSecondsPerKm) defaultsApplied.push("thresholdPaceSecondsPerKm");
    if (!this._baseWeightKg) defaultsApplied.push("weightKg");

    return {
      ftp: this._baseFtp,
      thresholdHr: this._baseThresholdHr,
      thresholdPaceSecondsPerKm: this._baseThresholdPaceSecondsPerKm,
      weightKg: this._baseWeightKg,
      defaultsApplied,
    };
  }

  private buildSessionSnapshot(startedAt: string): RecordingSessionSnapshot {
    const devices = this.buildConnectedDevicesSnapshot();
    const intent = this.buildRecordingLaunchIntent();
    const configuration = RecordingConfigResolver.resolveFromLaunchIntent(intent, {
      plan: this.buildPlanConfigInput(),
      devices: this.buildConfigDevicesInput(),
      gpsAvailable: this._gpsAvailable,
    });

    return deepFreeze({
      identity: {
        sessionId: `${this.profile.id}:${Date.now()}`,
        revision: 1,
        startedAt,
        appBuild: "mobile-recorder-v1",
      },
      activity: {
        category: this.selectedActivityCategory,
        mode: this.hasPlan ? "planned" : "free",
        gpsMode: this._gpsRecordingEnabled ? "on" : "off",
        eventId: this._eventId ?? null,
        activityPlanId: this._plan?.id ?? null,
        routeId: this._plan?.route_id ?? this._currentRoute?.id ?? null,
      },
      profileSnapshot: this.buildProfileSnapshot(),
      devices,
      capabilities: configuration.capabilities,
      policies: {
        sourcePolicy: {
          preferUserSelection: true,
          allowDerivedSpeed: true,
          allowDerivedDistance: true,
        },
        controlPolicy: intent.controlPolicy,
        degradedModePolicy: {
          allowWithoutGps: true,
          allowWithoutSensors: true,
          exposeSourceWarnings: true,
        },
      },
    });
  }

  private buildPlanConfigInput(): RecordingConfiguration["input"]["plan"] {
    if (!this.hasPlan) {
      return undefined;
    }

    return {
      hasStructure: this.stepCount > 0,
      hasRoute: Boolean(this._plan?.route_id || this.hasRoute),
      stepCount: this.stepCount,
      requiresManualAdvance: this.planExecution.hasManualAdvanceSteps(),
    };
  }

  private buildConfigDevicesInput(): RecordingConfiguration["input"]["devices"] {
    const connectedSensors = this.sensorsManager.getConnectedSensors();
    const sourceTypes = connectedSensors.flatMap((sensor) =>
      this.getMetricSourceTypesForSensor(sensor),
    );
    const ftmsTrainer = this.sensorsManager.getControllableTrainer();

    return {
      ftmsTrainer: ftmsTrainer
        ? {
            deviceId: ftmsTrainer.id,
            autoControlEnabled: !this.isTrainerManualMode(),
          }
        : undefined,
      hasPowerMeter: sourceTypes.includes("power_meter") || sourceTypes.includes("trainer_power"),
      hasHeartRateMonitor:
        sourceTypes.includes("chest_strap") ||
        sourceTypes.includes("optical") ||
        sourceTypes.includes("trainer_passthrough"),
      hasCadenceSensor:
        sourceTypes.includes("cadence_sensor") ||
        sourceTypes.includes("trainer_cadence") ||
        sourceTypes.includes("power_meter"),
    };
  }

  private applySessionOverride(override: RecordingSessionOverride): void {
    this.sessionController.applyOverride(override);
    this.publishSessionUpdate();
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

  get eventId(): string | undefined {
    return this._eventId;
  }

  get stepIndex(): number {
    return this.planExecution.getStepIndex();
  }

  get stepCount(): number {
    return this.planExecution.getStepCount();
  }

  get currentStep(): IntervalStepV2 | undefined {
    return this.planExecution.getCurrentStep();
  }

  get nextStep(): IntervalStepV2 | undefined {
    return this.planExecution.getNextStep();
  }

  get allSteps(): IntervalStepV2[] {
    return this.planExecution.getAllSteps();
  }

  get isFinished(): boolean {
    return this.hasPlan && this.planExecution.isFinished();
  }

  // ================================
  // Route Getters
  // ================================

  get hasRoute(): boolean {
    return this._currentRoute !== null;
  }

  get currentRoute(): LoadedRoute | null {
    return this._currentRoute;
  }

  get routeDistance(): number {
    return this._routeDistance;
  }

  get currentRouteDistance(): number {
    return this._currentRouteDistance;
  }

  get routeProgress(): number {
    if (!this.hasRoute || this._routeDistance === 0) return 0;
    return (this._currentRouteDistance / this._routeDistance) * 100;
  }

  /**
   * Get recorded GPS path (all location points recorded so far)
   * Returns array of coordinates for displaying user's path on map
   */
  get recordedGpsPath(): Array<{ latitude: number; longitude: number }> {
    if (!this.liveMetricsManager?.streamBuffer) return [];

    // Get all locations from StreamBuffer's persistent array (not cleared on flush)
    const allLocations = this.liveMetricsManager.streamBuffer.getAllLocations();

    return allLocations.map((loc: any) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
    }));
  }

  /**
   * Get current grade (%) based on route elevation profile
   * Returns grade at current position along route
   */
  get currentRouteGrade(): number {
    if (!this.hasRoute || !this._currentRoute?.elevation_profile) return 0;

    const profile = this._currentRoute.elevation_profile;
    if (!profile || profile.length < 2) return 0;

    // Find the segment we're currently on
    let segmentIndex = 0;
    for (let i = 0; i < profile.length - 1; i++) {
      if (
        this._currentRouteDistance >= profile[i].distance &&
        this._currentRouteDistance < profile[i + 1].distance
      ) {
        segmentIndex = i;
        break;
      }
    }

    // Calculate grade between current and next point
    const current = profile[segmentIndex];
    const next = profile[Math.min(segmentIndex + 1, profile.length - 1)];

    const elevationChange = next.elevation - current.elevation;
    const distanceChange = next.distance - current.distance;

    if (distanceChange === 0) return 0;

    // Grade as percentage: (rise / run) * 100
    return (elevationChange / distanceChange) * 100;
  }

  get stepProgress(): StepProgress {
    const progress = this.planExecution.getStepProgress(this.getMovingTime());
    if (!progress) throw new Error("No plan or current step");
    return progress;
  }

  getStepInfo(): StepInfo {
    return this.planExecution.getStepInfo(this.getMovingTime());
  }
  get planTimeRemaining(): number {
    if (!this.hasPlan) return 0;
    return this.planExecution.getPlanTimeRemaining(this.getMovingTime());
  }

  // ================================
  // Plan Actions
  // ================================

  selectPlan(plan: RecordingServiceActivityPlan, eventId?: string): void {
    if (!this.ensureMutableSessionIdentity("Plan selection")) {
      return;
    }

    console.log("[Service] Selected plan:", plan.name);
    console.log("[Service] Plan structure:", JSON.stringify(plan.structure, null, 2));

    this._plan = plan;
    this._eventId = eventId;
    if (!plan.activity_category) {
      throw new Error("no plan category found");
    }

    // Load route if plan has one
    if (plan.route_id) {
      console.log("[Service] Plan has route, loading route data:", plan.route_id);
      this.loadRoute(plan.route_id).catch((error) => {
        console.error("[Service] Failed to load route:", error);
        // Continue without route - don't fail the whole plan selection
      });
    }

    try {
      this.planExecution.loadPlan(plan, eventId);

      console.log(`[Service] Loaded ${this.planExecution.getStepCount()} steps from plan manager`);

      if (this.planExecution.getStepCount() === 0) {
        console.warn("[Service] Plan structure has 0 steps");
      }
    } catch (error) {
      console.error("[Service] Error loading plan steps:", error);
      console.error(
        "[Service] Error details:",
        error instanceof Error ? error.message : String(error),
      );
      this.planExecution.clear();
    }

    this.selectedActivityCategory = plan.activity_category;
    this.syncGpsTrackingForCurrentState();

    this.emit("planSelected", { plan, eventId });

    // Emit step changed immediately so UI shows the first step
    this.emit("stepChanged", this.getStepInfo());
    this.publishSessionUpdate();

    console.log("[Service] Plan ready with first step:", this.currentStep?.name);
  }

  clearPlan(): void {
    if (!this.ensureMutableSessionIdentity("Plan clearing")) {
      return;
    }

    console.log("[Service] Clearing plan");

    this._plan = undefined;
    this._eventId = undefined;
    this.planExecution.clear();
    this._currentRoute = null;
    this._routeDistance = 0;
    this._currentRouteDistance = 0;

    this.emit("planCleared");
    this.publishSessionUpdate();
  }

  /**
   * Load full route data from the server
   */
  private async loadRoute(routeId: string): Promise<void> {
    try {
      console.log("[Service] Loading route:", routeId);

      // Import vanilla trpc client (for use outside React components)
      const { getVanillaTrpcClient } = await import("@/lib/trpc");

      // Load full route with coordinates
      const route = await getVanillaTrpcClient().routes.loadFull.query({
        id: routeId,
      });

      if (!route || !route.coordinates || route.coordinates.length === 0) {
        console.warn("[Service] Route has no coordinates");
        return;
      }

      this._currentRoute = route;

      // Calculate total route distance
      this._routeDistance = this.calculateRouteDistance(route.coordinates);
      this._currentRouteDistance = 0;

      console.log("[Service] Route loaded successfully:", {
        id: route.id,
        name: route.name,
        points: route.coordinates.length,
        distance: this._routeDistance,
      });

      this.publishSessionUpdate();
    } catch (error) {
      console.error("[Service] Failed to load route:", error);
      throw error;
    }
  }

  /**
   * Calculate total distance of a route from coordinates
   */
  private calculateRouteDistance(
    coordinates: Array<{ latitude: number; longitude: number }>,
  ): number {
    if (coordinates.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      totalDistance += this.calculateDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );
    }

    return totalDistance;
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Update current position along route
   * Called from location updates
   */
  private updateRouteProgress(latitude: number, longitude: number): void {
    if (!this.hasRoute || !this._currentRoute?.coordinates) return;

    const previousDistance = this._currentRouteDistance;

    // Find closest point on route and calculate distance traveled
    const coordinates = this._currentRoute.coordinates;
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < coordinates.length; i++) {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        coordinates[i].latitude,
        coordinates[i].longitude,
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    // Calculate distance along route up to closest point
    let distanceAlongRoute = 0;
    for (let i = 1; i <= closestIndex; i++) {
      distanceAlongRoute += this.calculateDistance(
        coordinates[i - 1].latitude,
        coordinates[i - 1].longitude,
        coordinates[i].latitude,
        coordinates[i].longitude,
      );
    }

    this._currentRouteDistance = distanceAlongRoute;

    // Apply grade-based resistance when GPS recording is disabled with FTMS
    // Only if: has trainer, recording, and NOT in manual control mode
    if (
      !this._gpsRecordingEnabled &&
      this.state === "recording" &&
      !this.isTrainerManualMode() &&
      Math.abs(distanceAlongRoute - previousDistance) > 10 // Only update every 10m
    ) {
      this.trainerControl.applyRouteGrade(this.currentRouteGrade).catch(console.error);
    }
  }

  private getFitSport(
    category: PublicActivityCategory,
    gpsRecordingEnabled: boolean,
  ): { sport: string; subSport: string } {
    switch (category) {
      case "bike":
        return {
          sport: "cycling",
          subSport: gpsRecordingEnabled ? "road" : "indoor_cycling",
        };
      case "run":
        return {
          sport: "running",
          subSport: gpsRecordingEnabled ? "road" : "treadmill",
        };
      case "swim":
        return { sport: "swimming", subSport: "lap_swimming" };
      default:
        return { sport: "generic", subSport: "generic" };
    }
  }

  /**
   * Start GPS location tracking early (before recording starts)
   * This allows the map to show the user's location in pending state
   */
  private async startEarlyLocationTracking(): Promise<void> {
    if (!this._gpsRecordingEnabled) {
      return;
    }

    try {
      console.log("[Service] Starting early location tracking for GPS map preview");
      await this.locationManager.startForegroundTracking();
      this._gpsAvailable = true;
      console.log("[Service] Early location tracking started successfully");
      this.publishSessionUpdate();
    } catch (error) {
      console.error("[Service] Failed to start early location tracking:", error);
      // Don't throw - this is a nice-to-have for map preview
    }
  }

  /**
   * Stop early GPS location tracking
   */
  private async stopEarlyLocationTracking(): Promise<void> {
    try {
      await this.locationManager.stopForegroundTracking();
      this._gpsAvailable = false;
      console.log("[Service] Early location tracking stopped");
      this.publishSessionUpdate();
    } catch (error) {
      console.error("[Service] Failed to stop early location tracking:", error);
    }
  }

  private async syncGpsTrackingForCurrentState(): Promise<void> {
    if (!this._gpsRecordingEnabled) {
      await this.stopEarlyLocationTracking();
      if (this._gpsAvailable) {
        await this.locationManager.stopHeadingTracking();
        await this.locationManager.stopForegroundTracking();
        await this.locationManager.stopBackgroundTracking();
        this._gpsAvailable = false;
        this.publishSessionUpdate();
      }
      return;
    }

    if (shouldStartGpsTracking(this.state, this._gpsRecordingEnabled)) {
      await this.locationManager.startForegroundTracking();
      await this.locationManager.startBackgroundTracking();
      await this.locationManager.startHeadingTracking();
      this._gpsAvailable = true;
      this.publishSessionUpdate();
      return;
    }

    if (this.state === "pending" || this.state === "ready") {
      await this.startEarlyLocationTracking();
    }
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

    console.log(`[Service] Advancing to step ${this.stepIndex + 1}`);

    this.planExecution.advance(this.getMovingTime());

    this.emit("stepChanged", this.getStepInfo());

    if (this.state === "recording" && this.currentStep) {
      this.trainerControl.applyStepTargets(this.currentStep, "step_change").catch(console.error);
    }

    if (this.isFinished) {
      console.log("[Service] Plan completed!");
      this.emit("planCompleted");
    }
  }

  public getTrainerMachineType() {
    return inferTrainerMachineType(this.sensorsManager.getControllableTrainer());
  }

  public getTrainerFeatures(): FTMSFeatures | null {
    return this.sensorsManager.getControllableTrainer()?.ftmsFeatures ?? null;
  }

  public getBleState(): string {
    return this.sensorsManager.getBleState();
  }

  public async resetAllSensors(): Promise<void> {
    await this.sensorsManager.resetAllSensors();
  }

  public async applyManualTrainerPower(watts: number): Promise<boolean> {
    return this.trainerControl.applyManualPower(watts);
  }

  public async applyManualTrainerResistance(resistance: number): Promise<boolean> {
    return this.trainerControl.applyManualResistance(resistance);
  }

  public async applyManualTrainerSimulation(params: {
    gradePercent: number;
    windSpeedMps: number;
    rollingResistanceCoefficient?: number;
    aerodynamicDragCoefficient?: number;
  }): Promise<boolean> {
    return this.trainerControl.applyManualSimulation(params);
  }

  public async applyManualTrainerSpeed(speedKph: number): Promise<boolean> {
    return this.trainerControl.applyManualSpeed(speedKph);
  }

  public async applyManualTrainerIncline(inclinePercent: number): Promise<boolean> {
    return this.trainerControl.applyManualIncline(inclinePercent);
  }

  public async applyManualTrainerCadence(rpm: number): Promise<boolean> {
    return this.trainerControl.applyManualCadence(rpm);
  }

  // ================================
  // GPS Recording Control
  // ================================

  public isGpsRecordingEnabled(): boolean {
    return this._gpsRecordingEnabled;
  }

  public async enableGpsRecording(): Promise<void> {
    if (!this.ensureMutableSessionIdentity("GPS mode")) {
      return;
    }

    if (this._gpsRecordingEnabled) {
      return;
    }

    this._gpsRecordingEnabled = true;
    this.emit("gpsTrackingChanged", true);
    this.emit("activitySelected", {
      category: this.selectedActivityCategory,
      gpsRecordingEnabled: true,
    });
    await this.syncGpsTrackingForCurrentState();
    this.publishSessionUpdate();
  }

  public async disableGpsRecording(): Promise<void> {
    if (!this.ensureMutableSessionIdentity("GPS mode")) {
      return;
    }

    if (!this._gpsRecordingEnabled) {
      return;
    }

    this._gpsRecordingEnabled = false;
    this.emit("gpsTrackingChanged", false);
    this.emit("activitySelected", {
      category: this.selectedActivityCategory,
      gpsRecordingEnabled: false,
    });
    await this.syncGpsTrackingForCurrentState();
    this.publishSessionUpdate();
  }

  public async toggleGpsRecording(): Promise<void> {
    if (getNextGpsRecordingEnabled(this._gpsRecordingEnabled)) {
      await this.enableGpsRecording();
    } else {
      await this.disableGpsRecording();
    }
  }

  // ================================
  // Recording Lifecycle
  // ================================

  /**
   * Validate plan requirements before starting recording
   * Returns validation result with missing metrics and warnings
   */
  public validatePlanRequirements(): PlanValidationResult | null {
    if (!this._plan) {
      return null; // No plan, no validation needed
    }

    return validatePlanRequirements(this._plan, this.profile);
  }

  // ================================
  // Configuration
  // ================================

  /**
   * Get the current recording configuration based on state and sensors
   */
  public getRecordingConfiguration(): RecordingConfiguration {
    const sessionSnapshot = this.getSessionSnapshot();
    const baseConfiguration = sessionSnapshot
      ? RecordingConfigResolver.resolveFromSessionSnapshot(sessionSnapshot, {
          plan: this.buildPlanConfigInput(),
          gpsAvailable: this._gpsAvailable,
        })
      : RecordingConfigResolver.resolveFromLaunchIntent(this.buildRecordingLaunchIntent(), {
          plan: this.buildPlanConfigInput(),
          devices: this.buildConfigDevicesInput(),
          gpsAvailable: this._gpsAvailable,
        });

    const validation = this.validatePlanRequirements();

    return {
      input: baseConfiguration.input,
      capabilities: {
        ...baseConfiguration.capabilities,
        isValid: validation?.isValid ?? baseConfiguration.capabilities.isValid,
        errors:
          validation?.missingMetrics.map((metric) => metric.name) ??
          baseConfiguration.capabilities.errors,
        warnings: validation?.warnings ?? baseConfiguration.capabilities.warnings,
      },
    };
  }

  async startRecording() {
    console.log("[Service] Starting recording");

    // Prevent concurrent recordings
    if (this.state === "recording") {
      const error = "Cannot start recording: A recording is already in progress";
      console.error(`[Service] ${error}`);
      throw new Error(error);
    }

    if (this.state === "paused") {
      const error = "Cannot start recording: Please resume the paused recording first";
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

    const startedAt = new Date().toISOString();
    this.finalizedArtifact = null;
    const sessionSnapshot = this.buildSessionSnapshot(startedAt);
    this.sessionController.resetForNewSession(sessionSnapshot);
    this.publishSnapshotUpdate();

    // Create recording metadata (in-memory)
    this.recordingMetadata = {
      startedAt,
      activityCategory: sessionSnapshot.activity.category,
      gpsRecordingEnabled: sessionSnapshot.activity.gpsMode === "on",
      profileId: this.profile.id,
      profile: this.profile,
      eventId: sessionSnapshot.activity.eventId ?? undefined,
      activityPlan: this._plan,
    };

    this.state = "recording";
    this.sessionController.setLifecycle(this.state);

    // Configure LiveMetricsManager before starting
    this.liveMetricsManager.setGpsRecordingEnabled(this._gpsRecordingEnabled);
    this.liveMetricsManager.setActivityCategory(this.selectedActivityCategory);

    // Start LiveMetricsManager (initializes StreamBuffer)
    await this.liveMetricsManager.startRecording();

    // Initialize timing
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.lastPauseTime = undefined;

    this.planExecution.resetForRecordingStart(0);

    // If we have a plan, emit the initial step info now that recording has started
    if (this.hasPlan && this.currentStep) {
      console.log("[Service] Recording started with plan, step:", this.currentStep.name);
      this.emit("stepChanged", this.getStepInfo());
      this.trainerControl.applyStepTargets(this.currentStep, "step_change").catch(console.error);
    }

    this.startElapsedTimeUpdates();

    if (this._gpsRecordingEnabled) {
      await this.locationManager.startForegroundTracking();
      await this.locationManager.startBackgroundTracking();
      await this.locationManager.startHeadingTracking();
      this._gpsAvailable = true;
    } else {
      this._gpsAvailable = false;
    }

    // Start foreground service notification
    const activityName =
      this._plan?.name ||
      `${this.selectedActivityCategory} (${this._gpsRecordingEnabled ? "GPS ON" : "GPS OFF"})`;
    this.notificationsManager = new NotificationsManager(activityName);
    await this.notificationsManager.startForegroundService();

    // Initialize FIT Encoder
    try {
      const encoder = new GarminFitEncoder(`${Date.now()}`, this.profile.id);
      await encoder.initialize(this.sensorsManager.getConnectedSensors());
      this.fitEncoder = encoder;
      console.log("[Service] FIT encoder initialized");

      // Write initial FIT record immediately to ensure file has data
      // This prevents "No data recorded" errors for very short recordings
      await this.updateFitRecording();
      console.log("[Service] Initial FIT record written");
    } catch (error) {
      console.error("[Service] Failed to initialize FIT encoder:", error);
      // Don't fail the whole recording if FIT encoding fails
    }

    // Emit initial sensor state
    this.emit("sensorsChanged", this.sensorsManager.getConnectedSensors());
    this.emit("stateChanged", this.state);
    this.publishSessionUpdate();
    console.log("[Service] Recording started successfully");
  }

  async pauseRecording() {
    if (this.state !== "recording") {
      throw new Error("Cannot pause - not recording");
    }

    console.log("[Service] Pausing recording");

    const pauseTimestamp = Date.now();
    this.state = "paused";
    this.sessionController.setLifecycle(this.state);
    this.lastPauseTime = pauseTimestamp;

    // Pause LiveMetricsManager
    this.liveMetricsManager.pauseRecording();

    // Pause FIT encoder timer
    if (this.fitEncoder) {
      await this.fitEncoder.pause();
    }

    this.stopElapsedTimeUpdates();

    this.emit("stateChanged", this.state);
    this.publishSessionUpdate();
  }

  async resumeRecording() {
    if (this.state !== "paused") {
      throw new Error("Cannot resume - not paused");
    }

    console.log("[Service] Resuming recording");

    const resumeTimestamp = Date.now();
    this.state = "recording";
    this.sessionController.setLifecycle(this.state);

    // Resume LiveMetricsManager
    this.liveMetricsManager.resumeRecording();

    // Update paused time accumulator
    if (this.lastPauseTime) {
      const pauseDuration = resumeTimestamp - this.lastPauseTime;
      this.pausedTime += pauseDuration;
      this.lastPauseTime = undefined;
    }

    // Resume FIT encoder timer
    if (this.fitEncoder) {
      await this.fitEncoder.resume();
    }

    this.startElapsedTimeUpdates();

    this.emit("stateChanged", this.state);
    this.publishSessionUpdate();
  }

  async finishRecording() {
    if (!this.recordingMetadata) {
      throw new Error("No active recording to finish");
    }

    if (this.state === "finishing") {
      throw new Error("Recording finalization is already in progress");
    }

    console.log("[Service] Finishing recording");

    const previousState = this.state;
    this.state = "finishing";
    this.sessionController.setLifecycle(this.state);
    this.emit("stateChanged", this.state);
    this.publishSessionUpdate();

    try {
      // Finish LiveMetricsManager (flushes final data to files)
      await this.liveMetricsManager.finishRecording();

      // Check StreamBuffer status before finalizing
      const bufferStatus = this.liveMetricsManager.streamBuffer.getBufferStatus();
      console.log("[Service] StreamBuffer status:", bufferStatus);

      // Finalize FIT file
      if (this.fitEncoder) {
        try {
          const stats = this.getSessionStats();

          // VALIDATION: Ensure we have some data
          const status = this.fitEncoder.getStatus();
          if (status.recordCount === 0) {
            throw new Error(
              "No data recorded. FIT file would be invalid without any records. Please ensure sensors are connected and recording for at least a few seconds.",
            );
          }

          console.log(
            `[Service] Finalizing FIT file with ${status.recordCount} records, ${stats.duration}s duration`,
          );

          const { sport, subSport } = this.getFitSport(
            this.selectedActivityCategory,
            this._gpsRecordingEnabled,
          );
          await this.fitEncoder.finalize({
            startTime: this.startTime || Date.now(),
            totalTime: stats.duration * 1000, // Convert to milliseconds
            distance: stats.distance,
            avgSpeed: stats.avgSpeed,
            maxSpeed: stats.maxSpeed,
            avgPower: stats.avgPower,
            maxPower: stats.maxPower,
            avgHeartRate: stats.avgHeartRate,
            maxHeartRate: stats.maxHeartRate,
            avgCadence: stats.avgCadence,
            totalAscent: stats.ascent,
            totalDescent: stats.descent,
            calories: stats.calories,
            sport,
            subSport,
          });

          // Add file path to metadata
          this.recordingMetadata.fitFilePath = this.fitEncoder.getFilePath();
          console.log("[Service] FIT file finalized:", this.recordingMetadata.fitFilePath);
        } catch (error) {
          console.error("[Service] Failed to finalize FIT file:", error);
          // Re-throw so UI can show proper error
          throw new Error(
            `FIT file creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      // Update recording metadata with end time
      this.recordingMetadata.endedAt = new Date().toISOString();

      const sessionSnapshot = this.getSessionSnapshot();
      if (sessionSnapshot) {
        this.finalizedArtifact = {
          sessionId: sessionSnapshot.identity.sessionId,
          snapshot: sessionSnapshot,
          overrides: this.getSessionOverrides(),
          finalStats: {
            durationSeconds: this.getSessionStats().duration,
            movingSeconds: this.getSessionStats().movingTime,
            distanceMeters: this.getSessionStats().distance,
            calories: this.getSessionStats().calories,
          },
          fitFilePath: this.recordingMetadata.fitFilePath ?? null,
          streamArtifactPaths: [this.liveMetricsManager.streamBuffer.getBufferStatus().storageDir],
          completedAt: this.recordingMetadata.endedAt,
          runtimeSourceState: this.getRuntimeSourceState(),
        };

        await persistPendingFinalizedArtifact(this.finalizedArtifact);
        this.emit("artifactReady", this.finalizedArtifact);
      }

      // Update state
      this.state = "finished";
      this.sessionController.setLifecycle(this.state);
      this.emit("stateChanged", this.state);
      this.publishSessionUpdate();

      // Emit completion event to signal data is ready for processing
      this.emit("recordingComplete");

      // Clean up resources
      if (this.notificationsManager) {
        await this.notificationsManager.stopForegroundService();
      }

      console.log("[Service] Recording finished successfully");
    } catch (err) {
      console.error("[Service] Failed to finish recording:", err);
      this.state = previousState;
      this.sessionController.setLifecycle(this.state);
      this.emit("stateChanged", this.state);
      this.publishSessionUpdate();
      this.emit("error", "Failed to save recording data.");
      throw err;
    }
  }

  // ================================
  // Activity Selection
  // ================================

  updateActivityConfiguration(
    category: PublicActivityCategory,
    gpsRecordingEnabled: boolean,
  ): void {
    if (!this.ensureMutableSessionIdentity("Activity configuration")) {
      return;
    }

    this.selectedActivityCategory = category;
    this._gpsRecordingEnabled = gpsRecordingEnabled;
    this.syncGpsTrackingForCurrentState().catch(console.error);
    this.emit("gpsTrackingChanged", gpsRecordingEnabled);
    this.emit("activitySelected", { category, gpsRecordingEnabled });
    this.publishSessionUpdate();
  }

  selectUnplannedActivity(category: PublicActivityCategory, gpsRecordingEnabled: boolean): void {
    if (!this.ensureMutableSessionIdentity("Activity selection")) {
      return;
    }

    this.selectedActivityCategory = category;
    this._gpsRecordingEnabled = gpsRecordingEnabled;
    this.clearPlan();
    this.syncGpsTrackingForCurrentState().catch(console.error);
    this.emit("gpsTrackingChanged", gpsRecordingEnabled);
    this.emit("activitySelected", { category, gpsRecordingEnabled });
    this.publishSessionUpdate();
  }

  /**
   * Initialize activity recording from an ActivityPayload.
   * Handles both planned activities (with structure) and quick-start activities.
   *
   * @param payload - ActivityPayload containing activity type and optional plan
   */
  selectActivityFromPayload(payload: import("@repo/core").ActivityPayload): void {
    console.log("[Service] Initializing from payload:", payload);

    try {
      if (!this.ensureMutableSessionIdentity("Activity payload changes")) {
        this.emit("payloadProcessed", payload);
        return;
      }

      if (payload.plan) {
        // Template or planned activity with structure
        const plan: RecordingServiceActivityPlan = {
          name: payload.plan.name,
          description: payload.plan.description || "",
          activity_category: payload.plan.activity_category || payload.category,
          structure: payload.plan.structure,
          route_id: payload.plan.route_id || null,
        };

        this._gpsRecordingEnabled = payload.gpsRecordingEnabled;
        this.syncGpsTrackingForCurrentState().catch(console.error);
        this.emit("gpsTrackingChanged", payload.gpsRecordingEnabled);

        console.log("[Service] Selecting plan from payload:", plan.name);
        this.selectPlan(plan, payload.eventId);
      } else {
        // Quick start activity - only clear plan if this is truly initial setup
        // Check if there's an existing plan to determine if this is initial setup
        // If there's already a plan attached, preserve it and just update configuration
        if (this.state === "pending" && !this.hasPlan) {
          // True initial setup: no plan exists, state is pending
          console.log(
            "[Service] Selecting unplanned activity from payload (initial):",
            payload.category,
            payload.gpsRecordingEnabled,
          );
          this.selectUnplannedActivity(payload.category, payload.gpsRecordingEnabled);
        } else {
          // Plan exists OR recording has started: preserve plan and just update config
          console.log(
            "[Service] Updating activity configuration from payload:",
            payload.category,
            payload.gpsRecordingEnabled,
            "hasPlan:",
            this.hasPlan,
          );
          this.updateActivityConfiguration(payload.category, payload.gpsRecordingEnabled);
        }
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
    this.sessionController.updateOverrideState((state) => ({
      ...state,
      trainerMode: enabled ? "manual" : "auto",
    }));
    console.log(`[Service] Manual control: ${enabled ? "enabled" : "disabled"}`);

    if (this.getSessionSnapshot()) {
      this.applySessionOverride({
        type: "trainer_mode",
        value: enabled ? "manual" : "auto",
        scope: "until_changed",
        recordedAt: new Date().toISOString(),
      });
    }

    if (!enabled && this.state === "recording" && this.currentStep) {
      // Re-apply plan targets when switching back to auto
      console.log("[Service] Reapplying plan targets after manual override disabled");
      this.trainerControl.applyStepTargets(this.currentStep, "step_change").catch(console.error);
    }

    this.publishSessionUpdate();
  }

  /**
   * Check if manual control override is currently active
   */
  public isManualControlActive(): boolean {
    return this.isTrainerManualMode();
  }

  // ================================
  // Data Handling
  // ================================

  private handleSensorData(reading: SensorReading) {
    // Always ingest sensor data for real-time display (even before recording starts)
    // The LiveMetricsManager will only persist data when recording is active
    this.liveMetricsManager.ingestSensorData(reading);

    // Only update notifications and do recording-specific processing when actually recording
    if (this.state !== "recording") return;

    // Update notification with key metrics
    if (
      ["heartrate", "power"].includes(reading.metric) &&
      this.notificationsManager &&
      typeof reading.value === "number"
    ) {
      const metrics = this.liveMetricsManager.getMetrics();
      const progress = this.hasPlan && this.currentStep ? this.stepProgress : null;
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
    if (!this._gpsRecordingEnabled) {
      return;
    }

    const timestamp = location.timestamp || Date.now();

    // Ingest location data for real-time display (even in pending state for map preview)
    // The LiveMetricsManager will only persist data when recording is active
    this.liveMetricsManager.ingestLocationData({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude || undefined,
      accuracy: location.coords.accuracy || undefined,
      heading: location.coords.heading || undefined,
      timestamp: timestamp,
    });

    // Only process for recording logic when actually recording/paused
    if (this.state !== "recording" && this.state !== "paused") return;

    // Update route progress if a route is loaded
    if (this.hasRoute) {
      this.updateRouteProgress(location.coords.latitude, location.coords.longitude);
    }
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

    // Emit time update for UI (convert milliseconds to seconds)
    this.emit("timeUpdated", {
      elapsed: Math.floor(this.getElapsedTime() / 1000),
      moving: Math.floor(this.getMovingTime() / 1000),
    });
    this.publishSessionUpdate();

    // Auto-advance plan steps when recording
    if (this.state === "recording") {
      // Update FIT recording every second
      this.updateFitRecording();

      if (this.hasPlan && this.currentStep) {
        const progress = this.stepProgress;
        if (progress && !progress.requiresManualAdvance && progress.progress >= 1) {
          this.advanceStep();
        }
      }
    }
  }

  /**
   * Update FIT recording with current data
   * Called every second by updateElapsedTime
   */
  private async updateFitRecording() {
    if (!this.fitEncoder || this.state !== "recording") return;

    try {
      if (this.selectedActivityCategory === "swim") {
        // TODO: Implement swim logic
      } else {
        // Time-based activities
        const readings = this.liveMetricsManager.getCurrentReadings();
        const stats = this.liveMetricsManager.getSessionStats();

        const record: FitRecord = {
          timestamp: Date.now(),
          distance: stats.distance,
          speed: readings.speed,
          heartRate: readings.heartRate,
          cadence: readings.cadence,
          power: readings.power,
          temperature: readings.temperature,
        };

        if (readings.position) {
          record.latitude = readings.position.lat;
          record.longitude = readings.position.lng;
          record.altitude = readings.position.alt;
        }

        await this.fitEncoder.addRecord(record);

        // Log periodically (every 10 seconds) to track recording progress
        const status = this.fitEncoder.getStatus();
        if (status.recordCount % 10 === 0 && status.recordCount > 0) {
          console.log(`[Service] FIT recording progress: ${status.recordCount} records`);
        }
      }
    } catch (error) {
      console.error("[Service] Failed to update FIT recording:", error);
    }
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime(): number {
    if (!this.startTime) return 0;
    if (this.state === "paused" && this.lastPauseTime) {
      return this.lastPauseTime - this.startTime;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Get moving time in milliseconds (excludes paused time)
   */
  getMovingTime(): number {
    if (!this.startTime) return 0;
    const elapsed = this.getElapsedTime();
    return elapsed - this.pausedTime;
  }

  /**
   * Get current lap time in milliseconds
   */
  getLapTime(): number {
    return this.getMovingTime() - this.lastLapTime;
  }

  /**
   * Record a new lap
   */
  recordLap(): void {
    if (this.state !== "recording") return;

    const movingTime = this.getMovingTime();
    const lapTime = movingTime - this.lastLapTime;
    this.laps.push(lapTime);
    this.lastLapTime = movingTime;

    this.emit("lapRecorded");
  }

  /**
   * Get all recorded laps
   */
  getLaps(): number[] {
    return this.laps;
  }

  // ================================
  // Cleanup
  // ================================

  /**
   * Clean up all resources
   */
  cleanup() {
    console.log("[Service] Cleaning up...");

    const preserveFinalizedArtifact = this.finalizedArtifact !== null;

    this.stopElapsedTimeUpdates();
    this.liveMetricsManager.cleanup().catch(console.error);
    this.locationManager.cleanup();
    this.sensorsManager.cleanup();
    if (this.notificationsManager) {
      this.notificationsManager.stopForegroundService().catch(console.error);
    }
    if (this.fitEncoder && !preserveFinalizedArtifact) {
      this.fitEncoder.cleanup().catch(console.error);
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }

    this.sessionController.resetAll();
    this.publishSnapshotUpdate();
  }
}
