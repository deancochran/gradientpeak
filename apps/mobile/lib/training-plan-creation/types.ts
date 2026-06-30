import type {
  AthletePlanningContext,
  AthletePlanningContextEffortInput,
  AthletePlanningContextFieldKey,
  AthletePlanningContextFieldOverride,
} from "@repo/core";
import type { z } from "zod";
import type {
  trainingPlanActivityPlanFactsSchema,
  trainingPlanBuilderEventOverridesSchema,
  trainingPlanBuilderGoalBlueprintSchema,
  trainingPlanBuilderGoalContextSchema,
  trainingPlanBuilderPlanPreferencesSchema,
  trainingPlanBuilderProfileGoalDraftSchema,
  trainingPlanBuilderSchedulingSchema,
  trainingPlanBuilderSelectionSchema,
  trainingPlanBuilderSessionIntentSchema,
  trainingPlanBuilderSessionSchema,
  trainingPlanBuilderStateSchema,
  trainingPlanFinalCreatePayloadSchema,
  trainingPlanFinalUpdatePayloadSchema,
} from "./schemas";

export type TrainingPlanActivityPlanFacts = z.infer<typeof trainingPlanActivityPlanFactsSchema>;
export type TrainingPlanBuilderEventOverrides = z.infer<
  typeof trainingPlanBuilderEventOverridesSchema
>;
export type TrainingPlanBuilderGoalBlueprint = z.infer<
  typeof trainingPlanBuilderGoalBlueprintSchema
>;
export type TrainingPlanBuilderGoalContext = z.infer<typeof trainingPlanBuilderGoalContextSchema>;
export type TrainingPlanBuilderPlanPreferences = z.infer<
  typeof trainingPlanBuilderPlanPreferencesSchema
>;
export type TrainingPlanBuilderProfileGoalDraft = z.infer<
  typeof trainingPlanBuilderProfileGoalDraftSchema
>;
export type TrainingPlanBuilderSelection = z.infer<typeof trainingPlanBuilderSelectionSchema>;
export type TrainingPlanBuilderSessionIntent = z.infer<
  typeof trainingPlanBuilderSessionIntentSchema
>;
export type TrainingPlanBuilderSession = z.infer<typeof trainingPlanBuilderSessionSchema>;
export type TrainingPlanBuilderScheduling = z.infer<typeof trainingPlanBuilderSchedulingSchema>;
export type TrainingPlanBuilderState = z.infer<typeof trainingPlanBuilderStateSchema>;
export type TrainingPlanFinalCreatePayload = z.infer<typeof trainingPlanFinalCreatePayloadSchema>;
export type TrainingPlanFinalUpdatePayload = z.infer<typeof trainingPlanFinalUpdatePayloadSchema>;

export type TrainingPlanBuilderAction =
  | { type: "state.replace"; state: TrainingPlanBuilderState }
  | { type: "details.update"; patch: Partial<TrainingPlanBuilderState["details"]> }
  | { type: "anchorDate.update"; anchorDate: string }
  | { type: "athleteContext.replace"; athleteContext: AthletePlanningContext }
  | { type: "athleteContext.fieldOverride"; override: AthletePlanningContextFieldOverride }
  | { type: "athleteContext.fieldRemove"; fieldKey: AthletePlanningContextFieldKey }
  | { type: "athleteContext.effortAdd"; effort: AthletePlanningContextEffortInput }
  | { type: "athleteContext.effortRemove"; effortIndex: number }
  | { type: "planPreferences.update"; patch: Partial<TrainingPlanBuilderPlanPreferences> }
  | { type: "goalContext.replaceSelectedGoals"; goals: TrainingPlanBuilderGoalBlueprint[] }
  | { type: "goalContext.addLocalGoal"; goal: TrainingPlanBuilderGoalBlueprint }
  | { type: "goalContext.removeLocalGoal"; goalId: string }
  | { type: "goalContext.toggleSelectedGoal"; goal: TrainingPlanBuilderGoalBlueprint }
  | { type: "goalContext.removeSelectedGoal"; sourceProfileGoalId: string }
  | { type: "session.add"; session: TrainingPlanBuilderSession }
  | { type: "session.update"; session: TrainingPlanBuilderSession }
  | {
      type: "session.assignActivityPlan";
      sessionId: string;
      activityPlan: TrainingPlanActivityPlanFacts | null;
    }
  | { type: "session.move"; sessionId: string; offsetDays: number }
  | { type: "scheduling.startDateUpdate"; startDate: string }
  | { type: "scheduling.togglePreferredWeekday"; weekday: number }
  | { type: "scheduling.moveSessionToDate"; sessionId: string; date: string }
  | { type: "scheduling.clearSessionDateOverride"; sessionId: string }
  | { type: "scheduling.shiftPlan"; days: number }
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
  | "invalid_goal_target_offset"
  | "invalid_assumption_date"
  | "invalid_plan_preferences"
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
