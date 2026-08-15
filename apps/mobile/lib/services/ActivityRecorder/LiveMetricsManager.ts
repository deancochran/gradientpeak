/**
 * LiveMetricsManager - Simplified Real-time Metrics Calculation
 *
 * Two core responsibilities:
 * 1. Calculate and emit metrics every 1 second for UI updates
 * 2. Persist data and cleanup memory every 60 seconds
 *
 * Key simplifications:
 * - Only 2 timers (down from 4+)
 * - Direct sensor ingestion (no complex batching)
 * - Predictable performance (1s UI, 60s DB writes)
 * - Simple data flow: Buffer -> Calculate -> Emit
 */

import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
  createProvisionalRecordingMetricsAccumulator,
  DEFAULT_HEART_RATE_MAX_GAP_SECONDS,
  getAvailablePerformanceTargetValue,
  getHrZoneUpperBoundsFromLthr,
  getPowerZoneUpperBoundsFromFtp,
  type ProvisionalRecordingMetricsAccumulator,
  type ProvisionalRecordingMetricsSnapshot,
  type RecordingActivityCategory,
  type RecordingMetricsConfig,
} from "@repo/core";
import {
  selectAerobicDecouplingValue,
  selectCyclingNormalizedPowerWatts,
  selectEfficiencyFactorValue,
} from "@repo/core/calculations";
import { EventEmitter } from "expo";
import { DEFAULT_RECORDING_WEIGHT_KG, MOVEMENT_THRESHOLDS, RECORDING_CONFIG } from "./config";
import { DataBuffer, type LatLngBufferedReading } from "./DataBuffer";
import { createRecordingStreamJournalAdapter } from "./recordingEvidenceJournal";
import {
  convertToSimplifiedMetrics,
  getSensorModel,
  type SimplifiedMetrics,
} from "./SimplifiedMetrics";
import { type DurableStreamReplay, StreamBuffer } from "./StreamBuffer";
import type {
  CurrentReadings,
  LiveMetricsState,
  LocationReading,
  ProfileMetrics,
  RecorderProfileRef,
  SensorReading,
  SessionStats,
  ZoneConfig,
} from "./types";

// Define event types for LiveMetricsManager
type EventArguments = Parameters<typeof console.log>;

interface LiveMetricsEvents {
  statsUpdate: (data: { stats: SessionStats; timestamp: number }) => void;
  sensorUpdate: (data: { readings: CurrentReadings; timestamp: number }) => void;
  metricsUpdated: (data: { profile: ProfileMetrics; zones: ZoneConfig }) => void;
  persistenceError: (error: unknown) => void;
  [key: string]: (...args: EventArguments) => void;
}

export class LiveMetricsManager extends EventEmitter<LiveMetricsEvents> {
  private profile: ProfileMetrics;
  private zones: ZoneConfig;
  private metrics: LiveMetricsState;
  private provisionalMetricsAccumulator: ProvisionalRecordingMetricsAccumulator;
  private provisionalMetricsSnapshot: ProvisionalRecordingMetricsSnapshot;
  private stagedPerformanceTargets: AthletePerformanceTargetFacts | null = null;
  private activePerformanceTargets: AthletePerformanceTargetFacts | null = null;
  private recordingSessionId: string | null = null;
  private isActive = false;
  private gpsRecordingEnabled = true;
  private gpsSpeedFallbackEnabled = true;
  private activityCategory?: RecordingActivityCategory; // Track activity category for calorie calculation

  // === Core Components ===
  private buffer: DataBuffer; // 60-second rolling window for calculations
  public streamBuffer: StreamBuffer; // Accumulates data for periodic file writes

  // === Timers ===
  private updateTimer?: ReturnType<typeof setInterval> | number; // 1s: Calculate metrics + emit UI updates
  private persistenceTimer?: ReturnType<typeof setInterval> | number; // 60s: Write to DB + cleanup memory

  // === Performance Optimization ===
  private pendingSensorUpdates = new Map<string, number>();
  private sensorUpdateTimer?: ReturnType<typeof setTimeout> | number;
  private lastStatsEmit = 0;
  private cachedStats?: SessionStats;
  private lastAdvancedMetricsSampleAt = 0;
  private advancedMetricsDisabledUntil = 0;

  // === State Tracking ===
  private startTime?: number;
  private pauseStartTime?: number;
  private totalPauseTime = 0;
  private lastLocation?: LocationReading;

  // === Cumulative Metrics (not in buffer) ===
  private totalDistance = 0;
  private totalWork = 0; // Joules
  private totalAscent = 0;
  private totalDescent = 0;
  private maxSpeed = 0;
  private maxPower = 0;
  private maxHeartRate = 0;
  private maxCadence = 0;

  // === Virtual Distance (for indoor activities) ===
  private lastPowerUpdate?: number; // Timestamp of last power reading
  private lastPowerValue = 0; // Last power reading in watts

  // === Zone Time Tracking ===
  private zoneStartTime?: number;
  private currentHrZone?: number;
  private currentPowerZone?: number;
  private hrZoneTimes = [0, 0, 0, 0, 0]; // 5 zones
  private powerZoneTimes = [0, 0, 0, 0, 0, 0, 0]; // 7 zones

  constructor(
    profile: RecorderProfileRef,
    metrics?: {
      weightKg?: number;
    },
  ) {
    super();
    // Note: expo-modules-core EventEmitter doesn't have setMaxListeners
    // If you need more listeners, consider using Node.js EventEmitter instead
    this.profile = this.extractProfileMetrics(profile, metrics);
    this.zones = this.calculateZones(this.profile);
    this.metrics = this.createInitialMetrics();
    this.provisionalMetricsAccumulator = createProvisionalRecordingMetricsAccumulator(
      this.buildRecordingMetricsConfig(),
    );
    this.provisionalMetricsSnapshot = this.provisionalMetricsAccumulator.getSnapshot();
    this.buffer = new DataBuffer(RECORDING_CONFIG.BUFFER_WINDOW_SECONDS);
    this.streamBuffer = new StreamBuffer();

    console.log("[LiveMetricsManager] Initialized with profile:", {
      bikeThresholdWatts: this.profile.bikeThresholdWatts,
      lthrBpm: this.profile.lthrBpm,
      weightKg: this.profile.weightKg,
    });
  }

  // ==================== PUBLIC API ====================

  public setGpsRecordingEnabled(enabled: boolean): void {
    this.gpsRecordingEnabled = enabled;
  }

  /** Must run before recording starts; foreground streams never discover a global active session. */
  public bindEvidenceSession(sessionId: string, profileId: string): void {
    if (this.isActive) throw new Error("Cannot rebind recording evidence while active");
    this.recordingSessionId = sessionId;
    this.streamBuffer = new StreamBuffer(
      undefined,
      createRecordingStreamJournalAdapter({ sessionId, profileId }),
    );
    this.resetRecordingMetricsAccumulator();
  }

  public setGpsSpeedFallbackEnabled(enabled: boolean): void {
    if (enabled && !this.gpsSpeedFallbackEnabled) {
      this.buffer.clearMetric("speed");
    }
    this.gpsSpeedFallbackEnabled = enabled;
  }

  public clearBufferedSensorMetric(metric: SensorReading["metric"]): void {
    this.buffer.clearMetric(metric);
  }

  /**
   * Set activity category (bike, run, etc.)
   * Used for improved calorie estimation
   */
  public setActivityCategory(category: RecordingActivityCategory): void {
    this.activityCategory = category;
    this.applyPerformanceTargetProfile(
      this.isActive ? this.activePerformanceTargets : this.stagedPerformanceTargets,
    );
    this.zones = this.calculateZones(this.profile);
    if (!this.isActive) this.resetRecordingMetricsAccumulator();
    console.log("[LiveMetricsManager] Activity category set to:", category);
  }

  /**
   * Update performance metrics reactively
   * Updates non-target recording profile values.
   */
  public updateMetrics(metrics: { weightKg?: number }): void {
    if (metrics.weightKg !== undefined) this.profile.weightKg = metrics.weightKg;

    this.emit("metricsUpdated", { profile: this.profile, zones: this.zones });

    console.log("[LiveMetricsManager] Metrics updated:", {
      bikeThresholdWatts: this.profile.bikeThresholdWatts,
      lthrBpm: this.profile.lthrBpm,
      weightKg: this.profile.weightKg,
    });
  }

  /** Stages validated target facts while an active session retains its captured facts. */
  public updatePerformanceTargets(snapshot: AthletePerformanceTargetFacts | null): void {
    this.stagedPerformanceTargets =
      snapshot === null ? null : athletePerformanceTargetFactsSchema.parse(snapshot);
    this.applyPerformanceTargetProfile(
      this.isActive ? this.activePerformanceTargets : this.stagedPerformanceTargets,
    );
    this.zones = this.calculateZones(this.profile);
    if (this.zones.hrZones.length === 0) {
      this.currentHrZone = undefined;
      delete this.metrics.currentHeartRateZone;
    }
    if (this.zones.powerZones.length === 0) {
      this.currentPowerZone = undefined;
      delete this.metrics.currentPowerZone;
    }
    if (!this.isActive) this.resetRecordingMetricsAccumulator();
    this.emit("metricsUpdated", { profile: this.profile, zones: this.zones });
  }

  /**
   * Start recording - initialize timers and state
   */
  public async startRecording(): Promise<void> {
    // Initialize StreamBuffer storage directory
    await this.streamBuffer.initialize();

    this.activePerformanceTargets =
      this.stagedPerformanceTargets === null
        ? null
        : athletePerformanceTargetFactsSchema.parse(this.stagedPerformanceTargets);
    this.applyPerformanceTargetProfile(this.activePerformanceTargets);
    this.zones = this.calculateZones(this.profile);
    this.resetLiveSessionState();
    this.isActive = true;
    this.startTime = Date.now();
    this.metrics.startedAt = this.startTime;
    this.zoneStartTime = this.startTime;
    this.addRecordingMetricsSample(this.startTime);
    this.lastAdvancedMetricsSampleAt = this.startTime;

    // Start 1-second update timer
    this.updateTimer = setInterval(() => {
      this.calculateAndEmitMetrics();
    }, RECORDING_CONFIG.UPDATE_INTERVAL);

    // Start 60-second persistence timer
    this.persistenceTimer = setInterval(() => {
      void this.persistAndCleanup();
    }, RECORDING_CONFIG.PERSISTENCE_INTERVAL);

    console.log("[LiveMetricsManager] Started recording");
  }

  /** Rehydrates durable samples while staged as paused, without rewriting replayed chunks. */
  public async stageRecoveredRecording(input: {
    sessionId: string;
    streamBuffer: StreamBuffer;
    replay: DurableStreamReplay;
    startedAt: number;
    accumulatedPauseMs: number;
    recoveryPausedAt: number;
    elapsedSeconds: number;
    movingSeconds: number;
  }): Promise<void> {
    this.stopTimers();
    this.recordingSessionId = input.sessionId;
    this.activePerformanceTargets =
      this.stagedPerformanceTargets === null
        ? null
        : athletePerformanceTargetFactsSchema.parse(this.stagedPerformanceTargets);
    this.applyPerformanceTargetProfile(this.activePerformanceTargets);
    this.zones = this.calculateZones(this.profile);
    this.streamBuffer = input.streamBuffer;
    await this.streamBuffer.initialize();
    this.resetLiveSessionState();
    this.startTime = input.startedAt;
    this.metrics.startedAt = input.startedAt;
    this.metrics.elapsedTime = Math.floor(input.elapsedSeconds);
    this.metrics.movingTime = Math.floor(input.movingSeconds);
    this.totalPauseTime = input.accumulatedPauseMs;
    this.pauseStartTime = input.recoveryPausedAt;
    this.isActive = false;

    for (const reading of input.replay.sensorReadings) this.ingestSensorData({ ...reading });
    for (const location of input.replay.locations) {
      this.ingestLocationData(location, { updateDistance: false });
    }
    const latestDistance = input.replay.sensorReadings
      .filter((reading) => reading.metric === "distance" && typeof reading.value === "number")
      .at(-1);
    if (latestDistance && typeof latestDistance.value === "number") {
      this.totalDistance = latestDistance.value;
    }
    this.provisionalMetricsAccumulator.restoreObservations({
      elapsedSeconds: input.elapsedSeconds,
      movingSeconds: input.movingSeconds,
      distanceMeters: this.totalDistance,
      observedAtMs: input.recoveryPausedAt,
    });
    this.provisionalMetricsSnapshot = this.provisionalMetricsAccumulator.getSnapshot();
    this.cachedStats = undefined;
    this.calculateAndEmitMetrics();
  }

  /**
   * Pause recording - stop timers but keep data
   */
  public pauseRecording(): void {
    this.addRecordingMetricsSample(Date.now());
    this.isActive = false;
    this.pauseStartTime = Date.now();

    // Stop timers to prevent unnecessary calculations and emissions during pause
    this.stopTimers();

    console.log("[LiveMetricsManager] Paused");
  }

  /**
   * Resume recording - restart timers
   */
  public resumeRecording(options: { preserveHistory?: boolean } = {}): void {
    const resumedAt = Date.now();
    this.addRecordingMetricsSample(resumedAt);
    if (this.pauseStartTime) {
      this.totalPauseTime += resumedAt - this.pauseStartTime;
      this.pauseStartTime = undefined;
    }
    if (!options.preserveHistory) this.buffer.clear();
    this.cachedStats = undefined;
    this.lastStatsEmit = 0;
    this.isActive = true;
    this.zoneStartTime = resumedAt;

    // Restart timers when resuming
    this.updateTimer = setInterval(() => {
      this.calculateAndEmitMetrics();
    }, RECORDING_CONFIG.UPDATE_INTERVAL);

    this.persistenceTimer = setInterval(() => {
      void this.persistAndCleanup();
    }, RECORDING_CONFIG.PERSISTENCE_INTERVAL);

    console.log("[LiveMetricsManager] Resumed");
  }

  /**
   * Finish recording - final flush and cleanup
   */
  public async finishRecording(): Promise<LiveMetricsState> {
    this.stopTimers();

    this.calculateAndEmitMetrics();

    // Final flush to files BEFORE setting isActive = false
    // Emergency flush using hasPendingData()
    if (this.streamBuffer.hasPendingData()) {
      await this.persistAndCleanup();
    }

    this.isActive = false;
    this.metrics.finishedAt = Date.now();

    console.log("[LiveMetricsManager] Finished recording");
    return this.metrics;
  }

  /**
   * Ingest sensor data with batched updates and validation
   */
  public ingestSensorData(reading: SensorReading): void {
    const timestamp = reading.timestamp || Date.now();

    // Add to buffer for real-time calculations (always, for display)
    // Type narrowing: check if numeric or tuple
    if (typeof reading.value === "number") {
      // Validate sensor data using sensor models
      const model = getSensorModel(reading.metric);
      if (model) {
        const validated = model.validate(reading.value);
        if (validated === null) {
          // Invalid reading, skip it
          return;
        }
        // Use validated value
        reading.value = validated;
      }

      // Numeric reading (power, HR, cadence, etc.)
      this.buffer.add({
        metric: reading.metric,
        value: reading.value,
        timestamp,
      });

      // Update max values only when recording is active
      if (this.isActive) {
        this.updateMaxValues(reading.metric, reading.value);
      }

      // Calculate virtual distance when GPS recording is disabled
      if (
        this.isActive &&
        !this.gpsRecordingEnabled &&
        reading.metric === "power" &&
        typeof reading.value === "number"
      ) {
        this.updateVirtualDistance(reading.value, timestamp);
      }

      // Batch sensor updates for UI (max 10Hz)
      this.pendingSensorUpdates.set(reading.metric, reading.value);

      if (!this.sensorUpdateTimer) {
        this.sensorUpdateTimer = setTimeout(() => {
          this.flushSensorUpdates();
          this.sensorUpdateTimer = undefined;
        }, 100); // 100ms = 10Hz max update rate
      }
    } else {
      // Tuple reading (latlng)
      this.buffer.add({
        metric: reading.metric,
        value: reading.value as [number, number],
        timestamp,
      });
    }

    // Add to streamBuffer for eventual persistence (only when active)
    if (this.isActive) {
      this.streamBuffer.add(reading);
    }
  }

  /**
   * Ingest location data
   */
  public ingestLocationData(
    location: LocationReading,
    options: { updateDistance?: boolean } = {},
  ): void {
    const updateDistance = options.updateDistance ?? true;
    const isReliableLocation = this.isLocationReliable(location);
    // Keep current position tied to reliable fixes so FIT/location artifacts do not drift on bad GPS.
    const previousLocation = this.lastLocation;
    if (isReliableLocation) {
      this.lastLocation = location;
    }

    // Add to streamBuffer for persistence (only when active)
    if (this.isActive && isReliableLocation) {
      this.streamBuffer.addLocation(location);
    }

    // Add lat/lng to buffer for route tracking (always, for display)
    if (isReliableLocation) {
      this.buffer.add({
        metric: "latlng",
        value: [location.latitude, location.longitude],
        timestamp: location.timestamp,
      });
    }

    // Emit sensor update immediately so UI reflects GPS acquisition
    this.emit("sensorUpdate", {
      readings: this.getCurrentReadings(),
      timestamp: Date.now(),
    });

    // Calculate distance if we have a previous location (only when active)
    // Skip GPS distance when GPS recording is disabled
    if (
      this.isActive &&
      previousLocation &&
      this.gpsRecordingEnabled &&
      updateDistance &&
      isReliableLocation
    ) {
      const distance = this.calculateDistance(previousLocation, location);

      // Filter GPS noise
      if (distance > MOVEMENT_THRESHOLDS.DISTANCE_MIN_DELTA_M && distance < 1000) {
        this.totalDistance += distance;

        // Calculate speed
        const timeDelta = (location.timestamp - previousLocation.timestamp) / 1000; // seconds
        if (timeDelta > 0) {
          const speed = distance / timeDelta; // m/s
          this.maxSpeed = Math.max(this.maxSpeed, speed);
          this.updateTerrainIntensity(previousLocation, location, distance, timeDelta);
        }
      }
    }

    // Track elevation (always, for display)
    if (location.altitude !== undefined) {
      this.buffer.add({
        metric: "altitude",
        value: location.altitude,
        timestamp: location.timestamp,
      });

      // Update elevation metrics only when active
      if (this.isActive) {
        this.updateElevation(location.altitude);
      }
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): LiveMetricsState {
    return { ...this.metrics };
  }

  public getProvisionalMetricsSnapshot(): ProvisionalRecordingMetricsSnapshot {
    return this.provisionalMetricsSnapshot;
  }

  /**
   * Get specific metric value
   */
  public getMetric(metric: keyof LiveMetricsState): number | undefined {
    return this.metrics[metric] as number | undefined;
  }

  /**
   * Get metrics in simplified format (cleaner API)
   * This is the recommended way to access metrics for UI components
   */
  public getSimplifiedMetrics(): SimplifiedMetrics {
    const currentReadings = this.getCurrentReadings();
    const hasEnoughData = this.hasEnoughDataForAdvancedMetrics();

    return convertToSimplifiedMetrics(
      this.metrics,
      currentReadings,
      hasEnoughData,
      this.provisionalMetricsSnapshot,
      this.profile,
    );
  }

  /**
   * Update plan adherence (called by plan manager)
   */
  public updatePlanAdherence(adherence: number): void {
    this.metrics.adherenceCurrentStep = adherence;
  }

  /**
   * Get current sensor readings with freshness tracking
   */
  public getCurrentReadings(): CurrentReadings & {
    lastUpdated: NonNullable<CurrentReadings["lastUpdated"]>;
  } {
    const heartRate = this.buffer.getLatest("heartrate");
    const power = this.buffer.getLatest("power");
    const cadence = this.buffer.getLatest("cadence");
    const speed = this.calculateCurrentSpeed();
    const temperature = this.buffer.getLatest("temperature");
    const readings: CurrentReadings = {
      ...(heartRate === undefined ? {} : { heartRate }),
      ...(power === undefined ? {} : { power }),
      ...(cadence === undefined ? {} : { cadence }),
      ...(speed === undefined ? {} : { speed }),
      ...(temperature === undefined ? {} : { temperature }),
    };

    // Add position if available
    if (this.lastLocation) {
      readings.position = {
        lat: this.lastLocation.latitude,
        lng: this.lastLocation.longitude,
        ...(this.lastLocation.altitude === undefined
          ? {}
          : { altitude: this.lastLocation.altitude }),
        ...(this.lastLocation.heading === undefined ? {} : { heading: this.lastLocation.heading }),
      };
    }

    // Track freshness
    const lastUpdated: NonNullable<CurrentReadings["lastUpdated"]> = {};
    readings.lastUpdated = lastUpdated;
    const metrics = ["heartrate", "power", "cadence", "speed", "temperature"];
    for (const metric of metrics) {
      const reading = this.buffer.getLatestReading(metric);
      if (reading) {
        const key = metric === "heartrate" ? "heartRate" : metric;
        lastUpdated[key as keyof typeof lastUpdated] = reading.timestamp;
      }
    }

    if (this.lastLocation) {
      lastUpdated.position = this.lastLocation.timestamp;
    }

    return readings as CurrentReadings & {
      lastUpdated: NonNullable<CurrentReadings["lastUpdated"]>;
    };
  }

  /**
   * Get computed session statistics
   */
  public getSessionStats(): SessionStats {
    const elapsed = this.getElapsedTime();
    const moving = this.getMovingTime();
    const normalizedPower = selectCyclingNormalizedPowerWatts(
      this.provisionalMetricsSnapshot.normalizedPowerResult,
    );
    const efficiencyFactor = selectEfficiencyFactorValue(
      this.provisionalMetricsSnapshot.efficiencyFactorResult,
    );
    const aerobicDecoupling = selectAerobicDecouplingValue(
      this.provisionalMetricsSnapshot.aerobicDecouplingResult,
    );

    return {
      // Timing
      duration: elapsed,
      movingTime: moving,
      pausedTime: this.totalPauseTime / 1000,

      // Totals
      distance: this.totalDistance,
      calories: this.metrics.calories,
      work: this.totalWork,
      ascent: this.totalAscent,
      descent: this.totalDescent,

      // Averages
      avgHeartRate: this.metrics.avgHeartRate,
      avgPower: this.metrics.avgPower,
      avgSpeed: this.metrics.avgSpeed,
      avgCadence: this.metrics.avgCadence,
      ...(this.metrics.avgTemperature === undefined
        ? {}
        : { avgTemperature: this.metrics.avgTemperature }),

      // Maximums
      maxHeartRate: this.maxHeartRate,
      maxPower: this.maxPower,
      maxSpeed: this.maxSpeed,
      maxCadence: this.maxCadence,

      // Zones
      hrZones: [...this.hrZoneTimes] as [number, number, number, number, number],
      powerZones: [...this.powerZoneTimes] as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ],

      // Elevation metrics
      avgGrade: this.metrics.avgGrade,
      elevationGainPerKm: this.metrics.elevationGainPerKm,
      ...(this.metrics.currentGrade !== undefined && { currentGrade: this.metrics.currentGrade }),
      ...(this.metrics.gradeAdjustedPaceSecondsPerKm !== undefined && {
        gradeAdjustedPaceSecondsPerKm: this.metrics.gradeAdjustedPaceSecondsPerKm,
      }),
      ...(this.metrics.verticalSpeedMetersPerHour !== undefined && {
        verticalSpeedMetersPerHour: this.metrics.verticalSpeedMetersPerHour,
      }),

      // Current zones
      ...(this.metrics.currentHeartRateZone !== undefined && {
        currentHeartRateZone: this.metrics.currentHeartRateZone,
      }),
      ...(this.metrics.currentPowerZone !== undefined && {
        currentPowerZone: this.metrics.currentPowerZone,
      }),

      // Advanced metrics from the exact core accumulator.
      ...(normalizedPower === null ? {} : { normalizedPower }),
      ...(this.provisionalMetricsSnapshot.variabilityIndex !== null && {
        variabilityIndex: this.provisionalMetricsSnapshot.variabilityIndex,
      }),
      ...(efficiencyFactor === null ? {} : { efficiencyFactor }),
      ...(aerobicDecoupling === null ? {} : { aerobicDecoupling }),
      provisionalMetrics: this.provisionalMetricsSnapshot,

      // Plan adherence
      planAdherence: this.metrics.adherenceCurrentStep,
    };
  }

  /**
   * Cleanup and stop
   */
  public async cleanup(): Promise<void> {
    this.stopTimers();
    this.buffer.clear();
    this.streamBuffer.clear();
    this.activePerformanceTargets = null;
    this.stagedPerformanceTargets = null;
    this.recordingSessionId = null;
    this.applyPerformanceTargetProfile(null);
    this.resetRecordingMetricsAccumulator();

    // Remove all listeners for each event type
    this.removeAllListeners("statsUpdate");
    this.removeAllListeners("sensorUpdate");
    this.removeAllListeners("persistenceError");

    console.log("[LiveMetricsManager] Cleaned up");
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Calculate all metrics and emit update event
   * Called every 1 second with optimizations
   */
  private calculateAndEmitMetrics(): void {
    const startTime = Date.now();
    let coreDuration = 0;
    let accumulatorDuration = 0;
    let statsDuration = 0;
    let emitDuration = 0;

    // Always update core metrics
    this.updateTiming();
    this.updateDistanceMetrics();
    this.updateZoneMetrics();
    coreDuration = Date.now() - startTime;

    if (this.isActive && this.shouldSampleAdvancedMetrics(startTime)) {
      const accumulatorStart = Date.now();
      this.addRecordingMetricsSample(startTime);
      accumulatorDuration = Date.now() - accumulatorStart;
      this.lastAdvancedMetricsSampleAt = startTime;

      if (accumulatorDuration > RECORDING_CONFIG.ADVANCED_METRICS_SLOW_THRESHOLD_MS) {
        this.advancedMetricsDisabledUntil =
          Date.now() + RECORDING_CONFIG.ADVANCED_METRICS_COOLDOWN_MS;
        console.warn(
          "[LiveMetricsManager] Advanced metrics temporarily disabled after slow sample",
          {
            accumulatorDuration,
            cooldownMs: RECORDING_CONFIG.ADVANCED_METRICS_COOLDOWN_MS,
          },
        );
      }
    }

    // Update expensive calculations less frequently
    const shouldUpdateExpensive = startTime - this.lastStatsEmit >= 1000;

    if (shouldUpdateExpensive) {
      const statsStart = Date.now();
      this.updatePowerMetrics();
      this.updateHeartRateMetrics();
      this.updateCadenceMetrics();
      this.updateTemperatureMetrics();
      this.updateCalories();
      this.updatePowerHeartRateRatio();
      this.applyProvisionalMetricsSnapshot();

      // Cache stats
      this.cachedStats = this.getSessionStats();
      this.lastStatsEmit = startTime;
      statsDuration = Date.now() - statsStart;

      // Emit stats update
      const emitStart = Date.now();
      this.emit("statsUpdate", {
        stats: this.cachedStats,
        timestamp: startTime,
      });
      emitDuration = Date.now() - emitStart;
    }

    const duration = Date.now() - startTime;
    if (duration > 50) {
      console.warn(`[LiveMetricsManager] Slow calculation: ${duration}ms`, {
        accumulatorDuration,
        coreDuration,
        emitDuration,
        statsDuration,
      });
    }
  }

  /**
   * Flush batched sensor updates
   */
  private flushSensorUpdates(): void {
    if (this.pendingSensorUpdates.size === 0) return;

    this.emit("sensorUpdate", {
      readings: this.getCurrentReadings(),
      timestamp: Date.now(),
    });

    this.pendingSensorUpdates.clear();
  }

  /**
   * Calculate current speed from buffer or recent GPS data
   * Returns speed in m/s
   *
   * Priority: Sensor Speed > GPS Speed (if available) > Indoor estimation from power
   */
  private calculateCurrentSpeed(): number | undefined {
    // First try to get speed from power meter or sensor (trainer)
    const sensorSpeed = this.buffer.getLatest("speed");
    if (sensorSpeed !== undefined) {
      return sensorSpeed;
    }

    // Fallback to GPS speed calculation when GPS recording is enabled
    // This ensures we always have speed/pace data even without sensors
    if (this.gpsRecordingEnabled && this.gpsSpeedFallbackEnabled && this.lastLocation) {
      // Calculate speed from recent GPS positions
      const gpsSpeed = this.calculateGPSSpeed();
      if (gpsSpeed !== undefined) {
        // Update max speed from GPS when recording is active
        if (this.isActive) {
          this.maxSpeed = Math.max(this.maxSpeed, gpsSpeed);
        }
        return gpsSpeed;
      }
    }

    // When GPS recording is disabled, calculate from power if available
    if (!this.gpsRecordingEnabled && this.lastPowerValue > 0) {
      // Estimate speed from power using the same physics model
      const powerWatts = this.lastPowerValue;
      const CRR = 0.005;
      const CDA = 0.324;
      const AIR_DENSITY = 1.225;
      const DRIVETRAIN_LOSS = 0.03;
      const effectivePower = powerWatts * (1 - DRIVETRAIN_LOSS);
      const riderWeightKg = this.profile.weightKg || DEFAULT_RECORDING_WEIGHT_KG;

      const bikeWeightKg = 8;
      const totalMassKg = riderWeightKg + bikeWeightKg;

      // Solve for speed
      let speed = 0;
      for (let v = 0; v < 20; v += 0.1) {
        const rollingResistance = CRR * totalMassKg * 9.81 * v;
        const airResistance = 0.5 * AIR_DENSITY * CDA * v ** 3;
        const requiredPower = rollingResistance + airResistance;

        if (requiredPower >= effectivePower) {
          speed = v;
          break;
        }
      }

      return speed > 0 ? speed : undefined;
    }

    return undefined;
  }

  private isLocationReliable(location: LocationReading): boolean {
    return (
      location.accuracy === undefined ||
      location.accuracy <= MOVEMENT_THRESHOLDS.GPS_ACCURACY_THRESHOLD_M
    );
  }

  /**
   * Calculate instantaneous speed from recent GPS positions
   * Uses the last 3-5 seconds of GPS data to smooth out GPS noise
   * Returns speed in m/s, or undefined if insufficient data
   */
  private calculateGPSSpeed(): number | undefined {
    if (!this.lastLocation) return undefined;

    // Get recent location readings (last 5 seconds)
    const recentReadings = this.buffer.getRecentReadings("latlng", 5);

    // Need at least 2 points to calculate speed
    if (recentReadings.length < 2) {
      return undefined;
    }

    // Calculate speed using last 3 seconds of movement
    // This smooths GPS noise while being responsive
    const cutoffTime = Date.now() - 3000; // 3 seconds ago
    const recentPoints = recentReadings.filter(
      (r) => r.timestamp >= cutoffTime,
    ) as LatLngBufferedReading[];

    if (recentPoints.length < 2) {
      // Fall back to using all recent points if not enough in last 3s
      if (recentReadings.length >= 2) {
        return this.computeSpeedFromPoints(recentReadings as LatLngBufferedReading[]);
      }
      return undefined;
    }

    return this.computeSpeedFromPoints(recentPoints);
  }

  /**
   * Compute speed from a series of GPS points
   * Returns speed in m/s
   */
  private computeSpeedFromPoints(
    points: Array<{ value: [number, number]; timestamp: number }>,
  ): number | undefined {
    if (points.length < 2) return undefined;

    // Calculate total distance and time between first and last point
    let totalDistance = 0;

    for (let i = 1; i < points.length; i++) {
      const [lat1, lon1] = points[i - 1].value;
      const [lat2, lon2] = points[i].value;

      const distance = this.calculateDistanceFromCoords(lat1, lon1, lat2, lon2);

      // Filter out unreasonable jumps (GPS noise/errors)
      // Max reasonable speed: 20 m/s (72 km/h) for cycling
      const timeDelta = (points[i].timestamp - points[i - 1].timestamp) / 1000;
      if (timeDelta > 0) {
        const segmentSpeed = distance / timeDelta;
        if (segmentSpeed < 20) {
          totalDistance += distance;
        }
      }
    }

    // Calculate time span
    const totalTime = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;

    // Avoid division by zero and require reasonable time span
    if (totalTime < 0.5) {
      return undefined;
    }

    // Calculate average speed (m/s)
    const speed = totalDistance / totalTime;

    // Filter out unreasonable speeds
    if (speed < 0 || speed > 20) {
      return undefined;
    }

    return speed;
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * Returns distance in meters
   */
  private calculateDistanceFromCoords(
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
   * Get elapsed time in seconds
   */
  private getElapsedTime(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get moving time in seconds
   */
  private getMovingTime(): number {
    return this.metrics.movingTime;
  }

  /**
   * Check if we have enough data for advanced metrics
   */
  private hasEnoughDataForAdvancedMetrics(): boolean {
    // Need at least 5 minutes of power data
    return this.metrics.elapsedTime > 300 && this.metrics.avgPower > 0;
  }

  /**
   * Persist data to files and cleanup old data
   * Called every 60 seconds
   */
  private async persistAndCleanup(): Promise<void> {
    try {
      // Write accumulated data to files
      await this.streamBuffer.flushToFiles();

      // Remove old data from buffer
      this.buffer.cleanup();

      const status = this.streamBuffer.getBufferStatus();
      console.log("[LiveMetricsManager] Persisted and cleaned up:", {
        readingsWritten: status.readingCount,
        locationsWritten: status.locationCount,
        bufferStats: this.buffer.getStats(),
      });
    } catch (error) {
      console.error("[LiveMetricsManager] Persistence failed:", error);
      this.emit("persistenceError", error);
    }
  }

  /**
   * Stop all timers
   */
  private stopTimers(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = undefined;
    }
    if (this.sensorUpdateTimer) {
      clearTimeout(this.sensorUpdateTimer);
      this.sensorUpdateTimer = undefined;
    }
  }

  /**
   * Update timing metrics
   */
  private updateTiming(): void {
    if (!this.startTime) return;

    const now = Date.now();
    const elapsed = now - this.startTime;
    const pauseTime = this.pauseStartTime ? now - this.pauseStartTime : 0;

    this.metrics.elapsedTime = Math.floor(elapsed / 1000);
    this.metrics.movingTime = Math.floor((elapsed - this.totalPauseTime - pauseTime) / 1000);
  }

  /**
   * Update distance and speed metrics
   */
  private updateDistanceMetrics(): void {
    this.metrics.distance = Math.round(this.totalDistance);
    this.metrics.maxSpeed = this.maxSpeed;

    // Calculate average speed
    if (this.metrics.movingTime > 0) {
      this.metrics.avgSpeed = this.totalDistance / this.metrics.movingTime; // m/s
    }

    // Calculate elevation gain per km
    if (this.totalDistance > 0) {
      this.metrics.elevationGainPerKm = (this.totalAscent / this.totalDistance) * 1000;
    }
  }

  /**
   * Update power metrics
   */
  private updatePowerMetrics(): void {
    const powerValues = this.buffer.getAll("power");

    if (powerValues.length > 0) {
      this.metrics.avgPower = Math.round(this.buffer.getAverage("power"));
      this.metrics.maxPower = this.maxPower;

      // Calculate total work (joules)
      // For each second, work = power * 1 second
      this.totalWork += powerValues[powerValues.length - 1]; // Latest power reading
      this.metrics.totalWork = Math.round(this.totalWork);
    }
  }

  /**
   * Update heart rate metrics
   */
  private updateHeartRateMetrics(): void {
    const hrValues = this.buffer.getAll("heartrate");

    if (hrValues.length > 0) {
      this.metrics.avgHeartRate = Math.round(this.buffer.getAverage("heartrate"));
      this.metrics.maxHeartRate = this.maxHeartRate;

      // Calculate % of threshold HR
      if (this.profile.lthrBpm) {
        const latestHr = this.buffer.getLatest("heartrate") || 0;
        this.metrics.maxHrPctThreshold = (latestHr / this.profile.lthrBpm) * 100;
      }
    }
  }

  /**
   * Update cadence metrics
   */
  private updateCadenceMetrics(): void {
    const cadenceValues = this.buffer.getAll("cadence");

    if (cadenceValues.length > 0) {
      this.metrics.avgCadence = Math.round(this.buffer.getAverage("cadence"));
      this.metrics.maxCadence = this.maxCadence;
    }
  }

  /**
   * Update temperature metrics
   */
  private updateTemperatureMetrics(): void {
    const tempValues = this.buffer.getAll("temperature");

    if (tempValues.length > 0) {
      this.metrics.avgTemperature = Math.round(this.buffer.getAverage("temperature") * 10) / 10;
    }
  }

  /**
   * Update zone time metrics
   */
  private updateZoneMetrics(): void {
    if (!this.zoneStartTime) return;

    const now = Date.now();
    const timeDelta = now - this.zoneStartTime;

    // Update HR zone time
    const currentHr = this.buffer.getLatest("heartrate");
    if (currentHr !== undefined) {
      const hrZone = this.getHeartRateZone(currentHr);
      if (hrZone !== undefined) {
        if (this.currentHrZone !== undefined && timeDelta < 60000) {
          this.hrZoneTimes[this.currentHrZone] += timeDelta;
        }
        this.currentHrZone = hrZone;
        this.metrics.currentHeartRateZone = hrZone + 1;
      }
    }

    // Update Power zone time
    const currentPower = this.buffer.getLatest("power");
    if (currentPower !== undefined) {
      const powerZone = this.getPowerZone(currentPower);
      if (powerZone !== undefined) {
        if (this.currentPowerZone !== undefined && timeDelta < 60000) {
          this.powerZoneTimes[this.currentPowerZone] += timeDelta;
        }
        this.currentPowerZone = powerZone;
        this.metrics.currentPowerZone = powerZone + 1;
      }
    }

    // Update metrics (convert to seconds)
    this.metrics.hrZone1Time = Math.floor(this.hrZoneTimes[0] / 1000);
    this.metrics.hrZone2Time = Math.floor(this.hrZoneTimes[1] / 1000);
    this.metrics.hrZone3Time = Math.floor(this.hrZoneTimes[2] / 1000);
    this.metrics.hrZone4Time = Math.floor(this.hrZoneTimes[3] / 1000);
    this.metrics.hrZone5Time = Math.floor(this.hrZoneTimes[4] / 1000);

    this.metrics.powerZone1Time = Math.floor(this.powerZoneTimes[0] / 1000);
    this.metrics.powerZone2Time = Math.floor(this.powerZoneTimes[1] / 1000);
    this.metrics.powerZone3Time = Math.floor(this.powerZoneTimes[2] / 1000);
    this.metrics.powerZone4Time = Math.floor(this.powerZoneTimes[3] / 1000);
    this.metrics.powerZone5Time = Math.floor(this.powerZoneTimes[4] / 1000);
    this.metrics.powerZone6Time = Math.floor(this.powerZoneTimes[5] / 1000);
    this.metrics.powerZone7Time = Math.floor(this.powerZoneTimes[6] / 1000);

    this.zoneStartTime = now;
  }

  /**
   * Update calorie estimate using waterfall logic
   * Priority: Power+HR > Power > HR+Activity > Distance+Activity > Basic fallback
   */
  private updateCalories(): void {
    if (this.metrics.movingTime === 0) {
      this.metrics.calories = 0;
      return;
    }

    const hours = this.metrics.movingTime / 3600;
    const weight = this.profile.weightKg || DEFAULT_RECORDING_WEIGHT_KG;

    // TIER 1: Power + Heart Rate (most accurate)
    if (this.metrics.avgPower > 0 && this.metrics.avgHeartRate > 0) {
      // Power-based calculation with HR efficiency adjustment
      const powerCalories = (this.metrics.avgPower * this.metrics.movingTime * 0.239) / 1000;

      // HR efficiency factor: adjust based on HR intensity
      const hrEfficiency = this.profile.lthrBpm
        ? Math.min(1.15, 0.85 + (this.metrics.avgHeartRate / this.profile.lthrBpm) * 0.3)
        : 1.0;

      this.metrics.calories = Math.round(powerCalories * hrEfficiency);
      return;
    }

    // TIER 2: Power only
    if (this.metrics.avgPower > 0) {
      // 1 watt × 1 second = 1 joule
      // 1 kJ = 0.239 kcal (assumes ~25% efficiency)
      const kj = (this.metrics.avgPower * this.metrics.movingTime) / 1000;
      this.metrics.calories = Math.round(kj * 0.239);
      return;
    }

    // TIER 3: Heart Rate + Activity Category
    if (this.metrics.avgHeartRate > 0 && this.activityCategory) {
      // Activity-specific MET multipliers (at moderate intensity)
      const activityMETs: Record<string, number> = {
        run: 9.0, // Running at moderate pace
        bike: 7.5, // Cycling at moderate pace
        swim: 7.0, // Swimming at moderate pace
        walk: 3.5, // Walking
        hike: 6.0, // Hiking
        row: 7.0, // Rowing
        ski: 7.0, // Cross-country skiing
        other: 6.0, // Generic moderate activity
      };

      const baseMET = activityMETs[this.activityCategory] || 6.0;

      // Adjust MET based on HR intensity
      let intensityMultiplier = 1.0;
      if (this.profile.lthrBpm) {
        const hrPercent = (this.metrics.avgHeartRate / this.profile.lthrBpm) * 100;
        if (hrPercent < 70)
          intensityMultiplier = 0.7; // Easy
        else if (hrPercent < 85)
          intensityMultiplier = 0.9; // Moderate
        else if (hrPercent < 95)
          intensityMultiplier = 1.1; // Hard
        else intensityMultiplier = 1.3; // Very Hard
      }

      const adjustedMET = baseMET * intensityMultiplier;

      // Calories = MET × weight(kg) × time(hours)
      this.metrics.calories = Math.round(adjustedMET * weight * hours);
      return;
    }

    // TIER 4: Distance + Activity Category
    if (this.totalDistance > 0 && this.activityCategory) {
      const distanceKm = this.totalDistance / 1000;

      // Calories per km by activity category
      const caloriesPerKm: Record<string, number> = {
        run: weight * 1.0, // ~1 kcal/kg/km
        walk: weight * 0.5, // ~0.5 kcal/kg/km
        bike: weight * 0.35, // ~0.35 kcal/kg/km (cycling is more efficient)
        hike: weight * 0.6, // ~0.6 kcal/kg/km
        swim: weight * 1.2, // Swimming (if distance tracked)
        other: weight * 0.7, // Generic
      };

      const calPerKm = caloriesPerKm[this.activityCategory] || weight * 0.7;
      this.metrics.calories = Math.round(calPerKm * distanceKm);
      return;
    }

    // TIER 5: Time + Activity Category fallback
    if (this.activityCategory) {
      // Use moderate MET values as fallback
      const fallbackMETs: Record<string, number> = {
        run: 8.0,
        bike: 7.0,
        swim: 7.0,
        walk: 3.5,
        hike: 6.0,
        row: 7.0,
        ski: 7.0,
        other: 5.0,
      };

      const met = fallbackMETs[this.activityCategory] || 5.0;
      this.metrics.calories = Math.round(met * weight * hours);
      return;
    }

    // TIER 6: Basic fallback (time only, assume moderate activity)
    // 5 METs = moderate activity
    this.metrics.calories = Math.round(5.0 * weight * hours);
  }

  private updatePowerHeartRateRatio(): void {
    // Power to HR ratio
    if (this.metrics.avgHeartRate > 0 && this.metrics.avgPower > 0) {
      this.metrics.powerHeartRateRatio = this.metrics.avgPower / this.metrics.avgHeartRate;
    }
  }

  private buildRecordingMetricsConfig(): RecordingMetricsConfig {
    return {
      activityCategory: this.activityCategory ?? "other",
      performanceTargets: this.activePerformanceTargets ?? this.stagedPerformanceTargets,
      recordingSessionId: this.recordingSessionId,
      timeBasis: "moving",
    };
  }

  private resetRecordingMetricsAccumulator(): void {
    this.provisionalMetricsAccumulator = createProvisionalRecordingMetricsAccumulator(
      this.buildRecordingMetricsConfig(),
    );
    this.provisionalMetricsSnapshot = this.provisionalMetricsAccumulator.getSnapshot();
  }

  private resetLiveSessionState(): void {
    this.buffer.clear();
    this.metrics = this.createInitialMetrics();
    this.cachedStats = undefined;
    this.lastStatsEmit = 0;
    this.lastAdvancedMetricsSampleAt = 0;
    this.advancedMetricsDisabledUntil = 0;
    this.startTime = undefined;
    this.pauseStartTime = undefined;
    this.totalPauseTime = 0;
    this.lastLocation = undefined;
    this.totalDistance = 0;
    this.totalWork = 0;
    this.totalAscent = 0;
    this.totalDescent = 0;
    this.maxSpeed = 0;
    this.maxPower = 0;
    this.maxHeartRate = 0;
    this.maxCadence = 0;
    this.lastPowerUpdate = undefined;
    this.lastPowerValue = 0;
    this.zoneStartTime = undefined;
    delete this.currentHrZone;
    delete this.currentPowerZone;
    this.hrZoneTimes = [0, 0, 0, 0, 0];
    this.powerZoneTimes = [0, 0, 0, 0, 0, 0, 0];
    this.resetRecordingMetricsAccumulator();
  }

  private shouldSampleAdvancedMetrics(timestampMs: number): boolean {
    if (timestampMs < this.advancedMetricsDisabledUntil) return false;
    return (
      this.lastAdvancedMetricsSampleAt === 0 ||
      timestampMs - this.lastAdvancedMetricsSampleAt >=
        RECORDING_CONFIG.ADVANCED_METRICS_SAMPLE_INTERVAL_MS
    );
  }

  private addRecordingMetricsSample(timestampMs: number): void {
    this.provisionalMetricsAccumulator.addSample({
      timestampMs,
      moving: this.isActive,
      powerWatts: this.buffer.getLatest("power") ?? null,
      heartRateBpm: this.freshHeartRateAt(timestampMs),
      cadenceRpm: this.buffer.getLatest("cadence") ?? null,
      speedMps: this.buffer.getLatest("speed") ?? null,
      distanceMeters: this.totalDistance,
      altitudeMeters: this.lastLocation?.altitude ?? null,
    });
    this.provisionalMetricsSnapshot = this.provisionalMetricsAccumulator.getSnapshot();
  }

  private freshHeartRateAt(timestampMs: number): number | null {
    const reading = this.buffer.getLatestReading("heartrate");
    if (
      reading === undefined ||
      typeof reading.value !== "number" ||
      !Number.isFinite(reading.timestamp) ||
      reading.timestamp > timestampMs ||
      timestampMs - reading.timestamp > DEFAULT_HEART_RATE_MAX_GAP_SECONDS * 1_000
    ) {
      return null;
    }
    return reading.value;
  }

  private applyProvisionalMetricsSnapshot(): void {
    const snapshot = this.provisionalMetricsSnapshot;

    if (snapshot.averagePowerWatts !== null) {
      this.metrics.avgPower = Math.round(snapshot.averagePowerWatts);
    }
    if (snapshot.workKilojoules !== null) {
      this.totalWork = snapshot.workKilojoules * 1000;
      this.metrics.totalWork = Math.round(this.totalWork);
    }
    if (snapshot.averageHeartRateBpm !== null) {
      this.metrics.avgHeartRate = Math.round(snapshot.averageHeartRateBpm);
    }
    const normalizedPower = selectCyclingNormalizedPowerWatts(snapshot.normalizedPowerResult);
    if (normalizedPower !== null) {
      this.metrics.normalizedPowerEst = normalizedPower;
    }
    if (snapshot.variabilityIndex !== null) {
      this.metrics.variabilityIndexEst = snapshot.variabilityIndex;
    }
    this.metrics.efficiencyFactorEst =
      selectEfficiencyFactorValue(snapshot.efficiencyFactorResult) ?? 0;
    this.metrics.decouplingEst =
      selectAerobicDecouplingValue(snapshot.aerobicDecouplingResult) ?? 0;
  }

  /**
   * Update elevation tracking
   */
  private updateElevation(_altitude: number): void {
    const recentAltitudes = this.buffer.getRecent("altitude", 10);

    if (recentAltitudes.length < 2) return;

    // Smooth altitude with 10-second average
    const smoothed = recentAltitudes.reduce((sum, a) => sum + a, 0) / recentAltitudes.length;

    // Calculate change (with noise threshold)
    const previous = recentAltitudes[recentAltitudes.length - 2];
    const delta = smoothed - previous;

    if (Math.abs(delta) > MOVEMENT_THRESHOLDS.ELEVATION_NOISE_THRESHOLD_M) {
      if (delta > 0) {
        this.totalAscent += delta;
      } else {
        this.totalDescent += Math.abs(delta);
      }
    }

    this.metrics.totalAscent = Math.round(this.totalAscent);
    this.metrics.totalDescent = Math.round(this.totalDescent);
  }

  private updateTerrainIntensity(
    previousLocation: LocationReading,
    location: LocationReading,
    distanceMeters: number,
    seconds: number,
  ): void {
    if (
      previousLocation.altitude === undefined ||
      location.altitude === undefined ||
      distanceMeters <= 0 ||
      seconds <= 0
    ) {
      return;
    }

    const altitudeDelta = location.altitude - previousLocation.altitude;
    const grade = clamp((altitudeDelta / distanceMeters) * 100, -30, 30);
    const speedMps = distanceMeters / seconds;
    const gradeAdjustedSpeed = speedMps * (minettiCost(grade / 100) / minettiCost(0));

    this.metrics.currentGrade = grade;
    this.metrics.verticalSpeedMetersPerHour = (altitudeDelta / seconds) * 3600;

    if (Number.isFinite(gradeAdjustedSpeed) && gradeAdjustedSpeed > 0) {
      this.metrics.gradeAdjustedPaceSecondsPerKm = 1000 / gradeAdjustedSpeed;
    }

    if (this.totalDistance > 0) {
      this.metrics.avgGrade = ((this.totalAscent - this.totalDescent) / this.totalDistance) * 100;
    }
  }

  /**
   * Update max values for metrics
   */
  private updateMaxValues(metric: string, value: number): void {
    switch (metric) {
      case "speed":
        this.maxSpeed = Math.max(this.maxSpeed, value);
        break;
      case "power":
        this.maxPower = Math.max(this.maxPower, value);
        break;
      case "heartrate":
        this.maxHeartRate = Math.max(this.maxHeartRate, value);
        break;
      case "cadence":
        this.maxCadence = Math.max(this.maxCadence, value);
        break;
    }
  }

  /**
   * Calculate virtual distance for indoor activities based on power
   * Uses physics model to estimate speed from power output
   */
  private updateVirtualDistance(powerWatts: number, timestamp: number): void {
    // Skip if this is the first power reading
    if (!this.lastPowerUpdate) {
      this.lastPowerUpdate = timestamp;
      this.lastPowerValue = powerWatts;
      return;
    }

    // Calculate time elapsed since last update (in seconds)
    const deltaTime = (timestamp - this.lastPowerUpdate) / 1000;

    // Skip if unreasonable time delta
    if (deltaTime <= 0 || deltaTime > 10) {
      this.lastPowerUpdate = timestamp;
      this.lastPowerValue = powerWatts;
      return;
    }

    // Average power over the interval
    const avgPower = (powerWatts + this.lastPowerValue) / 2;

    // Calculate virtual distance using power-to-speed model
    const distanceMeters = this.calculateVirtualDistanceFromPower(avgPower, deltaTime);

    // Add to total distance
    this.totalDistance += distanceMeters;

    // Update last values
    this.lastPowerUpdate = timestamp;
    this.lastPowerValue = powerWatts;
  }

  /**
   * Calculate virtual distance from power using physics model
   * Models road cycling physics: power = (rolling resistance + air resistance) * speed
   *
   * @param powerWatts - Average power in watts
   * @param durationSeconds - Duration in seconds
   * @returns Distance in meters
   */
  private calculateVirtualDistanceFromPower(powerWatts: number, durationSeconds: number): number {
    // Physics constants for road cycling
    const CRR = 0.005; // Coefficient of rolling resistance (typical road tire)
    const CDA = 0.324; // Drag coefficient * frontal area (typical cycling position)
    const AIR_DENSITY = 1.225; // kg/m³ (air density at sea level, 15°C)
    const DRIVETRAIN_LOSS = 0.03; // 3% drivetrain loss

    // Account for drivetrain loss
    const effectivePower = powerWatts * (1 - DRIVETRAIN_LOSS);

    // Get rider weight from profile (default 75kg if not set)
    const riderWeightKg = this.profile.weightKg || DEFAULT_RECORDING_WEIGHT_KG;
    const bikeWeightKg = 8; // Typical bike weight
    const totalMassKg = riderWeightKg + bikeWeightKg;

    // Solve for speed iteratively using Binary Search (O(log N))
    // Power equation: P = (CRR * m * g * v) + (0.5 * ρ * CDA * v³)

    let min = 0;
    let max = 25; // 25 m/s = 90 km/h (reasonable max)
    let speed = 0;

    // 10 iterations gives precision < 0.025 m/s
    for (let i = 0; i < 10; i++) {
      speed = (min + max) / 2;

      const rollingResistance = CRR * totalMassKg * 9.81 * speed;
      const airResistance = 0.5 * AIR_DENSITY * CDA * speed ** 3;
      const requiredPower = rollingResistance + airResistance;

      if (requiredPower < effectivePower) {
        min = speed;
      } else {
        max = speed;
      }
    }

    // If no power (coasting), speed is 0 (handled by binary search converging to 0 if power is 0)
    if (powerWatts <= 0) {
      speed = 0;
    }

    // Calculate distance: distance = speed * time
    const distanceMeters = speed * durationSeconds;

    return distanceMeters;
  }

  /**
   * Calculate distance between two locations (Haversine formula)
   */
  private calculateDistance(loc1: LocationReading, loc2: LocationReading): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (loc1.latitude * Math.PI) / 180;
    const φ2 = (loc2.latitude * Math.PI) / 180;
    const Δφ = ((loc2.latitude - loc1.latitude) * Math.PI) / 180;
    const Δλ = ((loc2.longitude - loc1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get heart rate zone (0-4)
   */
  private getHeartRateZone(hr: number): number | undefined {
    const thresholds = this.zones.hrZones;
    if (thresholds.length === 0) return undefined;
    for (let i = 0; i < thresholds.length; i++) {
      if (hr < thresholds[i]) return i;
    }
    return thresholds.length - 1;
  }

  /**
   * Get power zone (0-6)
   */
  private getPowerZone(power: number): number | undefined {
    const thresholds = this.zones.powerZones;
    if (thresholds.length === 0) return undefined;
    for (let i = 0; i < thresholds.length; i++) {
      if (power < thresholds[i]) return i;
    }
    return thresholds.length - 1;
  }

  private applyPerformanceTargetProfile(snapshot: AthletePerformanceTargetFacts | null): void {
    delete this.profile.bikeThresholdWatts;
    delete this.profile.lthrBpm;
    if (snapshot === null) return;

    const category = this.activityCategory;
    if (category === "bike") {
      const bikeThresholdWatts = getAvailablePerformanceTargetValue(snapshot.thresholds.bike);
      if (bikeThresholdWatts !== null) this.profile.bikeThresholdWatts = bikeThresholdWatts;
    }
    if (category === "bike" || category === "run" || category === "swim") {
      const lthr = snapshot.heartRate[category].lthr;
      const lthrBpm = lthr.status === "available" ? lthr.valueBpm : null;
      if (lthrBpm !== null) this.profile.lthrBpm = lthrBpm;
    }
  }

  /**
   * Extract profile metrics
   */
  private extractProfileMetrics(
    _profile: RecorderProfileRef,
    metrics?: {
      weightKg?: number;
    },
  ): ProfileMetrics {
    return {
      ...(metrics?.weightKg === undefined ? {} : { weightKg: metrics.weightKg }),
    };
  }

  /**
   * Calculate zone thresholds
   */
  private calculateZones(profile: ProfileMetrics): ZoneConfig {
    return {
      hrZones: profile.lthrBpm === undefined ? [] : getHrZoneUpperBoundsFromLthr(profile.lthrBpm),
      powerZones:
        profile.bikeThresholdWatts === undefined
          ? []
          : getPowerZoneUpperBoundsFromFtp(profile.bikeThresholdWatts),
    };
  }

  /**
   * Create initial metrics state
   */
  private createInitialMetrics(): LiveMetricsState {
    return {
      elapsedTime: 0,
      movingTime: 0,
      distance: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      totalAscent: 0,
      totalDescent: 0,
      avgGrade: 0,
      elevationGainPerKm: 0,
      avgHeartRate: 0,
      maxHeartRate: 0,
      maxHrPctThreshold: 0,
      hrZone1Time: 0,
      hrZone2Time: 0,
      hrZone3Time: 0,
      hrZone4Time: 0,
      hrZone5Time: 0,
      avgPower: 0,
      maxPower: 0,
      totalWork: 0,
      powerZone1Time: 0,
      powerZone2Time: 0,
      powerZone3Time: 0,
      powerZone4Time: 0,
      powerZone5Time: 0,
      powerZone6Time: 0,
      powerZone7Time: 0,
      powerHeartRateRatio: 0,
      avgCadence: 0,
      maxCadence: 0,
      avgTemperature: 0,
      calories: 0,
      normalizedPowerEst: 0,
      variabilityIndexEst: 0,
      efficiencyFactorEst: 0,
      decouplingEst: 0,
      adherenceCurrentStep: 0,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function minettiCost(grade: number): number {
  return (
    155.4 * grade ** 5 -
    30.4 * grade ** 4 -
    43.3 * grade ** 3 +
    46.3 * grade ** 2 +
    19.5 * grade +
    3.6
  );
}
