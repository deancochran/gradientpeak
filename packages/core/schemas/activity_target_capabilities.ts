import type { z } from "zod";
import type { ActivityPlanStructure } from "../activity-plan";
import {
  type ActivityTargetCategory,
  type ActivityTargetType,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
} from "../targets";
import { canonicalActivityCategoryValues } from "./activity-category";

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

export const activityTargetCategorySchemaValues = canonicalActivityCategoryValues;

export type ActivityTargetCompatibilityIssue = {
  activityCategory: ActivityTargetCategory;
  message: string;
  path: (string | number)[];
  targetType: ActivityTargetType;
};

export function getActivityTargetCompatibilityIssues(input: {
  pathPrefix?: (string | number)[];
  structure: ActivityPlanStructure;
}): ActivityTargetCompatibilityIssue[] {
  const issues: ActivityTargetCompatibilityIssue[] = [];
  const pathPrefix = input.pathPrefix ?? [];

  input.structure.items.forEach((item, itemIndex) => {
    (item.type === "step" ? [item] : item.steps).forEach((step, stepIndex) => {
      step.targets.forEach((target, targetIndex) => {
        if (
          isTargetTypePermittedForActivity({
            activityCategory: input.structure.activity_category,
            targetType: target.type,
          })
        ) {
          return;
        }

        issues.push({
          activityCategory: input.structure.activity_category,
          targetType: target.type,
          path: [
            ...pathPrefix,
            "items",
            itemIndex,
            ...(item.type === "repeat" ? ["steps", stepIndex] : []),
            "targets",
            targetIndex,
            "type",
          ],
          message: `Target type ${target.type} is not permitted for ${input.structure.activity_category} activity plans. Allowed targets: ${getPermissibleTargetTypes(input.structure.activity_category).join(", ")}.`,
        });
      });
    });
  });

  return issues;
}

export function addActivityTargetCompatibilityIssuesToZodContext(input: {
  ctx: z.RefinementCtx;
  pathPrefix?: (string | number)[];
  structure: ActivityPlanStructure;
}): void {
  getActivityTargetCompatibilityIssues(input).forEach((issue) => {
    input.ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message,
    });
  });
}
