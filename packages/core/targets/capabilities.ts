import type { CanonicalSport } from "../schemas/sport";
import type { ActivityTargetType } from "./schema";

export type ActivityTargetCategory = CanonicalSport;

export type ActivityTargetCapability = {
  allowed: readonly ActivityTargetType[];
  preferred: readonly ActivityTargetType[];
};

export const activityTargetCapabilityConfig = {
  run: {
    allowed: ["bpm", "%MaxHR", "%ThresholdHR", "speed", "cadence", "RPE"],
    preferred: ["speed", "%ThresholdHR", "bpm", "%MaxHR", "cadence", "RPE"],
  },
  bike: {
    allowed: ["%FTP", "watts", "bpm", "%MaxHR", "%ThresholdHR", "cadence", "RPE"],
    preferred: ["%FTP", "watts", "cadence", "%ThresholdHR", "bpm", "%MaxHR", "RPE"],
  },
  swim: {
    allowed: ["bpm", "%MaxHR", "%ThresholdHR", "RPE"],
    preferred: ["RPE", "%ThresholdHR", "bpm", "%MaxHR"],
  },
  strength: { allowed: ["RPE"], preferred: ["RPE"] },
  other: {
    allowed: ["RPE", "bpm", "%MaxHR"],
    preferred: ["RPE", "bpm", "%MaxHR"],
  },
} as const satisfies Record<ActivityTargetCategory, ActivityTargetCapability>;

export function getPermissibleTargetTypes(
  activityCategory: ActivityTargetCategory,
): readonly ActivityTargetType[] {
  return activityTargetCapabilityConfig[activityCategory].allowed;
}

export function getPreferredTargetTypes(
  activityCategory: ActivityTargetCategory,
): readonly ActivityTargetType[] {
  return activityTargetCapabilityConfig[activityCategory].preferred;
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
