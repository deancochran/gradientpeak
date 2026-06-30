import type { TrainingPlanBuilderGoalBlueprint } from "./types";

export interface TrainingPlanCreationProfileGoalSnapshot {
  id: string;
  title: string;
  target_date?: string | null;
  priority?: number | null;
  activity_category?: "run" | "bike" | "swim" | "other" | null;
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
  onCreateError?: (error: Error) => void;
  onUpdated?: (updatedPlan: { id: string }) => void;
  onUpdateError?: (error: Error) => void;
}
