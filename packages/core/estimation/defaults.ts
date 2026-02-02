/**
 * Intelligent Defaults for Performance Metrics
 *
 * Provides estimation functions for performance metrics when no measured values exist.
 * These estimates serve as starting points until actual test data is available.
 */

import type { MetricSource } from "../schemas/activity_efforts";

/**
 * Result of a metric estimation.
 */
export interface EstimationResult {
  value: number;
  source: MetricSource;
  confidence?: "high" | "medium" | "low";
  notes?: string;
}

// ==========================================
// Power Estimation
// ==========================================

/**
 * Estimates FTP (Functional Threshold Power) from body weight.
 *
 * Uses a conservative 2.5 W/kg ratio for recreational cyclists.
 * This is on the lower end to avoid overestimation.
 *
 * @param weightKg - Body weight in kilograms
 * @returns Estimated FTP in watts
 */
export function estimateFTPFromWeight(weightKg: number): EstimationResult {
  const W_PER_KG = 2.5; // Conservative ratio for recreational cyclists
  const estimatedFTP = Math.round(weightKg * W_PER_KG);

  return {
    value: estimatedFTP,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from weight (${weightKg}kg) using ${W_PER_KG} W/kg ratio`,
  };
}

/**
 * Estimates FTP from recent activities with power data.
 *
 * Finds the best 20-minute power from the last 90 days and applies 0.95 multiplier.
 *
 * @param activities - Array of recent activities with power data
 * @returns Estimated FTP or null if insufficient data
 */
export function estimateFTPFromRecentActivities(
  activities: Array<{
    powerStream?: number[];
    timestamps?: number[];
    startedAt: Date;
  }>,
): EstimationResult | null {
  const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const TARGET_DURATION = 1200; // 20 minutes

  // Filter to recent activities with power data
  const recentActivities = activities.filter(
    (act) =>
      act.powerStream &&
      act.timestamps &&
      act.powerStream.length > 0 &&
      new Date(act.startedAt) >= NINETY_DAYS_AGO,
  );

  if (recentActivities.length === 0) {
    return null;
  }

  let maxAvgPower = 0;

  // Find best 20-minute average power
  for (const activity of recentActivities) {
    if (!activity.powerStream || !activity.timestamps) continue;

    const avgPower = findMaxAveragePower(
      activity.powerStream,
      activity.timestamps,
      TARGET_DURATION,
    );

    if (avgPower > maxAvgPower) {
      maxAvgPower = avgPower;
    }
  }

  if (maxAvgPower === 0) {
    return null;
  }

  // Apply 0.95 multiplier to 20-minute power to estimate FTP
  const estimatedFTP = Math.round(maxAvgPower * 0.95);

  return {
    value: estimatedFTP,
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from 20min power (${Math.round(maxAvgPower)}W) from recent activities`,
  };
}

// ==========================================
// Heart Rate Estimation
// ==========================================

/**
 * Estimates maximum heart rate from age.
 *
 * Uses the traditional 220 - age formula.
 * Note: This is a rough estimate; actual max HR varies significantly.
 *
 * @param age - Age in years
 * @returns Estimated max heart rate in bpm
 */
export function estimateMaxHR(age: number): EstimationResult {
  const estimatedMaxHR = 220 - age;

  return {
    value: estimatedMaxHR,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from age (${age}) using 220 - age formula`,
  };
}

/**
 * Estimates lactate threshold heart rate (LTHR) from maximum heart rate.
 *
 * Uses 85% of max HR as a conservative estimate for LTHR.
 *
 * @param maxHR - Maximum heart rate in bpm
 * @returns Estimated LTHR in bpm
 */
export function estimateLTHR(maxHR: number): EstimationResult {
  const LTHR_PERCENTAGE = 0.85;
  const estimatedLTHR = Math.round(maxHR * LTHR_PERCENTAGE);

  return {
    value: estimatedLTHR,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from max HR (${maxHR} bpm) using ${LTHR_PERCENTAGE * 100}% ratio`,
  };
}

/**
 * Estimates LTHR from recent activities with sustained efforts.
 *
 * Finds average HR during sustained efforts of 20-60 minutes.
 *
 * @param activities - Array of recent activities with HR data
 * @returns Estimated LTHR or null if insufficient data
 */
export function estimateLTHRFromRecentActivities(
  activities: Array<{
    hrStream?: number[];
    timestamps?: number[];
    startedAt: Date;
  }>,
): EstimationResult | null {
  const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const TARGET_DURATION = 1200; // 20 minutes

  // Filter to recent activities with HR data
  const recentActivities = activities.filter(
    (act) =>
      act.hrStream &&
      act.timestamps &&
      act.hrStream.length > 0 &&
      new Date(act.startedAt) >= NINETY_DAYS_AGO,
  );

  if (recentActivities.length === 0) {
    return null;
  }

  let maxAvgHR = 0;

  // Find best 20-minute average HR
  for (const activity of recentActivities) {
    if (!activity.hrStream || !activity.timestamps) continue;

    const avgHR = findMaxAverageHR(
      activity.hrStream,
      activity.timestamps,
      TARGET_DURATION,
    );

    if (avgHR > maxAvgHR) {
      maxAvgHR = avgHR;
    }
  }

  if (maxAvgHR === 0) {
    return null;
  }

  return {
    value: Math.round(maxAvgHR),
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from 20min avg HR (${Math.round(maxAvgHR)} bpm) from recent activities`,
  };
}

// ==========================================
// Pace Estimation
// ==========================================

/**
 * Estimates threshold pace from fitness level.
 *
 * @param fitnessLevel - Fitness level category
 * @returns Estimated threshold pace in seconds per km
 */
export function estimateThresholdPaceFromFitnessLevel(
  fitnessLevel: "beginner" | "intermediate" | "advanced",
): EstimationResult {
  const PACE_BY_LEVEL: Record<typeof fitnessLevel, number> = {
    beginner: 360, // 6:00 min/km
    intermediate: 300, // 5:00 min/km
    advanced: 240, // 4:00 min/km
  };

  const estimatedPace = PACE_BY_LEVEL[fitnessLevel];
  const minutes = Math.floor(estimatedPace / 60);
  const seconds = estimatedPace % 60;

  return {
    value: estimatedPace,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from fitness level (${fitnessLevel}): ${minutes}:${seconds.toString().padStart(2, "0")} min/km`,
  };
}

/**
 * Estimates threshold pace from recent running activities.
 *
 * Uses Riegel formula or recent race results to estimate threshold pace.
 *
 * @param activities - Array of recent running activities
 * @returns Estimated threshold pace or null if insufficient data
 */
export function estimateThresholdPaceFromRecentRuns(
  activities: Array<{
    paceStream?: number[];
    timestamps?: number[];
    distanceMeters?: number;
    startedAt: Date;
  }>,
): EstimationResult | null {
  const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const TARGET_DISTANCE = 5000; // 5k

  // Filter to recent runs with pace data
  const recentRuns = activities.filter(
    (act) =>
      act.paceStream &&
      act.timestamps &&
      act.distanceMeters &&
      act.paceStream.length > 0 &&
      new Date(act.startedAt) >= NINETY_DAYS_AGO,
  );

  if (recentRuns.length === 0) {
    return null;
  }

  // Find best 5k pace
  let bestPace = Infinity;

  for (const run of recentRuns) {
    if (!run.paceStream || !run.timestamps || !run.distanceMeters) continue;

    // If run is close to 5k, use average pace
    if (Math.abs(run.distanceMeters - TARGET_DISTANCE) < 500) {
      const avgPace =
        run.paceStream.reduce((sum, pace) => sum + pace, 0) /
        run.paceStream.length;
      if (avgPace < bestPace) {
        bestPace = avgPace;
      }
    }
  }

  if (bestPace === Infinity) {
    return null;
  }

  // Threshold pace is approximately 5k pace + 5%
  const estimatedThresholdPace = Math.round(bestPace * 1.05);
  const minutes = Math.floor(estimatedThresholdPace / 60);
  const seconds = estimatedThresholdPace % 60;

  return {
    value: estimatedThresholdPace,
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from recent 5k pace: ${minutes}:${seconds.toString().padStart(2, "0")} min/km`,
  };
}

/**
 * Estimates critical velocity from recent running activities.
 *
 * Critical velocity is the pace sustainable for approximately 1 hour.
 *
 * @param activities - Array of recent running activities
 * @returns Estimated critical velocity in m/s or null if insufficient data
 */
export function estimateCriticalVelocity(
  activities: Array<{
    distanceMeters?: number;
    durationSeconds?: number;
    startedAt: Date;
  }>,
): EstimationResult | null {
  const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Filter to runs between 20-60 minutes
  const sustainedRuns = activities.filter(
    (act) =>
      act.distanceMeters &&
      act.durationSeconds &&
      act.durationSeconds >= 1200 && // At least 20 minutes
      act.durationSeconds <= 3600 && // At most 60 minutes
      new Date(act.startedAt) >= NINETY_DAYS_AGO,
  );

  if (sustainedRuns.length === 0) {
    return null;
  }

  // Find best velocity (distance / time)
  let bestVelocity = 0;

  for (const run of sustainedRuns) {
    if (!run.distanceMeters || !run.durationSeconds) continue;

    const velocity = run.distanceMeters / run.durationSeconds;
    if (velocity > bestVelocity) {
      bestVelocity = velocity;
    }
  }

  if (bestVelocity === 0) {
    return null;
  }

  // Convert to pace (seconds per km)
  const paceSecondsPerKm = Math.round(1000 / bestVelocity);
  const minutes = Math.floor(paceSecondsPerKm / 60);
  const seconds = paceSecondsPerKm % 60;

  return {
    value: bestVelocity,
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from recent sustained runs: ${minutes}:${seconds.toString().padStart(2, "0")} min/km`,
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Finds the maximum average power for a given duration.
 *
 * @param powerStream - Array of power values
 * @param timestamps - Array of timestamps
 * @param durationSeconds - Target duration in seconds
 * @returns Maximum average power
 */
function findMaxAveragePower(
  powerStream: number[],
  timestamps: number[],
  durationSeconds: number,
): number {
  if (powerStream.length < 2) return 0;

  let maxAvg = 0;

  for (let i = 0; i < powerStream.length; i++) {
    const startTime = timestamps[i];
    if (startTime === undefined) continue;

    const targetEndTime = startTime + durationSeconds;

    // Find end index
    let endIdx = i;
    while (endIdx < timestamps.length) {
      const currentTime = timestamps[endIdx];
      if (currentTime === undefined || currentTime >= targetEndTime) break;
      endIdx++;
    }

    if (endIdx - i < 10) continue; // Need at least 10 data points

    // Calculate average power for this window
    const sum = powerStream.slice(i, endIdx).reduce((s, p) => s + p, 0);
    const avg = sum / (endIdx - i);

    if (avg > maxAvg) {
      maxAvg = avg;
    }
  }

  return maxAvg;
}

/**
 * Finds the maximum average heart rate for a given duration.
 *
 * @param hrStream - Array of heart rate values
 * @param timestamps - Array of timestamps
 * @param durationSeconds - Target duration in seconds
 * @returns Maximum average heart rate
 */
function findMaxAverageHR(
  hrStream: number[],
  timestamps: number[],
  durationSeconds: number,
): number {
  if (hrStream.length < 2) return 0;

  let maxAvg = 0;

  for (let i = 0; i < hrStream.length; i++) {
    const startTime = timestamps[i];
    if (startTime === undefined) continue;

    const targetEndTime = startTime + durationSeconds;

    // Find end index
    let endIdx = i;
    while (endIdx < timestamps.length) {
      const currentTime = timestamps[endIdx];
      if (currentTime === undefined || currentTime >= targetEndTime) break;
      endIdx++;
    }

    if (endIdx - i < 10) continue; // Need at least 10 data points

    // Calculate average HR for this window
    const sum = hrStream.slice(i, endIdx).reduce((s, hr) => s + hr, 0);
    const avg = sum / (endIdx - i);

    if (avg > maxAvg) {
      maxAvg = avg;
    }
  }

  return maxAvg;
}
