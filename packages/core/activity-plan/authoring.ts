import { z } from "zod";
import { getActivityTargetRole } from "../targets/objective-intensity";
import { resolveActivityPlanStructure } from "./adaptation-resolution";
import {
  type ActivityPlanAdaptationValues,
  type AdaptationTarget,
  activityPlanAdaptationSchema,
} from "./adaptation-schema";
import { validateActivityPlanIntent } from "./intent-validation";
import {
  type ActivityPlanDuration,
  activityPlanStructureSchema,
  type EditableActivityPlanStructure,
} from "./structure-schema";
import { activityPlanIntentSchema } from "./training-intent";

export const activityPlanAuthoringIssueCodes = {
  durationNotPermitted: "ACTIVITY_PLAN_AUTHORING_DURATION_NOT_PERMITTED",
  repetitionsRequireRpe: "ACTIVITY_PLAN_AUTHORING_REPETITIONS_REQUIRE_RPE",
  missingIntensity: "ACTIVITY_PLAN_AUTHORING_MISSING_INTENSITY",
  purposeRequired: "ACTIVITY_PLAN_AUTHORING_PURPOSE_REQUIRED",
  invalidRpe: "ACTIVITY_PLAN_AUTHORING_INVALID_RPE",
  maxHrExceeded: "ACTIVITY_PLAN_AUTHORING_MAX_HR_EXCEEDED",
  distanceSpeedNotPositive: "ACTIVITY_PLAN_AUTHORING_DISTANCE_SPEED_NOT_POSITIVE",
  multipleFieldOwners: "ACTIVITY_PLAN_AUTHORING_MULTIPLE_FIELD_OWNERS",
  surfaceTooLarge: "ACTIVITY_PLAN_AUTHORING_SURFACE_TOO_LARGE",
  invalidResolution: "ACTIVITY_PLAN_AUTHORING_INVALID_RESOLUTION",
  incompatibleIntent: "ACTIVITY_PLAN_AUTHORING_INCOMPATIBLE_INTENT",
} as const;

export type ActivityPlanAuthoringIssueCode =
  (typeof activityPlanAuthoringIssueCodes)[keyof typeof activityPlanAuthoringIssueCodes];

export type ActivityPlanAuthoringIssue = {
  code: ActivityPlanAuthoringIssueCode;
  path: (string | number)[];
  message: string;
};

/** Completion choices for NEW activity plans; interval repetitions are independent of these choices. */
export function getPermissibleActivityPlanDurationTypes(
  category: EditableActivityPlanStructure["activity_category"],
): readonly Exclude<ActivityPlanDuration["type"], "untilFinished">[] {
  if (category === "strength") return ["time", "repetitions"];
  if (category === "run" || category === "bike" || category === "swim") return ["time", "distance"];
  return ["time"];
}

/** Policy-only issues for a structurally typed editor draft. Use the schema for untrusted input. */
export function getActivityPlanAuthoringIssues(
  structure: EditableActivityPlanStructure,
): ActivityPlanAuthoringIssue[] {
  const issues: ActivityPlanAuthoringIssue[] = [];
  const add = (
    code: ActivityPlanAuthoringIssueCode,
    path: ActivityPlanAuthoringIssue["path"],
    message: string,
  ) => issues.push({ code, path, message: `[${code}] ${message}` });
  const permitted = getPermissibleActivityPlanDurationTypes(structure.activity_category);
  structure.segments.forEach((segment, segmentIndex) => {
    if (segment.role !== "activity") return;
    segment.intervals.forEach((interval, intervalIndex) => {
      interval.steps.forEach((step, stepIndex) => {
        const path = ["segments", segmentIndex, "intervals", intervalIndex, "steps", stepIndex];
        if (!step.purpose)
          add(
            activityPlanAuthoringIssueCodes.purposeRequired,
            [...path, "purpose"],
            "Choose an explicit step purpose.",
          );
        if (step.duration.type === "untilFinished" || !permitted.includes(step.duration.type))
          add(
            activityPlanAuthoringIssueCodes.durationNotPermitted,
            [...path, "duration", "type"],
            `This completion type is not permitted for newly authored ${structure.activity_category} activity plans.`,
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
          if (
            step.duration.type === "distance" &&
            target.type === "speed" &&
            !(target.intensity > 0)
          )
            add(
              activityPlanAuthoringIssueCodes.distanceSpeedNotPositive,
              intensityPath,
              "Distance steps require a positive speed when a speed target is supplied.",
            );
        });
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

/** Opt-in current-authoring boundary. Historical parsing and runtime resolution stay unchanged. */
export const activityPlanAuthoringStructureSchema = activityPlanStructureSchema.superRefine(
  (structure, context) => addIssues(getActivityPlanAuthoringIssues(structure), context),
);
export type ActivityPlanAuthoringStructure = z.output<typeof activityPlanAuthoringStructureSchema>;

function fieldKey(target: AdaptationTarget): string {
  if (target.type === "rest_segment") return `segment:${target.segmentId}:duration`;
  const interval = `${target.activitySegmentId}:${target.intervalId}`;
  if (target.type === "interval_repetitions") return `interval:${interval}:repetitions`;
  const step = `step:${interval}:${target.stepId}`;
  return target.type === "target_intensity"
    ? `${step}:target:${target.targetType}`
    : `${step}:duration`;
}

/** Exhaustive validation is bounded, never sampled. Larger surfaces require explicit allowed states. */
export const ACTIVITY_PLAN_AUTHORING_MAX_SURFACE_STATES = 10_000;

/** Reusable UI/API content boundary; paths are relative to structure, intent, or adaptation.
 * Adapted-state issues retain their structure path and include adaptation_values in Zod params.
 * Only allowed tuples are evaluated when allowedStates is supplied; otherwise the full grid is.
 */
export const activityPlanAuthoringContentSchema = z
  .object({
    structure: activityPlanAuthoringStructureSchema,
    intent: activityPlanIntentSchema,
    adaptation: activityPlanAdaptationSchema.nullish(),
  })
  .strict()
  .superRefine((content, context) => {
    const add = (
      code: ActivityPlanAuthoringIssueCode,
      path: (string | number)[],
      message: string,
      values?: ActivityPlanAdaptationValues,
    ) =>
      context.addIssue({
        code: "custom",
        path,
        message: `[${code}] ${message}`,
        params: { activityPlanIssueCode: code, ...(values ? { adaptation_values: values } : {}) },
      });
    // Avoid resolving an invalid base draft; the nested schema already reports its issues.
    if (!activityPlanAuthoringStructureSchema.safeParse(content.structure).success) return;
    const validateIntent = (
      structure: typeof content.structure,
      values?: ActivityPlanAdaptationValues,
    ) => {
      const validation = validateActivityPlanIntent({ structure, intent: content.intent });
      for (const violation of validation.violations)
        add(
          activityPlanAuthoringIssueCodes.incompatibleIntent,
          ["intent", "training_intent"],
          `[${violation.code}] ${violation.message}`,
          values,
        );
      return validation.violations.length === 0;
    };
    validateIntent(content.structure);
    const adaptation = content.adaptation;
    if (!adaptation) return;
    if (!activityPlanAdaptationSchema.safeParse(adaptation).success) return;
    const owners = new Map<string, number>();
    let conflicting = false;
    adaptation.controls.forEach((control, controlIndex) => {
      control.targets.forEach((target, targetIndex) => {
        const key = fieldKey(target);
        const owner = owners.get(key);
        if (owner !== undefined && owner !== controlIndex) {
          conflicting = true;
          add(
            activityPlanAuthoringIssueCodes.multipleFieldOwners,
            ["adaptation", "controls", controlIndex, "targets", targetIndex],
            "Each authored field must be owned by only one adaptation control.",
          );
        }
        owners.set(key, controlIndex);
      });
    });
    if (conflicting) return;
    const counts = adaptation.controls.map(
      ({ range }) => Math.round((range.maximum - range.minimum) / range.increment) + 1,
    );
    const count =
      adaptation.allowedStates?.length ?? counts.reduce((total, size) => total * size, 1);
    if (!Number.isSafeInteger(count) || count > ACTIVITY_PLAN_AUTHORING_MAX_SURFACE_STATES) {
      add(
        activityPlanAuthoringIssueCodes.surfaceTooLarge,
        ["adaptation"],
        `Authoring validation supports at most ${ACTIVITY_PLAN_AUTHORING_MAX_SURFACE_STATES} permitted states.`,
      );
      return;
    }
    const evaluate = (values: ActivityPlanAdaptationValues) => {
      const resolution = resolveActivityPlanStructure({
        structure: content.structure,
        adaptation,
        adaptation_values: values,
      });
      if (resolution.status !== "resolved") {
        add(
          activityPlanAuthoringIssueCodes.invalidResolution,
          ["adaptation"],
          resolution.issues.join(" "),
          values,
        );
        return false;
      }
      const issues = getActivityPlanAuthoringIssues(resolution.structure);
      for (const issue of issues)
        add(issue.code, ["structure", ...issue.path], issue.message, values);
      const intentValid = validateIntent(resolution.structure, values);
      return issues.length === 0 && intentValid;
    };
    // Stop at the first invalid tuple: enough evidence to reject, with bounded diagnostics.
    if (adaptation.allowedStates) {
      for (const state of adaptation.allowedStates) if (!evaluate(state.values)) break;
    } else {
      const visit = (index: number, values: ActivityPlanAdaptationValues): boolean => {
        const control = adaptation.controls[index];
        if (!control) return evaluate(values);
        const size = counts[index] ?? 0;
        for (let offset = 0; offset < size; offset += 1) {
          // Never quantize a permitted value into a valid one (e.g. a near-half-point RPE).
          const value =
            offset === size - 1
              ? control.range.maximum
              : control.range.minimum + offset * control.range.increment;
          if (!visit(index + 1, { ...values, [control.key]: value })) return false;
        }
        return true;
      };
      visit(0, {});
    }
  });
export type ActivityPlanAuthoringContent = z.output<typeof activityPlanAuthoringContentSchema>;
