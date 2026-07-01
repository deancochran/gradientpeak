import { isValidDateOnlyUtc, validateTrainingPlanCreationInput } from "@repo/core";
import { ZodError } from "zod";
import { toTrainingPlanStructure } from "./mappers";
import { trainingPlanBuilderPlanPreferencesSchema } from "./schemas";
import type {
  TrainingPlanBuilderSaveBlocker,
  TrainingPlanBuilderState,
  TrainingPlanBuilderValidationResult,
} from "./types";

function createBlocker(blocker: TrainingPlanBuilderSaveBlocker): TrainingPlanBuilderSaveBlocker {
  return blocker;
}

function toBuilderTarget(issue: {
  targetType: "overview" | "session" | "goal" | "assumptions";
  targetId?: string;
}): TrainingPlanBuilderSaveBlocker["target"] {
  if (issue.targetType === "session" && issue.targetId) {
    return { type: "session", sessionId: issue.targetId };
  }
  if (issue.targetType === "goal" && issue.targetId) {
    return { type: "goal", goalId: issue.targetId };
  }
  if (issue.targetType === "assumptions") {
    return { type: "assumptions" };
  }
  return { type: "overview" };
}

export function validateTrainingPlanBuilderState(
  state: TrainingPlanBuilderState,
): TrainingPlanBuilderValidationResult {
  const planPreferenceResult = trainingPlanBuilderPlanPreferencesSchema.safeParse(
    state.planPreferences,
  );
  const blockers: TrainingPlanBuilderSaveBlocker[] = validateTrainingPlanCreationInput({
    name: state.details.name,
    anchorDateValid: isValidDateOnlyUtc(state.anchorDate),
    profileBirthDateValid: true,
    planPreferencesValid: planPreferenceResult.success,
    planPreferencesMessage: planPreferenceResult.success
      ? undefined
      : planPreferenceResult.error.issues[0]?.message,
    sessions: state.structure.sessions.map((session) => ({
      localId: session.localId,
      offsetDays: session.offsetDays,
      plannedOffsetDays: null,
      plannedDateValid: true,
      activityPlan: session.activityPlan
        ? {
            id: session.activityPlan.id,
            accessible: session.activityPlan.accessible,
            published: session.activityPlan.published,
          }
        : null,
      startTime: session.eventOverrides?.start_time ?? null,
    })),
    goals: state.goalContext.selectedGoals.map((goal) => ({
      localId: goal.localId,
      targetDateValid: goal.targetDate ? isValidDateOnlyUtc(goal.targetDate) : true,
      targetOffsetDays: goal.targetOffsetDays,
    })),
  }).map((issue) =>
    createBlocker({
      code: issue.code,
      message: issue.message,
      target: toBuilderTarget(issue),
    }),
  );

  if (blockers.length === 0) {
    try {
      toTrainingPlanStructure(state);
    } catch (error) {
      if (error instanceof ZodError) {
        blockers.push(
          createBlocker({
            code: "canonical_schema_failure",
            message: error.issues[0]?.message ?? "Training plan structure is invalid.",
            target: { type: "overview" },
          }),
        );
      } else {
        throw error;
      }
    }
  }

  return { blockers };
}
