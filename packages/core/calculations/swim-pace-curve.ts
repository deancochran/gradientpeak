/**
 * Swim Pace Curve Derivation
 *
 * Represents the locally supported 400m/200m CSS protocol without fabricating
 * a broader swimming performance curve.
 */

import { z } from "zod";
import { classifyActivityEffortPlausibility } from "../athlete-inputs/activity-effort-policy";

export const CSS_TEST_PROTOCOL = "css_400m_200m" as const;
export const CSS_CALCULATION_VERSION = "critical-swim-speed-400m-200m-v1" as const;
const CSS_SECONDS_PER_HUNDRED_METERS_BOUNDS = { min: 45, max: 600 } as const;

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
    const bounds = CSS_SECONDS_PER_HUNDRED_METERS_BOUNDS;
    if (cssSecondsPer100m < bounds.min || cssSecondsPer100m > bounds.max) {
      ctx.addIssue({
        code: "custom",
        message: "Calculated CSS is outside accepted model bounds",
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
export type CssTestObservationInput = CssTestProtocolInput & { recordedAt: Date };

export interface CssTestProtocolResult {
  cssSecondsPer100m: number;
  efforts: readonly [
    { distanceMeters: 400; durationSeconds: number; speedMetersPerSecond: number },
    { distanceMeters: 200; durationSeconds: number; speedMetersPerSecond: number },
  ];
}

export type CssCalculationResult =
  | {
      status: "available";
      calculationVersion: typeof CSS_CALCULATION_VERSION;
      protocol: typeof CSS_TEST_PROTOCOL;
      cssSecondsPer100m: number;
      cssMetersPerSecond: number;
      efforts: CssTestProtocolResult["efforts"];
    }
  | {
      status: "unavailable";
      calculationVersion: typeof CSS_CALCULATION_VERSION;
      protocol: typeof CSS_TEST_PROTOCOL;
      cssSecondsPer100m: null;
      cssMetersPerSecond: null;
      efforts: null;
      reason: "invalid_protocol";
    };

function calculateValidatedCss(input: CssTestTimesInput): CssTestProtocolResult {
  return {
    cssSecondsPer100m: (input.time400Seconds - input.time200Seconds) / 2,
    efforts: [
      {
        distanceMeters: 400,
        durationSeconds: input.time400Seconds,
        speedMetersPerSecond: 400 / input.time400Seconds,
      },
      {
        distanceMeters: 200,
        durationSeconds: input.time200Seconds,
        speedMetersPerSecond: 200 / input.time200Seconds,
      },
    ],
  };
}

/** Returns explicit availability for untrusted or incomplete CSS protocol input. */
export function evaluateCssFrom400m200mTest(input: unknown): CssCalculationResult {
  const parsed = cssTestTimesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "unavailable",
      calculationVersion: CSS_CALCULATION_VERSION,
      protocol: CSS_TEST_PROTOCOL,
      cssSecondsPer100m: null,
      cssMetersPerSecond: null,
      efforts: null,
      reason: "invalid_protocol",
    };
  }
  const calculated = calculateValidatedCss(parsed.data);
  return {
    status: "available",
    calculationVersion: CSS_CALCULATION_VERSION,
    protocol: CSS_TEST_PROTOCOL,
    cssSecondsPer100m: calculated.cssSecondsPer100m,
    cssMetersPerSecond: 100 / calculated.cssSecondsPer100m,
    efforts: calculated.efforts,
  };
}

/** Validates and calculates the standard 400m/200m CSS test as one protocol result. */
export function calculateCssFrom400m200mTest(input: CssTestTimesInput): CssTestProtocolResult {
  return calculateValidatedCss(cssTestTimesSchema.parse(input));
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
