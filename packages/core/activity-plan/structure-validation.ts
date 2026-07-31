import type { z } from "zod";

import { isTargetTypePermittedForActivity } from "../targets/capabilities";
import type { ActivityPlanSegment } from "./structure-schema";

type ActivityPlanStructureShape = { version: 3; segments: ActivityPlanSegment[] };

export const ACTIVITY_PLAN_LIMITS = {
  maxSegments: 64,
  maxIntervalsPerActivity: 50,
  maxStepsPerInterval: 20,
  maxIntervalRepetitions: 50,
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
  missingActivity: "ACTIVITY_PLAN_MISSING_ACTIVITY",
  payloadTooLarge: "ACTIVITY_PLAN_PAYLOAD_TOO_LARGE",
  consecutiveRests: "ACTIVITY_PLAN_CONSECUTIVE_RESTS",
  incompatibleTarget: "ACTIVITY_PLAN_INCOMPATIBLE_TARGET",
  mixedActivityCategories: "ACTIVITY_PLAN_MIXED_ACTIVITY_CATEGORIES",
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

type ValidationIssue = {
  code: ActivityPlanIssueCode;
  path: PropertyKey[];
  message: string;
};

function issue(code: ActivityPlanIssueCode, path: PropertyKey[], message: string): ValidationIssue {
  return { code, path, message: `[${code}] ${message}` };
}

/** Validates invariants which span multiple activity-plan segments, intervals, or steps. */
export function getActivityPlanDocumentIssues(
  structure: ActivityPlanStructureShape,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, PropertyKey[]>();
  let activityCount = 0;
  const activityCategories = new Set<string>();
  let expandedOccurrences = 0;
  let explicitTimedSeconds = 0;

  const registerId = (id: string, path: PropertyKey[]) => {
    const firstPath = ids.get(id);
    if (firstPath) {
      issues.push(
        issue(
          activityPlanIssueCodes.duplicateId,
          path,
          `ID ${id} duplicates ${firstPath.join(".")}.`,
        ),
      );
      return;
    }
    ids.set(id, path);
  };

  structure.segments.forEach((segment, segmentIndex) => {
    const segmentPath: PropertyKey[] = ["segments", segmentIndex];
    registerId(segment.id, [...segmentPath, "id"]);

    if (segment.role !== "activity") {
      explicitTimedSeconds += segment.duration.seconds;
      if (segment.role === "rest" && structure.segments[segmentIndex - 1]?.role === "rest") {
        issues.push(
          issue(
            activityPlanIssueCodes.consecutiveRests,
            [...segmentPath, "role"],
            "Rest segments cannot be consecutive.",
          ),
        );
      }
      return;
    }

    activityCount += 1;
    activityCategories.add(segment.activity_category);
    segment.intervals.forEach((interval, intervalIndex) => {
      const intervalPath = [...segmentPath, "intervals", intervalIndex];
      registerId(interval.id, [...intervalPath, "id"]);
      expandedOccurrences += interval.steps.length * interval.repetitions;

      interval.steps.forEach((step, stepIndex) => {
        registerId(step.id, [...intervalPath, "steps", stepIndex, "id"]);
        if (step.duration.type === "time") {
          explicitTimedSeconds += step.duration.seconds * interval.repetitions;
        }
        step.targets.forEach((target, targetIndex) => {
          if (
            !isTargetTypePermittedForActivity({
              activityCategory: segment.activity_category,
              targetType: target.type,
            })
          ) {
            issues.push(
              issue(
                activityPlanIssueCodes.incompatibleTarget,
                [...intervalPath, "steps", stepIndex, "targets", targetIndex, "type"],
                `Target type ${target.type} is not permitted for ${segment.activity_category}.`,
              ),
            );
          }
        });
      });
    });
  });

  if (activityCount === 0) {
    issues.push(
      issue(
        activityPlanIssueCodes.missingActivity,
        ["segments"],
        "A plan must contain at least one activity segment.",
      ),
    );
  }
  if (activityCategories.size > 1) {
    issues.push(
      issue(
        activityPlanIssueCodes.mixedActivityCategories,
        ["segments"],
        "A plan must contain activity segments for exactly one activity_category.",
      ),
    );
  }
  if (expandedOccurrences > ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences) {
    issues.push(
      issue(
        activityPlanIssueCodes.expandedOccurrencesExceeded,
        ["segments"],
        `A plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxExpandedStepOccurrences} expanded step occurrences.`,
      ),
    );
  }
  if (explicitTimedSeconds > ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds) {
    issues.push(
      issue(
        activityPlanIssueCodes.explicitTimedBudgetExceeded,
        ["segments"],
        `A plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds} explicit timed seconds.`,
      ),
    );
  }

  const encodedBytes = getEncodedJsonByteLength(structure);
  if (!isActivityPlanEncodedByteLengthWithinLimit(encodedBytes)) {
    issues.push(
      issue(
        activityPlanIssueCodes.payloadTooLarge,
        [],
        `The encoded plan cannot exceed ${ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes} bytes.`,
      ),
    );
  }

  return issues;
}

export function addActivityPlanDocumentIssues(
  structure: ActivityPlanStructureShape,
  ctx: z.RefinementCtx,
): void {
  for (const validationIssue of getActivityPlanDocumentIssues(structure)) {
    ctx.addIssue({
      code: "custom",
      path: validationIssue.path,
      message: validationIssue.message,
      params: { activityPlanIssueCode: validationIssue.code },
    });
  }
}
