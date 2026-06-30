import type { PlanningContext } from "@repo/core";
import type { TrainingPlanBuilderState } from "./types";

export type TrainingPlanPlanningContext = PlanningContext;

export function createTrainingPlanPlanningContext(
  state: TrainingPlanBuilderState,
): TrainingPlanPlanningContext {
  return {
    anchorDate: state.anchorDate,
    athleteContext: state.athleteContext,
    goals: state.goalContext.selectedGoals,
    preferences: state.planPreferences,
    sessions: state.structure.sessions,
    scheduling: state.scheduling,
  };
}
