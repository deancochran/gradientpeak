import {
  type AthleteCapabilityPlanningProjectionInput,
  projectAthleteCapabilitiesForPlanning,
} from "../athlete-capabilities/planning";
import { numericPlannedCommonLoad } from "../load";
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
  capabilityPlanning?: AthleteCapabilityPlanningProjectionInput;
};

export type PlanningProjection = ReturnType<typeof derivePlanningProjection>;

export function derivePlanningProjection({
  activityPlansById = {},
  capabilityPlanning,
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
            targetLoad: session.intent.targetLoad,
          }
        : undefined,
      estimatedCommonLoad: plannedCommonLoad(session),
      estimatedDurationSeconds: plannedDurationSeconds(session),
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
      estimatedCommonLoad: plannedCommonLoad(session),
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
    ...(capabilityPlanning === undefined
      ? {}
      : {
          capabilityProjection: projectAthleteCapabilitiesForPlanning(capabilityPlanning),
        }),
  };
}

function plannedCommonLoad(session: PlannedTrainingSession): number | null {
  const commonLoad = session.activityPlan?.prescriptionQuantification?.summary.commonLoad;
  return commonLoad === undefined ? null : (numericPlannedCommonLoad(commonLoad)?.load ?? null);
}

function plannedDurationSeconds(session: PlannedTrainingSession): number | null {
  const elapsed = session.activityPlan?.prescriptionQuantification?.summary.duration.elapsed;
  return !elapsed || elapsed.status === "unavailable" ? null : elapsed.value;
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
