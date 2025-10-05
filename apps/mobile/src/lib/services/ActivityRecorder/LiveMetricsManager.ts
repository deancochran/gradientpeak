import { EventEmitter } from "events";
import {
  RECORDING_CONFIG,
  METRIC_DEFINITIONS,
  EVENT_TYPES,
  roundToPrecision,
  type AllMetrics,
} from "./config";
import {
  OptimizedCircularBuffer,
  RunningAverage,
  ZoneTimeTracker,
  DistanceCalculator,
  ElevationTracker,
  PerformanceMonitor,
  type SensorReading,
  type LocationData,
  type BatchWriteData,
} from "./data-structures";
import {
  LiveMetricsState,
  ZoneConfig,
  ProfileMetrics,
  MetricsUpdateEvent,
  PerformanceStats,
  LiveMetricsState_Recording,
  LiveMetricsError,
  PlanAdherenceMetrics,
} from "./types";
import { PublicProfilesRow } from "@repo/core";

/**
 * High-performance live metrics calculator
 * Handles Tier 1 (real-time) and Tier 2 (live approximation) metrics
 *
 * Architecture:
 * - Data ingestion: Immediate (no blocking)
 * - UI updates: 1Hz (smooth performance)
 * - Database writes: 5s batches (efficient I/O)
 * - Metric calculations: 1Hz (optimized)
 */
export class LiveMetricsManager extends EventEmitter {
  private config = RECORDING_CONFIG;
  private metrics: LiveMetricsState;
  private profile: ProfileMetrics;
  private zones: ZoneConfig;
  private state: LiveMetricsState_Recording = "inactive";

  // === Timers ===
  private uiUpdateTimer?: NodeJS.Timeout;
  private dbBatchTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  // === Data Buffers ===
  private buffers = {
    power: new OptimizedCircularBuffer<number>(this.config.BUFFERS.POWER_SIZE),
    heartRate: new OptimizedCircularBuffer<number>(
      this.config.BUFFERS.HEART_RATE_SIZE,
    ),
    cadence: new OptimizedCircularBuffer<number>(
      this.config.BUFFERS.CADENCE_SIZE,
    ),
    temperature: new OptimizedCircularBuffer<number>(
      this.config.BUFFERS.TEMPERATURE_SIZE,
    ),
    // Special buffer for NP calculation (stores P30^4 values)
    normalizedPower: new OptimizedCircularBuffer<number>(
      this.config.BUFFERS.NP_CALCULATION_SIZE,
    ),
  };

  // === Running Averages ===
  private averages = {
    heartRate: new RunningAverage(),
    power: new RunningAverage(),
    cadence: new RunningAverage(),
    temperature: new RunningAverage(),
  };

  // === Zone Trackers ===
  private zoneTrackers = {
    heartRate: new ZoneTimeTracker(5), // 5 HR zones
    power: new ZoneTimeTracker(7), // 7 power zones
  };

  // === Specialized Calculators ===
  private distanceCalculator = new DistanceCalculator();
  private elevationTracker = new ElevationTracker();
  private performanceMonitor = new PerformanceMonitor();

  // === State Tracking ===
  private lastTimestamp?: number;
  private pauseStartTime?: number;
  private totalPauseTime = 0;
  private metricsDirty = false;
  private lastUIUpdate = 0;
  private currentInstantaneousValues = new Map<string, number>();

  // === Batch Processing ===
  private pendingWrites: BatchWriteData[] = [];
  private batchBuffer: {
    readings: SensorReading[];
    locations: LocationData[];
  } = { readings: [], locations: [] };

  // === Error Tracking ===
  private errors: LiveMetricsError[] = [];
  private consecutiveErrors = 0;

  constructor(profile: PublicProfilesRow) {
    super();
    this.profile = this.extractProfileMetrics(profile);
    this.zones = this.calculateZones(this.profile);
    this.metrics = this.createInitialState();

    this.setupEventHandlers();
    console.log("LiveMetricsManager initialized with profile:", {
      ftp: this.profile.ftp,
      thresholdHr: this.profile.thresholdHr,
      weight: this.profile.weight,
    });
  }

  // === Initialization ===
  private extractProfileMetrics(profile: PublicProfilesRow): ProfileMetrics {
    return {
      ftp: profile.ftp || undefined,
      thresholdHr: profile.threshold_hr || undefined,
      weight: profile.weight_kg || undefined,
      age: profile.age || undefined,
    };
  }

  private calculateZones(profile: ProfileMetrics): ZoneConfig {
    const thresholdHr = profile.thresholdHr || 150; // Default threshold
    const ftp = profile.ftp || 200; // Default FTP

    return {
      // 5-zone HR model based on threshold HR
      hrZones: [
        Math.round(thresholdHr * 0.68), // Zone 1: <68%
        Math.round(thresholdHr * 0.83), // Zone 2: 68-82%
        Math.round(thresholdHr * 0.94), // Zone 3: 83-94%
        Math.round(thresholdHr * 1.05), // Zone 4: 94-105%
        Infinity, // Zone 5: >105%
      ],

      // 7-zone power model based on FTP
      powerZones: [
        Math.round(ftp * 0.55), // Zone 1: <55%
        Math.round(ftp * 0.75), // Zone 2: 55-75%
        Math.round(ftp * 0.9), // Zone 3: 75-90%
        Math.round(ftp * 1.05), // Zone 4: 90-105%
        Math.round(ftp * 1.2), // Zone 5: 105-120%
        Math.round(ftp * 1.5), // Zone 6: 120-150%
        Infinity, // Zone 7: >150%
      ],
    };
  }

  private createInitialState(): LiveMetricsState {
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
      calories: 0,
      normalizedPowerEst: 0,
      intensityFactorEst: 0,
      trainingStressScoreEst: 0,
      variabilityIndexEst: 0,
      efficiencyFactorEst: 0,
      decouplingEst: 0,
      adherenceCurrentStep: 0,
    };
  }

  private startTimers(): void {
    this.stopTimers(); // Ensure no duplicates

    // UI Update Timer - 1Hz
    this.uiUpdateTimer = setInterval(() => {
      if (this.metricsDirty && this.state === "active") {
        const startTime = Date.now();
        try {
          this.recalculateMetrics();
          this.emitMetricsUpdate();
          this.metricsDirty = false;
          this.consecutiveErrors = 0;

          // Track performance
          const calculationTime = Date.now() - startTime;
          this.performanceMonitor.recordCalculationTime(calculationTime);
          this.performanceMonitor.recordUpdateTime(
            Date.now() - this.lastUIUpdate,
          );
          this.lastUIUpdate = Date.now();
        } catch (error) {
          this.handleError("calculation", error as Error);
        }
      }
    }, this.config.UI_UPDATE_RATE);

    // Database Batch Timer - Every 5s
    this.dbBatchTimer = setInterval(() => {
      this.flushPendingWrites();
    }, this.config.DB_BATCH_INTERVAL);

    // Memory Cleanup Timer - Every 10 minutes
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.MEMORY.CLEANUP_INTERVAL_MS);

    console.log("LiveMetricsManager timers started");
  }

  private stopTimers(): void {
    if (this.uiUpdateTimer) {
      clearInterval(this.uiUpdateTimer);
      this.uiUpdateTimer = undefined;
    }
    if (this.dbBatchTimer) {
      clearInterval(this.dbBatchTimer);
      this.dbBatchTimer = undefined;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private setupEventHandlers(): void {
    // Handle process termination gracefully
    const cleanup = () => {
      this.cleanup();
    };

    // Note: In React Native, these process events might not be available
    try {
      process.on("beforeExit", cleanup);
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    } catch (error) {
      // Ignore if process events aren't available in this environment
    }
  }

  // === Public API ===
  public startRecording(timestamp: number = Date.now()): void {
    this.state = "starting";

    try {
      this.metrics.startedAt = timestamp;
      this.lastTimestamp = timestamp;
      this.totalPauseTime = 0;
      this.metricsDirty = true;

      // Reset all tracking state
      this.resetTrackingState();

      // Start timers
      this.startTimers();

      this.state = "active";

      this.emit(EVENT_TYPES.RECORDING_STARTED, {
        timestamp,
        activityType: "unknown",
        profile: this.profile,
      });

      console.log("Recording started at:", new Date(timestamp).toISOString());
    } catch (error) {
      this.state = "error";
      this.handleError("calculation", error as Error);
      throw error;
    }
  }

  public pauseRecording(timestamp: number = Date.now()): void {
    if (this.state !== "active") return;

    this.state = "paused";
    this.pauseStartTime = timestamp;

    this.emit(EVENT_TYPES.RECORDING_PAUSED, {
      timestamp,
      elapsedTime: this.metrics.elapsedTime,
      reason: "manual",
    });

    console.log("Recording paused at:", new Date(timestamp).toISOString());
  }

  public resumeRecording(timestamp: number = Date.now()): void {
    if (this.state !== "paused") return;

    if (this.pauseStartTime) {
      const pauseDuration = timestamp - this.pauseStartTime;
      this.totalPauseTime += pauseDuration;
      this.pauseStartTime = undefined;

      this.emit(EVENT_TYPES.RECORDING_RESUMED, {
        timestamp,
        pauseDuration,
      });

      console.log(
        `Recording resumed after ${Math.round(pauseDuration / 1000)}s pause`,
      );
    }

    this.state = "active";
  }

  public finishRecording(timestamp: number = Date.now()): void {
    this.state = "finishing";

    try {
      this.metrics.finishedAt = timestamp;

      // Final calculation pass
      this.updateTiming(timestamp);
      this.recalculateMetrics();

      // Flush any remaining writes
      this.flushPendingWrites();

      // Stop timers
      this.stopTimers();

      const finalMetrics = this.getMetrics();
      const totalDuration = finalMetrics.elapsedTime;

      this.emit(EVENT_TYPES.RECORDING_FINISHED, {
        timestamp,
        finalMetrics,
        totalDuration,
        summary: this.generateSummary(),
      });

      this.state = "inactive";

      console.log(
        "Recording finished. Total duration:",
        totalDuration,
        "seconds",
      );
    } catch (error) {
      this.state = "error";
      this.handleError("calculation", error as Error);
      throw error;
    }
  }

  // === Data Ingestion (FAST - minimal processing) ===
  public ingestSensorData(reading: SensorReading): void {
    if (this.state !== "active" && this.state !== "paused") return;

    try {
      const timestamp = reading.timestamp || Date.now();

      // Store instantaneous value for UI
      this.currentInstantaneousValues.set(reading.metric, reading.value);

      // Add to appropriate buffer
      this.addToBuffer(reading.metric, reading.value, timestamp);

      // Queue for database write
      this.queueSensorForWrite(reading);

      // Mark metrics as dirty for next UI update
      this.metricsDirty = true;

      // Update timestamp tracking
      this.updateTiming(timestamp);
    } catch (error) {
      this.handleError("invalid_data", error as Error, reading.metric);
    }
  }

  public ingestLocationData(location: LocationData): void {
    if (this.state !== "active" && this.state !== "paused") return;

    try {
      // Add to distance calculator
      const deltaDistance = this.distanceCalculator.addLocation(location);

      // Add to elevation tracker
      if (location.altitude !== undefined) {
        this.elevationTracker.addElevation(location.altitude);
      }

      // Store GPS speed if available
      if (location.speed !== undefined) {
        this.currentInstantaneousValues.set("speed", location.speed);
        this.metrics.maxSpeed = Math.max(this.metrics.maxSpeed, location.speed);
      }

      // Queue for database write
      this.queueLocationForWrite(location);

      // Mark metrics as dirty
      this.metricsDirty = true;

      // Update timestamp tracking
      this.updateTiming(location.timestamp);
    } catch (error) {
      this.handleError("invalid_data", error as Error, "location");
    }
  }

  private addToBuffer(metric: string, value: number, timestamp: number): void {
    // Validate value
    if (!isFinite(value) || value < 0) {
      throw new Error(`Invalid ${metric} value: ${value}`);
    }

    switch (metric.toLowerCase()) {
      case "power":
        this.buffers.power.add(value);
        this.averages.power.addValue(value);
        // Update zone tracker
        const powerZone = ZoneTimeTracker.getZone(value, this.zones.powerZones);
        this.zoneTrackers.power.updateZone(powerZone, timestamp);
        break;

      case "heartrate":
        this.buffers.heartRate.add(value);
        this.averages.heartRate.addValue(value);
        // Update zone tracker
        const hrZone = ZoneTimeTracker.getZone(value, this.zones.hrZones);
        this.zoneTrackers.heartRate.updateZone(hrZone, timestamp);
        break;

      case "cadence":
        this.buffers.cadence.add(value);
        this.averages.cadence.addValue(value);
        break;

      case "temperature":
        this.buffers.temperature.add(value);
        this.averages.temperature.addValue(value);
        break;
    }
  }

  private updateTiming(timestamp: number): void {
    if (!this.metrics.startedAt) return;

    // Update elapsed time (includes pauses)
    this.metrics.elapsedTime = Math.floor(
      (timestamp - this.metrics.startedAt) / 1000,
    );

    // Update moving time (excludes pauses)
    const currentPauseTime = this.pauseStartTime
      ? this.totalPauseTime + (timestamp - this.pauseStartTime)
      : this.totalPauseTime;
    this.metrics.movingTime = Math.max(
      0,
      Math.floor(this.metrics.elapsedTime - currentPauseTime / 1000),
    );

    this.lastTimestamp = timestamp;
  }

  // === Metric Calculations (called at 1Hz) ===
  private recalculateMetrics(): void {
    // Update Tier 1 metrics
    this.updatePowerMetrics();
    this.updateHeartRateMetrics();
    this.updateCadenceMetrics();
    this.updateDistanceMetrics();
    this.updateElevationMetrics();
    this.updateTemperatureMetrics();
    this.updateZoneMetrics();
    this.updateCalories();

    // Update Tier 2 metrics (more expensive calculations)
    this.updateNormalizedPowerEst();
    this.updateIntensityFactorEst();
    this.updateTSSEst();
    this.updateVariabilityIndexEst();
    this.updateEfficiencyFactorEst();
    this.updateDecouplingEst();

    // Update ratios
    this.updatePowerHeartRateRatio();

    // Mark buffers as processed
    Object.values(this.buffers).forEach((buffer) => buffer.markProcessed());
  }

  private updatePowerMetrics(): void {
    // Average power
    if (this.averages.power.hasData()) {
      this.metrics.avgPower = roundToPrecision(
        this.averages.power.average(),
        "power",
      );
    }

    // Max power
    const currentPower = this.currentInstantaneousValues.get("power");
    if (currentPower !== undefined) {
      this.metrics.maxPower = Math.max(this.metrics.maxPower, currentPower);
    }

    // Total work (Joules) - incremental calculation
    if (currentPower !== undefined && this.lastTimestamp) {
      const deltaSeconds = 1; // 1 second intervals at 1Hz
      this.metrics.totalWork += currentPower * deltaSeconds; // Watts * seconds = Joules
    }
  }

  private updateHeartRateMetrics(): void {
    // Average heart rate
    if (this.averages.heartRate.hasData()) {
      this.metrics.avgHeartRate = roundToPrecision(
        this.averages.heartRate.average(),
        "heartRate",
      );
    }

    // Max heart rate
    const currentHR = this.currentInstantaneousValues.get("heartrate");
    if (currentHR !== undefined) {
      this.metrics.maxHeartRate = Math.max(
        this.metrics.maxHeartRate,
        currentHR,
      );
    }

    // Max HR percentage of threshold
    if (this.profile.thresholdHr && this.metrics.maxHeartRate > 0) {
      this.metrics.maxHrPctThreshold = roundToPrecision(
        (this.metrics.maxHeartRate / this.profile.thresholdHr) * 100,
        "heartRate",
      );
    }
  }

  private updateCadenceMetrics(): void {
    // Average cadence
    if (this.averages.cadence.hasData()) {
      this.metrics.avgCadence = roundToPrecision(
        this.averages.cadence.average(),
        "cadence",
      );
    }

    // Max cadence
    const currentCadence = this.currentInstantaneousValues.get("cadence");
    if (currentCadence !== undefined) {
      this.metrics.maxCadence = Math.max(
        this.metrics.maxCadence,
        currentCadence,
      );
    }
  }

  private updateDistanceMetrics(): void {
    // Distance from GPS
    this.metrics.distance = roundToPrecision(
      this.distanceCalculator.getTotalDistance(),
      "distance",
    );

    // Average speed
    if (this.metrics.movingTime > 0) {
      this.metrics.avgSpeed = roundToPrecision(
        this.metrics.distance / this.metrics.movingTime,
        "speed",
      );
    }

    // Max speed already updated in ingestLocationData
  }

  private updateElevationMetrics(): void {
    this.metrics.totalAscent = roundToPrecision(
      this.elevationTracker.getTotalAscent(),
      "elevation",
    );
    this.metrics.totalDescent = roundToPrecision(
      this.elevationTracker.getTotalDescent(),
      "elevation",
    );

    // Average grade
    if (this.metrics.distance > 0) {
      const netElevation = this.elevationTracker.getNetElevation();
      this.metrics.avgGrade = roundToPrecision(
        (netElevation / this.metrics.distance) * 100,
        "grade",
      );
    }

    // Elevation gain per km
    if (this.metrics.distance > 0) {
      this.metrics.elevationGainPerKm = roundToPrecision(
        this.metrics.totalAscent / (this.metrics.distance / 1000),
        "elevation",
      );
    }
  }

  private updateTemperatureMetrics(): void {
    if (this.averages.temperature.hasData()) {
      this.metrics.avgTemperature = roundToPrecision(
        this.averages.temperature.average(),
        "temperature",
      );
    }

    const currentTemp = this.currentInstantaneousValues.get("temperature");
    if (
      currentTemp !== undefined &&
      this.metrics.maxTemperature !== undefined
    ) {
      this.metrics.maxTemperature = Math.max(
        this.metrics.maxTemperature,
        currentTemp,
      );
    } else if (currentTemp !== undefined) {
      this.metrics.maxTemperature = currentTemp;
    }
  }

  private updateZoneMetrics(): void {
    // HR zone times
    const hrZoneTimes = this.zoneTrackers.heartRate.getZoneTimes();
    this.metrics.hrZone1Time = hrZoneTimes[0]
      ? Math.floor(hrZoneTimes[0] / 1000)
      : 0;
    this.metrics.hrZone2Time = hrZoneTimes[1]
      ? Math.floor(hrZoneTimes[1] / 1000)
      : 0;
    this.metrics.hrZone3Time = hrZoneTimes[2]
      ? Math.floor(hrZoneTimes[2] / 1000)
      : 0;
    this.metrics.hrZone4Time = hrZoneTimes[3]
      ? Math.floor(hrZoneTimes[3] / 1000)
      : 0;
    this.metrics.hrZone5Time = hrZoneTimes[4]
      ? Math.floor(hrZoneTimes[4] / 1000)
      : 0;

    // Power zone times
    const powerZoneTimes = this.zoneTrackers.power.getZoneTimes();
    this.metrics.powerZone1Time = powerZoneTimes[0]
      ? Math.floor(powerZoneTimes[0] / 1000)
      : 0;
    this.metrics.powerZone2Time = powerZoneTimes[1]
      ? Math.floor(powerZoneTimes[1] / 1000)
      : 0;
    this.metrics.powerZone3Time = powerZoneTimes[2]
      ? Math.floor(powerZoneTimes[2] / 1000)
      : 0;
    this.metrics.powerZone4Time = powerZoneTimes[3]
      ? Math.floor(powerZoneTimes[3] / 1000)
      : 0;
    this.metrics.powerZone5Time = powerZoneTimes[4]
      ? Math.floor(powerZoneTimes[4] / 1000)
      : 0;
    this.metrics.powerZone6Time = powerZoneTimes[5]
      ? Math.floor(powerZoneTimes[5] / 1000)
      : 0;
    this.metrics.powerZone7Time = powerZoneTimes[6]
      ? Math.floor(powerZoneTimes[6] / 1000)
      : 0;
  }

  private updateCalories(): void {
    // Power-based calories if available
    const currentPower = this.currentInstantaneousValues.get("power");
    if (currentPower !== undefined && currentPower > 0) {
      const deltaCal = (currentPower * 1) / 4184; // 1 second at 1Hz, Watts to kcal
      this.metrics.calories += deltaCal;
    }
    // HR-based calories fallback
    else if (
      this.metrics.avgHeartRate > 0 &&
      this.profile.age &&
      this.profile.weight
    ) {
      // Simplified HR-based formula
      const mets = (this.metrics.avgHeartRate / 180) * 12; // Rough estimate
      const deltaCal = (mets * this.profile.weight * 1) / 3600; // kcal per second
      this.metrics.calories += deltaCal;
    }

    this.metrics.calories = roundToPrecision(this.metrics.calories, "calories");
  }

  // === Tier 2 Calculations ===
  private updateNormalizedPowerEst(): void {
    if (this.buffers.power.size() < 30) return; // Need 30s of data

    // Calculate 30s rolling average (P30)
    const p30 = this.buffers.power.average();

    // Add P30^4 to NP buffer
    const p30Fourth = Math.pow(p30, 4);
    this.buffers.normalizedPower.add(p30Fourth);

    // Calculate NP estimate: (mean(P30^4))^(1/4)
    if (this.buffers.normalizedPower.size() > 0) {
      const avgFourthPower = this.buffers.normalizedPower.average();
      this.metrics.normalizedPowerEst = roundToPrecision(
        Math.pow(avgFourthPower, 0.25),
        "normalizedPower",
      );
    }
  }

  private updateIntensityFactorEst(): void {
    if (this.profile.ftp && this.metrics.normalizedPowerEst > 0) {
      this.metrics.intensityFactorEst = roundToPrecision(
        this.metrics.normalizedPowerEst / this.profile.ftp,
        "intensityFactor",
      );
    }
  }

  private updateTSSEst(): void {
    if (this.metrics.intensityFactorEst > 0 && this.metrics.elapsedTime > 0) {
      const hours = this.metrics.elapsedTime / 3600;
      this.metrics.trainingStressScoreEst = roundToPrecision(
        hours * Math.pow(this.metrics.intensityFactorEst, 2) * 100,
        "tss",
      );
    }
  }

  private updateVariabilityIndexEst(): void {
    if (this.metrics.avgPower > 0 && this.metrics.normalizedPowerEst > 0) {
      this.metrics.variabilityIndexEst = roundToPrecision(
        this.metrics.normalizedPowerEst / this.metrics.avgPower,
        "variabilityIndex",
      );
    }
  }

  private updateEfficiencyFactorEst(): void {
    if (this.metrics.avgHeartRate > 0 && this.metrics.avgPower > 0) {
      this.metrics.efficiencyFactorEst = roundToPrecision(
        this.metrics.avgPower / this.metrics.avgHeartRate,
        "efficiency",
      );
    }
  }

  private updateDecouplingEst(): void {
    // Simplified decoupling estimate
    // Compare efficiency factor from first and second half of workout
    if (this.metrics.elapsedTime > 600) {
      // At least 10 minutes
      // This is a simplified version - full implementation would track first/second half separately
      this.metrics.decouplingEst = roundToPrecision(0, "decoupling"); // Placeholder
    }
  }

  private updatePowerHeartRateRatio(): void {
    if (this.metrics.avgHeartRate > 0 && this.metrics.avgPower > 0) {
      this.metrics.powerHeartRateRatio = roundToPrecision(
        this.metrics.avgPower / this.metrics.avgHeartRate,
        "efficiency",
      );
    }
  }

  // === Batch Processing ===
  private queueSensorForWrite(reading: SensorReading): void {
    this.batchBuffer.readings.push(reading);

    if (
      this.batchBuffer.readings.length >=
      this.config.PERFORMANCE.BATCH_SIZE_DB_WRITE
    ) {
      this.createBatch();
    }
  }

  private queueLocationForWrite(location: LocationData): void {
    this.batchBuffer.locations.push(location);

    if (
      this.batchBuffer.locations.length >=
      this.config.PERFORMANCE.BATCH_SIZE_DB_WRITE
    ) {
      this.createBatch();
    }
  }

  private createBatch(): void {
    if (
      this.batchBuffer.readings.length === 0 &&
      this.batchBuffer.locations.length === 0
    ) {
      return;
    }

    const batch: BatchWriteData = {
      readings: [...this.batchBuffer.readings],
      locations: [...this.batchBuffer.locations],
      timestamp: Date.now(),
    };

    this.pendingWrites.push(batch);

    // Clear buffer
    this.batchBuffer.readings = [];
    this.batchBuffer.locations = [];
  }

  private flushPendingWrites(): void {
    if (this.pendingWrites.length === 0) {
      this.createBatch(); // Flush remaining buffer
      if (this.pendingWrites.length === 0) return;
    }

    const batches = [...this.pendingWrites];
    this.pendingWrites = [];

    // Emit event for external handling (database writes)
    this.emit(EVENT_TYPES.BATCH_WRITE_COMPLETE, {
      batches,
      totalReadings: batches.reduce((sum, b) => sum + b.readings.length, 0),
      totalLocations: batches.reduce((sum, b) => sum + b.locations.length, 0),
    });
  }

  // === Utility Methods ===
  private performCleanup(): void {
    try {
      // Check memory usage
      const memoryUsage = this.getMemoryUsage();
      this.performanceMonitor.recordMemoryUsage(memoryUsage);

      // Clean up old errors
      if (this.errors.length > 100) {
        this.errors = this.errors.slice(-50); // Keep last 50 errors
      }

      // Emit memory warning if needed
      if (
        memoryUsage >
        this.config.MEMORY.MAX_DURATION_MS *
          this.config.MEMORY.LOW_MEMORY_THRESHOLD
      ) {
        this.emit(EVENT_TYPES.MEMORY_WARNING, {
          currentUsage: memoryUsage,
          threshold:
            this.config.MEMORY.MAX_DURATION_MS *
            this.config.MEMORY.LOW_MEMORY_THRESHOLD,
        });
      }

      console.log(
        "Memory cleanup completed. Usage:",
        Math.round(memoryUsage / 1024 / 1024),
        "MB",
      );
    } catch (error) {
      this.handleError("memory_limit", error as Error);
    }
  }

  private resetTrackingState(): void {
    // Clear all buffers
    Object.values(this.buffers).forEach((buffer) => buffer.clear());

    // Reset averages
    Object.values(this.averages).forEach((avg) => avg.reset());

    // Reset zone trackers
    Object.values(this.zoneTrackers).forEach((tracker) => tracker.reset());

    // Reset calculators
    this.distanceCalculator.reset();
    this.elevationTracker.reset();
    this.performanceMonitor.reset();

    // Clear tracking state
    this.currentInstantaneousValues.clear();
    this.lastTimestamp = undefined;
    this.pauseStartTime = undefined;
    this.totalPauseTime = 0;
    this.metricsDirty = false;
    this.lastUIUpdate = 0;
    this.consecutiveErrors = 0;

    // Clear batch processing
    this.pendingWrites = [];
    this.batchBuffer = { readings: [], locations: [] };
  }

  private handleError(
    type: LiveMetricsError["type"],
    error: Error,
    metric?: string,
  ): void {
    const errorObj: LiveMetricsError = {
      type,
      message: error.message,
      timestamp: Date.now(),
      metric,
      severity:
        this.consecutiveErrors > 5
          ? "critical"
          : this.consecutiveErrors > 2
            ? "high"
            : this.consecutiveErrors > 0
              ? "medium"
              : "low",
    };

    this.errors.push(errorObj);
    this.consecutiveErrors++;

    console.error(
      `LiveMetrics Error [${type}]:`,
      error.message,
      metric ? `(${metric})` : "",
    );

    // Emit error event
    this.emit("error", errorObj);

    // If too many consecutive errors, pause recording
    if (this.consecutiveErrors > 10) {
      console.error("Too many consecutive errors, pausing metrics calculation");
      this.state = "error";
    }
  }

  private emitMetricsUpdate(): void {
    const updateEvent: MetricsUpdateEvent = {
      metrics: { ...this.metrics },
      timestamp: Date.now(),
      changedMetrics: [], // Could track which metrics changed for optimization
    };

    this.emit(EVENT_TYPES.METRICS_UPDATE, updateEvent);
  }

  private generateSummary() {
    return {
      primary: {
        elapsedTime: this.metrics.elapsedTime,
        distance: this.metrics.distance,
        avgPower: this.metrics.avgPower,
        avgHeartRate: this.metrics.avgHeartRate,
      },
      secondary: {
        calories: Math.round(this.metrics.calories),
        avgSpeed: this.metrics.avgSpeed,
        maxPower: this.metrics.maxPower,
        maxHeartRate: this.metrics.maxHeartRate,
      },
      analysis: {
        tss: Math.round(this.metrics.trainingStressScoreEst),
        intensityFactor: this.metrics.intensityFactorEst,
        normalizedPower: Math.round(this.metrics.normalizedPowerEst),
        adherence: this.metrics.adherenceCurrentStep,
      },
    };
  }

  // === Public Getters ===
  public getMetrics(): LiveMetricsState {
    return { ...this.metrics };
  }

  public getMetric(key: keyof LiveMetricsState): number | undefined {
    return this.metrics[key] as number | undefined;
  }

  public getInstantaneousValue(metric: string): number | undefined {
    return this.currentInstantaneousValues.get(metric);
  }

  public getState(): LiveMetricsState_Recording {
    return this.state;
  }

  public getProfile(): ProfileMetrics {
    return { ...this.profile };
  }

  public getZones(): ZoneConfig {
    return {
      hrZones: [...this.zones.hrZones],
      powerZones: [...this.zones.powerZones],
    };
  }

  public getPerformanceStats(): PerformanceStats {
    const stats = this.performanceMonitor.getStats();
    return {
      uiUpdateRate: stats.updateRate,
      calculationTime: stats.avgCalculationTime,
      memoryUsage: stats.avgMemoryUsage,
      bufferUtilization: {
        power: this.buffers.power.size() / this.config.BUFFERS.POWER_SIZE,
        heartRate:
          this.buffers.heartRate.size() / this.config.BUFFERS.HEART_RATE_SIZE,
        cadence: this.buffers.cadence.size() / this.config.BUFFERS.CADENCE_SIZE,
        temperature:
          this.buffers.temperature.size() /
          this.config.BUFFERS.TEMPERATURE_SIZE,
        normalizedPower:
          this.buffers.normalizedPower.size() /
          this.config.BUFFERS.NP_CALCULATION_SIZE,
      },
    };
  }

  public getBufferStatus() {
    return {
      power: {
        size: this.buffers.power.size(),
        capacity: this.config.BUFFERS.POWER_SIZE,
        utilization: this.buffers.power.size() / this.config.BUFFERS.POWER_SIZE,
        hasData: !this.buffers.power.isEmpty(),
      },
      heartRate: {
        size: this.buffers.heartRate.size(),
        capacity: this.config.BUFFERS.HEART_RATE_SIZE,
        utilization:
          this.buffers.heartRate.size() / this.config.BUFFERS.HEART_RATE_SIZE,
        hasData: !this.buffers.heartRate.isEmpty(),
      },
      pendingWrites: this.pendingWrites.length,
      batchBufferSize:
        this.batchBuffer.readings.length + this.batchBuffer.locations.length,
    };
  }

  public getErrors(): LiveMetricsError[] {
    return [...this.errors];
  }

  public getMemoryUsage(): number {
    let total = 0;

    // Buffer memory
    Object.values(this.buffers).forEach((buffer) => {
      total += buffer.getMemoryUsage();
    });

    // Batch buffer memory (rough estimate)
    total += this.batchBuffer.readings.length * 64; // ~64 bytes per reading
    total += this.batchBuffer.locations.length * 80; // ~80 bytes per location
    total += this.pendingWrites.length * 1024; // ~1KB per batch

    // Error history
    total += this.errors.length * 200; // ~200 bytes per error

    return total;
  }

  // === Cleanup ===
  public async cleanup(): Promise<void> {
    console.log("LiveMetricsManager cleanup starting...");

    try {
      // Stop all timers
      this.stopTimers();

      // Flush any remaining data
      this.createBatch();
      if (this.pendingWrites.length > 0) {
        this.flushPendingWrites();
        // Give a moment for final writes
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Reset all state
      this.resetTrackingState();
      this.state = "inactive";

      // Remove all listeners
      this.removeAllListeners();

      console.log("LiveMetricsManager cleanup completed");
    } catch (error) {
      console.error("Error during LiveMetricsManager cleanup:", error);
    }
  }

  // === Plan Integration (Placeholder for future implementation) ===
  public updatePlanAdherence(planTarget: number, currentValue: number): void {
    // Simplified adherence calculation
    if (planTarget > 0) {
      const diff = Math.abs(currentValue - planTarget) / planTarget;
      const adherence = Math.max(0, 1 - diff);
      this.metrics.adherenceCurrentStep = roundToPrecision(
        adherence,
        "adherence",
      );
    }
  }

  // === Debug Methods ===
  public getDebugInfo() {
    return {
      state: this.state,
      timers: {
        ui: !!this.uiUpdateTimer,
        db: !!this.dbBatchTimer,
        cleanup: !!this.cleanupTimer,
      },
      buffers: Object.fromEntries(
        Object.entries(this.buffers).map(([key, buffer]) => [
          key,
          {
            size: buffer.size(),
            hasNewData: buffer.hasNewData(),
            latest: buffer.latest(),
          },
        ]),
      ),
      averages: Object.fromEntries(
        Object.entries(this.averages).map(([key, avg]) => [
          key,
          {
            hasData: avg.hasData(),
            count: avg.getCount(),
            average: avg.average(),
          },
        ]),
      ),
      zones: this.zones,
      errors: this.errors.length,
      consecutiveErrors: this.consecutiveErrors,
      memoryUsage: this.getMemoryUsage(),
      performance: this.getPerformanceStats(),
    };
  }
}
