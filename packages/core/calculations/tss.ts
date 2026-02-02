import { calculateNormalizedPower } from "./normalized-power";

/**
 * Training Stress Score (TSS) Calculations
 *
 * Multi-modal TSS calculation supporting power, heart rate, and pace-based methods.
 * Priority: Power > Heart Rate > Pace for optimal accuracy.
 */

// ==========================================
// Power-Based TSS (Most Accurate)
// ==========================================

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

/**
 * Calculates TSS from power data using Dr. Coggan's formula.
 *
 * TSS quantifies the training load based on:
 * - Normalized Power (30-second rolling average)
 * - Intensity Factor (NP / FTP)
 * - Duration
 *
 * Formula: TSS = (duration × NP × IF) / (FTP × 3600) × 100
 *
 * @param params - Power stream, timestamps, and FTP
 * @returns TSS calculation result with metadata
 */
export function calculateTSSFromPower(params: TSSFromPowerParams): TSSResult {
  const { powerStream, timestamps, ftp, weight } = params;

  if (!ftp || ftp === 0) {
    throw new Error("FTP is required for power-based TSS calculation");
  }

  if (powerStream.length === 0 || timestamps.length === 0) {
    throw new Error("Power stream and timestamps cannot be empty");
  }

  if (powerStream.length !== timestamps.length) {
    throw new Error("Power stream and timestamps must have the same length");
  }

  // Calculate 30-second rolling average (normalized power)
  const normalizedPower = calculateNormalizedPower(powerStream);

  // Calculate intensity factor
  const intensityFactor = normalizedPower / ftp;

  // Calculate duration in seconds
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];

  if (firstTimestamp === undefined || lastTimestamp === undefined) {
    throw new Error("Invalid timestamps");
  }

  const durationSeconds = lastTimestamp - firstTimestamp;

  if (durationSeconds === 0) {
    throw new Error("Duration cannot be zero");
  }

  // TSS formula: (duration × NP × IF) / (FTP × 3600) × 100
  const tss =
    ((durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600)) *
    100;

  // Variability index (VI = NP / Avg Power)
  const avgPower =
    powerStream.reduce((sum, p) => sum + p, 0) / powerStream.length;
  const variabilityIndex = avgPower > 0 ? normalizedPower / avgPower : 1;

  return {
    tss: Math.round(tss),
    normalizedPower: Math.round(normalizedPower),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    variabilityIndex: Math.round(variabilityIndex * 100) / 100,
  };
}

// ==========================================
// Heart Rate-Based TSS (HRSS)
// ==========================================

export interface HRSSParams {
  hrStream: number[];
  timestamps: number[];
  lthr: number; // Lactate threshold heart rate
  maxHR: number;
  restingHR?: number;
}

export interface HRSSResult {
  hrss: number;
  avgHR: number;
  timeInZones: { zone: number; seconds: number; percentage: number }[];
  source: "hr";
}

/**
 * Calculates heart rate-based TSS (HRSS).
 *
 * Uses Coggan's 5-zone model with weighted zone points:
 * - Zone 1 (Active Recovery): 20 points/hour
 * - Zone 2 (Endurance): 30 points/hour
 * - Zone 3 (Tempo): 40 points/hour
 * - Zone 4 (Threshold): 50 points/hour
 * - Zone 5 (VO2max+): 100 points/hour
 *
 * @param params - HR stream, timestamps, LTHR, and max HR
 * @returns HRSS calculation result
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

  // Define HR zones (% of LTHR)
  const zones = [
    { zone: 1, min: restingHR, max: lthr * 0.82, points: 20 }, // Active recovery
    { zone: 2, min: lthr * 0.82, max: lthr * 0.89, points: 30 }, // Endurance
    { zone: 3, min: lthr * 0.89, max: lthr * 0.93, points: 40 }, // Tempo
    { zone: 4, min: lthr * 0.93, max: lthr * 1.0, points: 50 }, // Threshold
    { zone: 5, min: lthr * 1.0, max: maxHR, points: 100 }, // VO2max+
  ];

  let totalPoints = 0;
  const timeInZones = zones.map((z) => ({ ...z, seconds: 0, percentage: 0 }));

  // Calculate time in each zone
  for (let i = 0; i < hrStream.length; i++) {
    const hr = hrStream[i];
    if (hr === undefined) continue;

    const currentTimestamp = timestamps[i];
    const nextTimestamp = timestamps[i + 1];
    if (currentTimestamp === undefined) continue;

    const duration =
      nextTimestamp !== undefined ? nextTimestamp - currentTimestamp : 1;

    const zone =
      zones.find((z) => hr >= z.min && hr < z.max) || zones[zones.length - 1];
    if (!zone) continue;

    const zoneIndex = zones.indexOf(zone);
    if (zoneIndex === -1) continue;

    const timeInZone = timeInZones[zoneIndex];
    if (timeInZone) {
      timeInZone.seconds += duration;
      totalPoints += (zone.points / 3600) * duration; // Points per second
    }
  }

  const firstTimestampHR = timestamps[0];
  const lastTimestampHR = timestamps[timestamps.length - 1];
  if (firstTimestampHR === undefined || lastTimestampHR === undefined) {
    throw new Error("Invalid timestamps for HR calculation");
  }

  const totalDuration = lastTimestampHR - firstTimestampHR;
  timeInZones.forEach((z) => {
    z.percentage = Math.round((z.seconds / totalDuration) * 100);
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

// ==========================================
// Pace-Based TSS (Running)
// ==========================================

export interface RunningTSSParams {
  paceStream: number[]; // seconds per km
  timestamps: number[];
  elevationStream?: number[]; // meters
  thresholdPace: number; // seconds per km
  distance: number; // meters
}

export interface RunningTSSResult {
  tss: number;
  normalizedPace: number; // Normalized graded pace
  intensityFactor: number;
  source: "pace";
}

/**
 * Calculates running TSS based on pace.
 *
 * Uses Normalized Graded Pace (NGP) to account for elevation changes.
 * Similar to power-based TSS but uses pace instead.
 *
 * Formula: TSS = (duration_hours × IF²) × 100
 *
 * @param params - Pace stream, timestamps, threshold pace, and optional elevation
 * @returns Running TSS calculation result
 */
export function calculateRunningTSS(
  params: RunningTSSParams,
): RunningTSSResult {
  const { paceStream, timestamps, elevationStream, thresholdPace, distance } =
    params;

  if (!thresholdPace || thresholdPace === 0) {
    throw new Error(
      "Threshold pace is required for pace-based TSS calculation",
    );
  }

  if (paceStream.length === 0 || timestamps.length === 0) {
    throw new Error("Pace stream and timestamps cannot be empty");
  }

  if (paceStream.length !== timestamps.length) {
    throw new Error("Pace stream and timestamps must have the same length");
  }

  // Calculate grade-adjusted pace if elevation available
  let adjustedPaceStream = paceStream;
  if (elevationStream) {
    adjustedPaceStream = calculateGradeAdjustedPace(
      paceStream,
      elevationStream,
      timestamps,
    );
  }

  // Calculate normalized graded pace (NGP) - similar to normalized power
  const normalizedPace = calculateNormalizedPace(adjustedPaceStream);

  // Calculate intensity factor (IF = threshold pace / NGP)
  // Note: For pace, lower is faster, so invert the ratio
  const intensityFactor = thresholdPace / normalizedPace;

  // Calculate duration in hours
  const firstTimestampPace = timestamps[0];
  const lastTimestampPace = timestamps[timestamps.length - 1];
  if (firstTimestampPace === undefined || lastTimestampPace === undefined) {
    throw new Error("Invalid timestamps for pace calculation");
  }

  const durationSeconds = lastTimestampPace - firstTimestampPace;
  const hours = durationSeconds / 3600;

  // TSS formula for running: (duration_hours × IF²) × 100
  const tss = hours * Math.pow(intensityFactor, 2) * 100;

  return {
    tss: Math.round(tss),
    normalizedPace: Math.round(normalizedPace),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    source: "pace",
  };
}

/**
 * Adjusts pace for grade/elevation changes.
 *
 * Uphill running is harder (slower pace), downhill is easier (faster pace).
 *
 * @param paceStream - Array of pace values (seconds per km)
 * @param elevationStream - Array of elevation values (meters)
 * @param timestamps - Array of timestamps
 * @returns Grade-adjusted pace stream
 */
function calculateGradeAdjustedPace(
  paceStream: number[],
  elevationStream: number[],
  timestamps: number[],
): number[] {
  const adjusted: number[] = [];

  for (let i = 0; i < paceStream.length; i++) {
    const pace = paceStream[i];
    if (pace === undefined) continue;

    if (i === 0) {
      adjusted.push(pace);
      continue;
    }

    // Calculate grade
    const currentElevation = elevationStream[i];
    const previousElevation = elevationStream[i - 1];
    const currentTimestamp = timestamps[i];
    const previousTimestamp = timestamps[i - 1];

    if (
      currentElevation === undefined ||
      previousElevation === undefined ||
      currentTimestamp === undefined ||
      previousTimestamp === undefined
    ) {
      adjusted.push(pace);
      continue;
    }

    const elevationGain = currentElevation - previousElevation;
    const timeDiff = currentTimestamp - previousTimestamp;
    const distance = (timeDiff / pace) * 1000; // meters
    const grade = distance > 0 ? (elevationGain / distance) * 100 : 0;

    // Adjustment factor
    // +1% grade = ~3.5% slower pace
    // -1% grade = ~2% faster pace (less benefit going down)
    const adjustmentFactor = grade > 0 ? 1 + grade * 0.035 : 1 + grade * 0.02;

    adjusted.push(pace / adjustmentFactor);
  }

  return adjusted;
}

/**
 * Calculates normalized pace using 30-second rolling average.
 *
 * @param paceStream - Array of pace values
 * @returns Normalized pace
 */
function calculateNormalizedPace(paceStream: number[]): number {
  if (paceStream.length === 0) return 0;

  const WINDOW_SIZE = 30; // 30-second rolling average
  const rollingAverages: number[] = [];

  // Calculate 30-second rolling averages
  for (let i = 0; i < paceStream.length; i++) {
    const start = Math.max(0, i - WINDOW_SIZE + 1);
    const window = paceStream.slice(start, i + 1);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAverages.push(avg);
  }

  // Return average of rolling averages
  if (rollingAverages.length === 0) return 0;
  return (
    rollingAverages.reduce((sum, p) => sum + p, 0) / rollingAverages.length
  );
}

// ==========================================
// Swimming TSS
// ==========================================

export interface SwimmingTSSParams {
  paceStream: number[]; // seconds per 100m
  timestamps: number[];
  thresholdPace: number; // seconds per 100m
  distance: number; // meters
}

export interface SwimmingTSSResult {
  tss: number;
  normalizedPace: number;
  intensityFactor: number;
  source: "pace";
}

/**
 * Calculates swimming TSS based on pace.
 *
 * Similar to running TSS but uses pace per 100m instead of pace per km.
 *
 * @param params - Pace stream, timestamps, threshold pace
 * @returns Swimming TSS calculation result
 */
export function calculateSwimmingTSS(
  params: SwimmingTSSParams,
): SwimmingTSSResult {
  const { paceStream, timestamps, thresholdPace, distance } = params;

  if (!thresholdPace || thresholdPace === 0) {
    throw new Error("Threshold pace is required for swimming TSS calculation");
  }

  if (paceStream.length === 0 || timestamps.length === 0) {
    throw new Error("Pace stream and timestamps cannot be empty");
  }

  // Calculate normalized pace
  const normalizedPace = calculateNormalizedPace(paceStream);

  // Calculate intensity factor
  const intensityFactor = thresholdPace / normalizedPace;

  // Calculate duration in hours
  const firstTimestampSwim = timestamps[0];
  const lastTimestampSwim = timestamps[timestamps.length - 1];
  if (firstTimestampSwim === undefined || lastTimestampSwim === undefined) {
    throw new Error("Invalid timestamps for swimming calculation");
  }

  const durationSeconds = lastTimestampSwim - firstTimestampSwim;
  const hours = durationSeconds / 3600;

  // TSS formula for swimming: (duration_hours × IF²) × 100
  const tss = hours * Math.pow(intensityFactor, 2) * 100;

  return {
    tss: Math.round(tss),
    normalizedPace: Math.round(normalizedPace),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    source: "pace",
  };
}

// ==========================================
// Heart Rate-Based TSS (HRSS)
// ==========================================

// Universal TSS Calculator
// ==========================================

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

/**
 * Calculates TSS from whatever data is available.
 *
 * Priority order: Power > Heart Rate > Pace
 *
 * @param params - All available streams and thresholds
 * @returns Best TSS calculation or null if insufficient data
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

  // Try power-based TSS first (most accurate)
  if (powerStream && powerStream.length > 0 && ftp) {
    try {
      const result = calculateTSSFromPower({
        powerStream,
        timestamps,
        ftp,
        weight,
      });
      return { ...result, source: "power", confidence: "high" };
    } catch (error) {
      // Fall through to next method
    }
  }

  // Fallback to HR-based TSS
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
    } catch (error) {
      // Fall through to next method
    }
  }

  // Fallback to pace-based TSS
  if (paceStream && paceStream.length > 0 && thresholdPace && distance) {
    try {
      // Swimming
      if (activityType === "swim") {
        const result = calculateSwimmingTSS({
          paceStream,
          timestamps,
          thresholdPace,
          distance,
        });
        return { ...result, confidence: "medium" };
      }

      // Running
      const result = calculateRunningTSS({
        paceStream,
        timestamps,
        elevationStream,
        thresholdPace,
        distance,
      });
      return { ...result, confidence: "medium" };
    } catch (error) {
      // No method worked
    }
  }

  return null; // No data available for TSS calculation
}
