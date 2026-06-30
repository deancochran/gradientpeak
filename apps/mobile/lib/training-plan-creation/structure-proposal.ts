import { deriveTrainingPlanStructureProposal as deriveCoreTrainingPlanStructureProposal } from "@repo/core";
import { selectBuilderGoalBlueprints } from "./selectors";
import type { TrainingPlanBuilderState } from "./types";

export type {
  TrainingPlanStructureDriver,
  TrainingPlanStructureProposal,
  TrainingPlanStructureProposalSession,
} from "@repo/core";

export function deriveTrainingPlanStructureProposal(state: TrainingPlanBuilderState) {
  return deriveCoreTrainingPlanStructureProposal({
    goals: selectBuilderGoalBlueprints(state).map((goal) => ({ objective: goal.objective })),
    preferences: {
      durationWeeks: state.planPreferences.durationWeeks,
      weeklySessionCount: state.planPreferences.weeklySessionCount,
    },
  });
}
