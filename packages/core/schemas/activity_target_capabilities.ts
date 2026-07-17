import type { z } from "zod";
import type { ActivityPlanStructureV3 } from "../activity-plan";
import {
  type ActivityTargetCategory,
  type ActivityTargetType,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
} from "../targets";
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
  pathPrefix?: (string | number)[];
  structure: ActivityPlanStructureV3;
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
              activityCategory: segment.category,
              targetType: target.type,
            })
          ) {
            return;
          }

          issues.push({
            activityCategory: segment.category,
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
            message: `Target type ${target.type} is not permitted for ${segment.category} activity plans. Allowed targets: ${getPermissibleTargetTypes(segment.category).join(", ")}.`,
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
  structure: ActivityPlanStructureV3;
}): void {
  getActivityTargetCompatibilityIssues(input).forEach((issue) => {
    input.ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message,
    });
  });
}
