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

  input.structure.segments.forEach((segment, segmentIndex) => {
    if (segment.role !== "activity") return;
    segment.intervals.forEach((interval, intervalIndex) => {
      interval.steps.forEach((step, stepIndex) => {
        step.targets.forEach((target, targetIndex) => {
          if (
            isTargetTypePermittedForActivity({
              activityCategory: segment.activity_category,
              targetType: target.type,
            })
          ) {
            return;
          }

          issues.push({
            activityCategory: segment.activity_category,
            targetType: target.type,
            path: [
              ...pathPrefix,
              "segments",
              segmentIndex,
              "intervals",
              intervalIndex,
              "steps",
              stepIndex,
              "targets",
              targetIndex,
              "type",
            ],
            message: `Target type ${target.type} is not permitted for ${segment.activity_category} activity plans. Allowed targets: ${getPermissibleTargetTypes(segment.activity_category).join(", ")}.`,
          });
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
