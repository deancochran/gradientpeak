export type ActivityCategory = "run" | "bike" | "swim" | "strength" | "other";

export type TrainingStressScoreMethod =
  | "power"
  | "heart_rate"
  | "run_grade_adjusted_pace"
  | "swim_critical_speed";

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
  activityCategory?: ActivityCategory;
  ftpWatts?: number | null;
  thresholdHeartRateBpm?: number | null;
  restingHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  heartRateTrimpExponentCoefficient?: number | null;
  thresholdPaceSecondsPerKm?: number | null;
  thresholdSwimPaceSecondsPer100m?: number | null;
  preferredTrainingStressScoreMethods?: TrainingStressScoreMethod[];
  timeBasis?: "moving" | "elapsed";
  npWindowSeconds?: number;
  maxGapSeconds?: number;
}

export interface RecordingMetricsSnapshot {
  elapsedSeconds: number;
  movingSeconds: number;

  averagePowerWatts: number | null;
  normalizedPowerWatts: number | null;
  intensityFactor: number | null;
  powerTrainingStressScore: number | null;
  variabilityIndex: number | null;
  workKilojoules: number | null;

  averageHeartRateBpm: number | null;
  efficiencyFactor: number | null;
  heartRateTrainingStressScore: number | null;

  runGradeAdjustedPaceTrainingStressScore: number | null;
  swimCriticalSpeedTrainingStressScore: number | null;

  trainingStressScore: number | null;
  trainingStressScoreMethod: TrainingStressScoreMethod | null;

  sampleCount: number;
  powerSampleCount: number;
  heartRateSampleCount: number;
}

export interface RecordingMetricsAccumulator {
  addSample(sample: RecordingMetricSample): void;
  getSnapshot(): RecordingMetricsSnapshot;
  reset(): void;
}

interface ResolvedRecordingMetricsConfig {
  activityCategory: ActivityCategory;
  ftpWatts: number | null;
  thresholdHeartRateBpm: number | null;
  restingHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  heartRateTrimpExponentCoefficient: number;
  thresholdPaceSecondsPerKm: number | null;
  thresholdSwimPaceSecondsPer100m: number | null;
  preferredTrainingStressScoreMethods: TrainingStressScoreMethod[];
  hasExplicitPreferredMethods: boolean;
  timeBasis: "moving" | "elapsed";
  npWindowSeconds: number;
  maxGapSeconds: number;
}

interface TimedValue {
  value: number;
  seconds: number;
}

interface RollingFourthRootState {
  queue: TimedValue[];
  queueSeconds: number;
  queueWeightedSum: number;
  fourthPowerSum: number;
  fourthPowerSeconds: number;
}

const DEFAULT_METHOD_PRIORITY: Record<ActivityCategory, TrainingStressScoreMethod[]> = {
  bike: ["power", "heart_rate"],
  run: ["power", "run_grade_adjusted_pace", "heart_rate"],
  swim: ["swim_critical_speed", "heart_rate"],
  strength: ["heart_rate"],
  other: ["power", "heart_rate"],
};

const DEFAULT_MAX_GAP_SECONDS = 5;
const DEFAULT_NP_WINDOW_SECONDS = 30;
const DEFAULT_TRIMP_EXPONENT_COEFFICIENT = 1.92;
const PRIMARY_COVERAGE_THRESHOLD = 0.8;

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveConfig(config: RecordingMetricsConfig = {}): ResolvedRecordingMetricsConfig {
  const activityCategory = config.activityCategory ?? "other";
  const preferredTrainingStressScoreMethods =
    config.preferredTrainingStressScoreMethods ?? DEFAULT_METHOD_PRIORITY[activityCategory];

  return {
    activityCategory,
    ftpWatts: isFinitePositive(config.ftpWatts) ? config.ftpWatts : null,
    thresholdHeartRateBpm: isFinitePositive(config.thresholdHeartRateBpm)
      ? config.thresholdHeartRateBpm
      : null,
    restingHeartRateBpm: isFinitePositive(config.restingHeartRateBpm)
      ? config.restingHeartRateBpm
      : null,
    maxHeartRateBpm: isFinitePositive(config.maxHeartRateBpm) ? config.maxHeartRateBpm : null,
    heartRateTrimpExponentCoefficient: isFinitePositive(config.heartRateTrimpExponentCoefficient)
      ? config.heartRateTrimpExponentCoefficient
      : DEFAULT_TRIMP_EXPONENT_COEFFICIENT,
    thresholdPaceSecondsPerKm: isFinitePositive(config.thresholdPaceSecondsPerKm)
      ? config.thresholdPaceSecondsPerKm
      : null,
    thresholdSwimPaceSecondsPer100m: isFinitePositive(config.thresholdSwimPaceSecondsPer100m)
      ? config.thresholdSwimPaceSecondsPer100m
      : null,
    preferredTrainingStressScoreMethods,
    hasExplicitPreferredMethods: config.preferredTrainingStressScoreMethods !== undefined,
    timeBasis: config.timeBasis ?? "moving",
    npWindowSeconds: isFinitePositive(config.npWindowSeconds)
      ? config.npWindowSeconds
      : DEFAULT_NP_WINDOW_SECONDS,
    maxGapSeconds: isFinitePositive(config.maxGapSeconds)
      ? config.maxGapSeconds
      : DEFAULT_MAX_GAP_SECONDS,
  };
}

function getTimeBasisSeconds(config: ResolvedRecordingMetricsConfig, state: MetricsState): number {
  return config.timeBasis === "elapsed" ? state.elapsedSeconds : state.movingSeconds;
}

function getCoverageDenominator(
  config: ResolvedRecordingMetricsConfig,
  state: MetricsState,
): number {
  return getTimeBasisSeconds(config, state);
}

function hasCoverage(seconds: number, denominatorSeconds: number): boolean {
  if (denominatorSeconds <= 0) return false;
  return seconds / denominatorSeconds >= PRIMARY_COVERAGE_THRESHOLD;
}

function createRollingFourthRootState(): RollingFourthRootState {
  return {
    queue: [],
    queueSeconds: 0,
    queueWeightedSum: 0,
    fourthPowerSum: 0,
    fourthPowerSeconds: 0,
  };
}

function addRollingFourthRootValue(
  state: RollingFourthRootState,
  value: TimedValue,
  windowSeconds: number,
): void {
  if (windowSeconds <= 0) return;

  let remainingSeconds = value.seconds;

  while (remainingSeconds > 0) {
    const neededSeconds = windowSeconds - state.queueSeconds;
    const sliceSeconds = Math.min(remainingSeconds, neededSeconds);

    if (sliceSeconds <= 0) break;

    state.queue.push({ value: value.value, seconds: sliceSeconds });
    state.queueSeconds += sliceSeconds;
    state.queueWeightedSum += value.value * sliceSeconds;
    remainingSeconds -= sliceSeconds;

    if (state.queueSeconds >= windowSeconds) {
      const rollingAverage = state.queueWeightedSum / windowSeconds;
      state.fourthPowerSum += rollingAverage ** 4 * sliceSeconds;
      state.fourthPowerSeconds += sliceSeconds;

      let secondsToRemove = sliceSeconds;
      while (secondsToRemove > 0 && state.queue.length > 0) {
        const first = state.queue[0];
        if (!first) break;

        const removedSeconds = Math.min(secondsToRemove, first.seconds);
        first.seconds -= removedSeconds;
        state.queueSeconds -= removedSeconds;
        state.queueWeightedSum -= first.value * removedSeconds;
        secondsToRemove -= removedSeconds;

        if (first.seconds <= 0) state.queue.shift();
      }
    }
  }
}

function getRollingFourthRootResult(state: RollingFourthRootState): number | null {
  if (state.fourthPowerSeconds <= 0) return null;
  return (state.fourthPowerSum / state.fourthPowerSeconds) ** 0.25;
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

function isMethodEligibleForActivity(
  activityCategory: ActivityCategory,
  method: TrainingStressScoreMethod,
): boolean {
  return DEFAULT_METHOD_PRIORITY[activityCategory].includes(method);
}

interface MetricsState {
  previousSample: RecordingMetricSample | null;
  previousAcceptedTimestampMs: number | null;
  sampleCount: number;
  elapsedSeconds: number;
  movingSeconds: number;

  powerSampleCount: number;
  powerSeconds: number;
  powerWeightedSum: number;
  powerRolling: RollingFourthRootState;
  workJoules: number;

  heartRateSampleCount: number;
  heartRateSeconds: number;
  heartRateWeightedSum: number;
  observedTrimp: number;

  gapSeconds: number;
  gapRolling: RollingFourthRootState;

  swimDistanceSeconds: number;
  swimDistanceMeters: number;
}

function createInitialState(): MetricsState {
  return {
    previousSample: null,
    previousAcceptedTimestampMs: null,
    sampleCount: 0,
    elapsedSeconds: 0,
    movingSeconds: 0,
    powerSampleCount: 0,
    powerSeconds: 0,
    powerWeightedSum: 0,
    powerRolling: createRollingFourthRootState(),
    workJoules: 0,
    heartRateSampleCount: 0,
    heartRateSeconds: 0,
    heartRateWeightedSum: 0,
    observedTrimp: 0,
    gapSeconds: 0,
    gapRolling: createRollingFourthRootState(),
    swimDistanceSeconds: 0,
    swimDistanceMeters: 0,
  };
}

function calculateTrimpPerMinute(
  heartRateBpm: number,
  config: ResolvedRecordingMetricsConfig,
): number | null {
  const { restingHeartRateBpm, maxHeartRateBpm } = config;
  if (!restingHeartRateBpm || !maxHeartRateBpm || maxHeartRateBpm <= restingHeartRateBpm) {
    return null;
  }

  const heartRateReserve =
    (heartRateBpm - restingHeartRateBpm) / (maxHeartRateBpm - restingHeartRateBpm);
  const clampedHeartRateReserve = clamp(heartRateReserve, 0, 1.2);

  return (
    clampedHeartRateReserve *
    0.64 *
    Math.exp(config.heartRateTrimpExponentCoefficient * clampedHeartRateReserve)
  );
}

function calculateHeartRateTss(
  state: MetricsState,
  config: ResolvedRecordingMetricsConfig,
): number | null {
  const thresholdHeartRateBpm = config.thresholdHeartRateBpm;
  if (!thresholdHeartRateBpm || state.heartRateSeconds <= 0) return null;

  const thresholdTrimpPerMinute = calculateTrimpPerMinute(thresholdHeartRateBpm, config);
  if (!thresholdTrimpPerMinute || thresholdTrimpPerMinute <= 0) return null;

  return (state.observedTrimp / (thresholdTrimpPerMinute * 60)) * 100;
}

function selectTrainingStressScore(input: {
  state: MetricsState;
  config: ResolvedRecordingMetricsConfig;
  powerTrainingStressScore: number | null;
  heartRateTrainingStressScore: number | null;
  runGradeAdjustedPaceTrainingStressScore: number | null;
  swimCriticalSpeedTrainingStressScore: number | null;
}): Pick<RecordingMetricsSnapshot, "trainingStressScore" | "trainingStressScoreMethod"> {
  const { state, config } = input;
  const denominatorSeconds = getCoverageDenominator(config, state);
  const candidates: Record<
    TrainingStressScoreMethod,
    { value: number | null; coverageSeconds: number }
  > = {
    power: { value: input.powerTrainingStressScore, coverageSeconds: state.powerSeconds },
    heart_rate: {
      value: input.heartRateTrainingStressScore,
      coverageSeconds: state.heartRateSeconds,
    },
    run_grade_adjusted_pace: {
      value: input.runGradeAdjustedPaceTrainingStressScore,
      coverageSeconds: state.gapSeconds,
    },
    swim_critical_speed: {
      value: input.swimCriticalSpeedTrainingStressScore,
      coverageSeconds: state.swimDistanceSeconds,
    },
  };

  for (const method of config.preferredTrainingStressScoreMethods) {
    if (!isMethodEligibleForActivity(config.activityCategory, method)) continue;

    const candidate = candidates[method];
    if (!candidate || candidate.value === null) continue;
    if (!hasCoverage(candidate.coverageSeconds, denominatorSeconds)) continue;

    return {
      trainingStressScore: candidate.value,
      trainingStressScoreMethod: method,
    };
  }

  return { trainingStressScore: null, trainingStressScoreMethod: null };
}

class DefaultRecordingMetricsAccumulator implements RecordingMetricsAccumulator {
  private readonly config: ResolvedRecordingMetricsConfig;
  private state: MetricsState = createInitialState();

  constructor(config?: RecordingMetricsConfig) {
    this.config = resolveConfig(config);
  }

  addSample(sample: RecordingMetricSample): void {
    if (!Number.isFinite(sample.timestampMs)) return;
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
    this.state.sampleCount += 1;

    if (previousSample === null || previousTimestampMs === null) return;

    const rawDtSeconds = (sample.timestampMs - previousTimestampMs) / 1000;
    if (!Number.isFinite(rawDtSeconds) || rawDtSeconds <= 0) return;

    const metricSeconds = Math.min(rawDtSeconds, this.config.maxGapSeconds);
    const isMoving = sample.moving !== false;
    const contributesToLoad = this.config.timeBasis === "elapsed" || isMoving;

    this.state.elapsedSeconds += rawDtSeconds;
    if (isMoving) {
      this.state.movingSeconds += rawDtSeconds;
    }
    if (!contributesToLoad) return;

    this.addPower(sample, metricSeconds);
    this.addHeartRate(sample, metricSeconds);
    this.addRunGap(previousSample, sample, metricSeconds, rawDtSeconds);
    this.addSwimDistance(previousSample, sample, metricSeconds);
  }

  getSnapshot(): RecordingMetricsSnapshot {
    const averagePowerWatts =
      this.state.powerSeconds > 0 ? this.state.powerWeightedSum / this.state.powerSeconds : null;
    const normalizedPowerWatts = getRollingFourthRootResult(this.state.powerRolling);
    const intensityFactor =
      normalizedPowerWatts !== null && this.config.ftpWatts
        ? normalizedPowerWatts / this.config.ftpWatts
        : null;
    const powerTrainingStressScore =
      normalizedPowerWatts !== null && intensityFactor !== null && this.config.ftpWatts
        ? ((this.state.powerSeconds * normalizedPowerWatts * intensityFactor) /
            (this.config.ftpWatts * 3600)) *
          100
        : null;
    const variabilityIndex =
      normalizedPowerWatts !== null && averagePowerWatts !== null && averagePowerWatts > 0
        ? normalizedPowerWatts / averagePowerWatts
        : null;
    const averageHeartRateBpm =
      this.state.heartRateSeconds > 0
        ? this.state.heartRateWeightedSum / this.state.heartRateSeconds
        : null;
    const efficiencyFactor =
      normalizedPowerWatts !== null && averageHeartRateBpm !== null && averageHeartRateBpm > 0
        ? normalizedPowerWatts / averageHeartRateBpm
        : null;
    const heartRateTrainingStressScore = calculateHeartRateTss(this.state, this.config);
    const runGradeAdjustedPaceTrainingStressScore = this.calculateRunGapTss();
    const swimCriticalSpeedTrainingStressScore = this.calculateSwimCssTss();
    const selected = selectTrainingStressScore({
      state: this.state,
      config: this.config,
      powerTrainingStressScore,
      heartRateTrainingStressScore,
      runGradeAdjustedPaceTrainingStressScore,
      swimCriticalSpeedTrainingStressScore,
    });

    return {
      elapsedSeconds: this.state.elapsedSeconds,
      movingSeconds: this.state.movingSeconds,
      averagePowerWatts,
      normalizedPowerWatts,
      intensityFactor,
      powerTrainingStressScore,
      variabilityIndex,
      workKilojoules: this.state.powerSeconds > 0 ? this.state.workJoules / 1000 : null,
      averageHeartRateBpm,
      efficiencyFactor,
      heartRateTrainingStressScore,
      runGradeAdjustedPaceTrainingStressScore,
      swimCriticalSpeedTrainingStressScore,
      ...selected,
      sampleCount: this.state.sampleCount,
      powerSampleCount: this.state.powerSampleCount,
      heartRateSampleCount: this.state.heartRateSampleCount,
    };
  }

  reset(): void {
    this.state = createInitialState();
  }

  private addPower(sample: RecordingMetricSample, seconds: number): void {
    const powerWatts = finiteOrNull(sample.powerWatts);
    if (powerWatts === null || powerWatts < 0 || seconds <= 0) return;

    this.state.powerSampleCount += 1;
    this.state.powerSeconds += seconds;
    this.state.powerWeightedSum += powerWatts * seconds;
    this.state.workJoules += powerWatts * seconds;
    addRollingFourthRootValue(
      this.state.powerRolling,
      { value: powerWatts, seconds },
      this.config.npWindowSeconds,
    );
  }

  private addHeartRate(sample: RecordingMetricSample, seconds: number): void {
    const heartRateBpm = finiteOrNull(sample.heartRateBpm);
    if (heartRateBpm === null || heartRateBpm <= 0 || seconds <= 0) return;

    this.state.heartRateSampleCount += 1;
    this.state.heartRateSeconds += seconds;
    this.state.heartRateWeightedSum += heartRateBpm * seconds;

    const trimpPerMinute = calculateTrimpPerMinute(heartRateBpm, this.config);
    if (trimpPerMinute !== null) {
      this.state.observedTrimp += trimpPerMinute * (seconds / 60);
    }
  }

  private addRunGap(
    previousSample: RecordingMetricSample,
    sample: RecordingMetricSample,
    metricSeconds: number,
    rawDtSeconds: number,
  ): void {
    if (this.config.activityCategory !== "run" || metricSeconds <= 0 || rawDtSeconds <= 0) return;

    const currentAltitude = finiteOrNull(sample.altitudeMeters);
    const previousAltitude = finiteOrNull(previousSample.altitudeMeters);
    if (currentAltitude === null || previousAltitude === null) return;

    const currentDistance = finiteOrNull(sample.distanceMeters);
    const previousDistance = finiteOrNull(previousSample.distanceMeters);
    let distanceDelta: number | null = null;

    if (currentDistance !== null && previousDistance !== null) {
      const delta = currentDistance - previousDistance;
      if (delta > 0) distanceDelta = delta;
    }

    if (distanceDelta === null) {
      const speedMps = finiteOrNull(sample.speedMps);
      if (speedMps === null || speedMps <= 0) return;
      distanceDelta = speedMps * rawDtSeconds;
    }

    if (distanceDelta <= 0) return;

    const speedMps = distanceDelta / rawDtSeconds;
    if (!Number.isFinite(speedMps) || speedMps <= 0) return;

    const grade = clamp((currentAltitude - previousAltitude) / distanceDelta, -0.3, 0.3);
    const gradeAdjustedSpeed = speedMps * (minettiCost(grade) / minettiCost(0));
    if (!Number.isFinite(gradeAdjustedSpeed) || gradeAdjustedSpeed <= 0) return;

    this.state.gapSeconds += metricSeconds;
    addRollingFourthRootValue(
      this.state.gapRolling,
      { value: gradeAdjustedSpeed, seconds: metricSeconds },
      this.config.npWindowSeconds,
    );
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

  private calculateRunGapTss(): number | null {
    if (this.config.activityCategory !== "run" || !this.config.thresholdPaceSecondsPerKm) {
      return null;
    }

    const normalizedGradeAdjustedSpeed = getRollingFourthRootResult(this.state.gapRolling);
    if (normalizedGradeAdjustedSpeed === null) return null;

    const thresholdSpeed = 1000 / this.config.thresholdPaceSecondsPerKm;
    if (!Number.isFinite(thresholdSpeed) || thresholdSpeed <= 0) return null;

    const intensityFactor = normalizedGradeAdjustedSpeed / thresholdSpeed;
    return (this.state.gapSeconds / 3600) * intensityFactor ** 2 * 100;
  }

  private calculateSwimCssTss(): number | null {
    if (this.config.activityCategory !== "swim" || !this.config.thresholdSwimPaceSecondsPer100m) {
      return null;
    }
    const basisSeconds = getTimeBasisSeconds(this.config, this.state);
    if (this.state.swimDistanceSeconds <= 0 || basisSeconds <= 0) return null;

    const swimSpeed = this.state.swimDistanceMeters / basisSeconds;
    const thresholdSwimSpeed = 100 / this.config.thresholdSwimPaceSecondsPer100m;
    if (!Number.isFinite(swimSpeed) || !Number.isFinite(thresholdSwimSpeed)) return null;
    if (swimSpeed <= 0 || thresholdSwimSpeed <= 0) return null;

    const intensityFactor = swimSpeed / thresholdSwimSpeed;
    return (basisSeconds / 3600) * intensityFactor ** 2 * 100;
  }
}

export function createRecordingMetricsAccumulator(
  config?: RecordingMetricsConfig,
): RecordingMetricsAccumulator {
  return new DefaultRecordingMetricsAccumulator(config);
}

export function calculateRecordingMetrics(input: {
  config?: RecordingMetricsConfig;
  samples: RecordingMetricSample[];
}): RecordingMetricsSnapshot {
  const accumulator = createRecordingMetricsAccumulator(input.config);
  for (const sample of input.samples) {
    accumulator.addSample(sample);
  }
  return accumulator.getSnapshot();
}
