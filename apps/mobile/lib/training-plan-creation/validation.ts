import { ZodError } from "zod";
import { toTrainingPlanStructure } from "./mappers";
import type {
  TrainingPlanBuilderSaveBlocker,
  TrainingPlanBuilderState,
  TrainingPlanBuilderValidationResult,
} from "./types";

function createBlocker(blocker: TrainingPlanBuilderSaveBlocker): TrainingPlanBuilderSaveBlocker {
  return blocker;
}

export function validateTrainingPlanBuilderState(
  state: TrainingPlanBuilderState,
): TrainingPlanBuilderValidationResult {
  const blockers: TrainingPlanBuilderSaveBlocker[] = [];

  if (state.details.name.trim().length === 0) {
    blockers.push(
      createBlocker({
        code: "missing_plan_name",
        message: "Add a training plan name before saving.",
        target: { type: "overview" },
      }),
    );
  }

  if (state.schedule.sessions.length === 0) {
    blockers.push(
      createBlocker({
        code: "no_sessions",
        message: "Add at least one session before saving.",
        target: { type: "overview" },
      }),
    );
  }

  const sessionKeys = new Map<string, string>();
  for (const session of state.schedule.sessions) {
    if (session.offsetDays < 0) {
      blockers.push(
        createBlocker({
          code: "invalid_offset_days",
          message: "Sessions must use a non-negative relative day offset.",
          target: { type: "session", sessionId: session.localId },
        }),
      );
    }

    if (
      session.eventOverrides?.start_time &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(session.eventOverrides.start_time)
    ) {
      blockers.push(
        createBlocker({
          code: "invalid_start_time",
          message: "Session start times must use HH:mm format.",
          target: { type: "session", sessionId: session.localId },
        }),
      );
    }

    if (!session.activityPlan) {
      blockers.push(
        createBlocker({
          code: "missing_activity_plan",
          message: "Assign an activity plan to every training plan session.",
          target: { type: "session", sessionId: session.localId },
        }),
      );
      continue;
    }

    if (!session.activityPlan.accessible) {
      blockers.push(
        createBlocker({
          code: "inaccessible_activity_plan",
          message: "Use only activity plans available to the athlete creating this plan.",
          target: { type: "session", sessionId: session.localId },
        }),
      );
    }

    if (!session.activityPlan.published) {
      blockers.push(
        createBlocker({
          code: "unpublished_activity_plan",
          message: "Publish the activity plan before assigning it to a training plan.",
          target: { type: "session", sessionId: session.localId },
        }),
      );
    }

    const sessionKey = [
      session.offsetDays,
      session.activityPlan.id,
      session.eventOverrides?.start_time ?? "",
    ].join("|");
    const existingSessionId = sessionKeys.get(sessionKey);
    if (existingSessionId) {
      blockers.push(
        createBlocker({
          code: "duplicate_session",
          message: "Sessions cannot duplicate the same activity plan, day, and start time.",
          target: { type: "session", sessionId: session.localId },
        }),
      );
    } else {
      sessionKeys.set(sessionKey, session.localId);
    }
  }

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
