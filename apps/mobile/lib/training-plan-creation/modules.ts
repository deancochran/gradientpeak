import { selectAthletePlanningContextFields } from "@repo/core";
import { selectBuilderGoalBlueprints } from "./selectors";
import type { TrainingPlanBuilderState } from "./types";

export type TrainingPlanCreationStage =
  | "who"
  | "what"
  | "constraints"
  | "structure"
  | "assignment"
  | "review";

export type TrainingPlanBuilderModuleId =
  | "athlete-context"
  | "plan-goals"
  | "plan-preferences"
  | "relative-session-structure"
  | "activity-plan-assignment"
  | "plan-identity"
  | "plan-review";

export type TrainingPlanBuilderModuleStatus = "empty" | "started" | "ready";

export type TrainingPlanBuilderModuleAction =
  | "athleteContext"
  | "goals"
  | "preferences"
  | "metadata";

export type TrainingPlanBuilderModuleIconKey =
  | "activity"
  | "flag"
  | "settings"
  | "sliders"
  | "user";

export interface TrainingPlanBuilderModule {
  id: TrainingPlanBuilderModuleId;
  stage: TrainingPlanCreationStage;
  order: number;
  title: string;
  description: string;
  iconKey: TrainingPlanBuilderModuleIconKey;
  action?: TrainingPlanBuilderModuleAction;
  applies: (state: TrainingPlanBuilderState) => boolean;
  getStatus: (state: TrainingPlanBuilderState) => TrainingPlanBuilderModuleStatus;
}

export interface TrainingPlanBuilderStageSummary {
  stage: TrainingPlanCreationStage;
  moduleCount: number;
  readyCount: number;
  startedCount: number;
}

const hasAthleteContext = (state: TrainingPlanBuilderState) => {
  return selectAthletePlanningContextFields(state.athleteContext).some((field) => field.visible);
};

const hasPlanPreferences = (state: TrainingPlanBuilderState) => {
  return (
    state.planPreferences.durationWeeks !== null ||
    state.planPreferences.weeklySessionCount !== null ||
    state.planPreferences.targetWeeklyHours !== null ||
    state.planPreferences.restDaysPerWeek !== null
  );
};

export const trainingPlanBuilderModules: readonly TrainingPlanBuilderModule[] = [
  {
    id: "athlete-context",
    stage: "who",
    order: 10,
    title: "Athlete context",
    description: "Profile details, metrics, and recent effort assumptions.",
    iconKey: "user",
    action: "athleteContext",
    applies: () => true,
    getStatus: (state) => (hasAthleteContext(state) ? "ready" : "empty"),
  },
  {
    id: "plan-goals",
    stage: "what",
    order: 20,
    title: "Plan goals",
    description: "Copied goals selected from My Goals for planning calculations.",
    iconKey: "flag",
    action: "goals",
    applies: () => true,
    getStatus: (state) => (selectBuilderGoalBlueprints(state).length > 0 ? "ready" : "empty"),
  },
  {
    id: "plan-preferences",
    stage: "constraints",
    order: 30,
    title: "Planning constraints",
    description: "Copied constraints that shape this plan only.",
    iconKey: "sliders",
    action: "preferences",
    applies: () => true,
    getStatus: (state) => (hasPlanPreferences(state) ? "ready" : "empty"),
  },
  {
    id: "relative-session-structure",
    stage: "structure",
    order: 40,
    title: "Plan structure",
    description: "Relative session slots and derived plan shape.",
    iconKey: "activity",
    applies: (state) =>
      hasPlanPreferences(state) ||
      selectBuilderGoalBlueprints(state).length > 0 ||
      state.structure.sessions.length > 0,
    getStatus: (state) => (state.structure.sessions.length > 0 ? "ready" : "empty"),
  },
  {
    id: "activity-plan-assignment",
    stage: "assignment",
    order: 50,
    title: "Activity assignment",
    description: "Discoverable activity plans assigned to relative sessions.",
    iconKey: "activity",
    applies: (state) => state.structure.sessions.length > 0,
    getStatus: (state) => {
      if (state.structure.sessions.length === 0) {
        return "empty";
      }
      return state.structure.sessions.every((session) => session.activityPlan !== null)
        ? "ready"
        : "started";
    },
  },
  {
    id: "plan-identity",
    stage: "review",
    order: 90,
    title: "Training plan metadata",
    description: "Name, description, and about information.",
    iconKey: "settings",
    action: "metadata",
    applies: () => true,
    getStatus: (state) => (state.details.name.trim().length > 0 ? "ready" : "empty"),
  },
  {
    id: "plan-review",
    stage: "review",
    order: 100,
    title: "Review",
    description: "Create readiness, warnings, and remaining tradeoffs.",
    iconKey: "settings",
    applies: (state) =>
      selectBuilderGoalBlueprints(state).length > 0 || state.structure.sessions.length > 0,
    getStatus: (state) => (state.structure.sessions.length > 0 ? "started" : "empty"),
  },
];

export function selectApplicableTrainingPlanBuilderModules(state: TrainingPlanBuilderState) {
  return trainingPlanBuilderModules
    .filter((module) => module.applies(state))
    .sort((left, right) => left.order - right.order);
}

export function selectActionableTrainingPlanBuilderModules(state: TrainingPlanBuilderState) {
  return selectApplicableTrainingPlanBuilderModules(state).filter(
    (module): module is TrainingPlanBuilderModule & { action: TrainingPlanBuilderModuleAction } =>
      module.action !== undefined,
  );
}

export function selectTrainingPlanBuilderStageSummaries(
  state: TrainingPlanBuilderState,
): TrainingPlanBuilderStageSummary[] {
  const summaries = new Map<TrainingPlanCreationStage, TrainingPlanBuilderStageSummary>();

  for (const module of selectApplicableTrainingPlanBuilderModules(state)) {
    const current = summaries.get(module.stage) ?? {
      stage: module.stage,
      moduleCount: 0,
      readyCount: 0,
      startedCount: 0,
    };
    const status = module.getStatus(state);

    summaries.set(module.stage, {
      stage: module.stage,
      moduleCount: current.moduleCount + 1,
      readyCount: current.readyCount + (status === "ready" ? 1 : 0),
      startedCount: current.startedCount + (status === "started" ? 1 : 0),
    });
  }

  return Array.from(summaries.values());
}
