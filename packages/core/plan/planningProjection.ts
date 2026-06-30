import type { PlanningContext } from "./planningContext";
import {
  mapPlanningPreferencesToCreationConstraints,
  type PlanningPreferences,
} from "./planningPreferences";
import {
  applyEstimatedSessionActivityFacts,
  deriveEstimatedPlannedTrainingSessions,
  type EstimateablePlanningActivityPlan,
  type EstimatedPlannedTrainingSession,
  type PlannedTrainingSession,
} from "./planningSessions";
import { deriveTrainingPlanCreationPreview } from "./trainingPlanCreationPreview";
import { deriveTrainingPlanSchedulingPreview } from "./trainingPlanSchedulingPreview";

export type PlanningProjectionInput = {
  context: PlanningContext;
  activityPlansById?: Record<string, EstimateablePlanningActivityPlan | undefined>;
};

export type PlanningProjection = ReturnType<typeof derivePlanningProjection>;

export function derivePlanningProjection({
  activityPlansById = {},
  context,
}: PlanningProjectionInput) {
  const estimatedSessions = deriveEstimatedPlannedTrainingSessions({
    activityPlansById,
    athleteContext: context.athleteContext,
    sessions: context.sessions,
  });
  const sessions = estimatedSessions.map(toPlannedSessionWithEstimatedFacts);
  const estimatedContext: PlanningContext = {
    ...context,
    sessions,
  };
  const creationPreview = deriveTrainingPlanCreationPreview({
    sessions: sessions.map((session) => ({
      offsetDays: session.offsetDays,
      assigned: session.activityPlan !== null,
      intent: session.intent
        ? {
            type: session.intent.type,
            targetDurationSeconds: session.intent.targetDurationSeconds,
            targetTss: session.intent.targetTss,
          }
        : undefined,
      estimatedTss: session.activityPlan?.estimatedTss ?? null,
      estimatedDurationSeconds: session.activityPlan?.estimatedDurationSeconds ?? null,
    })),
  });
  const schedulingPreview = deriveTrainingPlanSchedulingPreview({
    startDate: context.scheduling.startDate,
    preferredWeekdays: context.scheduling.preferredWeekdays,
    sessionDateOverrides: context.scheduling.sessionDateOverrides,
    sessions: sessions.map((session) => ({
      id: session.localId,
      label: formatPlanningSessionLabel(session),
      offsetDays: session.offsetDays,
      estimatedTss: session.activityPlan?.estimatedTss ?? null,
      intentType: session.intent?.type,
    })),
  });
  const creationConstraints = mapPlanningPreferencesToCreationConstraints({
    preferences: context.preferences,
    preferredWeekdays: context.scheduling.preferredWeekdays,
  });

  return {
    context,
    estimatedContext,
    estimatedSessions,
    sessions,
    creationPreview,
    schedulingPreview,
    creationConstraints,
  };
}

function toPlannedSessionWithEstimatedFacts(
  session: EstimatedPlannedTrainingSession,
): PlannedTrainingSession {
  const { activityPlanEstimate, ...plannedSession } = session;
  return applyEstimatedSessionActivityFacts(plannedSession, activityPlanEstimate);
}

function formatPlanningSessionLabel(session: PlannedTrainingSession): string {
  return (
    session.eventOverrides?.title ?? session.activityPlan?.name ?? `Day ${session.offsetDays + 1}`
  );
}

export function hasPlanningPreferenceSeed(preferences: PlanningPreferences): boolean {
  return preferences.durationWeeks !== null || preferences.weeklySessionCount !== null;
}
