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
  BLE_SERVICE_UUIDS,
  PublicActivityCategory,
  PublicActivityLocation,
  PublicProfilesRow,
  RecordingServiceActivityPlan,
  type IntervalStepV2,
} from "@repo/core";

import {
  areAllPermissionsGranted,
  checkAllPermissions,
  type AllPermissionsStatus,
} from "../permissions-check";
import { LiveMetricsManager } from "./LiveMetricsManager";
import { LocationManager } from "./location";
import { NotificationsManager } from "./notification";
import { PlanManager } from "./plan";
import { SensorsManager } from "./sensors";
import { RecordingMetadata, SensorReading } from "./types";

import { EventEmitter } from "expo";
import { LocationObject } from "expo-location";
import { AppState, AppStateStatus } from "react-native";
import { SimplifiedMetrics } from "./SimplifiedMetrics";
import {
  validatePlanRequirements,
  type PlanValidationResult,
} from "./planValidation";

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
  current: IntervalStepV2 | undefined;
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
  activitySelected: (data: {
    category: PublicActivityCategory;
    location: PublicActivityLocation;
  }) => void;

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

  // GPS tracking events
  gpsTrackingChanged: (enabled: boolean) => void;

  // Index signature for EventsMap
  [key: string]: (...args: any[]) => void;
}

// ================================
// Activity Recorder Service
// ================================

export class ActivityRecorderService extends EventEmitter<ServiceEvents> {
  // === Public State ===
  public state: RecordingState = "pending";
  public selectedActivityCategory: PublicActivityCategory = "bike";
  public selectedActivityLocation: PublicActivityLocation = "indoor";
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
  private _steps: IntervalStepV2[] = [];
  private _stepIndex: number = 0;
  private _stepStartMovingTime: number = 0; // Moving time when current step started

  // === Manual Control Override ===
  private manualControlOverride: boolean = false;

  // === GPS Availability Cache ===
  private _gpsAvailable: boolean = false;

  // === GPS Tracking Control ===
  private _gpsTrackingEnabled: boolean = true;

  // === Route State ===
  private _currentRoute: any | null = null; // Full route data with coordinates
  private _routeDistance: number = 0; // Total route distance in meters
  private _currentRouteDistance: number = 0; // User's current distance along route

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

  // === Lap Tracking ===
  private laps: number[] = []; // Array of lap times (moving time in seconds)
  private lastLapTime: number = 0; // Moving time when last lap was recorded

  // === Profile ===
  private profile: PublicProfilesRow;
  private ftp?: number;
  private thresholdHr?: number;
  private weightKg?: number;

  constructor(
    profile: PublicProfilesRow,
    metrics?: { ftp?: number; thresholdHr?: number; weightKg?: number }
  ) {
    super();
    // Note: expo-modules-core EventEmitter doesn't have setMaxListeners
    // If you need more listeners, consider using Node.js EventEmitter instead
    this.profile = profile;
    this.ftp = metrics?.ftp;
    this.thresholdHr = metrics?.thresholdHr;
    this.weightKg = metrics?.weightKg;

    // Initialize managers
    this.liveMetricsManager = new LiveMetricsManager(profile, metrics);
    this.locationManager = new LocationManager();
    this.sensorsManager = new SensorsManager();

    // Note: Location tracking is now started conditionally when activity is selected
    // (only for outdoor activities) rather than immediately in constructor

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

  get currentStep(): IntervalStepV2 | undefined {
    return this._steps[this._stepIndex];
  }

  get nextStep(): IntervalStepV2 | undefined {
    return this._steps[this._stepIndex + 1];
  }

  get allSteps(): IntervalStepV2[] {
    return this._steps;
  }

  get isFinished(): boolean {
    return this.hasPlan && this._stepIndex >= this._steps.length;
  }

  // ================================
  // Route Getters
  // ================================

  get hasRoute(): boolean {
    return this._currentRoute !== null;
  }

  get currentRoute(): any | null {
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
    const allLocations =
      (this.liveMetricsManager.streamBuffer as any).getAllLocations?.() || [];

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
    if (!this.hasPlan || !this.currentStep)
      throw new Error("No plan or current step");

    const step = this.currentStep;
    const movingTime = this.getMovingTime() - this._stepStartMovingTime;

    let durationMs = 0;
    let requiresManualAdvance = false;

    if (step.duration.type === "untilFinished") {
      requiresManualAdvance = true;
    } else if (step.duration.type === "time") {
      durationMs = step.duration.seconds * 1000;
    } else if (step.duration.type === "distance") {
      // Placeholder: Assuming 5 m/s (18 km/h) average speed for distance-based steps
      // This should ideally come from user profile or activity type for better accuracy
      const estimatedSpeedMPS = 5; // meters per second
      durationMs = (step.duration.meters / estimatedSpeedMPS) * 1000;
    } else if (step.duration.type === "repetitions") {
      // For repetitions, we can't estimate duration - treat as manual advance
      requiresManualAdvance = true;
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
      if (step.duration.type === "untilFinished") {
        // If a step is "untilFinished", we cannot determine total remaining time
        // For simplicity, we'll return 0 to signify indefinite
        return 0;
      } else if (step.duration.type === "time") {
        totalRemainingMs += step.duration.seconds * 1000;
      } else if (step.duration.type === "distance") {
        const estimatedSpeedMPS = 5; // meters per second (placeholder)
        totalRemainingMs += (step.duration.meters / estimatedSpeedMPS) * 1000;
      } else if (step.duration.type === "repetitions") {
        // Can't estimate duration for repetitions
        return 0;
      }
    }

    return totalRemainingMs;
  }

  // ================================
  // Plan Actions
  // ================================

  selectPlan(plan: RecordingServiceActivityPlan, plannedId?: string): void {
    console.log("[Service] Selected plan:", plan.name);
    console.log(
      "[Service] Plan structure:",
      JSON.stringify(plan.structure, null, 2),
    );

    this._plan = plan;
    this._plannedActivityId = plannedId;
    if (!plan.activity_category || !plan.activity_location) {
      throw new Error("no plan category or location found");
    }

    // Load route if plan has one
    if (plan.route_id) {
      console.log(
        "[Service] Plan has route, loading route data:",
        plan.route_id,
      );
      this.loadRoute(plan.route_id).catch((error) => {
        console.error("[Service] Failed to load route:", error);
        // Continue without route - don't fail the whole plan selection
      });
    }

    // Create PlanManager which will handle expanding intervals to flat steps
    try {
      // PlanManager constructor expands intervals × repetitions into flat steps internally
      const planManager = new PlanManager(plan, plannedId);
      this._steps = (planManager as any).steps || []; // Access private steps array

      console.log(
        `[Service] Loaded ${this._steps.length} steps from plan manager`,
      );

      if (this._steps.length === 0) {
        console.warn("[Service] Plan structure has 0 steps");
      }
    } catch (error) {
      console.error("[Service] Error loading plan steps:", error);
      console.error(
        "[Service] Error details:",
        error instanceof Error ? error.message : String(error),
      );
      this._steps = [];
    }

    // Initialize to step 0 (first step)
    this._stepIndex = 0;
    this._stepStartMovingTime = 0; // Will be set when recording starts

    const previousLocation = this.selectedActivityLocation;
    this.selectedActivityCategory = plan.activity_category;
    this.selectedActivityLocation = plan.activity_location || "indoor";

    // Handle location tracking changes
    if (previousLocation !== this.selectedActivityLocation) {
      if (this.selectedActivityLocation === "outdoor") {
        // Switching to outdoor - start early location tracking
        this.startEarlyLocationTracking();
      } else if (previousLocation === "outdoor") {
        // Switching from outdoor to indoor - stop location tracking
        this.stopEarlyLocationTracking();
      }
    }

    this.emit("planSelected", { plan, plannedId });

    // Emit step changed immediately so UI shows the first step
    this.emit("stepChanged", this.getStepInfo());

    console.log(
      "[Service] Plan ready with first step:",
      this.currentStep?.name,
    );
  }

  clearPlan(): void {
    console.log("[Service] Clearing plan");

    this._plan = undefined;
    this._plannedActivityId = undefined;
    this._steps = [];
    this._stepIndex = 0;
    this._stepStartMovingTime = 0;
    this._currentRoute = null;
    this._routeDistance = 0;
    this._currentRouteDistance = 0;

    this.emit("planCleared");
  }

  /**
   * Load full route data from the server
   */
  private async loadRoute(routeId: string): Promise<void> {
    try {
      console.log("[Service] Loading route:", routeId);

      // Import vanilla trpc client (for use outside React components)
      const { vanillaTrpc } = await import("@/lib/trpc");

      // Load full route with coordinates
      const route = await vanillaTrpc.routes.loadFull.query({ id: routeId });

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

      // Emit event for UI to update
      this.emit("routeLoaded" as any, route);
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
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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
        coordinates[i].lat,
        coordinates[i].lng,
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
        coordinates[i - 1].lat,
        coordinates[i - 1].lng,
        coordinates[i].lat,
        coordinates[i].lng,
      );
    }

    this._currentRouteDistance = distanceAlongRoute;

    // Apply grade-based resistance for indoor activities with FTMS
    // Only if: indoor location, has trainer, recording, NOT in manual control mode
    if (
      this.selectedActivityLocation === "indoor" &&
      this.state === "recording" &&
      !this.manualControlOverride &&
      Math.abs(distanceAlongRoute - previousDistance) > 10 // Only update every 10m
    ) {
      this.applyRouteGradeToTrainer();
    }
  }

  /**
   * Apply current route grade to FTMS trainer as resistance
   * For indoor training with outdoor routes (virtual route riding)
   */
  private async applyRouteGradeToTrainer(): Promise<void> {
    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) return;

    const grade = this.currentRouteGrade;

    // Check if trainer supports slope/grade control
    if (trainer.ftmsFeatures?.inclinationSupported) {
      console.log(
        `[Service] Applying route grade to trainer: ${grade.toFixed(1)}%`,
      );

      try {
        const success = await this.sensorsManager.setTargetInclination(grade);
        if (!success) {
          console.warn(`[Service] Failed to set grade: ${grade.toFixed(1)}%`);
        }
      } catch (error) {
        console.error("[Service] Error applying route grade:", error);
      }
    }
  }

  /**
   * Start GPS location tracking early (before recording starts)
   * This allows the map to show the user's location in pending state
   * Only starts tracking for outdoor activities
   */
  private async startEarlyLocationTracking(): Promise<void> {
    // Only track location for outdoor activities
    if (this.selectedActivityLocation !== "outdoor") {
      console.log(
        "[Service] Skipping early location tracking for indoor activity",
      );
      return;
    }

    try {
      console.log(
        "[Service] Starting early location tracking for outdoor map preview",
      );
      await this.locationManager.startForegroundTracking();
      this._gpsAvailable = true;
      console.log("[Service] Early location tracking started successfully");
    } catch (error) {
      console.error(
        "[Service] Failed to start early location tracking:",
        error,
      );
      // Don't throw - this is a nice-to-have for map preview
    }
  }

  /**
   * Stop early GPS location tracking
   * Called when switching from outdoor to indoor or on cleanup
   */
  private async stopEarlyLocationTracking(): Promise<void> {
    try {
      await this.locationManager.stopForegroundTracking();
      this._gpsAvailable = false;
      console.log("[Service] Early location tracking stopped");
    } catch (error) {
      console.error("[Service] Failed to stop early location tracking:", error);
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
  // GPS Tracking Control
  // ================================

  /**
   * Check if GPS tracking is currently enabled
   * Independent of whether recording is active
   */
  public isGpsTrackingEnabled(): boolean {
    return this._gpsTrackingEnabled;
  }

  /**
   * Enable GPS tracking - switches to outdoor mode
   * Preserves existing GPS data and starts collecting new data
   */
  public async enableGpsTracking(): Promise<void> {
    if (this._gpsTrackingEnabled) {
      console.log("[Service] GPS tracking already enabled");
      return;
    }

    console.log("[Service] Enabling GPS tracking - switching to outdoor mode");
    const previousLocation = this.selectedActivityLocation;
    this._gpsTrackingEnabled = true;
    this.selectedActivityLocation = "outdoor";

    this.emit("gpsTrackingChanged", true);
    this.emit("activitySelected", {
      category: this.selectedActivityCategory,
      location: "outdoor",
    });

    // Start location tracking if not recording yet (early tracking for preview)
    if (this.state === "pending" || this.state === "ready") {
      await this.startEarlyLocationTracking();
    }

    // Start GPS if currently recording
    if (this.state === "recording") {
      try {
        await this.locationManager.startForegroundTracking();
        await this.locationManager.startBackgroundTracking();
        await this.locationManager.startHeadingTracking();
        this._gpsAvailable = true;
        console.log("[Service] GPS tracking started successfully");
      } catch (error) {
        console.error("[Service] Failed to start GPS tracking:", error);
        // Revert state on error
        this._gpsTrackingEnabled = false;
        this.selectedActivityLocation = previousLocation;
        this.emit("gpsTrackingChanged", false);
        this.emit("activitySelected", {
          category: this.selectedActivityCategory,
          location: previousLocation,
        });
        throw error;
      }
    }
  }

  /**
   * Disable GPS tracking - switches to indoor mode
   * Preserves existing GPS data but stops collecting new data
   */
  public async disableGpsTracking(): Promise<void> {
    if (!this._gpsTrackingEnabled) {
      console.log("[Service] GPS tracking already disabled");
      return;
    }

    console.log("[Service] Disabling GPS tracking - switching to indoor mode");
    this._gpsTrackingEnabled = false;
    this.selectedActivityLocation = "indoor";

    this.emit("gpsTrackingChanged", false);
    this.emit("activitySelected", {
      category: this.selectedActivityCategory,
      location: "indoor",
    });

    // Stop GPS tracking if currently active
    if (this._gpsAvailable) {
      try {
        await this.locationManager.stopHeadingTracking();
        await this.locationManager.stopForegroundTracking();
        await this.locationManager.stopBackgroundTracking();
        this._gpsAvailable = false;
        console.log("[Service] GPS tracking stopped successfully");
      } catch (error) {
        console.error("[Service] Failed to stop GPS tracking:", error);
        // Continue anyway - we've updated the flag
      }
    }

    // Stop early location tracking if in pending/ready state
    if (this.state === "pending" || this.state === "ready") {
      await this.stopEarlyLocationTracking();
    }
  }

  /**
   * Toggle GPS tracking on/off (indoor/outdoor mode)
   * User-facing action for the GPS toggle button
   * ON (Outdoor) = GPS enabled, location data collected
   * OFF (Indoor) = GPS disabled, no location data
   */
  public async toggleGpsTracking(): Promise<void> {
    if (this._gpsTrackingEnabled) {
      await this.disableGpsTracking();
    } else {
      await this.enableGpsTracking();
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
      activityCategory: this.selectedActivityCategory,
      activityLocation: this.selectedActivityLocation,
      profileId: this.profile.id,
      profile: this.profile,
      plannedActivityId: this._plannedActivityId,
      activityPlan: this._plan,
    };

    this.state = "recording";

    // Configure LiveMetricsManager with activity location and category before starting
    this.liveMetricsManager.setActivityLocation(this.selectedActivityLocation);
    this.liveMetricsManager.setActivityCategory(this.selectedActivityCategory);

    // Start LiveMetricsManager (initializes StreamBuffer)
    await this.liveMetricsManager.startRecording();

    // Initialize timing
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.lastPauseTime = undefined;

    // Reset step timer for plan (will be 0 when recording starts)
    this._stepStartMovingTime = 0;

    // If we have a plan, emit the initial step info now that recording has started
    if (this.hasPlan && this.currentStep) {
      console.log(
        "[Service] Recording started with plan, step:",
        this.currentStep.name,
      );
      this.emit("stepChanged", this.getStepInfo());
    }

    this.startElapsedTimeUpdates();

    // Start location tracking - only for outdoor activities and if GPS tracking is enabled
    if (
      this.selectedActivityLocation === "outdoor" &&
      this._gpsTrackingEnabled
    ) {
      console.log("[Service] Starting GPS tracking for outdoor activity");
      await this.locationManager.startForegroundTracking();
      await this.locationManager.startBackgroundTracking();
      await this.locationManager.startHeadingTracking();
      this._gpsAvailable = true;
    } else {
      console.log(
        "[Service] Skipping GPS tracking (indoor activity or GPS disabled)",
      );
      this._gpsAvailable = false;
    }

    // Start foreground service notification
    const activityName =
      this._plan?.name ||
      `${this.selectedActivityLocation} ${this.selectedActivityCategory}`;
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
   * Update activity configuration (category/location) without clearing plan or route
   * Use this when the user switches between indoor/outdoor during configuration
   */
  updateActivityConfiguration(
    category: PublicActivityCategory,
    location: PublicActivityLocation,
  ): void {
    console.log(
      "[Service] Updating activity configuration:",
      category,
      location,
    );

    const previousLocation = this.selectedActivityLocation;
    this.selectedActivityCategory = category;
    this.selectedActivityLocation = location;

    // Handle location tracking changes
    if (previousLocation !== location) {
      if (location === "outdoor") {
        // Switching to outdoor - start early location tracking
        this.startEarlyLocationTracking();
      } else if (previousLocation === "outdoor") {
        // Switching from outdoor to indoor - stop location tracking
        this.stopEarlyLocationTracking();
      }
    }

    // Don't clear plan - preserve any existing plan/route
    this.emit("activitySelected", { category, location });
  }

  /**
   * Select an unplanned activity
   * Clears any existing plan and updates the activity category and location
   */
  selectUnplannedActivity(
    category: PublicActivityCategory,
    location: PublicActivityLocation,
  ): void {
    console.log("[Service] Selected unplanned activity:", category, location);

    const previousLocation = this.selectedActivityLocation;
    this.selectedActivityCategory = category;
    this.selectedActivityLocation = location;
    this.clearPlan();

    // Handle location tracking changes
    if (previousLocation !== location) {
      if (location === "outdoor") {
        // Switching to outdoor - start early location tracking
        this.startEarlyLocationTracking();
      } else if (previousLocation === "outdoor") {
        // Switching from outdoor to indoor - stop location tracking
        this.stopEarlyLocationTracking();
      }
    }

    this.emit("activitySelected", { category, location });
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
          activity_category: payload.plan.activity_category || payload.category,
          activity_location: payload.plan.activity_location || payload.location,
          structure: payload.plan.structure,
          route_id: payload.plan.route_id || null,
        };

        console.log("[Service] Selecting plan from payload:", plan.name);
        this.selectPlan(plan, payload.plannedActivityId);
      } else {
        // Quick start activity - only clear plan if this is truly initial setup
        // Check if there's an existing plan to determine if this is initial setup
        // If there's already a plan attached, preserve it and just update configuration
        if (this.state === "pending" && !this.hasPlan) {
          // True initial setup: no plan exists, state is pending
          console.log(
            "[Service] Selecting unplanned activity from payload (initial):",
            payload.category,
            payload.location,
          );
          this.selectUnplannedActivity(payload.category, payload.location);
        } else {
          // Plan exists OR recording has started: preserve plan and just update config
          console.log(
            "[Service] Updating activity configuration from payload:",
            payload.category,
            payload.location,
            "hasPlan:",
            this.hasPlan,
          );
          this.updateActivityConfiguration(payload.category, payload.location);
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

    // Hot-plug detection: Apply targets when a controllable trainer connects mid-workout
    this.sensorsManager.subscribeConnection(async (sensor) => {
      // Skip if manual control is active
      if (this.manualControlOverride) {
        console.log("[Service] Manual control active, skipping auto target");
        return;
      }

      // Only react to newly connected controllable trainers
      if (!sensor.isControllable || sensor.connectionState !== "connected") {
        return;
      }

      // Only apply if we're actively recording with a plan
      if (this.state !== "recording" || !this.hasPlan || !this.currentStep) {
        return;
      }

      console.log(
        `[Service] Controllable trainer "${sensor.name}" connected during recording - applying Auto ERG`,
      );

      // Apply current step targets to the newly connected trainer
      await this.applyStepTargets(this.currentStep);

      // Show success notification (optional - can be removed if too noisy)
      console.log(
        `[Service] Auto ERG activated for "${sensor.name}" at ${this.currentStep.name}`,
      );
    });
  }

  /**
   * Apply targets from a plan step to the trainer
   */
  private async applyStepTargets(step: IntervalStepV2): Promise<void> {
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
      // Find power or FTP target (ERG mode)
      const powerTarget = step.targets.find(
        (t) => t.type === "watts" || t.type === "%FTP",
      );

      if (powerTarget) {
        const powerWatts = this.resolvePowerTarget(powerTarget);
        if (powerWatts) {
          console.log(`[Service] Applying power target: ${powerWatts}W`);
          const success = await this.sensorsManager.setPowerTarget(powerWatts);

          if (!success) {
            this.emit("error", `Failed to set power target: ${powerWatts}W`);
          }
        }
      }
      // Note: Grade targets are not part of IntensityTargetV2
      // If you need grade/simulation mode, it should be added to the schema
    } catch (error) {
      console.error("[Service] Failed to apply step targets:", error);
      this.emit("error", "Failed to apply workout targets to trainer");
    }
  }

  /**
   * Resolve power target from plan step to absolute watts
   */
  private resolvePowerTarget(
    target: import("@repo/core").IntensityTargetV2,
  ): number | null {
    // Handle percentage of FTP
    if (target.type === "%FTP") {
      if (!this.ftp) {
        console.warn(
          "[Service] Cannot apply %FTP target - no FTP value in profile. User should set FTP in settings.",
        );
        this.emit(
          "error",
          "Cannot apply power target: FTP not set in profile. Please set your FTP in settings.",
        );
        return null;
      }
      const percentage = target.intensity;
      const watts = Math.round((percentage / 100) * this.ftp);
      console.log(
        `[Service] Resolved %FTP target: ${percentage}% of ${this.ftp}W = ${watts}W`,
      );
      return watts;
    }

    // Handle absolute watts
    if (target.type === "watts") {
      return Math.round(target.intensity);
    }

    console.warn("[Service] Unable to resolve power target:", target);
    return null;
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
    // Skip location processing for indoor activities or if GPS tracking is disabled
    if (
      this.selectedActivityLocation !== "outdoor" ||
      !this._gpsTrackingEnabled
    ) {
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
      this.updateRouteProgress(
        location.coords.latitude,
        location.coords.longitude,
      );
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
   * Returns time in milliseconds
   */
  public getMovingTime(): number {
    if (!this.startTime) return 0;

    const now = Date.now();
    const elapsed = now - this.startTime;

    // Calculate total paused time
    let totalPaused = this.pausedTime;
    if (this.state === "paused" && this.lastPauseTime) {
      // Add current pause duration
      totalPaused += now - this.lastPauseTime;
    }

    return Math.max(0, elapsed - totalPaused);
  }

  /**
   * Record a lap at the current moving time
   * Returns the lap time in seconds
   */
  public recordLap(): number {
    const metrics = this.liveMetricsManager.getMetrics();
    const currentMovingTime = metrics.movingTime;

    // Calculate lap time (time since last lap)
    const lapTime = currentMovingTime - this.lastLapTime;

    // Record the lap
    this.laps.push(lapTime);
    this.lastLapTime = currentMovingTime;

    // Emit lap recorded event
    this.emit("lapRecorded", {
      lapNumber: this.laps.length,
      lapTime,
      totalLaps: this.laps.length,
    });

    return lapTime;
  }

  /**
   * Get current lap time (time since last lap)
   * Returns time in seconds
   */
  public getLapTime(): number {
    const metrics = this.liveMetricsManager.getMetrics();
    const currentMovingTime = metrics.movingTime;
    return currentMovingTime - this.lastLapTime;
  }

  /**
   * Get all recorded laps
   * Returns array of lap times in seconds
   */
  public getLaps(): number[] {
    return [...this.laps];
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

    // Determine if we're in planned mode - check both _plan and _plannedActivityId
    // This ensures we show planned mode UI even if structure parsing failed
    const isPlannedMode = !!(this._plan || this._plannedActivityId);

    console.log("[Service] getRecordingConfiguration:", {
      isPlannedMode,
      hasPlan: !!this._plan,
      hasPlannedId: !!this._plannedActivityId,
      stepsLength: this._steps.length,
      activityCategory: this.selectedActivityCategory,
      activityLocation: this.selectedActivityLocation,
    });

    return RecordingConfigResolver.resolve({
      activityCategory: this.selectedActivityCategory,
      activityLocation: this.selectedActivityLocation,
      mode: isPlannedMode ? "planned" : "unplanned",
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
          .some((s) => s.services.includes(BLE_SERVICE_UUIDS.CYCLING_POWER)),
        hasHeartRateMonitor: this.sensorsManager
          .getConnectedSensors()
          .some((s) => s.services.includes(BLE_SERVICE_UUIDS.HEART_RATE)),
        hasCadenceSensor: this.sensorsManager
          .getConnectedSensors()
          .some((s) =>
            s.services.includes(BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE),
          ),
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
