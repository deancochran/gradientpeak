import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { ActivityTargetType } from "./schema";

export type ActivityTargetCategory = CanonicalActivityCategory;

export type ActivityTargetCapability = readonly ActivityTargetType[];

export const activityTargetCapabilityConfig = {
  run: ["speed", "%ThresholdHR", "bpm", "%MaxHR", "cadence", "RPE"],
  bike: ["%FTP", "watts", "cadence", "%ThresholdHR", "bpm", "%MaxHR", "RPE"],
  swim: ["speed", "RPE", "%ThresholdHR", "bpm", "%MaxHR"],
  strength: ["RPE"],
  other: ["RPE", "bpm", "%MaxHR"],
} as const satisfies Record<ActivityTargetCategory, ActivityTargetCapability>;

export function getPermissibleTargetTypes(
  activityCategory: ActivityTargetCategory,
): readonly ActivityTargetType[] {
  return activityTargetCapabilityConfig[activityCategory];
}

export function getPreferredTargetTypes(
  activityCategory: ActivityTargetCategory,
): readonly ActivityTargetType[] {
  return activityTargetCapabilityConfig[activityCategory];
}

export function isTargetTypePermittedForActivity(input: {
  activityCategory: ActivityTargetCategory;
  targetType: ActivityTargetType;
}): boolean {
  return getPermissibleTargetTypes(input.activityCategory).includes(input.targetType);
}

export function sortTargetsByActivityPreference<
  TTarget extends { type: ActivityTargetType },
>(input: { activityCategory: ActivityTargetCategory; targets: readonly TTarget[] }): TTarget[] {
  const preferred = getPreferredTargetTypes(input.activityCategory);
  return [...input.targets].sort(
    (left, right) => preferred.indexOf(left.type) - preferred.indexOf(right.type),
  );
}
