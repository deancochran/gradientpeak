import type { z } from "zod";
import {
  type ActivityTargetCategory,
  type ActivityTargetType,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
} from "../targets";
import type { ActivityPlanStructureV2 } from "./activity_plan_v2";
import { canonicalSportValues } from "./sport";

export {
  type ActivityTargetCapability,
  type ActivityTargetCategory,
  type ActivityTargetDomain,
  type ActivityTargetType,
  activityTargetCapabilityConfig,
  activityTargetDomainByType,
  getPermissibleTargetTypes,
  getPreferredTargetTypes,
  isTargetTypePermittedForActivity,
  sortTargetsByActivityPreference,
} from "../targets";

export const activityTargetCategorySchemaValues = canonicalSportValues;

export type ActivityTargetCompatibilityIssue = {
  activityCategory: ActivityTargetCategory;
  message: string;
  path: (string | number)[];
  targetType: ActivityTargetType;
};

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
