import type { TrainingPlanBuilderGoalBlueprint, TrainingPlanBuilderState } from "./types";
import { validateTrainingPlanBuilderState } from "./validation";

export type TrainingPlanBuilderSummary = {
  sessionCount: number;
  durationDays: number;
  assignedSessionCount: number;
  goalCount: number;
  totalEstimatedTss: number;
  totalEstimatedDurationSeconds: number;
};

export function selectSessionById(state: TrainingPlanBuilderState, sessionId: string) {
  return state.structure.sessions.find((session) => session.localId === sessionId) ?? null;
}

export function selectBuilderGoalBlueprints(
  state: TrainingPlanBuilderState,
): TrainingPlanBuilderGoalBlueprint[] {
  return state.goalContext.selectedGoals;
}

export function selectBuilderSummary(state: TrainingPlanBuilderState): TrainingPlanBuilderSummary {
  const sessions = state.structure.sessions;
  const latestOffsetDays = sessions.reduce(
    (latest, session) => Math.max(latest, session.offsetDays),
    -1,
  );

  return {
    sessionCount: sessions.length,
    durationDays: latestOffsetDays >= 0 ? latestOffsetDays + 1 : 0,
    assignedSessionCount: sessions.filter((session) => session.activityPlan !== null).length,
    goalCount: selectBuilderGoalBlueprints(state).length,
    totalEstimatedTss: sessions.reduce(
      (total, session) => total + (session.activityPlan?.estimatedTss ?? 0),
      0,
    ),
    totalEstimatedDurationSeconds: sessions.reduce(
      (total, session) => total + (session.activityPlan?.estimatedDurationSeconds ?? 0),
      0,
    ),
  };
}

export function selectSaveReadiness(state: TrainingPlanBuilderState) {
  const validation = validateTrainingPlanBuilderState(state);
  return {
    canSave: validation.blockers.length === 0,
    blockers: validation.blockers,
  };
}
