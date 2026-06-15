import type { z } from "zod";
import type {
  trainingPlanActivityPlanFactsSchema,
  trainingPlanBuilderEventOverridesSchema,
  trainingPlanBuilderGoalSchema,
  trainingPlanBuilderSelectionSchema,
  trainingPlanBuilderSessionSchema,
  trainingPlanBuilderStateSchema,
} from "./schemas";

export type TrainingPlanActivityPlanFacts = z.infer<typeof trainingPlanActivityPlanFactsSchema>;
export type TrainingPlanBuilderEventOverrides = z.infer<
  typeof trainingPlanBuilderEventOverridesSchema
>;
export type TrainingPlanBuilderGoal = z.infer<typeof trainingPlanBuilderGoalSchema>;
export type TrainingPlanBuilderSelection = z.infer<typeof trainingPlanBuilderSelectionSchema>;
export type TrainingPlanBuilderSession = z.infer<typeof trainingPlanBuilderSessionSchema>;
export type TrainingPlanBuilderState = z.infer<typeof trainingPlanBuilderStateSchema>;

export type TrainingPlanBuilderAction =
  | { type: "details.update"; patch: Partial<TrainingPlanBuilderState["details"]> }
  | { type: "assumptions.update"; patch: Partial<TrainingPlanBuilderState["scenarioAssumptions"]> }
  | { type: "goal.add"; goal: TrainingPlanBuilderGoal }
  | { type: "goal.remove"; goalId: string }
  | { type: "session.add"; session: TrainingPlanBuilderSession }
  | {
      type: "session.assignActivityPlan";
      sessionId: string;
      activityPlan: TrainingPlanActivityPlanFacts | null;
    }
  | { type: "session.move"; sessionId: string; offsetDays: number }
  | {
      type: "session.updateEventOverrides";
      sessionId: string;
      eventOverrides: TrainingPlanBuilderEventOverrides | undefined;
    }
  | { type: "session.remove"; sessionId: string }
  | { type: "selection.set"; selection: TrainingPlanBuilderSelection };

export type TrainingPlanBuilderSaveBlockerCode =
  | "missing_plan_name"
  | "no_sessions"
  | "missing_activity_plan"
  | "invalid_offset_days"
  | "inaccessible_activity_plan"
  | "unpublished_activity_plan"
  | "invalid_start_time"
  | "duplicate_session"
  | "canonical_schema_failure";

export type TrainingPlanBuilderSaveBlocker = {
  code: TrainingPlanBuilderSaveBlockerCode;
  message: string;
  target?: TrainingPlanBuilderSelection;
};

export type TrainingPlanBuilderValidationResult = {
  blockers: TrainingPlanBuilderSaveBlocker[];
};
