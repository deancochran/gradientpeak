import { getActivityTargetRole } from "../targets/objective-intensity";
import type { ActivityTarget } from "../targets/schema";
import type { ActivityPlanStructure } from "./structure-schema";
import { type ActivityPlanIntent, activityPlanIntentSchema } from "./training-intent";

export type ActivityPlanPrescriptionCharacteristics = {
  explicit_duration_seconds: number;
  /** Step purpose is no longer authored, so work/recovery classification is unavailable. */
  work_duration_seconds: null;
  recovery_duration_seconds: number;
  work_recovery_ratio: null;
  work_step_count: null;
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

export function deriveActivityPlanPrescriptionCharacteristics(
  structure: ActivityPlanStructure,
): ActivityPlanPrescriptionCharacteristics {
  let explicitDurationSeconds = 0;
  let maximumRpe: number | null = null;
  const objectiveIntensities: ActivityPlanPrescriptionCharacteristics["objective_intensities"] = [];

  for (const item of structure.items) {
    const steps = item.type === "step" ? [item] : item.steps;
    const count = item.type === "step" ? 1 : item.count;
    for (const step of steps) {
      const seconds = step.duration.type === "time" ? step.duration.seconds * count : 0;
      explicitDurationSeconds += seconds;
      for (const target of step.targets) {
        if (target.type === "RPE") {
          maximumRpe = Math.max(maximumRpe ?? 0, target.intensity);
        }
        if (getActivityTargetRole(target) === "objective") {
          if (target.type !== "rest")
            objectiveIntensities.push({ type: target.type, intensity: target.intensity });
        }
      }
    }
  }
  return {
    explicit_duration_seconds: explicitDurationSeconds,
    work_duration_seconds: null,
    recovery_duration_seconds: 0,
    work_recovery_ratio: null,
    work_step_count: null,
    recovery_step_count: 0,
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
  return {
    status:
      violations.length > 0 ? "incompatible" : warnings.length > 0 ? "indeterminate" : "compatible",
    characteristics,
    violations,
    warnings,
  };
}
