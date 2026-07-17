import type { z } from "zod";

import { isTargetTypePermittedForActivity } from "../targets/capabilities";
import type { ActivityPlanSegmentV3 } from "./v3-schema";

type ActivityPlanStructureV3Shape = { version: 3; segments: ActivityPlanSegmentV3[] };

export const ACTIVITY_PLAN_V3_LIMITS = {
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

export const activityPlanV3IssueCodes = {
  duplicateId: "ACTIVITY_PLAN_DUPLICATE_ID",
  expandedOccurrencesExceeded: "ACTIVITY_PLAN_EXPANDED_OCCURRENCES_EXCEEDED",
  explicitTimedBudgetExceeded: "ACTIVITY_PLAN_EXPLICIT_TIMED_BUDGET_EXCEEDED",
  missingActivity: "ACTIVITY_PLAN_MISSING_ACTIVITY",
  payloadTooLarge: "ACTIVITY_PLAN_PAYLOAD_TOO_LARGE",
  transitionGrammar: "ACTIVITY_PLAN_TRANSITION_GRAMMAR",
  consecutiveRests: "ACTIVITY_PLAN_CONSECUTIVE_RESTS",
  incompatibleTarget: "ACTIVITY_PLAN_INCOMPATIBLE_TARGET",
} as const;

export type ActivityPlanV3IssueCode =
  (typeof activityPlanV3IssueCodes)[keyof typeof activityPlanV3IssueCodes];

export function getEncodedJsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function isActivityPlanEncodedByteLengthWithinLimit(encodedBytes: number): boolean {
  return (
    Number.isInteger(encodedBytes) &&
    encodedBytes >= 0 &&
    encodedBytes <= ACTIVITY_PLAN_V3_LIMITS.maxEncodedJsonBytes
  );
}

type ValidationIssue = {
  code: ActivityPlanV3IssueCode;
  path: PropertyKey[];
  message: string;
};

function issue(
  code: ActivityPlanV3IssueCode,
  path: PropertyKey[],
  message: string,
): ValidationIssue {
  return { code, path, message: `[${code}] ${message}` };
}

/** Validates invariants which span multiple V3 segments, intervals, or steps. */
export function getActivityPlanV3DocumentIssues(
  structure: ActivityPlanStructureV3Shape,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, PropertyKey[]>();
  let activityCount = 0;
  let expandedOccurrences = 0;
  let explicitTimedSeconds = 0;

  const registerId = (id: string, path: PropertyKey[]) => {
    const firstPath = ids.get(id);
    if (firstPath) {
      issues.push(
        issue(
          activityPlanV3IssueCodes.duplicateId,
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
            activityPlanV3IssueCodes.consecutiveRests,
            [...segmentPath, "role"],
            "Rest segments cannot be consecutive.",
          ),
        );
      }
      return;
    }

    activityCount += 1;
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
              activityCategory: segment.category,
              targetType: target.type,
            })
          ) {
            issues.push(
              issue(
                activityPlanV3IssueCodes.incompatibleTarget,
                [...intervalPath, "steps", stepIndex, "targets", targetIndex, "type"],
                `Target type ${target.type} is not permitted for ${segment.category}.`,
              ),
            );
          }
        });
      });
    });
  });

  structure.segments.forEach((segment, segmentIndex) => {
    if (segment.role !== "transition") return;
    const previous = structure.segments[segmentIndex - 1];
    const next = structure.segments[segmentIndex + 1];
    if (previous?.role !== "activity" || next?.role !== "activity") {
      issues.push(
        issue(
          activityPlanV3IssueCodes.transitionGrammar,
          ["segments", segmentIndex, "role"],
          "A transition must be immediately between two activity segments.",
        ),
      );
    }
  });

  if (activityCount === 0) {
    issues.push(
      issue(
        activityPlanV3IssueCodes.missingActivity,
        ["segments"],
        "A plan must contain at least one activity segment.",
      ),
    );
  }
  if (expandedOccurrences > ACTIVITY_PLAN_V3_LIMITS.maxExpandedStepOccurrences) {
    issues.push(
      issue(
        activityPlanV3IssueCodes.expandedOccurrencesExceeded,
        ["segments"],
        `A plan cannot exceed ${ACTIVITY_PLAN_V3_LIMITS.maxExpandedStepOccurrences} expanded step occurrences.`,
      ),
    );
  }
  if (explicitTimedSeconds > ACTIVITY_PLAN_V3_LIMITS.maxExplicitTimedDurationSeconds) {
    issues.push(
      issue(
        activityPlanV3IssueCodes.explicitTimedBudgetExceeded,
        ["segments"],
        `A plan cannot exceed ${ACTIVITY_PLAN_V3_LIMITS.maxExplicitTimedDurationSeconds} explicit timed seconds.`,
      ),
    );
  }

  const encodedBytes = getEncodedJsonByteLength(structure);
  if (!isActivityPlanEncodedByteLengthWithinLimit(encodedBytes)) {
    issues.push(
      issue(
        activityPlanV3IssueCodes.payloadTooLarge,
        [],
        `The encoded plan cannot exceed ${ACTIVITY_PLAN_V3_LIMITS.maxEncodedJsonBytes} bytes.`,
      ),
    );
  }

  return issues;
}

export function addActivityPlanV3DocumentIssues(
  structure: ActivityPlanStructureV3Shape,
  ctx: z.RefinementCtx,
): void {
  for (const validationIssue of getActivityPlanV3DocumentIssues(structure)) {
    ctx.addIssue({
      code: "custom",
      path: validationIssue.path,
      message: validationIssue.message,
      params: { activityPlanIssueCode: validationIssue.code },
    });
  }
}
