import {
  addAthletePlanningContextEffort,
  overrideAthletePlanningContextField,
  removeAthletePlanningContextEffort,
  removeAthletePlanningContextField,
} from "@repo/core";
import type { TrainingPlanBuilderAction, TrainingPlanBuilderState } from "./types";

function replaceSessionEventOverrides(
  session: TrainingPlanBuilderState["structure"]["sessions"][number],
  eventOverrides: Extract<
    TrainingPlanBuilderAction,
    { type: "session.updateEventOverrides" }
  >["eventOverrides"],
) {
  if (eventOverrides) return { ...session, eventOverrides };
  const { eventOverrides: _removed, ...sessionWithoutOverrides } = session;
  return sessionWithoutOverrides;
}

export function trainingPlanBuilderReducer(
  state: TrainingPlanBuilderState,
  action: TrainingPlanBuilderAction,
): TrainingPlanBuilderState {
  switch (action.type) {
    case "state.replace":
      return action.state;
    case "details.update":
      return {
        ...state,
        details: { ...state.details, ...action.patch },
      };
    case "anchorDate.update":
      return {
        ...state,
        anchorDate: action.anchorDate,
      };
    case "athleteContext.replace":
      return {
        ...state,
        athleteContext: action.athleteContext,
      };
    case "athleteContext.fieldOverride":
      return {
        ...state,
        athleteContext: overrideAthletePlanningContextField(state.athleteContext, action.override),
      };
    case "athleteContext.fieldRemove":
      return {
        ...state,
        athleteContext: removeAthletePlanningContextField(state.athleteContext, action.fieldKey),
      };
    case "athleteContext.effortAdd":
      return {
        ...state,
        athleteContext: addAthletePlanningContextEffort(state.athleteContext, action.effort),
      };
    case "athleteContext.effortRemove":
      return {
        ...state,
        athleteContext: removeAthletePlanningContextEffort(
          state.athleteContext,
          action.effortIndex,
        ),
      };
    case "planPreferences.update":
      return {
        ...state,
        planPreferences: { ...state.planPreferences, ...action.patch },
      };
    case "goalContext.replaceSelectedGoals":
      return {
        ...state,
        goalContext: { selectedGoals: action.goals },
      };
    case "goalContext.addLocalGoal":
      return {
        ...state,
        goalContext: {
          selectedGoals: [...state.goalContext.selectedGoals, action.goal],
        },
      };
    case "goalContext.removeLocalGoal":
      return {
        ...state,
        goalContext: {
          selectedGoals: state.goalContext.selectedGoals.filter(
            (goal) => goal.localId !== action.goalId,
          ),
        },
      };
    case "goalContext.toggleSelectedGoal": {
      const sourceProfileGoalId = action.goal.sourceProfileGoalId;
      if (!sourceProfileGoalId) {
        return state;
      }

      const isSelected = state.goalContext.selectedGoals.some(
        (goal) => goal.sourceProfileGoalId === sourceProfileGoalId,
      );
      const selectedGoals = isSelected
        ? state.goalContext.selectedGoals.filter(
            (goal) => goal.sourceProfileGoalId !== sourceProfileGoalId,
          )
        : [
            ...state.goalContext.selectedGoals.filter(
              (goal) => goal.sourceProfileGoalId !== sourceProfileGoalId,
            ),
            action.goal,
          ];

      return {
        ...state,
        goalContext: { selectedGoals },
      };
    }
    case "goalContext.removeSelectedGoal":
      return {
        ...state,
        goalContext: {
          selectedGoals: state.goalContext.selectedGoals.filter(
            (goal) => goal.sourceProfileGoalId !== action.sourceProfileGoalId,
          ),
        },
      };
    case "session.add":
      return {
        ...state,
        structure: { sessions: [...state.structure.sessions, action.session] },
      };
    case "session.update":
      return {
        ...state,
        structure: {
          sessions: state.structure.sessions.map((session) =>
            session.localId === action.session.localId ? action.session : session,
          ),
        },
      };
    case "session.assignActivityPlan":
      return {
        ...state,
        structure: {
          sessions: state.structure.sessions.map((session) =>
            session.localId === action.sessionId
              ? (() => {
                  const { activityPlanVariantId: _removed, ...withoutVariant } = session;
                  return { ...withoutVariant, activityPlan: action.activityPlan };
                })()
              : session,
          ),
        },
      };
    case "session.selectActivityPlanVariant":
      return {
        ...state,
        structure: {
          sessions: state.structure.sessions.map((session) => {
            if (session.localId !== action.sessionId) return session;
            if (action.variantId === undefined) {
              const { activityPlanVariantId: _removed, ...withoutVariant } = session;
              return withoutVariant;
            }
            return { ...session, activityPlanVariantId: action.variantId };
          }),
        },
      };
    case "scheduling.startDateUpdate":
      return {
        ...state,
        anchorDate: action.startDate,
        scheduling: {
          ...state.scheduling,
          startDate: action.startDate,
          sessionDateOverrides: {},
        },
      };
    case "session.updateEventOverrides":
      return {
        ...state,
        structure: {
          sessions: state.structure.sessions.map((session) =>
            session.localId === action.sessionId
              ? replaceSessionEventOverrides(session, action.eventOverrides)
              : session,
          ),
        },
      };
    case "session.remove":
      return {
        ...state,
        structure: {
          sessions: state.structure.sessions.filter(
            (session) => session.localId !== action.sessionId,
          ),
        },
        selection:
          state.selection.type === "session" && state.selection.sessionId === action.sessionId
            ? { type: "overview" }
            : state.selection,
      };
    case "selection.set":
      return { ...state, selection: action.selection };
  }
}
