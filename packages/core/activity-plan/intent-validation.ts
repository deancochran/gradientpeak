import { getActivityTargetRole } from "../targets/objective-intensity";
import type { ActivityTarget } from "../targets/schema";
import type { ActivityPlanStructure } from "./structure-schema";
import { type ActivityPlanIntent, activityPlanIntentSchema } from "./training-intent";

export type ActivityPlanPrescriptionCharacteristics = {
  explicit_duration_seconds: number;
  work_duration_seconds: number;
  recovery_duration_seconds: number;
  work_recovery_ratio: number | null;
  work_step_count: number;
  recovery_step_count: number;
  objective_intensities: Array<{ type: ActivityTarget["type"]; intensity: number }>;
  maximum_rpe: number | null;
};

export type ActivityPlanIntentViolationCode =
  | "NO_QUALIFYING_WORK"
  | "RECOVERY_EXCESSIVE_FOR_INTENT"
  | "INTENSITY_INCOMPATIBLE_WITH_INTENT"
  | "TECHNIQUE_WORK_MISSING";

export type ActivityPlanIntentValidation = {
  status: "compatible" | "incompatible" | "indeterminate";
  characteristics: ActivityPlanPrescriptionCharacteristics;
  violations: Array<{ code: ActivityPlanIntentViolationCode; message: string }>;
  warnings: string[];
};

function inferredPurpose(name: string): "work" | "recovery" | "other" {
  const normalized = name.toLowerCase();
  if (/recovery|recover|rest|easy|float/.test(normalized)) return "recovery";
  if (/warm.?up|cool.?down/.test(normalized)) return "other";
  return "work";
}

export function deriveActivityPlanPrescriptionCharacteristics(
  structure: ActivityPlanStructure,
): ActivityPlanPrescriptionCharacteristics {
  let explicitDurationSeconds = 0;
  let workDurationSeconds = 0;
  let recoveryDurationSeconds = 0;
  let workStepCount = 0;
  let recoveryStepCount = 0;
  let maximumRpe: number | null = null;
  const objectiveIntensities: ActivityPlanPrescriptionCharacteristics["objective_intensities"] = [];

  for (const segment of structure.segments) {
    if (segment.role === "rest") {
      explicitDurationSeconds += segment.duration.seconds;
      recoveryDurationSeconds += segment.duration.seconds;
      recoveryStepCount += 1;
      continue;
    }
    for (const interval of segment.intervals) {
      for (const step of interval.steps) {
        const purpose = step.purpose ?? inferredPurpose(step.name);
        const seconds =
          step.duration.type === "time" ? step.duration.seconds * interval.repetitions : 0;
        explicitDurationSeconds += seconds;
        if (purpose === "work") {
          workDurationSeconds += seconds;
          workStepCount += interval.repetitions;
        } else if (purpose === "recovery") {
          recoveryDurationSeconds += seconds;
          recoveryStepCount += interval.repetitions;
        }
        for (const target of step.targets) {
          if (target.type === "RPE") {
            maximumRpe = Math.max(maximumRpe ?? 0, target.intensity);
          }
          if (getActivityTargetRole(target) === "objective") {
            objectiveIntensities.push({ type: target.type, intensity: target.intensity });
          }
        }
      }
    }
  }
  return {
    explicit_duration_seconds: explicitDurationSeconds,
    work_duration_seconds: workDurationSeconds,
    recovery_duration_seconds: recoveryDurationSeconds,
    work_recovery_ratio:
      recoveryDurationSeconds > 0 && workDurationSeconds > 0
        ? workDurationSeconds / recoveryDurationSeconds
        : null,
    work_step_count: workStepCount,
    recovery_step_count: recoveryStepCount,
    objective_intensities: objectiveIntensities,
    maximum_rpe: maximumRpe,
  };
}

function hasHighIntensity(characteristics: ActivityPlanPrescriptionCharacteristics): boolean {
  return (
    characteristics.objective_intensities.some((target) => {
      if (target.type === "%FTP") return target.intensity >= 105;
      if (target.type === "%ThresholdHR") return target.intensity >= 100;
      if (target.type === "%MaxHR") return target.intensity >= 90;
      return false;
    }) || (characteristics.maximum_rpe ?? 0) >= 8
  );
}

function hasThresholdIntensity(characteristics: ActivityPlanPrescriptionCharacteristics): boolean {
  return (
    characteristics.objective_intensities.some((target) => {
      if (target.type === "%FTP") return target.intensity >= 88 && target.intensity <= 105;
      if (target.type === "%ThresholdHR") return target.intensity >= 95 && target.intensity <= 105;
      if (target.type === "%MaxHR") return target.intensity >= 80 && target.intensity <= 95;
      return false;
    }) || (characteristics.maximum_rpe ?? 0) >= 6
  );
}

export function validateActivityPlanIntent(input: {
  intent: ActivityPlanIntent;
  structure: ActivityPlanStructure;
}): ActivityPlanIntentValidation {
  const intent = activityPlanIntentSchema.parse(input.intent);
  const characteristics = deriveActivityPlanPrescriptionCharacteristics(input.structure);
  const violations: ActivityPlanIntentValidation["violations"] = [];
  const warnings: string[] = [];
  const add = (code: ActivityPlanIntentViolationCode, message: string) =>
    violations.push({ code, message });

  if (
    characteristics.work_step_count === 0 &&
    ["vo2max", "threshold_development", "anaerobic_capacity", "speed_skill"].includes(
      intent.training_intent,
    )
  ) {
    add("NO_QUALIFYING_WORK", "The activity plan contains no qualifying work steps.");
  }

  if (
    (intent.training_intent === "vo2max" ||
      intent.training_intent === "threshold_development" ||
      intent.training_intent === "anaerobic_capacity") &&
    characteristics.work_recovery_ratio !== null &&
    characteristics.work_recovery_ratio < 0.5
  ) {
    add(
      "RECOVERY_EXCESSIVE_FOR_INTENT",
      "Recovery exceeds the supported density for the declared training intent.",
    );
  }

  if (intent.training_intent === "vo2max" && !hasHighIntensity(characteristics)) {
    add(
      "INTENSITY_INCOMPATIBLE_WITH_INTENT",
      "VO2max activity plans require a supported high-intensity target or RPE.",
    );
  }
  if (
    intent.training_intent === "threshold_development" &&
    !hasThresholdIntensity(characteristics)
  ) {
    add(
      "INTENSITY_INCOMPATIBLE_WITH_INTENT",
      "Threshold activity plans require a supported threshold-intensity target or RPE.",
    );
  }
  if (intent.training_intent === "recovery" && hasHighIntensity(characteristics)) {
    add(
      "INTENSITY_INCOMPATIBLE_WITH_INTENT",
      "Recovery activity plans cannot contain high-intensity work.",
    );
  }
  if (
    intent.training_intent === "technique" &&
    !input.structure.segments.some(
      (segment) =>
        segment.role === "activity" &&
        segment.intervals.some((interval) =>
          interval.steps.some((step) => step.purpose === "technique"),
        ),
    )
  ) {
    add(
      "TECHNIQUE_WORK_MISSING",
      "Technique activity plans require an explicitly marked technique step.",
    );
  }

  return {
    status:
      violations.length > 0 ? "incompatible" : warnings.length > 0 ? "indeterminate" : "compatible",
    characteristics,
    violations,
    warnings,
  };
}
