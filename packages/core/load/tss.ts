import { calculateGradedSpeedStream, calculateNGP } from "../calculations/normalized-graded-pace";
import { calculateNormalizedPower as calculateNormalizedPowerFromStream } from "../calculations/normalized-power";
import { getTrainingIntensityZone as getCanonicalTrainingIntensityZone } from "../zones/intensity";

/**
 * Canonical load-domain stress calculations.
 */

export interface TSSFromPowerParams {
  powerStream: number[];
  timestamps: number[];
  ftp: number;
  weight?: number;
}

export interface TSSResult {
  tss: number;
  normalizedPower: number;
  intensityFactor: number;
  variabilityIndex: number;
}

export interface HRSSParams {
  hrStream: number[];
  timestamps: number[];
  lthr: number;
  maxHR: number;
  restingHR?: number;
}

export interface HRSSResult {
  hrss: number;
  avgHR: number;
  timeInZones: { zone: number; seconds: number; percentage: number }[];
  source: "hr";
}

export interface RunningTSSParams {
  paceStream: number[];
  timestamps: number[];
  elevationStream?: number[];
  thresholdPace: number;
  distance: number;
}

export interface RunningTSSResult {
  tss: number;
  normalizedPace: number;
  intensityFactor: number;
  source: "pace";
}

export interface SwimmingTSSParams {
  paceStream: number[];
  timestamps: number[];
  thresholdPace: number;
  distance: number;
}

export interface SwimmingTSSResult {
  tss: number;
  normalizedPace: number;
  intensityFactor: number;
  source: "pace";
}

export interface UniversalTSSParams {
  powerStream?: number[];
  hrStream?: number[];
  paceStream?: number[];
  elevationStream?: number[];
  timestamps: number[];
  ftp?: number;
  lthr?: number;
  maxHR?: number;
  restingHR?: number;
  thresholdPace?: number;
  distance?: number;
  weight?: number;
  activityType?: "run" | "bike" | "swim" | "other";
}

export type UniversalTSSResult =
  | (TSSResult & { source: "power"; confidence: "high" })
  | (HRSSResult & { confidence: "medium" })
  | (RunningTSSResult & { confidence: "medium" })
  | (SwimmingTSSResult & { confidence: "medium" });

function getDurationSecondsFromTimestamps(timestamps: number[]): number {
  if (timestamps.length === 0) {
    throw new Error("Timestamps cannot be empty");
  }

  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];

  if (firstTimestamp === undefined || lastTimestamp === undefined) {
    throw new Error("Invalid timestamps");
  }

  const durationSeconds = lastTimestamp - firstTimestamp;
  if (durationSeconds === 0) {
    throw new Error("Duration cannot be zero");
  }

  return durationSeconds;
}

function calculateNormalizedPace(paceStream: number[]): number {
  if (paceStream.length === 0) return 0;

  const windowSize = 30;
  const rollingAverages: number[] = [];

  for (let index = 0; index < paceStream.length; index += 1) {
    const start = Math.max(0, index - windowSize + 1);
    const window = paceStream.slice(start, index + 1);
    const average = window.reduce((sum, pace) => sum + pace, 0) / window.length;
    rollingAverages.push(average);
  }

  if (rollingAverages.length === 0) return 0;

  return rollingAverages.reduce((sum, pace) => sum + pace, 0) / rollingAverages.length;
}

/**
 * Canonical power-based TSS calculation.
 */
export function calculateTSSFromPower(params: TSSFromPowerParams): TSSResult {
  const { powerStream, timestamps, ftp } = params;

  if (!ftp || ftp === 0) {
    throw new Error("FTP is required for power-based TSS calculation");
  }
  if (powerStream.length === 0 || timestamps.length === 0) {
    throw new Error("Power stream and timestamps cannot be empty");
  }
  if (powerStream.length !== timestamps.length) {
    throw new Error("Power stream and timestamps must have the same length");
  }

  const normalizedPower = calculateNormalizedPowerFromStream(powerStream);
  const intensityFactor = normalizedPower / ftp;
  const durationSeconds = getDurationSecondsFromTimestamps(timestamps);
  const tss = ((durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600)) * 100;
  const averagePower = powerStream.reduce((sum, watts) => sum + watts, 0) / powerStream.length;
  const variabilityIndex = averagePower > 0 ? normalizedPower / averagePower : 1;

  return {
    tss: Math.round(tss),
    normalizedPower: Math.round(normalizedPower),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    variabilityIndex: Math.round(variabilityIndex * 100) / 100,
  };
}

/**
 * Canonical heart-rate-based stress score.
 */
export function calculateHRSS(params: HRSSParams): HRSSResult {
  const { hrStream, timestamps, lthr, maxHR, restingHR = 60 } = params;

  if (!lthr || lthr === 0) {
    throw new Error("LTHR is required for HR-based TSS calculation");
  }
  if (!maxHR || maxHR === 0) {
    throw new Error("Max HR is required for HR-based TSS calculation");
  }
  if (hrStream.length === 0 || timestamps.length === 0) {
    throw new Error("HR stream and timestamps cannot be empty");
  }
  if (hrStream.length !== timestamps.length) {
    throw new Error("HR stream and timestamps must have the same length");
  }

  const zones = [
    { zone: 1, min: restingHR, max: lthr * 0.82, points: 20 },
    { zone: 2, min: lthr * 0.82, max: lthr * 0.89, points: 30 },
    { zone: 3, min: lthr * 0.89, max: lthr * 0.93, points: 40 },
    { zone: 4, min: lthr * 0.93, max: lthr * 1.0, points: 50 },
    { zone: 5, min: lthr * 1.0, max: maxHR, points: 100 },
  ];

  let totalPoints = 0;
  const timeInZones = zones.map((zone) => ({ ...zone, seconds: 0, percentage: 0 }));

  for (let index = 0; index < hrStream.length; index += 1) {
    const hr = hrStream[index];
    if (hr === undefined) continue;

    const currentTimestamp = timestamps[index];
    const nextTimestamp = timestamps[index + 1];
    if (currentTimestamp === undefined) continue;

    const duration = nextTimestamp !== undefined ? nextTimestamp - currentTimestamp : 1;
    const zone =
      zones.find((candidate) => hr >= candidate.min && hr < candidate.max) ??
      zones[zones.length - 1];
    if (!zone) continue;

    const zoneIndex = zones.indexOf(zone);
    if (zoneIndex === -1) continue;

    const timeInZone = timeInZones[zoneIndex];
    if (!timeInZone) continue;

    timeInZone.seconds += duration;
    totalPoints += (zone.points / 3600) * duration;
  }

  const totalDuration = getDurationSecondsFromTimestamps(timestamps);
  timeInZones.forEach((zone) => {
    zone.percentage = Math.round((zone.seconds / totalDuration) * 100);
  });

  const avgHR = hrStream.reduce((sum, hr) => sum + hr, 0) / hrStream.length;

  return {
    hrss: Math.round(totalPoints),
    avgHR: Math.round(avgHR),
    timeInZones: timeInZones.map(({ zone, seconds, percentage }) => ({
      zone,
      seconds,
      percentage,
    })),
    source: "hr",
  };
}

/**
 * Canonical run stress score using threshold pace.
 */
export function calculateRunningTSS(params: RunningTSSParams): RunningTSSResult {
  const { paceStream, timestamps, elevationStream, thresholdPace } = params;

  if (!thresholdPace || thresholdPace === 0) {
    throw new Error("Threshold pace is required for pace-based TSS calculation");
  }
  if (paceStream.length === 0 || timestamps.length === 0) {
    throw new Error("Pace stream and timestamps cannot be empty");
  }
  if (paceStream.length !== timestamps.length) {
    throw new Error("Pace stream and timestamps must have the same length");
  }

  let normalizedPace = calculateNormalizedPace(paceStream);
  if (elevationStream && elevationStream.length === paceStream.length) {
    const speedStream = paceStream.map((pace) => (pace > 0 ? 1000 / pace : 0));
    const gradedSpeedStream = calculateGradedSpeedStream(speedStream, elevationStream, timestamps);
    const normalizedSpeed = calculateNGP(gradedSpeedStream);
    normalizedPace = normalizedSpeed > 0 ? 1000 / normalizedSpeed : normalizedPace;
  }

  const intensityFactor = thresholdPace / normalizedPace;
  const durationSeconds = getDurationSecondsFromTimestamps(timestamps);
  const hours = durationSeconds / 3600;
  const tss = hours * Math.pow(intensityFactor, 2) * 100;

  return {
    tss: Math.round(tss),
    normalizedPace: Math.round(normalizedPace),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    source: "pace",
  };
}

/**
 * Canonical swim stress score using threshold pace.
 */
export function calculateSwimmingTSS(params: SwimmingTSSParams): SwimmingTSSResult {
  const { paceStream, timestamps, thresholdPace } = params;

  if (!thresholdPace || thresholdPace === 0) {
    throw new Error("Threshold pace is required for swimming TSS calculation");
  }
  if (paceStream.length === 0 || timestamps.length === 0) {
    throw new Error("Pace stream and timestamps cannot be empty");
  }

  const normalizedPace = calculateNormalizedPace(paceStream);
  const intensityFactor = thresholdPace / normalizedPace;
  const durationSeconds = getDurationSecondsFromTimestamps(timestamps);
  const hours = durationSeconds / 3600;
  const tss = hours * Math.pow(intensityFactor, 2) * 100;

  return {
    tss: Math.round(tss),
    normalizedPace: Math.round(normalizedPace),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    source: "pace",
  };
}

/**
 * Generic stress calculator that prefers higher-confidence data sources.
 */
export function calculateTSSFromAvailableData(
  params: UniversalTSSParams,
): UniversalTSSResult | null {
  const {
    powerStream,
    hrStream,
    paceStream,
    elevationStream,
    timestamps,
    ftp,
    lthr,
    maxHR,
    restingHR,
    thresholdPace,
    distance,
    weight,
    activityType,
  } = params;

  if (powerStream && powerStream.length > 0 && ftp) {
    try {
      const result = calculateTSSFromPower({
        powerStream,
        timestamps,
        ftp,
        weight,
      });
      return { ...result, source: "power", confidence: "high" };
    } catch {
      // Fall through.
    }
  }

  if (hrStream && hrStream.length > 0 && lthr && maxHR) {
    try {
      const result = calculateHRSS({
        hrStream,
        timestamps,
        lthr,
        maxHR,
        restingHR,
      });
      return { ...result, confidence: "medium" };
    } catch {
      // Fall through.
    }
  }

  if (paceStream && paceStream.length > 0 && thresholdPace && distance) {
    try {
      if (activityType === "swim") {
        const result = calculateSwimmingTSS({
          paceStream,
          timestamps,
          thresholdPace,
          distance,
        });
        return { ...result, confidence: "medium" };
      }

      const result = calculateRunningTSS({
        paceStream,
        timestamps,
        elevationStream,
        thresholdPace,
        distance,
      });
      return { ...result, confidence: "medium" };
    } catch {
      // Fall through.
    }
  }

  return null;
}

export function calculateTrainingIntensityFactor(
  normalizedPower: number,
  functionalThreshold: number,
): number {
  if (functionalThreshold === 0) return 0;
  return normalizedPower / functionalThreshold;
}

export function getTrainingIntensityZone(
  intensityFactor: number,
): "recovery" | "endurance" | "tempo" | "threshold" | "vo2max" | "anaerobic" | "neuromuscular" {
  return getCanonicalTrainingIntensityZone(intensityFactor);
}

export function calculateTrainingTSS(durationSeconds: number, intensityFactor: number): number {
  return (durationSeconds * Math.pow(intensityFactor, 2) * 100) / 3600;
}

export function estimateTSS(
  durationMinutes: number,
  effortLevel: "easy" | "moderate" | "hard",
): number {
  const estimatedIF = {
    easy: 0.65,
    moderate: 0.8,
    hard: 0.95,
  };

  return calculateTrainingTSS(durationMinutes * 60, estimatedIF[effortLevel]);
}
