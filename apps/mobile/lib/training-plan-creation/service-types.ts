import type { CanonicalSport } from "@repo/core";
import type { api } from "@/lib/api";
import type { TrainingPlanBuilderGoalBlueprint } from "./types";

type TrainingPlanMutationError = NonNullable<
  ReturnType<typeof api.trainingPlans.create.useMutation>["error"]
>;

export interface TrainingPlanCreationProfileGoalSnapshot {
  id: string;
  title: string;
  target_date?: string | null;
  priority?: number | null;
  activity_category?: CanonicalSport | null;
  objective?: TrainingPlanBuilderGoalBlueprint["objective"];
}

export interface UseTrainingPlanCreationServiceOptions {
  mode?: "create" | "edit";
  planId?: string;
  activityPlanPicker?: {
    enabled: boolean;
    searchQuery: string;
    activityCategoryFilter: "run" | "bike" | "swim" | "strength" | "other" | null;
    sort: "newest" | "oldest" | "name";
    selectedSessionId: string | null;
  };
  onCreated?: (createdPlan: { id: string }) => void;
  onCreateError?: (error: TrainingPlanMutationError) => void;
  onUpdated?: (updatedPlan: { id: string }) => void;
  onUpdateError?: (error: TrainingPlanMutationError) => void;
}
