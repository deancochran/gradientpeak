/**
 * Swim Pace Curve Derivation
 *
 * Represents CSS without fabricating a full swimming performance curve.
 *
 * CSS is typically the pace sustainable for approximately 30 minutes (1500-2000m).
 * Similar to threshold pace in running, but with different physiological demands
 * due to horizontal body position and cooling effect of water.
 *
 */

import { z } from "zod";
import { classifyActivityEffortPlausibility } from "../athlete-inputs/activity-effort-policy";
import { PROFILE_PERFORMANCE_THRESHOLD_BOUNDS } from "../athlete-inputs/profile-metrics";
import type { DerivedEffort } from "./power-curve";

export const CSS_TEST_PROTOCOL = "css_400m_200m" as const;

export const cssTestTimesSchema = z
  .object({
    time400Seconds: z.number().int().positive().max(14_400),
    time200Seconds: z.number().int().positive().max(14_400),
  })
  .superRefine((input, ctx) => {
    if (input.time400Seconds <= 2 * input.time200Seconds) {
      ctx.addIssue({
        code: "custom",
        message: "400m time must be greater than twice the 200m time",
        path: ["time400Seconds"],
      });
      return;
    }

    const efforts = [
      { distanceMeters: 400, durationSeconds: input.time400Seconds },
      { distanceMeters: 200, durationSeconds: input.time200Seconds },
    ] as const;
    for (const effort of efforts) {
      const plausibility = classifyActivityEffortPlausibility({
        activityCategory: "swim",
        effortType: "speed",
        durationSeconds: effort.durationSeconds,
        value: effort.distanceMeters / effort.durationSeconds,
      });
      if (plausibility.classification !== "plausible") {
        ctx.addIssue({
          code: "custom",
          message: `${effort.distanceMeters}m effort is outside accepted plausibility bounds`,
          path: [effort.distanceMeters === 400 ? "time400Seconds" : "time200Seconds"],
        });
      }
    }

    const cssSecondsPer100m = (input.time400Seconds - input.time200Seconds) / 2;
    const bounds = PROFILE_PERFORMANCE_THRESHOLD_BOUNDS.swimCssSecondsPerHundredMeters;
    if (cssSecondsPer100m < bounds.min || cssSecondsPer100m > bounds.max) {
      ctx.addIssue({
        code: "custom",
        message: "Calculated CSS is outside accepted profile bounds",
        path: ["time400Seconds"],
      });
    }
  });

export const cssTestProtocolSchema = z.intersection(
  cssTestTimesSchema,
  z.object({ operationId: z.string().uuid() }),
);

export type CssTestTimesInput = z.infer<typeof cssTestTimesSchema>;
export type CssTestProtocolInput = z.infer<typeof cssTestProtocolSchema>;

export interface CssTestProtocolResult {
  cssSecondsPer100m: number;
  efforts: readonly [
    { distanceMeters: 400; durationSeconds: number; speedMetersPerSecond: number },
    { distanceMeters: 200; durationSeconds: number; speedMetersPerSecond: number },
  ];
}

/** Validates and calculates the standard 400m/200m CSS test as one protocol result. */
export function calculateCssFrom400m200mTest(input: CssTestTimesInput): CssTestProtocolResult {
  const parsed = cssTestTimesSchema.parse(input);
  return {
    cssSecondsPer100m: (parsed.time400Seconds - parsed.time200Seconds) / 2,
    efforts: [
      {
        distanceMeters: 400,
        durationSeconds: parsed.time400Seconds,
        speedMetersPerSecond: 400 / parsed.time400Seconds,
      },
      {
        distanceMeters: 200,
        durationSeconds: parsed.time200Seconds,
        speedMetersPerSecond: 200 / parsed.time200Seconds,
      },
    ],
  };
}

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
 * Returns one 30-minute CSS anchor. A single CSS input does not establish
 * sprint, middle-distance, or longer-distance performance.
 *
 * @param cssSecondsPerHundredMeters - CSS in seconds per 100 meters (pace sustainable for ~30 min)
 * @returns A single CSS speed anchor
 *
 * @example
 * const css = 90; // 1:30/100m
 * const swimCurve = deriveSwimPaceCurveFromCSS(css);
 * // Returns: [{ duration_seconds: 1800, value: 1.11, ... }]
 */
export function deriveSwimPaceCurveFromCSS(cssSecondsPerHundredMeters: number): DerivedEffort[] {
  // Validate input
  if (!Number.isFinite(cssSecondsPerHundredMeters) || cssSecondsPerHundredMeters <= 0) {
    throw new Error("CSS must be greater than 0");
  }

  const bounds = PROFILE_PERFORMANCE_THRESHOLD_BOUNDS.swimCssSecondsPerHundredMeters;
  if (cssSecondsPerHundredMeters < bounds.min || cssSecondsPerHundredMeters > bounds.max) {
    throw new Error("CSS is outside the accepted profile bounds");
  }

  // Convert CSS (seconds per 100m) to speed (m/s)
  const cssSpeedMps = pacePerHundredMetersToSpeed(cssSecondsPerHundredMeters);

  return [
    {
      duration_seconds: 1_800,
      effort_type: "speed",
      value: Math.round(cssSpeedMps * 100) / 100,
      unit: "meters_per_second",
      activity_category: "swim",
    },
  ];
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
export function pacePerHundredMetersToSpeed(secondsPerHundredMeters: number): number {
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

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds < 0 || seconds >= 60) {
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
export function estimateCSSFromSwimTests(time400m: number, time200m: number): number {
  return calculateCssFrom400m200mTest({
    time400Seconds: time400m,
    time200Seconds: time200m,
  }).cssSecondsPer100m;
}
