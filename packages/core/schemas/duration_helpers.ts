import type { DurationV2 } from "./activity_plan_v2";

// ==============================
// DURATION HELPER UTILITIES V2
// ==============================

/**
 * Format duration for display
 */
export function formatDuration(duration: DurationV2): string {
  switch (duration.type) {
    case "time":
      if (duration.seconds < 60) {
        return `${duration.seconds}s`;
      } else if (duration.seconds < 3600) {
        const minutes = Math.floor(duration.seconds / 60);
        const seconds = duration.seconds % 60;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
      } else {
        const hours = Math.floor(duration.seconds / 3600);
        const minutes = Math.floor((duration.seconds % 3600) / 60);
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }

    case "distance":
      if (duration.meters < 1000) {
        return `${duration.meters}m`;
      } else {
        const km = (duration.meters / 1000).toFixed(2);
        return `${km}km`;
      }

    case "repetitions":
      return `${duration.count} reps`;

    case "untilFinished":
      return "Until finished";
  }
}

/**
 * Get duration in seconds (estimate for distance/reps)
 * Returns 0 for untilFinished
 */
export function getDurationSeconds(
  duration: DurationV2,
  options?: {
    paceSecondsPerKm?: number; // For distance estimation
    secondsPerRep?: number; // For rep estimation
  },
): number {
  switch (duration.type) {
    case "time":
      return duration.seconds;

    case "distance":
      // Estimate based on pace (default: 5 min/km = 300 sec/km)
      const paceSecondsPerKm = options?.paceSecondsPerKm || 300;
      const km = duration.meters / 1000;
      return Math.round(km * paceSecondsPerKm);

    case "repetitions":
      // Estimate based on seconds per rep (default: 30 seconds)
      const secondsPerRep = options?.secondsPerRep || 30;
      return duration.count * secondsPerRep;

    case "untilFinished":
      return 0;
  }
}

/**
 * Calculate total duration for all steps
 */
export function calculateTotalDurationV2(
  steps: Array<{ duration: DurationV2 }>,
  options?: {
    paceSecondsPerKm?: number;
    secondsPerRep?: number;
  },
): number {
  return steps.reduce((total, step) => {
    return total + getDurationSeconds(step.duration, options);
  }, 0);
}

/**
 * Duration builder helpers for fluent API
 */
export const Duration = {
  seconds: (seconds: number): DurationV2 => ({ type: "time", seconds }),
  minutes: (minutes: number): DurationV2 => ({ type: "time", seconds: minutes * 60 }),
  hours: (hours: number): DurationV2 => ({ type: "time", seconds: hours * 3600 }),
  meters: (meters: number): DurationV2 => ({ type: "distance", meters }),
  km: (km: number): DurationV2 => ({ type: "distance", meters: Math.round(km * 1000) }),
  reps: (count: number): DurationV2 => ({ type: "repetitions", count }),
  untilFinished: (): DurationV2 => ({ type: "untilFinished" }),
};
