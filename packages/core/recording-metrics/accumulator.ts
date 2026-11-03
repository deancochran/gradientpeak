import {
  type AerobicAnalysisAccumulator,
  type AerobicAnalysisInput,
  createAerobicAnalysisAccumulator,
} from "../calculations/efficiency";
import {
  createRunningGradeAdjustedSpeedProjector,
  createRunningNormalizedGradedPaceAccumulator,
  type RunningGradeAdjustedSpeedProjector,
  type RunningNormalizedGradedPaceAccumulator,
  selectRunningNormalizedGradedSpeedMetersPerSecond,
} from "../calculations/normalized-graded-pace";
import {
  type CyclingNormalizedPowerAccumulator,
  createCyclingNormalizedPowerAccumulator,
  selectCyclingNormalizedPowerWatts,
} from "../calculations/normalized-power";
import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
} from "../performance-model";
import {
  calculateHeartRateZoneDuration,
  createHeartRateDurationAccumulator,
  type HeartRateDurationAccumulator,
} from "../zones/heart-rate-duration";
import {
  type ProvisionalRecordingMetricsSnapshot,
  provisionalRecordingMetricsSnapshotSchema,
  type RecordingMetricsActivityCategory,
} from "./contracts";
import {
  calculateProvisionalCommonLoad,
  type ProvisionalCommonLoadMethod,
} from "./provisional-common-load";

export interface RecordingMetricSample {
  timestampMs: number;
  moving?: boolean;
  powerWatts?: number | null;
  heartRateBpm?: number | null;
  cadenceRpm?: number | null;
  speedMps?: number | null;
  distanceMeters?: number | null;
  altitudeMeters?: number | null;
}

export interface RecordingMetricsConfig {
  activityCategory?: RecordingMetricsActivityCategory;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  recordingSessionId?: string | null;
  preferredCommonLoadMethods?: readonly ProvisionalCommonLoadMethod[];
  timeBasis?: "moving" | "elapsed";
  normalizedWindowSeconds?: number;
  maxGapSeconds?: number;
}

export interface ProvisionalRecordingMetricsAccumulator {
  addSample(sample: RecordingMetricSample): void;
  getSnapshot(): ProvisionalRecordingMetricsSnapshot;
  restoreObservations(input: {
    elapsedSeconds: number;
    movingSeconds: number;
    distanceMeters: number;
    observedAtMs: number;
  }): void;
  reset(): void;
}

interface ResolvedRecordingMetricsConfig {
  activityCategory: RecordingMetricsActivityCategory;
  performanceTargets: AthletePerformanceTargetFacts | null;
  recordingSessionId: string | null;
  preferredCommonLoadMethods?: readonly ProvisionalCommonLoadMethod[];
  timeBasis: "moving" | "elapsed";
  normalizedWindowSeconds: number;
  maxGapSeconds: number;
}

interface MetricsState {
  previousSample: RecordingMetricSample | null;
  previousAcceptedTimestampMs: number | null;
  latestAcceptedTimestampMs: number | null;
  sampleCount: number;
  elapsedSeconds: number;
  movingSeconds: number;

  latestDistanceMeters: number | null;
  distanceSourceIncomplete: boolean;

  powerSampleCount: number;
  powerSeconds: number;
  powerWeightedSum: number;
  normalizedPower: CyclingNormalizedPowerAccumulator;
  workJoules: number;

  heartRateDuration: HeartRateDurationAccumulator;

  normalizedGradedPace: RunningNormalizedGradedPaceAccumulator;
  runningAerobicOutput: RunningGradeAdjustedSpeedProjector;
  aerobicAnalysis: AerobicAnalysisAccumulator;

  swimDistanceSeconds: number;
  swimDistanceMeters: number;
}

const DEFAULT_MAX_GAP_SECONDS = 5;
const DEFAULT_NORMALIZED_WINDOW_SECONDS = 30;
const FALLBACK_COMPUTED_AS_OF = "1970-01-01T00:00:00.000Z";
const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000;

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidTimestamp(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_DATE_TIMESTAMP_MS;
}

function resolveConfig(config: RecordingMetricsConfig = {}): ResolvedRecordingMetricsConfig {
  const recordingSessionId = config.recordingSessionId?.trim() || null;
  return {
    activityCategory: config.activityCategory ?? "other",
    performanceTargets:
      config.performanceTargets == null
        ? null
        : athletePerformanceTargetFactsSchema.parse(config.performanceTargets),
    recordingSessionId,
    ...(config.preferredCommonLoadMethods === undefined
      ? {}
      : { preferredCommonLoadMethods: [...config.preferredCommonLoadMethods] }),
    timeBasis: config.timeBasis ?? "moving",
    normalizedWindowSeconds: isFinitePositive(config.normalizedWindowSeconds)
      ? config.normalizedWindowSeconds
      : DEFAULT_NORMALIZED_WINDOW_SECONDS,
    maxGapSeconds: isFinitePositive(config.maxGapSeconds)
      ? config.maxGapSeconds
      : DEFAULT_MAX_GAP_SECONDS,
  };
}

function getTimeBasisSeconds(config: ResolvedRecordingMetricsConfig, state: MetricsState): number {
  return config.timeBasis === "elapsed" ? state.elapsedSeconds : state.movingSeconds;
}

function aerobicIdentityForActivityCategory(
  activityCategory: RecordingMetricsActivityCategory,
): Pick<AerobicAnalysisInput, "modality" | "outputUnit"> {
  if (activityCategory === "bike") return { modality: "cycling", outputUnit: "watts" };
  if (activityCategory === "run") {
    return { modality: "running", outputUnit: "meters_per_second" };
  }
  return { modality: "unsupported", outputUnit: "unsupported" };
}

function createInitialState(config: ResolvedRecordingMetricsConfig): MetricsState {
  return {
    previousSample: null,
    previousAcceptedTimestampMs: null,
    latestAcceptedTimestampMs: null,
    sampleCount: 0,
    elapsedSeconds: 0,
    movingSeconds: 0,
    latestDistanceMeters: null,
    distanceSourceIncomplete: false,
    powerSampleCount: 0,
    powerSeconds: 0,
    powerWeightedSum: 0,
    normalizedPower: createCyclingNormalizedPowerAccumulator({
      windowSeconds: config.normalizedWindowSeconds,
      maxGapSeconds: config.maxGapSeconds,
    }),
    workJoules: 0,
    heartRateDuration: createHeartRateDurationAccumulator({ maxGapSeconds: config.maxGapSeconds }),
    normalizedGradedPace: createRunningNormalizedGradedPaceAccumulator({
      windowSeconds: config.normalizedWindowSeconds,
      maxGapSeconds: config.maxGapSeconds,
    }),
    runningAerobicOutput: createRunningGradeAdjustedSpeedProjector(),
    aerobicAnalysis: createAerobicAnalysisAccumulator(
      aerobicIdentityForActivityCategory(config.activityCategory),
    ),
    swimDistanceSeconds: 0,
    swimDistanceMeters: 0,
  };
}

class DefaultProvisionalRecordingMetricsAccumulator
  implements ProvisionalRecordingMetricsAccumulator
{
  private readonly config: ResolvedRecordingMetricsConfig;
  private state: MetricsState;

  constructor(config?: RecordingMetricsConfig) {
    this.config = resolveConfig(config);
    this.state = createInitialState(this.config);
  }

  addSample(sample: RecordingMetricSample): void {
    if (!isValidTimestamp(sample.timestampMs)) return;
    const isMoving = sample.moving !== false;
    const contributesToLoad = this.config.timeBasis === "elapsed" || isMoving;
    const timestampSeconds = sample.timestampMs / 1_000;
    const heartRateBpm = finiteOrNull(sample.heartRateBpm);
    this.state.heartRateDuration.addSample({
      timestampSeconds,
      heartRateBpm,
      included: contributesToLoad,
    });
    const powerWatts = finiteOrNull(sample.powerWatts);
    const normalizedPowerValue = powerWatts !== null && powerWatts >= 0 ? powerWatts : null;
    this.state.normalizedPower.addSample({
      timestampSeconds,
      powerWatts: normalizedPowerValue,
      included: contributesToLoad,
    });
    let aerobicOutput: number | null =
      this.config.activityCategory === "bike" ? normalizedPowerValue : null;
    if (this.config.activityCategory === "run") {
      const runningSample = {
        timestampSeconds,
        speedMetersPerSecond: this.resolveAlignedRunSpeed(sample),
        elevationMeters: finiteOrNull(sample.altitudeMeters),
        included: contributesToLoad,
      };
      this.state.normalizedGradedPace.addSample(runningSample);
      aerobicOutput = this.state.runningAerobicOutput.project(runningSample).value;
    }
    this.state.aerobicAnalysis.addSample({
      timestampSeconds,
      output: aerobicOutput,
      heartRateBpm,
      included: contributesToLoad,
    });
    if (
      this.state.previousAcceptedTimestampMs !== null &&
      sample.timestampMs <= this.state.previousAcceptedTimestampMs
    ) {
      return;
    }

    const previousSample = this.state.previousSample;
    const previousTimestampMs = this.state.previousAcceptedTimestampMs;
    this.state.previousSample = sample;
    this.state.previousAcceptedTimestampMs = sample.timestampMs;
    this.state.latestAcceptedTimestampMs = sample.timestampMs;
    this.state.sampleCount += 1;
    this.addDistanceObservation(sample.distanceMeters);

    if (previousSample === null || previousTimestampMs === null) return;
    const rawDtSeconds = (sample.timestampMs - previousTimestampMs) / 1000;
    if (!Number.isFinite(rawDtSeconds) || rawDtSeconds <= 0) return;

    const metricSeconds = rawDtSeconds <= this.config.maxGapSeconds ? rawDtSeconds : 0;

    this.state.elapsedSeconds += rawDtSeconds;
    if (isMoving) this.state.movingSeconds += rawDtSeconds;
    if (!contributesToLoad || metricSeconds <= 0) return;

    this.addPower(sample, metricSeconds);
    this.addSwimDistance(previousSample, sample, metricSeconds);
  }

  getSnapshot(): ProvisionalRecordingMetricsSnapshot {
    const averagePowerWatts =
      this.state.powerSeconds > 0 ? this.state.powerWeightedSum / this.state.powerSeconds : null;
    const normalizedPowerResult = this.state.normalizedPower.getResult();
    const normalizedPowerWatts = selectCyclingNormalizedPowerWatts(normalizedPowerResult);
    const normalizedGradedPaceResult =
      this.config.activityCategory === "run" ? this.state.normalizedGradedPace.getResult() : null;
    const normalizedGradedSpeedMetersPerSecond =
      normalizedGradedPaceResult === null
        ? null
        : selectRunningNormalizedGradedSpeedMetersPerSecond(normalizedGradedPaceResult);
    const variabilityIndex =
      normalizedPowerWatts !== null && averagePowerWatts !== null && averagePowerWatts > 0
        ? normalizedPowerWatts / averagePowerWatts
        : null;
    const heartRateEvidence = this.state.heartRateDuration.getResult();
    const averageHeartRateBpm = heartRateEvidence.timeWeightedAverageBpm;
    const { efficiencyFactorResult, aerobicDecouplingResult } =
      this.state.aerobicAnalysis.getResult();
    const computedAsOf =
      this.state.latestAcceptedTimestampMs === null
        ? (this.config.performanceTargets?.asOf ?? FALLBACK_COMPUTED_AS_OF)
        : new Date(this.state.latestAcceptedTimestampMs).toISOString();
    const eligibleDurationSeconds = getTimeBasisSeconds(this.config, this.state);
    const commonLoad = calculateProvisionalCommonLoad({
      activityCategory: this.config.activityCategory,
      performanceTargets: this.config.performanceTargets,
      computedAsOf,
      eligibleDurationSeconds,
      recordingSessionId: this.config.recordingSessionId,
      ...(this.config.preferredCommonLoadMethods === undefined
        ? {}
        : { preferredMethods: this.config.preferredCommonLoadMethods }),
      power: {
        normalizedWatts: normalizedPowerWatts,
        contributingDurationSeconds: this.state.powerSeconds,
      },
      heartRate: {
        evidence: heartRateEvidence,
      },
      run: {
        normalizedGradeAdjustedSpeedMps: normalizedGradedSpeedMetersPerSecond,
        contributingDurationSeconds:
          normalizedGradedPaceResult?.diagnostics.contributingDurationSeconds ?? 0,
      },
      swim: {
        distanceMeters: this.state.swimDistanceMeters,
        contributingDurationSeconds: this.state.swimDistanceSeconds,
      },
    });

    return provisionalRecordingMetricsSnapshotSchema.parse({
      schemaVersion: 1,
      stage: "provisional",
      authority: "live_recording_only",
      activity_category: this.config.activityCategory,
      observations: {
        duration: {
          provenance: {
            stage: "provisional",
            evidenceRole: "measured",
            source: "recording_sample_timestamps",
          },
          value: this.durationObservation(),
        },
        distance: {
          provenance: {
            stage: "provisional",
            evidenceRole: "measured",
            source: "recording_distance_accumulator",
          },
          value: this.distanceObservation(),
        },
      },
      commonLoad,
      averagePowerWatts,
      normalizedPowerResult,
      normalizedGradedPaceResult,
      variabilityIndex,
      workKilojoules: this.state.powerSeconds > 0 ? this.state.workJoules / 1000 : null,
      averageHeartRateBpm,
      heartRateEvidence,
      heartRateZoneDuration: calculateHeartRateZoneDuration({
        evidence: heartRateEvidence,
        lthrBpm: this.resolveEligibleLthr(),
      }),
      efficiencyFactorResult,
      aerobicDecouplingResult,
      sampleCount: this.state.sampleCount,
      powerSampleCount: this.state.powerSampleCount,
      heartRateSampleCount: heartRateEvidence.diagnostics.contributingIntervalCount,
    });
  }

  restoreObservations(input: {
    elapsedSeconds: number;
    movingSeconds: number;
    distanceMeters: number;
    observedAtMs: number;
  }): void {
    if (this.state.sampleCount !== 0) {
      throw new Error("Provisional recording observations can only be restored into empty state");
    }
    if (
      !Number.isFinite(input.elapsedSeconds) ||
      input.elapsedSeconds < 0 ||
      !Number.isFinite(input.movingSeconds) ||
      input.movingSeconds < 0 ||
      input.movingSeconds > input.elapsedSeconds ||
      !Number.isFinite(input.distanceMeters) ||
      input.distanceMeters < 0 ||
      !isValidTimestamp(input.observedAtMs)
    ) {
      throw new Error("Recovered provisional recording observations are invalid");
    }
    const sample = {
      timestampMs: input.observedAtMs,
      moving: false,
      distanceMeters: input.distanceMeters,
    };
    this.state.previousSample = sample;
    this.state.previousAcceptedTimestampMs = input.observedAtMs;
    this.state.latestAcceptedTimestampMs = input.observedAtMs;
    this.state.sampleCount = 1;
    this.state.elapsedSeconds = input.elapsedSeconds;
    this.state.movingSeconds = input.movingSeconds;
    this.state.latestDistanceMeters = input.distanceMeters;
  }

  reset(): void {
    this.state = createInitialState(this.config);
  }

  private durationObservation() {
    if (this.state.sampleCount === 0) {
      const unavailable = {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        unit: "seconds",
        reason: "not_observed",
      };
      return { elapsed: unavailable, active: unavailable, moving: unavailable };
    }
    return {
      elapsed: {
        status: "available",
        evidenceRole: "measured",
        value: this.state.elapsedSeconds,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: "measured",
        value: this.state.movingSeconds,
        unit: "seconds",
      },
      moving: {
        status: "available",
        evidenceRole: "measured",
        value: this.state.movingSeconds,
        unit: "seconds",
      },
    };
  }

  private distanceObservation() {
    if (this.state.latestDistanceMeters === null) {
      return {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        unit: "meters",
        reason: this.state.distanceSourceIncomplete ? "invalid_data" : "not_observed",
      };
    }
    return this.state.distanceSourceIncomplete
      ? {
          status: "partial",
          evidenceRole: "measured",
          value: this.state.latestDistanceMeters,
          unit: "meters",
          reason: "source_incomplete",
        }
      : {
          status: "available",
          evidenceRole: "measured",
          value: this.state.latestDistanceMeters,
          unit: "meters",
        };
  }

  private addDistanceObservation(distanceMeters: number | null | undefined): void {
    if (distanceMeters === undefined || distanceMeters === null) return;
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
      this.state.distanceSourceIncomplete = true;
      return;
    }
    if (
      this.state.latestDistanceMeters !== null &&
      distanceMeters < this.state.latestDistanceMeters
    ) {
      this.state.distanceSourceIncomplete = true;
      return;
    }
    this.state.latestDistanceMeters = distanceMeters;
  }

  private addPower(sample: RecordingMetricSample, seconds: number): void {
    const powerWatts = finiteOrNull(sample.powerWatts);
    if (powerWatts === null || powerWatts < 0 || seconds <= 0) return;
    this.state.powerSampleCount += 1;
    this.state.powerSeconds += seconds;
    this.state.powerWeightedSum += powerWatts * seconds;
    this.state.workJoules += powerWatts * seconds;
  }

  private resolveAlignedRunSpeed(sample: RecordingMetricSample): number | null {
    const explicitSpeed = finiteOrNull(sample.speedMps);
    if (explicitSpeed !== null) return explicitSpeed >= 0 ? explicitSpeed : null;

    const previousSample = this.state.previousSample;
    const previousTimestampMs = this.state.previousAcceptedTimestampMs;
    if (previousSample === null || previousTimestampMs === null) return null;
    const seconds = (sample.timestampMs - previousTimestampMs) / 1000;
    const currentDistance = finiteOrNull(sample.distanceMeters);
    const previousDistance = finiteOrNull(previousSample.distanceMeters);
    if (
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      currentDistance === null ||
      previousDistance === null
    ) {
      return null;
    }
    const distanceDelta = currentDistance - previousDistance;
    return Number.isFinite(distanceDelta) && distanceDelta >= 0 ? distanceDelta / seconds : null;
  }

  private addSwimDistance(
    previousSample: RecordingMetricSample,
    sample: RecordingMetricSample,
    seconds: number,
  ): void {
    if (this.config.activityCategory !== "swim" || seconds <= 0) return;
    const currentDistance = finiteOrNull(sample.distanceMeters);
    const previousDistance = finiteOrNull(previousSample.distanceMeters);
    if (currentDistance === null || previousDistance === null) return;
    const distanceDelta = currentDistance - previousDistance;
    if (!Number.isFinite(distanceDelta) || distanceDelta <= 0) return;
    this.state.swimDistanceSeconds += seconds;
    this.state.swimDistanceMeters += distanceDelta;
  }

  private resolveEligibleLthr(): number | null {
    const performanceTargets = this.config.performanceTargets;
    if (performanceTargets === null) return null;
    const fact =
      this.config.activityCategory === "bike"
        ? performanceTargets.heartRate.bike.lthr
        : this.config.activityCategory === "run"
          ? performanceTargets.heartRate.run.lthr
          : this.config.activityCategory === "swim"
            ? performanceTargets.heartRate.swim.lthr
            : null;
    return fact?.status === "available" ? fact.valueBpm : null;
  }
}

export function createProvisionalRecordingMetricsAccumulator(
  config?: RecordingMetricsConfig,
): ProvisionalRecordingMetricsAccumulator {
  return new DefaultProvisionalRecordingMetricsAccumulator(config);
}

export function calculateProvisionalRecordingMetrics(input: {
  config?: RecordingMetricsConfig;
  samples: readonly RecordingMetricSample[];
}): ProvisionalRecordingMetricsSnapshot {
  const accumulator = createProvisionalRecordingMetricsAccumulator(input.config);
  for (const sample of input.samples) accumulator.addSample(sample);
  return accumulator.getSnapshot();
}
