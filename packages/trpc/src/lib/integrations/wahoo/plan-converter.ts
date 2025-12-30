/**
 * Wahoo Plan Converter
 * Converts GradientPeak ActivityPlanStructureV2 to Wahoo's plan.json format
 */

import type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
} from "@repo/core";
import type { ActivityType } from "./activity-type-utils";
import { isWahooSupported, toWahooTypes } from "./activity-type-utils";

export interface WahooPlanJson {
  header: {
    name: string;
    version: string;
    description?: string;
    workout_type_family: number; // 0 = bike, 1 = run
    workout_type_location: number; // 0 = indoor, 1 = outdoor
    ftp?: number;
    threshold_hr?: number;
  };
  intervals: WahooInterval[];
}

export interface WahooInterval {
  name: string;
  exit_trigger_type: "time" | "distance" | "repeat";
  exit_trigger_value: number;
  intensity_type: "wu" | "active" | "tempo" | "lt" | "cd" | "recover" | "rest";
  targets?: WahooTarget[];
  intervals?: WahooInterval[]; // For repeats
}

export interface WahooTarget {
  type: "ftp" | "watts" | "hr" | "threshold_hr" | "speed" | "rpm";
  low?: number;
  high?: number;
  value?: number;
}

export interface ConvertOptions {
  activityType: ActivityType;
  name: string;
  description?: string;
  ftp?: number;
  threshold_hr?: number;
}

/**
 * Convert GradientPeak activity plan to Wahoo plan.json format
 */
export function convertToWahooPlan(
  structure: ActivityPlanStructureV2,
  options: ConvertOptions,
): WahooPlanJson {
  const activityTypeMapping = toWahooTypes(options.activityType);

  if (!activityTypeMapping) {
    throw new Error(
      `Activity type '${options.activityType}' is not supported by Wahoo. Only cycling and running activities can be synced.`,
    );
  }

  const { workout_type_family, workout_type_location } = activityTypeMapping;

  const plan: WahooPlanJson = {
    header: {
      name: options.name,
      version: "1.0.0",
      description: options.description,
      workout_type_family,
      workout_type_location,
    },
    intervals: [],
  };

  // Add FTP and threshold HR if available (needed for percentage-based targets)
  if (options.ftp) {
    plan.header.ftp = options.ftp;
  }
  if (options.threshold_hr) {
    plan.header.threshold_hr = options.threshold_hr;
  }

  // Convert V2 intervals to Wahoo intervals
  if (structure.intervals && structure.intervals.length > 0) {
    const intervals = convertIntervals(structure.intervals);
    plan.intervals = intervals;
  }

  return plan;
}

/**
 * Convert V2 intervals to Wahoo intervals
 */
function convertIntervals(intervals: IntervalV2[]): WahooInterval[] {
  const wahooIntervals: WahooInterval[] = [];

  for (const interval of intervals) {
    const repeatCount = interval.repetitions;

    if (repeatCount > 1) {
      // This is a repetition - create a Wahoo repeat interval
      const repeatInterval: WahooInterval = {
        name: interval.name,
        exit_trigger_type: "repeat",
        exit_trigger_value: repeatCount - 1, // Wahoo repeats AFTER first execution
        intensity_type: "active",
        intervals: [],
      };

      // Add all steps in the interval as the pattern
      for (const step of interval.steps) {
        repeatInterval.intervals!.push(convertStep(step));
      }

      wahooIntervals.push(repeatInterval);
    } else {
      // Single repetition - add steps directly
      for (const step of interval.steps) {
        wahooIntervals.push(convertStep(step));
      }
    }
  }

  return wahooIntervals;
}

// Re-export from activity-type-utils for backwards compatibility
export { isWahooSupported as isActivityTypeSupportedByWahoo } from "./activity-type-utils";

/**
 * Convert a single V2 step to Wahoo interval
 */
function convertStep(step: IntervalStepV2): WahooInterval {
  const interval: WahooInterval = {
    name: step.name || "Step",
    exit_trigger_type: "time",
    exit_trigger_value: 300, // Default 5 minutes
    intensity_type: "active",
  };

  // Convert duration
  const { type, value } = convertDuration(step.duration);
  interval.exit_trigger_type = type;
  interval.exit_trigger_value = value;

  // Convert intensity type (estimate from targets)
  if (step.targets && step.targets.length > 0) {
    interval.intensity_type = inferIntensityType(step.targets[0]!);
  }

  // Convert targets (Wahoo only shows first target on device)
  if (step.targets && step.targets.length > 0) {
    interval.targets = [convertTarget(step.targets[0]!)];
  }

  return interval;
}

/**
 * Convert GradientPeak V2 duration to Wahoo format
 */
function convertDuration(duration: DurationV2): {
  type: "time" | "distance";
  value: number;
} {
  switch (duration.type) {
    case "time":
      // Already in seconds
      return { type: "time", value: duration.seconds };

    case "distance":
      // Already in meters
      return { type: "distance", value: duration.meters };

    case "repetitions":
      // Wahoo doesn't support reps as duration, use time estimate
      return { type: "time", value: duration.count * 30 }; // 30 seconds per rep

    case "untilFinished":
      return { type: "time", value: 300 }; // Default 5 minutes

    default:
      return { type: "time", value: 300 };
  }
}

/**
 * Convert GradientPeak V2 intensity target to Wahoo target
 */
function convertTarget(target: IntensityTargetV2): WahooTarget {
  switch (target.type) {
    case "%FTP": {
      // Convert percentage to decimal (e.g., 85% -> 0.85)
      const value = target.intensity / 100;
      return {
        type: "ftp",
        low: value * 0.95, // 5% tolerance
        high: value * 1.05,
      };
    }

    case "watts": {
      return {
        type: "watts",
        low: target.intensity * 0.95,
        high: target.intensity * 1.05,
      };
    }

    case "bpm": {
      return {
        type: "hr",
        value: target.intensity,
      };
    }

    case "%ThresholdHR": {
      // Convert percentage to decimal
      const value = target.intensity / 100;
      return {
        type: "threshold_hr",
        low: value * 0.95,
        high: value * 1.05,
      };
    }

    case "%MaxHR": {
      // Wahoo doesn't have MaxHR type, use absolute HR
      // This would need the actual max HR value from profile
      return {
        type: "hr",
        value: target.intensity, // Placeholder, needs profile.max_hr
      };
    }

    case "speed": {
      // Convert km/h to m/s for Wahoo
      const metersPerSecond = target.intensity / 3.6;
      return {
        type: "speed",
        low: metersPerSecond * 0.95,
        high: metersPerSecond * 1.05,
      };
    }

    case "cadence": {
      return {
        type: "rpm",
        low: target.intensity * 0.95,
        high: target.intensity * 1.05,
      };
    }

    case "RPE": {
      // Wahoo doesn't support RPE, estimate as FTP percentage
      // RPE 1-10 roughly maps to 50-100% FTP
      const ftpPercent = (target.intensity / 10) * 0.5 + 0.5;
      return {
        type: "ftp",
        low: ftpPercent * 0.95,
        high: ftpPercent * 1.05,
      };
    }

    default:
      // Fallback to moderate intensity
      return {
        type: "ftp",
        low: 0.65,
        high: 0.75,
      };
  }
}

/**
 * Infer Wahoo intensity type from target intensity
 */
function inferIntensityType(
  target: IntensityTargetV2,
): WahooInterval["intensity_type"] {
  switch (target.type) {
    case "%FTP":
    case "watts": {
      const intensity =
        target.type === "%FTP" ? target.intensity : target.intensity;

      if (intensity < 60) return "recover";
      if (intensity < 75) return "active";
      if (intensity < 90) return "tempo";
      if (intensity >= 90) return "lt";
      return "active";
    }

    case "RPE": {
      if (target.intensity <= 3) return "recover";
      if (target.intensity <= 5) return "active";
      if (target.intensity <= 7) return "tempo";
      return "lt";
    }

    default:
      return "active";
  }
}

/**
 * Validate that the plan structure is compatible with Wahoo
 * Note: This assumes activity type has already been validated with isActivityTypeSupportedByWahoo
 */
export function validateWahooCompatibility(
  structure: ActivityPlanStructureV2,
): {
  compatible: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check if structure is empty (no intervals)
  if (!structure.intervals || structure.intervals.length === 0) {
    warnings.push(
      "Workout has no intervals. Wahoo requires at least one interval.",
    );
    return { compatible: false, warnings };
  }

  // Calculate total steps (expand intervals × repetitions)
  let totalSteps = 0;
  for (const interval of structure.intervals) {
    totalSteps += interval.steps.length * interval.repetitions;
  }

  if (totalSteps > 100) {
    warnings.push(
      `Workout has ${totalSteps} steps. Wahoo may have issues with very long workouts.`,
    );
  }

  // Check for features Wahoo doesn't support well
  for (const interval of structure.intervals) {
    for (const step of interval.steps) {
      // Multiple targets
      if (step.targets && step.targets.length > 1) {
        warnings.push(
          `Step "${step.name}" has multiple targets. Wahoo devices only show the first target.`,
        );
      }

      // RPE targets
      if (step.targets?.some((t: IntensityTargetV2) => t.type === "RPE")) {
        warnings.push(
          `Step "${step.name}" uses RPE targets. These will be converted to approximate FTP percentages.`,
        );
      }

      // Repetition-based duration
      if (step.duration.type === "repetitions") {
        warnings.push(
          `Step "${step.name}" uses repetitions as duration. This will be converted to time estimate.`,
        );
      }
    }
  }

  return {
    compatible: warnings.length === 0 || totalSteps <= 100,
    warnings,
  };
}
