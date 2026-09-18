/**
 * Wahoo Plan Converter
 * Converts compiled GradientPeak activity-plan semantics to Wahoo's plan.json format
 */

import type {
  ActivityPlanDuration,
  ActivityPlanProviderProjection,
  ActivityPlanStructure,
  ActivityPlanTarget,
  ActivityTargetCategory,
  CompiledActivityStepOccurrence,
  ProviderProjectionDisposition,
  ProviderProjectionSemantic,
} from "@repo/core";
import {
  activityPlanSpeedKphToMetersPerSecond,
  compileActivityPlan,
  getActivityPlanProviderProjection,
  isTargetTypePermittedForActivity,
  selectActivityPlanProviderTarget,
} from "@repo/core";
import { z } from "zod";
import type { WahooActivityType } from "./activity-type-utils";
import { toWahooTypes } from "./activity-type-utils";

export interface WahooPlanJson {
  header: {
    name: string;
    version: string;
    description?: string | undefined;
    workout_type_family: number; // 0 = bike, 1 = run
    workout_type_location: number; // 0 = indoor, 1 = outdoor
    ftp?: number | undefined;
    max_hr?: number | undefined;
    threshold_hr?: number | undefined;
  };
  intervals: WahooInterval[];
}

export interface WahooInterval {
  name: string;
  exit_trigger_type: "time" | "distance" | "repeat";
  exit_trigger_value: number;
  intensity_type: "wu" | "active" | "tempo" | "lt" | "cd" | "recover" | "rest";
  targets?: WahooTarget[] | undefined;
  intervals?: WahooInterval[] | undefined; // For repeats
}

export interface WahooTarget {
  type: "ftp" | "watts" | "hr" | "threshold_hr" | "max_hr" | "speed" | "rpm";
  low?: number | undefined;
  high?: number | undefined;
  value?: number | undefined;
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

const wahooTargetSchema: z.ZodType<WahooTarget> = z
  .object({
    type: z.enum(["ftp", "watts", "hr", "threshold_hr", "max_hr", "speed", "rpm"]),
    low: z.number().finite().optional(),
    high: z.number().finite().optional(),
    value: z.number().finite().optional(),
  })
  .strict();

const wahooIntervalSchema: z.ZodType<WahooInterval> = z.lazy(() =>
  z
    .object({
      name: z.string(),
      exit_trigger_type: z.enum(["time", "distance", "repeat"]),
      exit_trigger_value: z.number().finite(),
      intensity_type: z.enum(["wu", "active", "tempo", "lt", "cd", "recover", "rest"]),
      targets: z.array(wahooTargetSchema).optional(),
      intervals: z.array(wahooIntervalSchema).optional(),
    })
    .strict(),
);

const wahooPlanJsonSchema: z.ZodType<WahooPlanJson> = z
  .object({
    header: z
      .object({
        name: z.string(),
        version: z.string(),
        description: z.string().optional(),
        workout_type_family: z.number().int(),
        workout_type_location: z.number().int(),
        ftp: z.number().finite().positive().optional(),
        max_hr: z.number().finite().positive().optional(),
        threshold_hr: z.number().finite().positive().optional(),
      })
      .strict(),
    intervals: z.array(wahooIntervalSchema),
  })
  .strict();

export const wahooProjectionSnapshotSchema: z.ZodType<WahooProjectionSnapshot> = z
  .object({ plan: wahooPlanJsonSchema })
  .strict();

export interface ConvertOptions {
  activityType: WahooActivityType;
  hasRoute?: boolean;
  name: string;
  description?: string;
  ftp?: number;
  max_hr?: number;
  threshold_hr?: number;
}

export class WahooPlanConversionError extends Error {
  constructor(
    readonly code: "unsupported_duration" | "unsupported_segment",
    message: string,
  ) {
    super(message);
    this.name = "WahooPlanConversionError";
  }
}

function compileWahooOccurrences(
  structure: ActivityPlanStructure,
): CompiledActivityStepOccurrence[] {
  return compileActivityPlan(structure).occurrences.map((occurrence) => {
    if (occurrence.role !== "activity") {
      throw new WahooPlanConversionError(
        "unsupported_segment",
        "Wahoo cannot preserve rest boundaries.",
      );
    }
    convertDuration(occurrence.duration);
    return occurrence;
  });
}

/** Exact authored seconds, or null when any distance completion makes the total unknown.
 * A speed target is not an exact completion time. Unsupported completion types throw.
 */
export function calculateWorkoutDuration(structure: ActivityPlanStructure): number | null {
  let seconds = 0;
  let unknown = false;
  for (const occurrence of compileWahooOccurrences(structure)) {
    if (occurrence.duration.type === "time") seconds += occurrence.duration.seconds;
    else unknown = true;
  }
  return unknown ? null : seconds;
}

/**
 * Convert GradientPeak activity plan to Wahoo plan.json format
 */
export function convertToWahooPlan(
  structure: ActivityPlanStructure,
  options: ConvertOptions,
): WahooPlanJson {
  const activityTypeMapping = toWahooTypes(options.activityType, {
    ...(options.hasRoute !== undefined ? { hasRoute: options.hasRoute } : {}),
  });

  if (!activityTypeMapping) {
    throw new Error(
      `Activity category '${options.activityType}' is not supported by Wahoo. Only cycling and running activities can be synced.`,
    );
  }

  const { workout_type_family, workout_type_location } = activityTypeMapping;
  const activityOccurrences = compileWahooOccurrences(structure);
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
      "A positive FTP is required to sync a Wahoo workout resource with FTP-relative targets.",
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
  if (hasValidFtp && requiresFtpHeader && options.ftp !== undefined) {
    plan.header = { ...plan.header, ftp: options.ftp };
  }
  if (hasValidMaxHr && requiresMaxHrHeader && options.max_hr !== undefined) {
    plan.header = { ...plan.header, max_hr: options.max_hr };
  }
  if (hasValidThresholdHr && requiresThresholdHrHeader && options.threshold_hr !== undefined) {
    plan.header = { ...plan.header, threshold_hr: options.threshold_hr };
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
  const { type, value } = convertDuration(occurrence.duration);
  const interval: WahooInterval = {
    name,
    exit_trigger_type: type,
    exit_trigger_value: value,
    intensity_type: "active",
  };

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
      message: `${target.type} targets are not supported for Wahoo activity category '${options.activityType}'`,
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
 * Preserve supported completion units; never invent a clock-time substitute.
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
    case "untilFinished":
      throw new WahooPlanConversionError(
        "unsupported_duration",
        `${duration.type} completion cannot be converted to Wahoo without changing activity semantics.`,
      );
    default:
      throw new WahooPlanConversionError(
        "unsupported_duration",
        "Unsupported Wahoo completion type.",
      );
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
 * Note: This assumes the Wahoo activity type has already been validated with isWahooSupported
 */
export function validateWahooCompatibility(
  structure: ActivityPlanStructure,
  options: ConvertOptions,
): WahooCompatibilityResult {
  const projection = getActivityPlanProviderProjection({
    anchors: {
      ...(options.ftp !== undefined ? { ftpWatts: options.ftp } : {}),
      ...(options.max_hr !== undefined ? { maxHeartRateBpm: options.max_hr } : {}),
      ...(options.threshold_hr !== undefined
        ? { thresholdHeartRateBpm: options.threshold_hr }
        : {}),
    },
    provider: "wahoo",
    structure,
  });
  const findings: WahooCompatibilityIssue[] = projection.findings.map((finding) => ({
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
    ...(finding.targetProjection !== undefined
      ? { targetProjection: finding.targetProjection }
      : {}),
    ...(finding.targetType !== undefined ? { targetType: finding.targetType } : {}),
  }));
  const compiled = compileActivityPlan(structure);
  if (compiled.occurrences.length > 100) {
    findings.push({
      code: "invalid_plan",
      disposition: "unsupported",
      message: `Activity plan has ${compiled.occurrences.length} compiled occurrences; Wahoo supports at most 100.`,
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
    projection,
    warnings,
  };
}

/** Canonical hash input for enqueue, worker race checks, and persisted provider metadata. */
export function getWahooProjectionSnapshot(
  structure: ActivityPlanStructure,
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
