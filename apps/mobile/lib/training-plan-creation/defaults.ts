import { trainingPlanBuilderStateSchema } from "./schemas";
import type { TrainingPlanBuilderState } from "./types";

type CreateDefaultTrainingPlanBuilderStateInput = {
  createId: () => string;
};

export function createDefaultTrainingPlanBuilderState(
  _input: CreateDefaultTrainingPlanBuilderStateInput,
): TrainingPlanBuilderState {
  return trainingPlanBuilderStateSchema.parse({
    details: {
      name: "Untitled training plan",
      description: "",
      templateVisibility: "private",
    },
    scenarioAssumptions: {
      label: "Profile defaults",
      weeklyAvailabilityDays: null,
      maxWeeklyLoadRampPct: null,
    },
    goals: [],
    schedule: {
      sessions: [],
    },
    selection: { type: "overview" },
  });
}
