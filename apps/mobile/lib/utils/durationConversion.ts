/**
 * Activity-plan duration conversion utilities.
 *
 * Non-time completion policies intentionally do not invent elapsed time.
 */

import type { ActivityPlanDuration } from "@repo/core";
import { formatDurationCompact as formatDurationCore, getExactDurationSeconds } from "@repo/core";

// ==============================
// UI -> activity-plan duration
// ==============================

export interface DurationUIInput {
  type: "time" | "distance" | "repetitions" | "untilFinished";
  value: number;
  unit: "seconds" | "minutes" | "hours" | "meters" | "km" | "reps";
}

/**
 * Convert UI duration input to the current activity-plan duration contract.
 */
export function convertUIToActivityPlanDuration(input: DurationUIInput): ActivityPlanDuration {
  switch (input.type) {
    case "time": {
      let seconds = input.value;
      if (input.unit === "minutes") {
        seconds = input.value * 60;
      } else if (input.unit === "hours") {
        seconds = input.value * 3600;
      }
      return { type: "time", seconds: Math.round(seconds) };
    }

    case "distance": {
      let meters = input.value;
      if (input.unit === "km") {
        meters = input.value * 1000;
      }
      return { type: "distance", meters: Math.round(meters) };
    }

    case "repetitions":
      return { type: "repetitions", count: Math.round(input.value) };

    case "untilFinished":
      return { type: "untilFinished" };

    default:
      throw new Error(`Unknown duration type: ${input.type}`);
  }
}

// ==============================
// Activity-plan duration -> UI
// ==============================

export interface DurationUIOutput {
  type: "time" | "distance" | "repetitions" | "untilFinished";
  value: number;
  unit: "seconds" | "minutes" | "hours" | "meters" | "km" | "reps";
  displayValue: string;
}

/**
 * Convert an activity-plan duration to UI representation.
 * Automatically selects the most appropriate unit for display
 */
export function convertActivityPlanDurationToUI(duration: ActivityPlanDuration): DurationUIOutput {
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
          displayValue: formatDurationCore(seconds),
        };
      }

      // Use minutes for durations >= 60 seconds
      if (seconds >= 60) {
        const minutes = seconds / 60;
        return {
          type: "time",
          value: minutes,
          unit: "minutes",
          displayValue: formatDurationCore(seconds),
        };
      }

      // Use seconds for short durations
      return {
        type: "time",
        value: seconds,
        unit: "seconds",
        displayValue: formatDurationCore(seconds),
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
      throw new Error(`Unknown duration type: ${String((duration as { type?: unknown }).type)}`);
  }
}

// ==============================
// Duration Calculations
// ==============================

/**
 * Get duration in milliseconds for time calculations
 * Returns estimated duration for distance/reps
 */
export function getDurationMs(duration: ActivityPlanDuration): number {
  return (getExactDurationSeconds(duration) ?? 0) * 1000;
}

// ==============================
// Formatting
// ==============================

/**
 * Format duration in a short form (e.g., "5m", "10km", "20 reps")
 */
export function formatDurationShort(duration: ActivityPlanDuration): string {
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
