/**
 * V2 Duration Conversion Utilities
 *
 * This file re-exports duration utilities from @repo/core
 * Use the core package directly for new code: import { formatDurationV2, getDurationSecondsV2 } from "@repo/core"
 *
 * @deprecated Import from @repo/core instead
 */

import {
  calculateTotalDurationV2,
  formatDurationV2 as formatDurationCore,
  getDurationSecondsV2 as getDurationSecondsCore,
} from "@repo/core";
import type { DurationV2 } from "@repo/core/schemas/activity_plan_v2";

// ==============================
// UI -> V2 Conversion
// ==============================

export interface DurationUIInput {
  type: "time" | "distance" | "repetitions" | "untilFinished";
  value: number;
  unit: "seconds" | "minutes" | "hours" | "meters" | "km" | "reps";
}

/**
 * Convert UI duration input to V2 format
 */
export function convertUIToV2Duration(input: DurationUIInput): DurationV2 {
  switch (input.type) {
    case "time":
      let seconds = input.value;
      if (input.unit === "minutes") {
        seconds = input.value * 60;
      } else if (input.unit === "hours") {
        seconds = input.value * 3600;
      }
      return { type: "time", seconds: Math.round(seconds) };

    case "distance":
      let meters = input.value;
      if (input.unit === "km") {
        meters = input.value * 1000;
      }
      return { type: "distance", meters: Math.round(meters) };

    case "repetitions":
      return { type: "repetitions", count: Math.round(input.value) };

    case "untilFinished":
      return { type: "untilFinished" };

    default:
      throw new Error(`Unknown duration type: ${input.type}`);
  }
}

// ==============================
// V2 -> UI Conversion
// ==============================

export interface DurationUIOutput {
  type: "time" | "distance" | "repetitions" | "untilFinished";
  value: number;
  unit: "seconds" | "minutes" | "hours" | "meters" | "km" | "reps";
  displayValue: string;
}

/**
 * Convert V2 duration to UI representation
 * Automatically selects the most appropriate unit for display
 */
export function convertV2ToUIFormat(duration: DurationV2): DurationUIOutput {
  switch (duration.type) {
    case "time": {
      const seconds = duration.seconds;

      // Use hours for durations >= 1 hour
      if (seconds >= 3600) {
        const hours = seconds / 3600;
        return {
          type: "time",
          value: hours,
          unit: "hours",
          displayValue: formatDuration({ type: "time", seconds }),
        };
      }

      // Use minutes for durations >= 60 seconds
      if (seconds >= 60) {
        const minutes = seconds / 60;
        return {
          type: "time",
          value: minutes,
          unit: "minutes",
          displayValue: formatDuration({ type: "time", seconds }),
        };
      }

      // Use seconds for short durations
      return {
        type: "time",
        value: seconds,
        unit: "seconds",
        displayValue: formatDuration({ type: "time", seconds }),
      };
    }

    case "distance": {
      const meters = duration.meters;

      // Use km for distances >= 1000m
      if (meters >= 1000) {
        const km = meters / 1000;
        return {
          type: "distance",
          value: km,
          unit: "km",
          displayValue: `${km.toFixed(2)} km`,
        };
      }

      // Use meters for short distances
      return {
        type: "distance",
        value: meters,
        unit: "meters",
        displayValue: `${meters} m`,
      };
    }

    case "repetitions":
      return {
        type: "repetitions",
        value: duration.count,
        unit: "reps",
        displayValue: `${duration.count} reps`,
      };

    case "untilFinished":
      return {
        type: "untilFinished",
        value: 0,
        unit: "seconds",
        displayValue: "Until Finished",
      };

    default:
      throw new Error(`Unknown duration type: ${(duration as any).type}`);
  }
}

// ==============================
// Duration Calculations
// ==============================

/**
 * Get duration in milliseconds for time calculations
 * Returns estimated duration for distance/reps
 */
export function getDurationMs(duration: DurationV2): number {
  return getDurationSecondsCore(duration) * 1000;
}

/**
 * Get duration in seconds (for time-based durations only)
 * @deprecated Use getDurationSecondsV2 from @repo/core instead
 */
export function getDurationSeconds(duration: DurationV2): number {
  return getDurationSecondsCore(duration);
}

// ==============================
// Formatting
// ==============================

/**
 * Format duration for display
 * @deprecated Use formatDurationV2 from @repo/core instead
 */
export function formatDuration(duration: DurationV2): string {
  return formatDurationCore(duration);
}

/**
 * Format duration in a short form (e.g., "5m", "10km", "20 reps")
 */
export function formatDurationShort(duration: DurationV2): string {
  switch (duration.type) {
    case "time": {
      const seconds = duration.seconds;
      if (seconds >= 3600) {
        const hours = seconds / 3600;
        return `${hours.toFixed(1)}h`;
      }
      if (seconds >= 60) {
        const minutes = seconds / 60;
        return `${minutes.toFixed(0)}m`;
      }
      return `${seconds}s`;
    }

    case "distance": {
      const meters = duration.meters;
      if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)}km`;
      }
      return `${meters}m`;
    }

    case "repetitions":
      return `${duration.count}x`;

    case "untilFinished":
      return "∞";

    default:
      return "?";
  }
}

/**
 * Calculate total duration from multiple steps
 * @deprecated Use calculateTotalDurationV2 from @repo/core instead
 */
export function calculateTotalDurationMs(durations: DurationV2[]): number {
  const steps = durations.map((duration) => ({ duration }));
  return calculateTotalDurationV2(steps) * 1000;
}
