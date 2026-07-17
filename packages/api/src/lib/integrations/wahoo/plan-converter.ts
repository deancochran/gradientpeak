/**
 * Wahoo Plan Converter
 * Converts compiled GradientPeak ActivityPlan V3 semantics to Wahoo's plan.json format
 */

import type {
  ActivityPlanDuration,
  ActivityPlanProviderProjection,
  ActivityPlanStructureV3,
  ActivityPlanTarget,
  ActivityTargetCategory,
  CompiledActivityStepOccurrence,
  ProviderProjectionDisposition,
  ProviderProjectionSemantic,
} from "@repo/core";
import {
  activityPlanSpeedKphToMetersPerSecond,
  compileActivityPlanV3,
  getActivityPlanProviderReadiness,
  isTargetTypePermittedForActivity,
  selectActivityPlanProviderTarget,
} from "@repo/core";
import type { WahooActivityType } from "./activity-type-utils";
import { toWahooTypes } from "./activity-type-utils";

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

export type WahooCompatibilityIssueCode =
  | "invalid_plan"
  | "missing_metric"
  | "unsupported_target"
  | "unsupported_sport"
  | "unsupported_segment";

export type WahooCompatibilityIssue = {
  code: WahooCompatibilityIssueCode;
  disposition?: ProviderProjectionDisposition;
  message: string;
  path?: (string | number)[];
  reasonCode?: string;
  semantic?: ProviderProjectionSemantic;
  targetProjection?: "retained" | "dropped";
  targetType?: ActivityPlanTarget["type"];
};

export type WahooCompatibilityResult = {
  compatible: boolean;
  disposition: ProviderProjectionDisposition;
  findings: WahooCompatibilityIssue[];
  issues: WahooCompatibilityIssue[];
  projection: ActivityPlanProviderProjection;
  warnings: string[];
};

export type WahooProjectionSnapshot = {
  plan: WahooPlanJson;
};

export interface ConvertOptions {
  activityType: WahooActivityType;
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
export function calculateWorkoutDuration(structure: ActivityPlanStructureV3): number {
  return compileActivityPlanV3(structure).occurrences.reduce(
    (seconds, occurrence) => seconds + parseDuration(occurrence.duration),
    0,
  );
}

/**
 * Parse duration to seconds
 */
function parseDuration(duration: ActivityPlanDuration): number {
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
  structure: ActivityPlanStructureV3,
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
  const compiled = compileActivityPlanV3(structure);
  const activityOccurrences = compiled.occurrences.filter(
    (occurrence): occurrence is CompiledActivityStepOccurrence => occurrence.role === "activity",
  );
  const requiresFtpHeader = Boolean(
    options.activityType !== "run" &&
      activityOccurrences.some((occurrence) => {
        const selectedTarget = selectWahooTarget(occurrence.targets, options);
        return selectedTarget?.type === "%FTP";
      }),
  );
  const requiresMaxHrHeader = Boolean(
    activityOccurrences.some(
      (occurrence) => selectWahooTarget(occurrence.targets, options)?.type === "%MaxHR",
    ),
  );
  const requiresThresholdHrHeader = Boolean(
    activityOccurrences.some(
      (occurrence) => selectWahooTarget(occurrence.targets, options)?.type === "%ThresholdHR",
    ),
  );
  const hasValidFtp = isFinitePositive(options.ftp);
  const hasValidMaxHr = isFinitePositive(options.max_hr);
  const hasValidThresholdHr = isFinitePositive(options.threshold_hr);

  if (requiresFtpHeader && !hasValidFtp) {
    throw new Error(
      "A positive FTP is required to sync a workout with FTP-relative targets to Wahoo.",
    );
  }

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

  // Include only anchors consumed by the selected provider-visible targets.
  if (hasValidFtp && requiresFtpHeader) {
    plan.header.ftp = options.ftp;
  }
  if (hasValidMaxHr && requiresMaxHrHeader) {
    plan.header.max_hr = options.max_hr;
  }
  if (hasValidThresholdHr && requiresThresholdHrHeader) {
    plan.header.threshold_hr = options.threshold_hr;
  }

  const stepNames = new Map(
    structure.segments.flatMap((segment) =>
      segment.role === "activity"
        ? segment.intervals.flatMap((interval) =>
            interval.steps.map((step) => [step.id, step.name] as const),
          )
        : [],
    ),
  );
  plan.intervals = activityOccurrences.map((occurrence) =>
    convertOccurrence(occurrence, stepNames.get(occurrence.stepId) ?? "Step", options),
  );

  assertValidWahooPlan(plan);

  return plan;
}

/** Converts one compiled occurrence exactly once; repeats are already expanded by Core. */
function convertOccurrence(
  occurrence: CompiledActivityStepOccurrence,
  name: string,
  options: ConvertOptions,
): WahooInterval {
  const interval: WahooInterval = {
    name,
    exit_trigger_type: "time",
    exit_trigger_value: 300, // Default 5 minutes
    intensity_type: "active",
  };

  // Convert duration
  const { type, value } = convertDuration(occurrence.duration);
  interval.exit_trigger_type = type;
  interval.exit_trigger_value = value;

  const targets = occurrence.targets;
  if (targets.length === 0) {
    throw new Error(
      `Step "${interval.name}" cannot be synced to Wahoo without a target. Wahoo's plan contract requires every step to contain a target.`,
    );
  }

  const target = selectWahooTarget(targets, options);
  const incompatibilities = targets
    .map((candidate) => {
      const incompatibility = getTargetIncompatibility(candidate, options);
      return incompatibility &&
        (incompatibility.code === "unsupported_target" || candidate === target)
        ? incompatibility.message
        : null;
    })
    .filter((reason): reason is string => reason !== null);
  if (incompatibilities.length > 0) {
    throw new Error(
      `Step "${interval.name}" cannot be synced to Wahoo: ${incompatibilities.join("; ")}`,
    );
  }

  // Wahoo displays one target. Preserve the existing activity preference when every
  // explicit target is representable, rather than hiding an unresolved secondary target.
  if (!target) {
    throw new Error(`Step "${interval.name}" has no Wahoo-compatible target.`);
  }

  interval.intensity_type = inferIntensityType(target);
  interval.targets = [convertTarget(target, options)];

  return interval;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getTargetIncompatibility(
  target: ActivityPlanTarget,
  options: ConvertOptions,
): WahooCompatibilityIssue | null {
  if (
    !isTargetTypePermittedForActivity({
      activityCategory: options.activityType as ActivityTargetCategory,
      targetType: target.type,
    })
  ) {
    return {
      code: "unsupported_target",
      message: `${target.type} targets are not supported for ${options.activityType} workouts`,
    };
  }

  switch (target.type) {
    case "RPE":
      return {
        code: "unsupported_target",
        message:
          "RPE targets are not supported by Wahoo; add a provider-supported physiological target",
      };
    case "%FTP":
      return isFinitePositive(options.ftp)
        ? null
        : {
            code: "missing_metric",
            message: "%FTP targets require a finite positive FTP in the athlete profile",
          };
    case "%ThresholdHR":
      return isFinitePositive(options.threshold_hr)
        ? null
        : {
            code: "missing_metric",
            message:
              "%ThresholdHR targets require a finite positive threshold heart rate in the athlete profile",
          };
    case "%MaxHR":
      return isFinitePositive(options.max_hr)
        ? null
        : {
            code: "missing_metric",
            message:
              "%MaxHR targets require a finite positive maximum heart rate in the athlete profile",
          };
    default:
      return null;
  }
}

function selectWahooTarget(
  targets: readonly ActivityPlanTarget[],
  options: ConvertOptions,
): ActivityPlanTarget | null {
  return (
    selectActivityPlanProviderTarget({
      activityCategory: options.activityType as ActivityTargetCategory,
      provider: "wahoo",
      targets,
    })?.target ?? null
  );
}

/**
 * Convert GradientPeak V2 duration to Wahoo format
 */
function convertDuration(duration: ActivityPlanDuration): {
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
function convertTarget(target: ActivityPlanTarget, options: ConvertOptions): WahooTarget {
  const incompatibility = getTargetIncompatibility(target, options);
  if (incompatibility) {
    throw new Error(`Cannot convert ${target.type} target to Wahoo: ${incompatibility.message}`);
  }

  switch (target.type) {
    case "%FTP": {
      const value = target.intensity / 100;
      return {
        type: "ftp",
        low: value * 0.95,
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
      const value = target.intensity / 100;
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
      const speedMetersPerSecond = activityPlanSpeedKphToMetersPerSecond(target.intensity);
      return {
        type: "speed",
        low: speedMetersPerSecond * 0.95,
        high: speedMetersPerSecond * 1.05,
      };
    }

    case "cadence": {
      return {
        type: "rpm",
        low: target.intensity * 0.95,
        high: target.intensity * 1.05,
      };
    }

    case "RPE":
      throw new Error("Cannot convert RPE target to Wahoo: RPE targets are not supported by Wahoo");
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
function inferIntensityType(target: ActivityPlanTarget): WahooInterval["intensity_type"] {
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
 * Note: This assumes activity type has already been validated with isWahooSupported
 */
export function validateWahooCompatibility(
  structure: ActivityPlanStructureV3,
  options: ConvertOptions,
): WahooCompatibilityResult {
  const readiness = getActivityPlanProviderReadiness({
    anchors: {
      ftpWatts: options.ftp,
      maxHeartRateBpm: options.max_hr,
      thresholdHeartRateBpm: options.threshold_hr,
    },
    provider: "wahoo",
    structure,
  });
  const findings: WahooCompatibilityIssue[] = readiness.projection.findings.map((finding) => ({
    code:
      finding.reasonCode === "missing_target_anchor"
        ? "missing_metric"
        : finding.reasonCode === "unsupported_sport"
          ? "unsupported_sport"
          : finding.reasonCode === "unsupported_boundary"
            ? "unsupported_segment"
            : finding.reasonCode === "unsupported_target" ||
                finding.reasonCode === "unsupported_duration"
              ? "unsupported_target"
              : "invalid_plan",
    disposition: finding.disposition,
    message: finding.message,
    path: finding.path,
    reasonCode: finding.reasonCode,
    semantic: finding.semantic,
    targetProjection: finding.targetProjection,
    targetType: finding.targetType,
  }));
  const compiled = compileActivityPlanV3(structure);
  if (compiled.occurrences.length > 100) {
    findings.push({
      code: "invalid_plan",
      disposition: "unsupported",
      message: `Workout has ${compiled.occurrences.length} compiled occurrences; Wahoo supports at most 100.`,
      path: ["structure", "segments"],
      reasonCode: "provider_occurrence_limit_exceeded",
      semantic: "provider",
    });
  }
  const issues = findings.filter((finding) => finding.disposition === "unsupported");
  const warnings = findings
    .filter((finding) => finding.disposition === "degraded")
    .map((finding) => finding.message);
  const disposition: ProviderProjectionDisposition =
    issues.length > 0 ? "unsupported" : warnings.length > 0 ? "degraded" : "compatible";

  return {
    compatible: issues.length === 0,
    disposition,
    findings,
    issues,
    projection: readiness.projection,
    warnings,
  };
}

/** Canonical hash input for enqueue, worker race checks, and persisted provider metadata. */
export function getWahooProjectionSnapshot(
  structure: ActivityPlanStructureV3,
  options: ConvertOptions,
): WahooProjectionSnapshot {
  return { plan: convertToWahooPlan(structure, options) };
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
