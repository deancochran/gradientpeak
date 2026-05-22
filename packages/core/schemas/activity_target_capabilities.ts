import type { z } from "zod";
import type { ActivityPlanStructureV2, IntensityTargetV2 } from "./activity_plan_v2";

export const activityTargetCategorySchemaValues = [
  "run",
  "bike",
  "swim",
  "strength",
  "other",
] as const;

export type ActivityTargetCategory = (typeof activityTargetCategorySchemaValues)[number];

export type ActivityTargetType = IntensityTargetV2["type"];

export type ActivityTargetDomain =
  | "cadence"
  | "heart_rate"
  | "perceived_effort"
  | "power"
  | "speed";

export type ActivityTargetCapability = {
  allowed: readonly ActivityTargetType[];
  preferred: readonly ActivityTargetType[];
};

export type ActivityTargetCompatibilityIssue = {
  activityCategory: ActivityTargetCategory;
  message: string;
  path: (string | number)[];
  targetType: ActivityTargetType;
};

export const activityTargetDomainByType = {
  "%FTP": "power",
  watts: "power",
  bpm: "heart_rate",
  "%MaxHR": "heart_rate",
  "%ThresholdHR": "heart_rate",
  speed: "speed",
  cadence: "cadence",
  RPE: "perceived_effort",
} as const satisfies Record<ActivityTargetType, ActivityTargetDomain>;

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
  strength: {
    allowed: ["RPE"],
    preferred: ["RPE"],
  },
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

export function getActivityTargetCompatibilityIssues(input: {
  activityCategory: ActivityTargetCategory;
  pathPrefix?: (string | number)[];
  structure: ActivityPlanStructureV2;
}): ActivityTargetCompatibilityIssue[] {
  const issues: ActivityTargetCompatibilityIssue[] = [];
  const pathPrefix = input.pathPrefix ?? [];

  input.structure.intervals.forEach((interval, intervalIndex) => {
    interval.steps.forEach((step, stepIndex) => {
      step.targets?.forEach((target, targetIndex) => {
        if (
          isTargetTypePermittedForActivity({
            activityCategory: input.activityCategory,
            targetType: target.type,
          })
        ) {
          return;
        }

        issues.push({
          activityCategory: input.activityCategory,
          targetType: target.type,
          path: [
            ...pathPrefix,
            "intervals",
            intervalIndex,
            "steps",
            stepIndex,
            "targets",
            targetIndex,
            "type",
          ],
          message: `Target type ${target.type} is not permitted for ${input.activityCategory} activity plans. Allowed targets: ${getPermissibleTargetTypes(input.activityCategory).join(", ")}.`,
        });
      });
    });
  });

  return issues;
}

export function getLegacyActivityTargetCompatibilityIssues(input: {
  activityCategory: ActivityTargetCategory;
  pathPrefix?: (string | number)[];
  structure: {
    steps?: Array<{
      steps?: Array<{ targets?: Array<{ type: ActivityTargetType }> }>;
      targets?: Array<{ type: ActivityTargetType }>;
      type?: string;
    }>;
  };
}): ActivityTargetCompatibilityIssue[] {
  const issues: ActivityTargetCompatibilityIssue[] = [];
  const pathPrefix = input.pathPrefix ?? [];

  input.structure.steps?.forEach((item, itemIndex) => {
    const steps = item.type === "repetition" ? (item.steps ?? []) : [item];
    steps.forEach((step, stepIndex) => {
      step.targets?.forEach((target, targetIndex) => {
        if (
          isTargetTypePermittedForActivity({
            activityCategory: input.activityCategory,
            targetType: target.type,
          })
        ) {
          return;
        }

        issues.push({
          activityCategory: input.activityCategory,
          targetType: target.type,
          path:
            item.type === "repetition"
              ? [
                  ...pathPrefix,
                  "steps",
                  itemIndex,
                  "steps",
                  stepIndex,
                  "targets",
                  targetIndex,
                  "type",
                ]
              : [...pathPrefix, "steps", itemIndex, "targets", targetIndex, "type"],
          message: `Target type ${target.type} is not permitted for ${input.activityCategory} activity plans. Allowed targets: ${getPermissibleTargetTypes(input.activityCategory).join(", ")}.`,
        });
      });
    });
  });

  return issues;
}

export function addActivityTargetCompatibilityIssuesToZodContext(input: {
  activityCategory: ActivityTargetCategory;
  ctx: z.RefinementCtx;
  pathPrefix?: (string | number)[];
  structure: ActivityPlanStructureV2;
}): void {
  getActivityTargetCompatibilityIssues(input).forEach((issue) => {
    input.ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message,
    });
  });
}
