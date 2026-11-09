import type { z } from "zod";
import { isTargetTypePermittedForActivity } from "../targets/capabilities";
import { getActivityTargetRole } from "../targets/objective-intensity";
import type { ActivityPlanItem } from "./structure-schema";

type ActivityPlanStructureShape = {
  version: 5;
  activity_category: "run" | "bike" | "swim" | "strength" | "other";
  items: ActivityPlanItem[];
};
export const ACTIVITY_PLAN_LIMITS = {
  maxItems: 1_000,
  maxStepsPerRepeat: 20,
  maxRepeatCount: 50,
  maxExpandedStepOccurrences: 1_000,
  maxStepDurationSeconds: 24 * 60 * 60,
  maxStepDistanceMeters: 1_000_000,
  maxStepRepetitionCount: 10_000,
  maxExplicitTimedDurationSeconds: 7 * 24 * 60 * 60,
  maxEncodedJsonBytes: 1024 * 1024,
} as const;
export const activityPlanIssueCodes = {
  duplicateId: "ACTIVITY_PLAN_DUPLICATE_ID",
  expandedOccurrencesExceeded: "ACTIVITY_PLAN_EXPANDED_OCCURRENCES_EXCEEDED",
  explicitTimedBudgetExceeded: "ACTIVITY_PLAN_EXPLICIT_TIMED_BUDGET_EXCEEDED",
  payloadTooLarge: "ACTIVITY_PLAN_PAYLOAD_TOO_LARGE",
  duplicateTarget: "ACTIVITY_PLAN_DUPLICATE_TARGET",
  incompatibleTarget: "ACTIVITY_PLAN_INCOMPATIBLE_TARGET",
  multipleObjectiveTargets: "ACTIVITY_PLAN_MULTIPLE_OBJECTIVE_TARGETS",
  restMustBeSoleTarget: "ACTIVITY_PLAN_REST_MUST_BE_SOLE_TARGET",
  restRequiresTimeDuration: "ACTIVITY_PLAN_REST_REQUIRES_TIME_DURATION",
} as const;
export type ActivityPlanIssueCode =
  (typeof activityPlanIssueCodes)[keyof typeof activityPlanIssueCodes];
export function getEncodedJsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export function isActivityPlanEncodedByteLengthWithinLimit(encodedBytes: number): boolean {
  return (
    Number.isInteger(encodedBytes) &&
    encodedBytes >= 0 &&
    encodedBytes <= ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes
  );
}
type ValidationIssue = { code: ActivityPlanIssueCode; path: PropertyKey[]; message: string };
const issue = (
  code: ActivityPlanIssueCode,
  path: PropertyKey[],
  message: string,
): ValidationIssue => ({ code, path, message: `[${code}] ${message}` });
export function getActivityPlanDocumentIssues(
  structure: ActivityPlanStructureShape,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, PropertyKey[]>();
  let expanded = 0;
  let timed = 0;
  const register = (id: string, path: PropertyKey[]) => {
    const first = ids.get(id);
    if (first)
      issues.push(
        issue(activityPlanIssueCodes.duplicateId, path, `ID ${id} duplicates ${first.join(".")}.`),
      );
    else ids.set(id, path);
  };
  const visit = (
    step: Extract<ActivityPlanItem, { type: "step" }>,
    path: PropertyKey[],
    executions: number,
  ) => {
    register(step.id, [...path, "id"]);
    if (step.duration.type === "time") timed += step.duration.seconds * executions;
    const restTargetIndex = step.targets.findIndex((target) => target.type === "rest");
    if (restTargetIndex !== -1 && step.targets.length !== 1)
      issues.push(
        issue(
          activityPlanIssueCodes.restMustBeSoleTarget,
          [...path, "targets", restTargetIndex],
          "A rest target must be the sole target on its step.",
        ),
      );
    if (restTargetIndex !== -1 && step.duration.type !== "time")
      issues.push(
        issue(
          activityPlanIssueCodes.restRequiresTimeDuration,
          [...path, "duration", "type"],
          "A rest target requires a positive time duration.",
        ),
      );
    const types = new Set<string>();
    let objective = false;
    step.targets.forEach((target, targetIndex) => {
      const targetPath = [...path, "targets", targetIndex, "type"];
      if (types.has(target.type))
        issues.push(
          issue(
            activityPlanIssueCodes.duplicateTarget,
            targetPath,
            `A step cannot contain more than one ${target.type} target.`,
          ),
        );
      types.add(target.type);
      if (getActivityTargetRole(target) === "objective") {
        if (objective)
          issues.push(
            issue(
              activityPlanIssueCodes.multipleObjectiveTargets,
              targetPath,
              "A step can have only one objective intensity target; cadence may be added as a supplemental target.",
            ),
          );
        objective = true;
      }
      if (
        !isTargetTypePermittedForActivity({
          activityCategory: structure.activity_category,
          targetType: target.type,
        })
      )
        issues.push(
          issue(
            activityPlanIssueCodes.incompatibleTarget,
            targetPath,
            `Target type ${target.type} is not permitted for ${structure.activity_category}.`,
          ),
        );
    });
  };
  structure.items.forEach((item, itemIndex) => {
    const path: PropertyKey[] = ["items", itemIndex];
    if (item.type === "step") {
      expanded += 1;
      visit(item, path, 1);
      return;
    }
    register(item.id, [...path, "id"]);
    expanded += item.steps.length * item.count;
    item.steps.forEach((step, stepIndex) => {
      visit(step, [...path, "steps", stepIndex], item.count);
    });
  });
  if (expanded > ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences)
    issues.push(
      issue(
        activityPlanIssueCodes.expandedOccurrencesExceeded,
        ["items"],
        `A plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences} expanded step occurrences.`,
      ),
    );
  if (timed > ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds)
    issues.push(
      issue(
        activityPlanIssueCodes.explicitTimedBudgetExceeded,
        ["items"],
        `A plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds} explicit timed seconds.`,
      ),
    );
  if (!isActivityPlanEncodedByteLengthWithinLimit(getEncodedJsonByteLength(structure)))
    issues.push(
      issue(
        activityPlanIssueCodes.payloadTooLarge,
        [],
        `The encoded plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes} bytes.`,
      ),
    );
  return issues;
}
export function addActivityPlanDocumentIssues(
  structure: ActivityPlanStructureShape,
  ctx: z.RefinementCtx,
): void {
  for (const value of getActivityPlanDocumentIssues(structure))
    ctx.addIssue({
      code: "custom",
      path: value.path,
      message: value.message,
      params: { activityPlanIssueCode: value.code },
    });
}
