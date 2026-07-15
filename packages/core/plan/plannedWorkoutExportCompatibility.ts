import {
  ACTIVITY_PLAN_V2_SAVEABLE_LIMITS,
  type ActivityPlanStructureV2,
} from "../schemas/activity_plan_v2";
import {
  type ActivityTargetCategory,
  getActivityTargetCompatibilityIssues,
} from "../schemas/activity_target_capabilities";

export type PlannedWorkoutExportCompatibilityIssue = {
  code: "unsupported_sport" | "unsupported_target" | "size_limit";
  message: string;
  path: (string | number)[];
};

export type PlannedWorkoutExportCompatibility = {
  compatible: boolean;
  issues: PlannedWorkoutExportCompatibilityIssue[];
};

/** Checks the provider-neutral export envelope before provider-specific readiness. */
export function getPlannedWorkoutExportCompatibility(input: {
  sport: ActivityTargetCategory;
  structure: ActivityPlanStructureV2;
}): PlannedWorkoutExportCompatibility {
  const issues: PlannedWorkoutExportCompatibilityIssue[] = [];

  if (input.sport !== "run" && input.sport !== "bike") {
    issues.push({
      code: "unsupported_sport",
      message: `Planned-workout export does not support ${input.sport}.`,
      path: ["sport"],
    });
  }

  getActivityTargetCompatibilityIssues({
    activityCategory: input.sport,
    structure: input.structure,
  }).forEach((issue) => {
    issues.push({ code: "unsupported_target", message: issue.message, path: issue.path });
  });

  let expandedStepCount = 0;
  let expandedTimeSeconds = 0;
  input.structure.intervals.forEach((interval, intervalIndex) => {
    expandedStepCount += interval.steps.length * interval.repetitions;
    interval.steps.forEach((step, stepIndex) => {
      const durationPath = [
        "structure",
        "intervals",
        intervalIndex,
        "steps",
        stepIndex,
        "duration",
      ];
      if (step.duration.type === "time") {
        expandedTimeSeconds += step.duration.seconds * interval.repetitions;
        if (step.duration.seconds > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDurationSeconds) {
          issues.push({
            code: "size_limit",
            message: `Step cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDurationSeconds} seconds.`,
            path: [...durationPath, "seconds"],
          });
        }
      }
      if (
        step.duration.type === "distance" &&
        step.duration.meters > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDistanceMeters
      ) {
        issues.push({
          code: "size_limit",
          message: `Step cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDistanceMeters} meters.`,
          path: [...durationPath, "meters"],
        });
      }
      if (
        step.duration.type === "repetitions" &&
        step.duration.count > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepRepetitionCount
      ) {
        issues.push({
          code: "size_limit",
          message: `Step cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepRepetitionCount} repetitions.`,
          path: [...durationPath, "count"],
        });
      }
    });
  });

  if (expandedStepCount > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount) {
    issues.push({
      code: "size_limit",
      message: `Workout cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount} expanded steps.`,
      path: ["structure", "intervals"],
    });
  }
  if (expandedTimeSeconds > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds) {
    issues.push({
      code: "size_limit",
      message: `Workout cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds} seconds of expanded time.`,
      path: ["structure", "intervals"],
    });
  }

  return { compatible: issues.length === 0, issues };
}
