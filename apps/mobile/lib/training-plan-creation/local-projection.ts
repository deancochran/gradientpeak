import {
  derivePlanningProjection,
  type EstimateablePlanningActivityPlan,
  hasPlanningPreferenceSeed,
  selectAthletePlanningContextFields,
} from "@repo/core";
import { deriveBackendPlanningState } from "./backend-planning-client";
import { createTrainingPlanPlanningContext } from "./planning-context";
import { selectTrainingPlanPreferenceFields } from "./preferences-context";
import { selectBuilderSummary, selectSaveReadiness } from "./selectors";
import { deriveTrainingPlanStructureProposal } from "./structure-proposal";
import type { TrainingPlanBuilderState } from "./types";
import { deriveBuilderPlanCreationViewModel } from "./view-model";

export function deriveTrainingPlanLocalProjection(
  state: TrainingPlanBuilderState,
  activityPlansById: Record<string, EstimateablePlanningActivityPlan | undefined> = {},
) {
  const planningContext = createTrainingPlanPlanningContext(state);
  const summary = selectBuilderSummary(state);
  const saveReadiness = selectSaveReadiness(state);
  const structureProposal = deriveTrainingPlanStructureProposal(state);
  const planningProjection = derivePlanningProjection({
    activityPlansById,
    context: planningContext,
  });
  const { creationPreview, schedulingPreview } = planningProjection;
  const estimatedState: TrainingPlanBuilderState = {
    ...state,
    anchorDate: planningProjection.estimatedContext.anchorDate,
    athleteContext: planningProjection.estimatedContext.athleteContext,
    goalContext: { selectedGoals: planningProjection.estimatedContext.goals },
    planPreferences: planningProjection.estimatedContext.preferences,
    scheduling: planningProjection.estimatedContext.scheduling,
    structure: { sessions: planningProjection.estimatedContext.sessions },
  };
  const builderViewModel = deriveBuilderPlanCreationViewModel({
    creationPreview,
    state: estimatedState,
  });
  const athleteContextFields = selectAthletePlanningContextFields(planningContext.athleteContext);
  const planningConstraintFields = selectTrainingPlanPreferenceFields(planningContext.preferences);
  const backendPlanning = deriveBackendPlanningState(planningProjection.estimatedContext);
  const canUseStructureProposal =
    planningContext.sessions.length === 0 &&
    (planningContext.goals.length > 0 || hasPlanningPreferenceSeed(planningContext.preferences));

  return {
    summary,
    saveReadiness,
    structureProposal,
    planningProjection,
    creationPreview,
    builderViewModel,
    schedulingPreview,
    athleteContextFields,
    planningConstraintFields,
    backendPlanning,
    canUseStructureProposal,
  };
}

export type TrainingPlanLocalProjection = ReturnType<typeof deriveTrainingPlanLocalProjection>;
