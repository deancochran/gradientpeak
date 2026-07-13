/**
 * Speed Curve Derivation
 *
 * Represents a threshold-pace input without fabricating a full performance curve.
 */

import { PROFILE_PERFORMANCE_THRESHOLD_BOUNDS } from "../athlete-inputs/profile-metrics";
import type { DerivedEffort } from "./power-curve";

/**
 * Standard durations for running speed efforts in seconds.
 * Covers the full range from sprints (5s) to tempo/endurance (60m).
 */
export const STANDARD_SPEED_DURATIONS = [
  5, // 5 seconds (sprint)
  10, // 10 seconds (sprint)
  30, // 30 seconds (sprint)
  60, // 1 minute (sprint)
  180, // 3 minutes (VO2max)
  300, // 5 minutes (VO2max)
  600, // 10 minutes (tempo)
  1200, // 20 minutes (threshold)
  1800, // 30 minutes (threshold)
  3600, // 60 minutes (tempo)
] as const;

/**
 * Speed multipliers based on duration and energy system.
 * Based on exercise physiology research and running performance models.
 */
export const SPEED_MULTIPLIERS = {
  sprint: 1.15, // < 60s: 15% faster than threshold (anaerobic, neuromuscular)
  vo2max: 1.08, // 60-300s: 8% faster (maximal aerobic capacity)
  threshold: 1.0, // 300-1200s: baseline (lactate threshold)
  tempo: 0.92, // > 1200s: 8% slower (aerobic endurance)
} as const;

/**
 * Returns one 60-minute running-threshold anchor. A single threshold input has
 * no defensible information about sprint or shorter-duration performance.
 *
 * @param thresholdPaceSecondsPerKm - Threshold pace in seconds per kilometer (pace sustainable for 30-60 min)
 * @returns A single threshold speed anchor
 *
 * @example
 * const thresholdPace = 270; // 4:30/km
 * const speedCurve = deriveSpeedCurveFromThresholdPace(thresholdPace);
 * // Returns: [{ duration_seconds: 3600, value: 3.7, ... }]
 */
export function deriveSpeedCurveFromThresholdPace(
  thresholdPaceSecondsPerKm: number,
): DerivedEffort[] {
  // Validate input
  if (!Number.isFinite(thresholdPaceSecondsPerKm) || thresholdPaceSecondsPerKm <= 0) {
    throw new Error("Threshold pace must be greater than 0");
  }

  const bounds = PROFILE_PERFORMANCE_THRESHOLD_BOUNDS.runningThresholdPaceSecondsPerKilometer;
  if (thresholdPaceSecondsPerKm < bounds.min || thresholdPaceSecondsPerKm > bounds.max) {
    throw new Error("Threshold pace is outside the accepted profile bounds");
  }

  // Convert threshold pace to speed (m/s)
  const thresholdSpeedMps = paceToSpeed(thresholdPaceSecondsPerKm);

  return [
    {
      duration_seconds: 3_600,
      effort_type: "speed",
      value: Math.round(thresholdSpeedMps * 100) / 100,
      unit: "meters_per_second",
      activity_category: "run",
    },
  ];
}

/**
 * Converts pace (seconds per kilometer) to speed (meters per second).
 *
 * @param secondsPerKm - Pace in seconds per kilometer
 * @returns Speed in meters per second
 *
 * @example
 * const pace = 300; // 5:00/km
 * const speed = paceToSpeed(pace);
 * // Returns: 3.33 m/s
 */
export function paceToSpeed(secondsPerKm: number): number {
  if (secondsPerKm <= 0) {
    throw new Error("Pace must be greater than 0");
  }

  // Speed (m/s) = 1000 meters / seconds
  return 1000 / secondsPerKm;
}

/**
 * Converts speed (meters per second) to pace (seconds per kilometer).
 *
 * @param metersPerSecond - Speed in meters per second
 * @returns Pace in seconds per kilometer
 *
 * @example
 * const speed = 3.33; // m/s
 * const pace = speedToPace(speed);
 * // Returns: 300 (5:00/km)
 */
export function speedToPace(metersPerSecond: number): number {
  if (metersPerSecond <= 0) {
    throw new Error("Speed must be greater than 0");
  }

  // Pace (s/km) = 1000 meters / speed (m/s)
  return Math.round(1000 / metersPerSecond);
}

/**
 * Formats pace in seconds to MM:SS string format.
 *
 * @param secondsPerKm - Pace in seconds per kilometer
 * @returns Formatted pace string (e.g., "4:30")
 *
 * @example
 * const pace = 270; // seconds
 * const formatted = formatPace(pace);
 * // Returns: "4:30"
 */
export function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Parses pace string (MM:SS) to seconds per kilometer.
 *
 * @param paceString - Pace in "M:SS" or "MM:SS" format (e.g., "4:30" or "10:15")
 * @returns Pace in seconds per kilometer
 *
 * @example
 * const pace = parsePace("4:30");
 * // Returns: 270 seconds
 */
export function parsePace(paceString: string): number {
  const parts = paceString.split(":");
  if (parts.length !== 2) {
    throw new Error('Invalid pace format. Expected "M:SS" or "MM:SS"');
  }

  const minutesPart = parts[0];
  const secondsPart = parts[1];

  if (!minutesPart || !secondsPart) {
    throw new Error('Invalid pace format. Expected "M:SS" or "MM:SS"');
  }

  const minutes = parseInt(minutesPart, 10);
  const seconds = parseInt(secondsPart, 10);

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds < 0 || seconds >= 60) {
    throw new Error("Invalid pace values");
  }

  return minutes * 60 + seconds;
}

/**
 * Estimates speed for a specific duration from threshold pace.
 *
 * Useful for calculating pace targets for specific intervals or races.
 *
 * @param thresholdPaceSecondsPerKm - Threshold pace in seconds per kilometer
 * @param durationSeconds - Target duration in seconds
 * @returns Estimated sustainable speed (m/s) for the given duration
 *
 * @example
 * const speed5k = estimateSpeedForDuration(270, 1200); // 20 minutes
 * // Returns: ~3.70 m/s (threshold pace)
 */
export function estimateSpeedForDuration(
  thresholdPaceSecondsPerKm: number,
  durationSeconds: number,
): number {
  if (thresholdPaceSecondsPerKm <= 0 || durationSeconds <= 0) {
    throw new Error("Pace and duration must be greater than 0");
  }

  const thresholdSpeedMps = paceToSpeed(thresholdPaceSecondsPerKm);

  // Determine multiplier based on duration
  let multiplier: number;

  if (durationSeconds < 60) {
    multiplier = SPEED_MULTIPLIERS.sprint;
  } else if (durationSeconds < 300) {
    multiplier = SPEED_MULTIPLIERS.vo2max;
  } else if (durationSeconds < 1200) {
    multiplier = SPEED_MULTIPLIERS.threshold;
  } else {
    multiplier = SPEED_MULTIPLIERS.tempo;
  }

  return Math.round(thresholdSpeedMps * multiplier * 100) / 100;
}
