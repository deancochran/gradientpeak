import { z } from "zod";
import { getActivityTargetRole } from "../targets/objective-intensity";
import { validateActivityPlanIntent } from "./intent-validation";
import {
  type ActivityPlanDuration,
  type ActivityPlanStructure,
  activityPlanStructureSchema,
  type EditableActivityPlanStructure,
} from "./structure-schema";
import { activityPlanIntentSchema } from "./training-intent";

export const ACTIVITY_PLAN_STEP_NOTE_MAX_CHARACTERS = 160;
/** Authoring-only: historical documents remain readable without rewriting notes. */
export const activityPlanStepNoteSchema = z
  .string()
  .refine(
    (value) =>
      !/[\r\n\u0085\u2028\u2029]/u.test(value) && !value.includes("\v") && !value.includes("\f"),
    {
      message: "Step notes must be a single line without line breaks or paragraph spacing.",
    },
  )
  .refine((value) => Array.from(value).length <= ACTIVITY_PLAN_STEP_NOTE_MAX_CHARACTERS, {
    message: `Keep step notes to ${ACTIVITY_PLAN_STEP_NOTE_MAX_CHARACTERS} characters or fewer; put detailed instructions in the activity plan description.`,
  })
  .optional();
export const activityPlanAuthoringIssueCodes = {
  durationNotPermitted: "ACTIVITY_PLAN_AUTHORING_DURATION_NOT_PERMITTED",
  repetitionsRequireRpe: "ACTIVITY_PLAN_AUTHORING_REPETITIONS_REQUIRE_RPE",
  missingIntensity: "ACTIVITY_PLAN_AUTHORING_MISSING_INTENSITY",
  invalidRpe: "ACTIVITY_PLAN_AUTHORING_INVALID_RPE",
  maxHrExceeded: "ACTIVITY_PLAN_AUTHORING_MAX_HR_EXCEEDED",
  distanceSpeedNotPositive: "ACTIVITY_PLAN_AUTHORING_DISTANCE_SPEED_NOT_POSITIVE",
  incompatibleIntent: "ACTIVITY_PLAN_AUTHORING_INCOMPATIBLE_INTENT",
  restMustBeSoleTarget: "ACTIVITY_PLAN_AUTHORING_REST_MUST_BE_SOLE_TARGET",
  restRequiresTimeDuration: "ACTIVITY_PLAN_AUTHORING_REST_REQUIRES_TIME_DURATION",
  rpeMixedWithIntensity: "ACTIVITY_PLAN_AUTHORING_RPE_MIXED_WITH_INTENSITY",
  invalidStepNote: "ACTIVITY_PLAN_AUTHORING_INVALID_STEP_NOTE",
} as const;
export type ActivityPlanAuthoringIssueCode =
  (typeof activityPlanAuthoringIssueCodes)[keyof typeof activityPlanAuthoringIssueCodes];
export type ActivityPlanAuthoringIssue = {
  code: ActivityPlanAuthoringIssueCode;
  path: (string | number)[];
  message: string;
};

/** Persisted speed prescriptions use km/h with at most this many decimal places. */
export const ACTIVITY_PLAN_SPEED_DECIMAL_PLACES = 2;

const speedPrecisionFactor = 10 ** ACTIVITY_PLAN_SPEED_DECIMAL_PLACES;

export type ActivityPlanSpeedTargetNormalization =
  | { success: true; intensity: number }
  | { success: false; message: string };

export type ActivityPlanAuthoringStructureNormalization =
  | { success: true; structure: ActivityPlanStructure }
  | { success: false; message: string };

/**
 * Canonicalizes only newly-authored speed target values. Other target domains,
 * including half-point RPE, retain their authored precision exactly.
 */
export function normalizeActivityPlanSpeedTargetIntensity(
  intensity: number,
): ActivityPlanSpeedTargetNormalization {
  if (!Number.isFinite(intensity) || intensity < 0)
    return { success: false, message: "Speed must be a finite, nonnegative number." };
  // Preserve an explicit zero for the authoring validator, which can provide
  // its domain-specific error (for example, on a distance step).
  if (intensity === 0) return { success: true, intensity: 0 };
  const normalized =
    Math.round((intensity + Number.EPSILON) * speedPrecisionFactor) / speedPrecisionFactor;
  // Input is rounded to the persisted two-decimal precision. Values at the
  // half-step (0.005) round up to the smallest representable speed, 0.01.
  // Smaller positive values are rejected instead of silently becoming zero.
  if (normalized <= 0) return { success: false, message: "Speed must be at least 0.01 km/h." };
  return { success: true, intensity: normalized };
}

/**
 * Produces the canonical write representation for an already-valid V5 structure.
 * This is a write-boundary helper: callers must not use it to rewrite historical
 * records merely because they are being read or updated for unrelated metadata.
 */
export function normalizeActivityPlanAuthoringStructure(
  structure: EditableActivityPlanStructure,
): ActivityPlanAuthoringStructureNormalization {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  if (!parsed.success) return { success: false, message: "Activity plan structure is invalid." };
  let speedError: string | undefined;
  const normalizeTargets = (targets: readonly import("../targets/schema").ActivityTarget[]) =>
    targets.map((target) => {
      if (target.type !== "speed") return target;
      const intensity = normalizeActivityPlanSpeedTargetIntensity(target.intensity);
      if (!intensity.success) {
        speedError ??= intensity.message;
        return target;
      }
      return { ...target, intensity: intensity.intensity };
    });
  const normalized = {
    ...parsed.data,
    items: parsed.data.items.map((item) =>
      item.type === "step"
        ? { ...item, targets: normalizeTargets(item.targets) }
        : {
            ...item,
            steps: item.steps.map((step) => ({ ...step, targets: normalizeTargets(step.targets) })),
          },
    ),
  };
  if (speedError) return { success: false, message: speedError };
  return { success: true, structure: normalized };
}
export function getPermissibleActivityPlanDurationTypes(
  category: EditableActivityPlanStructure["activity_category"],
): readonly Exclude<ActivityPlanDuration["type"], "untilFinished">[] {
  if (category === "strength") return ["time", "repetitions"];
  if (category === "run" || category === "bike" || category === "swim") return ["time", "distance"];
  return ["time"];
}
export function getActivityPlanAuthoringIssues(
  structure: EditableActivityPlanStructure,
): ActivityPlanAuthoringIssue[] {
  const issues: ActivityPlanAuthoringIssue[] = [];
  const add = (code: ActivityPlanAuthoringIssueCode, path: (string | number)[], message: string) =>
    issues.push({ code, path, message: `[${code}] ${message}` });
  const permitted = getPermissibleActivityPlanDurationTypes(structure.activity_category);
  structure.items.forEach((item, itemIndex) => {
    const steps = item.type === "step" ? [item] : item.steps;
    steps.forEach((step, stepIndex) => {
      const path =
        item.type === "step" ? ["items", itemIndex] : ["items", itemIndex, "steps", stepIndex];
      const note = activityPlanStepNoteSchema.safeParse(step.instructions);
      if (!note.success)
        for (const issue of note.error.issues)
          add(
            activityPlanAuthoringIssueCodes.invalidStepNote,
            [...path, "instructions"],
            issue.message,
          );
      if (step.duration.type === "untilFinished" || !permitted.includes(step.duration.type))
        add(
          activityPlanAuthoringIssueCodes.durationNotPermitted,
          [...path, "duration", "type"],
          `This completion type is not permitted for newly authored ${structure.activity_category} activity plans.`,
        );
      const hasRestTarget = step.targets.some((target) => target.type === "rest");
      if (
        step.targets.some((target) => target.type === "RPE") &&
        step.targets.some((target) => getActivityTargetRole(target) === "objective")
      )
        add(
          activityPlanAuthoringIssueCodes.rpeMixedWithIntensity,
          [...path, "targets"],
          "RPE cannot be combined with heart-rate, power, or speed intensity targets. Supplemental targets such as cadence are allowed.",
        );
      if (hasRestTarget && step.targets.length !== 1)
        add(
          activityPlanAuthoringIssueCodes.restMustBeSoleTarget,
          [...path, "targets"],
          "A rest target must be the sole target on its step.",
        );
      if (hasRestTarget && step.duration.type !== "time")
        add(
          activityPlanAuthoringIssueCodes.restRequiresTimeDuration,
          [...path, "duration", "type"],
          "A rest target requires a positive time duration.",
        );
      if (
        step.duration.type === "repetitions" &&
        (step.targets.length !== 1 || step.targets[0]?.type !== "RPE")
      )
        add(
          activityPlanAuthoringIssueCodes.repetitionsRequireRpe,
          [...path, "targets"],
          "Repetition steps require exactly one target, which must be RPE.",
        );
      if (
        !hasRestTarget &&
        step.targets.length > 0 &&
        !step.targets.some(
          (target) => target.type === "RPE" || getActivityTargetRole(target) === "objective",
        )
      )
        add(
          activityPlanAuthoringIssueCodes.missingIntensity,
          [...path, "targets"],
          "Choose an objective intensity or RPE; cadence alone is insufficient.",
        );
      step.targets.forEach((target, targetIndex) => {
        const intensityPath = [...path, "targets", targetIndex, "intensity"];
        if (
          target.type === "RPE" &&
          (!Number.isFinite(target.intensity) ||
            target.intensity < 1 ||
            target.intensity > 10 ||
            !Number.isInteger(target.intensity * 2))
        )
          add(
            activityPlanAuthoringIssueCodes.invalidRpe,
            intensityPath,
            "RPE must be between 1 and 10 in half-point increments.",
          );
        if (target.type === "%MaxHR" && target.intensity > 100)
          add(
            activityPlanAuthoringIssueCodes.maxHrExceeded,
            intensityPath,
            "Maximum heart-rate percentage cannot exceed 100.",
          );
        if (step.duration.type === "distance" && target.type === "speed" && !(target.intensity > 0))
          add(
            activityPlanAuthoringIssueCodes.distanceSpeedNotPositive,
            intensityPath,
            "Distance steps require a positive speed when a speed target is supplied.",
          );
      });
    });
  });
  return issues;
}
function addIssues(issues: ActivityPlanAuthoringIssue[], context: z.RefinementCtx) {
  for (const issue of issues)
    context.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message,
      params: { activityPlanIssueCode: issue.code },
    });
}
export const activityPlanAuthoringStructureSchema = activityPlanStructureSchema.superRefine(
  (structure, context) => addIssues(getActivityPlanAuthoringIssues(structure), context),
);
export type ActivityPlanAuthoringStructure = z.output<typeof activityPlanAuthoringStructureSchema>;
/** Fixed authoring accepts only structure and intent; removed fields fail strict parsing. */
export const activityPlanAuthoringContentSchema = z
  .object({ structure: activityPlanAuthoringStructureSchema, intent: activityPlanIntentSchema })
  .strict()
  .superRefine((content, context) => {
    for (const violation of validateActivityPlanIntent({
      structure: content.structure,
      intent: content.intent,
    }).violations)
      context.addIssue({
        code: "custom",
        path: ["intent", "training_intent"],
        message: `[${activityPlanAuthoringIssueCodes.incompatibleIntent}] [${violation.code}] ${violation.message}`,
        params: { activityPlanIssueCode: activityPlanAuthoringIssueCodes.incompatibleIntent },
      });
  });
export type ActivityPlanAuthoringContent = z.output<typeof activityPlanAuthoringContentSchema>;
