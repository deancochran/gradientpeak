import type {
  AthletePlanningContextFieldKey,
  AthletePlanningContextFieldOverride,
} from "@repo/core";
import { addDaysDateOnlyUtc } from "@repo/core";
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

type StructureProposalSession = {
  offsetDays: number;
  label: string;
  intent?: TrainingPlanBuilderSession["intent"];
};

export function createTrainingPlanBuilderActions(input: {
  dispatch: Dispatch<TrainingPlanBuilderAction>;
  state: TrainingPlanBuilderState;
  createSession: (
    offsetDays: number,
    title?: string,
    intent?: TrainingPlanBuilderSession["intent"],
  ) => TrainingPlanBuilderSession;
  createLocalId: () => string;
  structureProposalSessions: StructureProposalSession[];
  toSelectedGoalBlueprint: (goal: {
    id: string;
    title: string;
    target_date?: string | null;
    priority?: number | null;
    activity_category?: "run" | "bike" | "swim" | "other" | null;
    objective?: TrainingPlanBuilderGoalBlueprint["objective"];
  }) => TrainingPlanBuilderGoalBlueprint;
}) {
  const { createLocalId, createSession, dispatch, state, structureProposalSessions } = input;

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
    addProposedStructure: () => {
      for (const proposalSession of structureProposalSessions) {
        dispatch({
          type: "session.add",
          session: createSession(
            proposalSession.offsetDays,
            proposalSession.label,
            proposalSession.intent,
          ),
        });
      }
    },
    assignActivityPlan: (sessionId: string, activityPlan: TrainingPlanActivityPlanFacts | null) =>
      dispatch({ type: "session.assignActivityPlan", sessionId, activityPlan }),
    updateSession: (session: TrainingPlanBuilderSession) =>
      dispatch({ type: "session.update", session }),
    removeSession: (sessionId: string) => dispatch({ type: "session.remove", sessionId }),
    updateScheduleStartDate: (startDate: string) =>
      dispatch({ type: "scheduling.startDateUpdate", startDate }),
    togglePreferredScheduleWeekday: (weekday: number) =>
      dispatch({ type: "scheduling.togglePreferredWeekday", weekday }),
    moveSessionToScheduleDate: (sessionId: string, date: string) =>
      dispatch({ type: "scheduling.moveSessionToDate", sessionId, date }),
    moveSessionByDays: (sessionId: string, currentDate: string, days: number) =>
      dispatch({
        type: "scheduling.moveSessionToDate",
        sessionId,
        date: addDaysDateOnlyUtc(currentDate, days),
      }),
    clearSessionScheduleDateOverride: (sessionId: string) =>
      dispatch({ type: "scheduling.clearSessionDateOverride", sessionId }),
    shiftSchedulePreview: (days: number) => dispatch({ type: "scheduling.shiftPlan", days }),
    updateSessionEventOverrides: (
      sessionId: string,
      eventOverrides: TrainingPlanBuilderEventOverrides | undefined,
    ) => dispatch({ type: "session.updateEventOverrides", sessionId, eventOverrides }),
    selectSession: (sessionId: string) =>
      dispatch({ type: "selection.set", selection: { type: "session", sessionId } }),
    getSessionById: (sessionId: string) => selectSessionById(state, sessionId),
    overrideAthleteContextField: (override: AthletePlanningContextFieldOverride) =>
      dispatch({ type: "athleteContext.fieldOverride", override }),
    removeAthleteContextField: (fieldKey: AthletePlanningContextFieldKey) =>
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
