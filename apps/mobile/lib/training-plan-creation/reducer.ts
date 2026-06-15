import { trainingPlanBuilderGoalSchema, trainingPlanBuilderStateSchema } from "./schemas";
import type { TrainingPlanBuilderAction, TrainingPlanBuilderState } from "./types";

export function trainingPlanBuilderReducer(
  state: TrainingPlanBuilderState,
  action: TrainingPlanBuilderAction,
): TrainingPlanBuilderState {
  switch (action.type) {
    case "details.update":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        details: { ...state.details, ...action.patch },
      });
    case "assumptions.update":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        scenarioAssumptions: { ...state.scenarioAssumptions, ...action.patch },
      });
    case "goal.add":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        goals: [...state.goals, trainingPlanBuilderGoalSchema.parse(action.goal)],
      });
    case "goal.remove":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        goals: state.goals.filter((goal) => goal.localId !== action.goalId),
      });
    case "session.add":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        schedule: { sessions: [...state.schedule.sessions, action.session] },
      });
    case "session.assignActivityPlan":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        schedule: {
          sessions: state.schedule.sessions.map((session) =>
            session.localId === action.sessionId
              ? { ...session, activityPlan: action.activityPlan }
              : session,
          ),
        },
      });
    case "session.move":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        schedule: {
          sessions: state.schedule.sessions.map((session) =>
            session.localId === action.sessionId
              ? { ...session, offsetDays: action.offsetDays }
              : session,
          ),
        },
      });
    case "session.updateEventOverrides":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        schedule: {
          sessions: state.schedule.sessions.map((session) =>
            session.localId === action.sessionId
              ? { ...session, eventOverrides: action.eventOverrides }
              : session,
          ),
        },
      });
    case "session.remove":
      return trainingPlanBuilderStateSchema.parse({
        ...state,
        schedule: {
          sessions: state.schedule.sessions.filter(
            (session) => session.localId !== action.sessionId,
          ),
        },
        selection:
          state.selection.type === "session" && state.selection.sessionId === action.sessionId
            ? { type: "overview" }
            : state.selection,
      });
    case "selection.set":
      return trainingPlanBuilderStateSchema.parse({ ...state, selection: action.selection });
  }
}
