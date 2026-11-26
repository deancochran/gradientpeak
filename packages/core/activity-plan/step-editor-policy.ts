import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { getPermissibleTargetTypes } from "../targets/capabilities";
import { type ActivityTargetType, activityTargetDefinitionByType } from "../targets/schema";
import type { NumericInputPrecision } from "../utils/numeric-ux-policy";
import type { ActivityPlanDuration } from "./structure-schema";

type NumericTargetType = Exclude<ActivityTargetType, "rest">;

/** Shared, display-safe numeric bounds. Surface-specific raw draft lifecycles stay local. */
export function getActivityPlanStepTargetInputPolicy(type: NumericTargetType): {
  commitMinimum: number;
  maximum: number;
  minimum: number;
  pickerMinimum: number;
  precision: NumericInputPrecision;
} {
  const definition = activityTargetDefinitionByType[type];
  const exclusive = "exclusiveMinimum" in definition && definition.exclusiveMinimum;
  return {
    // Typed raw drafts retain the schema's lower edge so callers can keep a visible invalid
    // entry for repair. Error display and picker controls use their stricter representations.
    commitMinimum: definition.minimum,
    minimum: definition.minimum + (exclusive ? Number.EPSILON : 0),
    pickerMinimum: definition.minimum + (exclusive ? 1 : 0),
    maximum: definition.saveableMaximum,
    precision:
      type === "speed"
        ? { maxDecimalPlaces: 2 }
        : type === "RPE"
          ? { maxDecimalPlaces: 1 }
          : "integer",
  };
}

/**
 * Editor availability is policy, not a UI layout concern. Existing unsupported values remain
 * repairable in callers; this only describes choices offered for a new selection.
 */
export function getActivityPlanStepTargetEditorPolicy(input: {
  activityCategory: CanonicalActivityCategory | null;
  durationType: ActivityPlanDuration["type"] | null | undefined;
}): {
  maximumTargets: number;
  restAllowed: boolean;
  selectableTargetTypes: readonly ActivityTargetType[];
} {
  const restAllowed = input.durationType === "time";
  const permittedTargetTypes = input.activityCategory
    ? getPermissibleTargetTypes(input.activityCategory)
    : [];
  return {
    restAllowed,
    selectableTargetTypes: permittedTargetTypes.filter((type) => type !== "rest" || restAllowed),
    maximumTargets: input.durationType === "repetitions" ? 1 : 3,
  };
}

export function getActivityPlanStepDurationAmount(duration: ActivityPlanDuration): number {
  if (duration.type === "time") return duration.seconds;
  if (duration.type === "distance") return duration.meters;
  if (duration.type === "repetitions") return duration.count;
  return 1;
}

export function createActivityPlanStepDuration(
  type: ActivityPlanDuration["type"],
  value: number,
): ActivityPlanDuration {
  if (type === "time") return { type, seconds: value };
  if (type === "distance") return { type, meters: value };
  if (type === "repetitions") return { type, count: value };
  return { type: "untilFinished" };
}
