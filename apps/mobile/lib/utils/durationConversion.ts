import type { DurationV2 } from "@repo/core/schemas/activity_plan_v2";

/**
 * V2 Duration Conversion Utilities
 *
 * These utilities help convert between V2 duration format and UI representations.
 * V2 uses a flat structure with type-specific fields:
 * - time: { type: "time", seconds: number }
 * - distance: { type: "distance", meters: number }
 * - repetitions: { type: "repetitions", count: number }
 * - untilFinished: { type: "untilFinished" }
 */

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
  switch (duration.type) {
    case "time":
      return duration.seconds * 1000;

    case "distance":
      // Estimate based on 5 min/km pace
      return (duration.meters / 1000) * 5 * 60 * 1000;

    case "repetitions":
      // Estimate 30 seconds per rep
      return duration.count * 30 * 1000;

    case "untilFinished":
      return 0;

    default:
      return 0;
  }
}

/**
 * Get duration in seconds (for time-based durations only)
 */
export function getDurationSeconds(duration: DurationV2): number {
  if (duration.type === "time") {
    return duration.seconds;
  }
  return Math.round(getDurationMs(duration) / 1000);
}

// ==============================
// Formatting
// ==============================

/**
 * Format duration for display
 */
export function formatDuration(duration: DurationV2): string {
  switch (duration.type) {
    case "time": {
      const seconds = duration.seconds;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      }
      if (minutes > 0) {
        return `${minutes}:${secs.toString().padStart(2, "0")}`;
      }
      return `${secs}s`;
    }

    case "distance": {
      const meters = duration.meters;
      if (meters >= 1000) {
        return `${(meters / 1000).toFixed(2)} km`;
      }
      return `${meters} m`;
    }

    case "repetitions":
      return `${duration.count} reps`;

    case "untilFinished":
      return "Until Finished";

    default:
      return "Unknown";
  }
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
 */
export function calculateTotalDurationMs(durations: DurationV2[]): number {
  return durations.reduce((total, duration) => {
    return total + getDurationMs(duration);
  }, 0);
}
