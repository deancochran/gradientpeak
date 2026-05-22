/**
 * Wahoo Plan Converter
 * Converts GradientPeak ActivityPlanStructureV2 to Wahoo's plan.json format
 */

import type {
  ActivityPlanStructureV2,
  ActivityTargetCategory,
  DurationV2,
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
} from "@repo/core";
import { isTargetTypePermittedForActivity, sortTargetsByActivityPreference } from "@repo/core";
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
    max_hr?: number;
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
  type: "ftp" | "watts" | "hr" | "threshold_hr" | "max_hr" | "speed" | "rpm";
  low?: number;
  high?: number;
  value?: number;
}

export type WahooPlanContractValidation = {
  errors: string[];
  valid: boolean;
};

export interface ConvertOptions {
  activityType: ActivityType;
  hasRoute?: boolean;
  name: string;
  description?: string;
  ftp?: number;
  max_hr?: number;
  threshold_hr?: number;
}

/**
 * Calculate total workout duration in seconds from structure
 */
export function calculateWorkoutDuration(structure: ActivityPlanStructureV2): number {
  if (!structure.intervals || structure.intervals.length === 0) {
    return 0;
  }

  let totalSeconds = 0;

  for (const interval of structure.intervals) {
    const intervalDuration = calculateIntervalDuration(interval);
    totalSeconds += intervalDuration * interval.repetitions;
  }

  return totalSeconds;
}

/**
 * Calculate duration of a single interval in seconds
 */
function calculateIntervalDuration(interval: IntervalV2): number {
  let seconds = 0;

  for (const step of interval.steps) {
    seconds += parseDuration(step.duration);
  }

  return seconds;
}

/**
 * Parse duration to seconds
 */
function parseDuration(duration: DurationV2): number {
  if (duration.type === "time") {
    return duration.seconds;
  } else if (duration.type === "distance") {
    // For distance-based steps, estimate ~4 seconds per 100m (reasonable pace)
    // This is a rough estimate - ideally we'd use pace/speed from user profile
    return Math.ceil((duration.meters / 100) * 4);
  } else if (duration.type === "untilFinished") {
    // Open-ended steps, estimate 60 seconds as fallback
    return 60;
  } else if (duration.type === "repetitions") {
    // Repetitions should be expanded before reaching here, but estimate 10 seconds per rep
    return duration.count * 10;
  }
  return 0;
}

/**
 * Convert GradientPeak activity plan to Wahoo plan.json format
 */
export function convertToWahooPlan(
  structure: ActivityPlanStructureV2,
  options: ConvertOptions,
): WahooPlanJson {
  const activityTypeMapping = toWahooTypes(options.activityType, {
    hasRoute: options.hasRoute,
  });

  if (!activityTypeMapping) {
    throw new Error(
      `Activity type '${options.activityType}' is not supported by Wahoo. Only cycling and running activities can be synced.`,
    );
  }

  const { workout_type_family, workout_type_location } = activityTypeMapping;
  const requiresFtpHeader = Boolean(
    structure.intervals?.some((interval) =>
      interval.steps.some((step) =>
        step.targets?.some(
          (target) =>
            options.activityType !== "run" && (target.type === "%FTP" || target.type === "RPE"),
        ),
      ),
    ),
  );
  const requiresMaxHrHeader = Boolean(
    options.max_hr &&
      structure.intervals?.some((interval) =>
        interval.steps.some((step) =>
          step.targets?.some(
            (target) =>
              target.type === "%MaxHR" ||
              (options.activityType === "run" &&
                target.type === "%ThresholdHR" &&
                !options.threshold_hr) ||
              (options.activityType === "run" && target.type === "RPE"),
          ),
        ),
      ),
  );

  const plan: WahooPlanJson = {
    header: {
      name: options.name,
      version: "1.0.0",
      description: options.description ?? "",
      workout_type_family,
      workout_type_location,
    },
    intervals: [],
  };

  // Add FTP and threshold HR if available (needed for percentage-based targets)
  if (options.ftp || requiresFtpHeader) {
    plan.header.ftp = options.ftp ?? 1;
  }
  if (options.max_hr && requiresMaxHrHeader) {
    plan.header.max_hr = options.max_hr;
  }
  if (options.threshold_hr) {
    plan.header.threshold_hr = options.threshold_hr;
  }

  // Convert V2 intervals to Wahoo intervals
  if (structure.intervals && structure.intervals.length > 0) {
    const intervals = convertIntervals(structure.intervals, options);
    plan.intervals = intervals;
  }

  assertValidWahooPlan(plan);

  return plan;
}

/**
 * Convert V2 intervals to Wahoo intervals
 */
function convertIntervals(intervals: IntervalV2[], options: ConvertOptions): WahooInterval[] {
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
        repeatInterval.intervals!.push(convertStep(step, options));
      }

      wahooIntervals.push(repeatInterval);
    } else {
      // Single repetition - add steps directly
      for (const step of interval.steps) {
        wahooIntervals.push(convertStep(step, options));
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
function convertStep(step: IntervalStepV2, options: ConvertOptions): WahooInterval {
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
  const target = selectWahooTarget(step.targets ?? [], options);

  if (target) {
    interval.intensity_type = inferIntensityType(target);
  }

  // Convert targets (Wahoo only shows first target on device)
  interval.targets = [
    target ? convertTarget(target, options) : getDefaultTarget(options.activityType),
  ];

  return interval;
}

function getDefaultTarget(activityType: ActivityType): WahooTarget {
  if (activityType === "run") {
    return { type: "speed", low: 0.5, high: 8 };
  }

  return { type: "watts", low: 1, high: 2_000 };
}

function canConvertTarget(target: IntensityTargetV2, options: ConvertOptions): boolean {
  if (
    !isTargetTypePermittedForActivity({
      activityCategory: options.activityType as ActivityTargetCategory,
      targetType: target.type,
    })
  ) {
    return false;
  }

  if (target.type === "%ThresholdHR" && !options.threshold_hr) {
    return options.activityType === "run" && Boolean(options.max_hr);
  }
  if (target.type === "%MaxHR" && !options.max_hr) return false;

  if (options.activityType === "run" && (target.type === "%FTP" || target.type === "RPE")) {
    return Boolean(options.max_hr);
  }

  return true;
}

function getTargetPriority(target: IntensityTargetV2, options: ConvertOptions): number {
  if (options.activityType === "run") {
    if (target.type === "speed") return 0;
    if (target.type === "bpm") return 1;
    if (target.type === "%ThresholdHR" || target.type === "%MaxHR") return 2;
    if (target.type === "%FTP" || target.type === "RPE") return 3;
    if (target.type === "watts") return 4;
    if (target.type === "cadence") return 4;
  }

  return 3;
}

function selectWahooTarget(
  targets: IntensityTargetV2[],
  options: ConvertOptions,
): IntensityTargetV2 | null {
  const supportedTargets = targets.filter((target) => canConvertTarget(target, options));
  if (supportedTargets.length === 0) return null;

  return sortTargetsByActivityPreference({
    activityCategory: options.activityType as ActivityTargetCategory,
    targets: supportedTargets,
  }).sort(
    (left, right) => getTargetPriority(left, options) - getTargetPriority(right, options),
  )[0]!;
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
function convertTarget(target: IntensityTargetV2, options: ConvertOptions): WahooTarget {
  switch (target.type) {
    case "%FTP": {
      if (options.activityType === "run" && options.max_hr) {
        return relativeMaxHrTarget(target.intensity / 100);
      }

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
        low: Math.max(1, target.intensity - 5),
        high: target.intensity + 5,
      };
    }

    case "%ThresholdHR": {
      // Convert percentage to decimal
      const value = target.intensity / 100;
      if (options.activityType === "run" && !options.threshold_hr && options.max_hr) {
        return relativeMaxHrTarget(value);
      }

      return {
        type: "threshold_hr",
        low: value * 0.95,
        high: value * 1.05,
      };
    }

    case "%MaxHR": {
      return relativeMaxHrTarget(target.intensity / 100);
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
      // Wahoo doesn't support RPE; estimate as a relative intensity target.
      const relativeIntensity = (target.intensity / 10) * 0.5 + 0.5;
      if (options.activityType === "run" && options.max_hr) {
        return relativeMaxHrTarget(relativeIntensity);
      }

      return {
        type: "ftp",
        low: relativeIntensity * 0.95,
        high: relativeIntensity * 1.05,
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

function relativeMaxHrTarget(value: number): WahooTarget {
  return {
    type: "max_hr",
    low: value * 0.95,
    high: value * 1.05,
  };
}

/**
 * Infer Wahoo intensity type from target intensity
 */
function inferIntensityType(target: IntensityTargetV2): WahooInterval["intensity_type"] {
  switch (target.type) {
    case "%FTP":
    case "watts": {
      const intensity = target.type === "%FTP" ? target.intensity : target.intensity;

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
export function validateWahooCompatibility(structure: ActivityPlanStructureV2): {
  compatible: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check if structure is empty (no intervals)
  if (!structure.intervals || structure.intervals.length === 0) {
    warnings.push("Workout has no intervals. Wahoo requires at least one interval.");
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

export function validateWahooPlanContract(plan: WahooPlanJson): WahooPlanContractValidation {
  const errors: string[] = [];

  if (!plan.header.name) errors.push("header.name is required");
  if (!plan.header.version) errors.push("header.version is required");
  if (plan.header.description === undefined) errors.push("header.description is required");
  if (typeof plan.header.workout_type_family !== "number") {
    errors.push("header.workout_type_family is required");
  }
  if (typeof plan.header.workout_type_location !== "number") {
    errors.push("header.workout_type_location is required");
  }
  if (!Array.isArray(plan.intervals) || plan.intervals.length === 0) {
    errors.push("intervals must contain at least one interval");
  }

  validateWahooIntervals(
    plan.intervals,
    errors,
    "intervals",
    Boolean(plan.header.ftp),
    Boolean(plan.header.max_hr),
  );

  return { valid: errors.length === 0, errors };
}

export function assertValidWahooPlan(plan: WahooPlanJson): void {
  const validation = validateWahooPlanContract(plan);
  if (!validation.valid) {
    throw new Error(`Invalid Wahoo plan contract: ${validation.errors.join("; ")}`);
  }
}

function validateWahooIntervals(
  intervals: WahooInterval[],
  errors: string[],
  path: string,
  hasFtpHeader: boolean,
  hasMaxHrHeader: boolean,
) {
  intervals.forEach((interval, index) => {
    const intervalPath = `${path}[${index}]`;
    if (!interval.name) errors.push(`${intervalPath}.name is required`);
    if (!interval.exit_trigger_type) errors.push(`${intervalPath}.exit_trigger_type is required`);
    if (!Number.isFinite(interval.exit_trigger_value)) {
      errors.push(`${intervalPath}.exit_trigger_value must be a finite number`);
    }

    if (interval.exit_trigger_type === "repeat") {
      if (!Array.isArray(interval.intervals) || interval.intervals.length === 0) {
        errors.push(`${intervalPath}.intervals must contain repeated intervals`);
      } else {
        validateWahooIntervals(
          interval.intervals,
          errors,
          `${intervalPath}.intervals`,
          hasFtpHeader,
          hasMaxHrHeader,
        );
      }
      return;
    }

    if (!Array.isArray(interval.targets) || interval.targets.length === 0) {
      errors.push(`${intervalPath}.targets must contain at least one target`);
      return;
    }

    interval.targets.forEach((target, targetIndex) => {
      const targetPath = `${intervalPath}.targets[${targetIndex}]`;
      if (target.type === "hr" && target.value !== undefined) {
        errors.push(`${targetPath}.value is not allowed for hr targets`);
      }
      if (target.type === "ftp" && !hasFtpHeader) {
        errors.push(`${targetPath} requires header.ftp`);
      }
      if (target.type === "max_hr" && !hasMaxHrHeader) {
        errors.push(`${targetPath} requires header.max_hr`);
      }
      if (target.value === undefined) {
        if (!Number.isFinite(target.low) || !Number.isFinite(target.high)) {
          errors.push(`${targetPath} must define finite low and high values`);
        }
      }
    });
  });
}
