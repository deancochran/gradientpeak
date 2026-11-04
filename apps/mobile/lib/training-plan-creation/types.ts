import type {
  AthletePlanningContext,
  AthletePlanningContextEditableFieldKey,
  AthletePlanningContextEffortInput,
  AthletePlanningContextFieldOverride,
  ContentVisibility,
  PlannedTrainingActivityPlanFacts,
  PlannedTrainingEventOverrides,
  PlanningGoal,
  PlanningSchedule,
  SessionDemand,
  TrainingPlanPreferences,
} from "@repo/core";

export type TrainingPlanActivityPlanFacts = PlannedTrainingActivityPlanFacts;
export type TrainingPlanBuilderEventOverrides = PlannedTrainingEventOverrides;
export type TrainingPlanBuilderGoalBlueprint = PlanningGoal;
export type TrainingPlanBuilderGoalContext = { selectedGoals: TrainingPlanBuilderGoalBlueprint[] };
export type TrainingPlanBuilderSession = {
  id: string;
  localId: string;
  offsetDays: number;
  demand: SessionDemand;
  activityPlan: TrainingPlanActivityPlanFacts | null;
  eventOverrides?: TrainingPlanBuilderEventOverrides;
};
export type TrainingPlanBuilderScheduling = PlanningSchedule;
export type TrainingPlanBuilderSelection =
  | { type: "overview" }
  | { type: "session"; sessionId: string }
  | { type: "goal"; goalId: string }
  | { type: "assumptions" }
  | { type: "planCheck"; planCheckId: string };

export type TrainingPlanBuilderState = {
  details: {
    name: string;
    description: string;
    contentVisibility: ContentVisibility;
  };
  anchorDate: string;
  athleteContext: AthletePlanningContext;
  planPreferences: TrainingPlanPreferences;
  goalContext: TrainingPlanBuilderGoalContext;
  structure: { sessions: TrainingPlanBuilderSession[] };
  scheduling: TrainingPlanBuilderScheduling;
  selection: TrainingPlanBuilderSelection;
};

export type TrainingPlanBuilderAction =
  | { type: "state.replace"; state: TrainingPlanBuilderState }
  | { type: "details.update"; patch: Partial<TrainingPlanBuilderState["details"]> }
  | { type: "anchorDate.update"; anchorDate: string }
  | { type: "athleteContext.replace"; athleteContext: AthletePlanningContext }
  | { type: "athleteContext.fieldOverride"; override: AthletePlanningContextFieldOverride }
  | { type: "athleteContext.fieldRemove"; fieldKey: AthletePlanningContextEditableFieldKey }
  | { type: "athleteContext.effortAdd"; effort: AthletePlanningContextEffortInput }
  | { type: "athleteContext.effortRemove"; effortIndex: number }
  | { type: "planPreferences.update"; patch: Partial<TrainingPlanPreferences> }
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
  | { type: "scheduling.startDateUpdate"; startDate: string }
  | {
      type: "session.updateEventOverrides";
      sessionId: string;
      eventOverrides: TrainingPlanBuilderEventOverrides | undefined;
    }
  | { type: "session.remove"; sessionId: string }
  | { type: "selection.set"; selection: TrainingPlanBuilderSelection };
