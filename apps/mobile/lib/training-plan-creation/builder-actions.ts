import type {
  AthletePlanningContextEditableFieldKey,
  AthletePlanningContextFieldOverride,
  CanonicalActivityCategory,
} from "@repo/core";
import type { Dispatch } from "react";
import {
  addTrainingPlanPreferenceField,
  applyTrainingPlanConstraintPreset,
  applyTrainingPlanPreferenceFieldOverride,
  type TrainingPlanConstraintPreset,
  type TrainingPlanPreferenceFieldKey,
} from "./preferences-context";
import { selectSessionById } from "./selectors";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderAction,
  TrainingPlanBuilderEventOverrides,
  TrainingPlanBuilderGoalBlueprint,
  TrainingPlanBuilderSession,
  TrainingPlanBuilderState,
} from "./types";

export function createTrainingPlanBuilderActions(input: {
  dispatch: Dispatch<TrainingPlanBuilderAction>;
  state: TrainingPlanBuilderState;
  createSession: (
    offsetDays: number,
    title?: string,
    intent?: TrainingPlanBuilderSession["intent"],
  ) => TrainingPlanBuilderSession;
  createLocalId: () => string;
  toSelectedGoalBlueprint: (goal: {
    id: string;
    title: string;
    target_date?: string | null;
    priority?: number | null;
    activity_category?: CanonicalActivityCategory | null;
    objective?: TrainingPlanBuilderGoalBlueprint["objective"];
  }) => TrainingPlanBuilderGoalBlueprint;
}) {
  const { createLocalId, createSession, dispatch, state } = input;

  return {
    updateDetails: (patch: Partial<typeof state.details>) =>
      dispatch({ type: "details.update", patch }),
    addSession: (offsetDays: number, title?: string) => {
      const session = createSession(offsetDays, title);
      dispatch({ type: "session.add", session });
      dispatch({
        type: "selection.set",
        selection: { type: "session", sessionId: session.localId },
      });
      return session;
    },
    duplicateSession: (sessionId: string, offsetDays?: number) => {
      const source = selectSessionById(state, sessionId);
      if (!source) {
        return null;
      }
      const session: TrainingPlanBuilderSession = {
        ...source,
        localId: createLocalId(),
        offsetDays: offsetDays ?? source.offsetDays,
      };
      dispatch({ type: "session.add", session });
      dispatch({
        type: "selection.set",
        selection: { type: "session", sessionId: session.localId },
      });
      return session;
    },
    assignActivityPlan: (sessionId: string, activityPlan: TrainingPlanActivityPlanFacts | null) =>
      dispatch({ type: "session.assignActivityPlan", sessionId, activityPlan }),
    updateSession: (session: TrainingPlanBuilderSession) =>
      dispatch({ type: "session.update", session }),
    removeSession: (sessionId: string) => dispatch({ type: "session.remove", sessionId }),
    updateScheduleStartDate: (startDate: string) =>
      dispatch({ type: "scheduling.startDateUpdate", startDate }),
    updateSessionEventOverrides: (
      sessionId: string,
      eventOverrides: TrainingPlanBuilderEventOverrides | undefined,
    ) => dispatch({ type: "session.updateEventOverrides", sessionId, eventOverrides }),
    selectSession: (sessionId: string) =>
      dispatch({ type: "selection.set", selection: { type: "session", sessionId } }),
    getSessionById: (sessionId: string) => selectSessionById(state, sessionId),
    overrideAthleteContextField: (override: AthletePlanningContextFieldOverride) =>
      dispatch({ type: "athleteContext.fieldOverride", override }),
    removeAthleteContextField: (fieldKey: AthletePlanningContextEditableFieldKey) =>
      dispatch({ type: "athleteContext.fieldRemove", fieldKey }),
    addPlanningConstraint: (fieldKey: TrainingPlanPreferenceFieldKey) =>
      dispatch({
        type: "planPreferences.update",
        patch: addTrainingPlanPreferenceField(state.planPreferences, fieldKey),
      }),
    applyPlanningConstraintPreset: (preset: TrainingPlanConstraintPreset) =>
      dispatch({
        type: "planPreferences.update",
        patch: applyTrainingPlanConstraintPreset(preset),
      }),
    updatePlanningPreferences: (preferences: TrainingPlanBuilderState["planPreferences"]) =>
      dispatch({ type: "planPreferences.update", patch: preferences }),
    updatePlanningConstraint: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) =>
      dispatch({
        type: "planPreferences.update",
        patch: applyTrainingPlanPreferenceFieldOverride(state.planPreferences, fieldKey, value),
      }),
    toggleSelectedGoal: (goal: Parameters<typeof input.toSelectedGoalBlueprint>[0]) =>
      dispatch({
        type: "goalContext.toggleSelectedGoal",
        goal: input.toSelectedGoalBlueprint(goal),
      }),
    removeSelectedGoal: (sourceProfileGoalId: string) =>
      dispatch({ type: "goalContext.removeSelectedGoal", sourceProfileGoalId }),
    clearGoals: () => dispatch({ type: "goalContext.replaceSelectedGoals", goals: [] }),
    addLocalGoal: (goal: string | Omit<TrainingPlanBuilderGoalBlueprint, "localId">) =>
      dispatch({
        type: "goalContext.addLocalGoal",
        goal:
          typeof goal === "string"
            ? {
                localId: createLocalId(),
                title: goal,
                targetOffsetDays: null,
                priority: 10,
                activityCategory: null,
                objective: null,
              }
            : {
                ...goal,
                localId: createLocalId(),
              },
      }),
    removeLocalGoal: (goalId: string) => dispatch({ type: "goalContext.removeLocalGoal", goalId }),
  };
}
