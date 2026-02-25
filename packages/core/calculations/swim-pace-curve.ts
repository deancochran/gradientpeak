/**
 * Swim Pace Curve Derivation
 *
 * Derives a complete swim pace curve from CSS (Critical Swim Speed) using
 * pace multipliers based on swimming exercise physiology. Different durations
 * correspond to different race distances and energy systems.
 *
 * CSS is typically the pace sustainable for approximately 30 minutes (1500-2000m).
 * Similar to threshold pace in running, but with different physiological demands
 * due to horizontal body position and cooling effect of water.
 *
 * Used during onboarding to generate estimated best efforts across all durations
 * from a single CSS input, creating a complete swimming performance profile.
 */

import type { DerivedEffort } from "./power-curve";

/**
 * Standard durations for swimming pace efforts in seconds.
 * Covers typical race distances from sprints (25m, 50m) to distance (1500m+).
 */
export const STANDARD_SWIM_DURATIONS = [
  10, // ~10 seconds (25m sprint)
  20, // ~20 seconds (sprint)
  30, // ~30 seconds (50m sprint)
  60, // ~1 minute (100m)
  120, // ~2 minutes (200m)
  180, // ~3 minutes (200m+)
  300, // ~5 minutes (400m CSS)
  600, // ~10 minutes (800m CSS)
  900, // ~15 minutes (distance)
  1800, // ~30 minutes (1500-2000m)
] as const;

/**
 * Swim pace multipliers based on duration and race distance.
 * Based on swimming exercise physiology research.
 *
 * Note: Swimming HR is typically 10-15 bpm lower than land-based sports
 * due to horizontal body position and cooling effect of water.
 */
export const SWIM_PACE_MULTIPLIERS = {
  sprint: 1.1, // < 60s: 10% faster than CSS (25m, 50m)
  middle: 1.06, // 60-180s: 6% faster (100m, 200m)
  css: 1.0, // 180-600s: CSS baseline (400m, 800m)
  distance: 0.93, // > 600s: 7% slower (1500m+)
} as const;

/**
 * Derives a complete swim pace curve from Critical Swim Speed (CSS).
 *
 * This function generates estimated swim pace efforts across standard durations
 * based on a single CSS input. It's used during onboarding to create a
 * comprehensive swimming performance profile from minimal user input.
 *
 * @param cssSecondsPerHundredMeters - CSS in seconds per 100 meters (pace sustainable for ~30 min)
 * @returns Array of speed efforts for standard durations (10s to 30m)
 *
 * @example
 * const css = 90; // 1:30/100m
 * const swimCurve = deriveSwimPaceCurveFromCSS(css);
 * // Returns: [
 * //   { duration_seconds: 30, value: 1.22, ... },   // 50m sprint (1:21/100m)
 * //   { duration_seconds: 300, value: 1.11, ... },  // 400m at CSS (1:30/100m)
 * //   { duration_seconds: 1800, value: 1.03, ... }, // 1500m distance (1:37/100m)
 * // ]
 */
export function deriveSwimPaceCurveFromCSS(
  cssSecondsPerHundredMeters: number,
): DerivedEffort[] {
  // Validate input
  if (cssSecondsPerHundredMeters <= 0) {
    throw new Error("CSS must be greater than 0");
  }

  // Reasonable CSS range check (60s/100m to 300s/100m = 1:00 to 5:00 per 100m)
  if (cssSecondsPerHundredMeters < 60 || cssSecondsPerHundredMeters > 300) {
    throw new Error("CSS must be between 1:00/100m and 5:00/100m");
  }

  // Convert CSS (seconds per 100m) to speed (m/s)
  const cssSpeedMps = pacePerHundredMetersToSpeed(cssSecondsPerHundredMeters);

  // Generate swim pace curve for all standard durations
  return STANDARD_SWIM_DURATIONS.map((duration) => {
    // Determine speed multiplier based on duration
    let multiplier: number;

    if (duration < 60) {
      multiplier = SWIM_PACE_MULTIPLIERS.sprint; // Sprint (25m, 50m)
    } else if (duration < 180) {
      multiplier = SWIM_PACE_MULTIPLIERS.middle; // Middle distance (100m, 200m)
    } else if (duration < 600) {
      multiplier = SWIM_PACE_MULTIPLIERS.css; // CSS baseline (400m, 800m)
    } else {
      multiplier = SWIM_PACE_MULTIPLIERS.distance; // Distance (1500m+)
    }

    // Apply multiplier to CSS speed
    const speedMps = cssSpeedMps * multiplier;

    return {
      duration_seconds: duration,
      effort_type: "speed",
      value: Math.round(speedMps * 100) / 100, // Round to 2 decimal places
      unit: "meters_per_second",
      activity_category: "swim",
    };
  });
}

/**
 * Converts pace per 100 meters (seconds) to speed (meters per second).
 *
 * @param secondsPerHundredMeters - Pace in seconds per 100 meters
 * @returns Speed in meters per second
 *
 * @example
 * const pace = 90; // 1:30/100m
 * const speed = pacePerHundredMetersToSpeed(pace);
 * // Returns: 1.11 m/s
 */
export function pacePerHundredMetersToSpeed(
  secondsPerHundredMeters: number,
): number {
  if (secondsPerHundredMeters <= 0) {
    throw new Error("Pace must be greater than 0");
  }

  // Speed (m/s) = 100 meters / seconds
  return 100 / secondsPerHundredMeters;
}

/**
 * Converts speed (meters per second) to pace per 100 meters (seconds).
 *
 * @param metersPerSecond - Speed in meters per second
 * @returns Pace in seconds per 100 meters
 *
 * @example
 * const speed = 1.11; // m/s
 * const pace = speedToPacePerHundredMeters(speed);
 * // Returns: 90 (1:30/100m)
 */
export function speedToPacePerHundredMeters(metersPerSecond: number): number {
  if (metersPerSecond <= 0) {
    throw new Error("Speed must be greater than 0");
  }

  // Pace (s/100m) = 100 meters / speed (m/s)
  return Math.round(100 / metersPerSecond);
}

/**
 * Formats swim pace in seconds to M:SS string format.
 *
 * @param secondsPerHundredMeters - Pace in seconds per 100 meters
 * @returns Formatted pace string (e.g., "1:30" for 90 seconds)
 *
 * @example
 * const pace = 90; // seconds
 * const formatted = formatSwimPace(pace);
 * // Returns: "1:30"
 */
export function formatSwimPace(secondsPerHundredMeters: number): string {
  const minutes = Math.floor(secondsPerHundredMeters / 60);
  const seconds = Math.round(secondsPerHundredMeters % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Parses swim pace string (M:SS) to seconds per 100 meters.
 *
 * @param paceString - Pace in "M:SS" format (e.g., "1:30" or "2:05")
 * @returns Pace in seconds per 100 meters
 *
 * @example
 * const pace = parseSwimPace("1:30");
 * // Returns: 90 seconds
 */
export function parseSwimPace(paceString: string): number {
  const parts = paceString.split(":");
  if (parts.length !== 2) {
    throw new Error('Invalid pace format. Expected "M:SS"');
  }

  const minutesPart = parts[0];
  const secondsPart = parts[1];

  if (!minutesPart || !secondsPart) {
    throw new Error('Invalid pace format. Expected "M:SS"');
  }

  const minutes = parseInt(minutesPart, 10);
  const seconds = parseInt(secondsPart, 10);

  if (isNaN(minutes) || isNaN(seconds) || seconds < 0 || seconds >= 60) {
    throw new Error("Invalid pace values");
  }

  return minutes * 60 + seconds;
}

/**
 * Estimates swim speed for a specific duration from CSS.
 *
 * Useful for calculating pace targets for specific intervals or race distances.
 *
 * @param cssSecondsPerHundredMeters - CSS in seconds per 100 meters
 * @param durationSeconds - Target duration in seconds
 * @returns Estimated sustainable speed (m/s) for the given duration
 *
 * @example
 * const speed400m = estimateSwimSpeedForDuration(90, 300); // 5 minutes
 * // Returns: ~1.11 m/s (CSS pace)
 */
export function estimateSwimSpeedForDuration(
  cssSecondsPerHundredMeters: number,
  durationSeconds: number,
): number {
  if (cssSecondsPerHundredMeters <= 0 || durationSeconds <= 0) {
    throw new Error("CSS and duration must be greater than 0");
  }

  const cssSpeedMps = pacePerHundredMetersToSpeed(cssSecondsPerHundredMeters);

  // Determine multiplier based on duration
  let multiplier: number;

  if (durationSeconds < 60) {
    multiplier = SWIM_PACE_MULTIPLIERS.sprint;
  } else if (durationSeconds < 180) {
    multiplier = SWIM_PACE_MULTIPLIERS.middle;
  } else if (durationSeconds < 600) {
    multiplier = SWIM_PACE_MULTIPLIERS.css;
  } else {
    multiplier = SWIM_PACE_MULTIPLIERS.distance;
  }

  return Math.round(cssSpeedMps * multiplier * 100) / 100;
}

/**
 * Estimates CSS from recent swim times for specific distances.
 *
 * Uses a simplified 2-point CSS test protocol (typically 400m and 200m times).
 *
 * @param time400m - Time for 400m in seconds
 * @param time200m - Time for 200m in seconds
 * @returns Estimated CSS in seconds per 100 meters
 *
 * @example
 * const css = estimateCSSFromSwimTests(360, 168); // 6:00 for 400m, 2:48 for 200m
 * // Returns: ~90 seconds/100m (1:30/100m)
 */
export function estimateCSSFromSwimTests(
  time400m: number,
  time200m: number,
): number {
  if (time400m <= 0 || time200m <= 0) {
    throw new Error("Times must be greater than 0");
  }

  if (time400m <= time200m) {
    throw new Error("400m time should be longer than 200m time");
  }

  // CSS formula: (400 - 200) / (time400 - time200)
  // This gives speed in m/s
  const cssSpeedMps = (400 - 200) / (time400m - time200m);

  // Convert to seconds per 100m
  const cssSecondsPerHundredMeters = speedToPacePerHundredMeters(cssSpeedMps);

  return cssSecondsPerHundredMeters;
}
