import { createAthletePlanningContextFromSnapshot } from "@repo/core";
import { toDateKey } from "@/lib/calendar/dateMath";
import type { TrainingPlanBuilderState } from "./types";

export const DEFAULT_TRAINING_PLAN_NAME = "";

function getDefaultAnchorDate() {
  return toDateKey(new Date());
}

export function createDefaultTrainingPlanBuilderState(): TrainingPlanBuilderState {
  const anchorDate = getDefaultAnchorDate();
  return {
    details: {
      name: DEFAULT_TRAINING_PLAN_NAME,
      description: "",
      contentVisibility: "private",
    },
    anchorDate,
    athleteContext: createAthletePlanningContextFromSnapshot({
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
    }),
    planPreferences: {
      weekly_session_count: null,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    },
    goalContext: {
      selectedGoals: [],
    },
    structure: {
      sessions: [],
    },
    scheduling: {
      startDate: anchorDate,
      preferredWeekdays: [],
      sessionDateOverrides: {},
    },
    selection: { type: "overview" },
  };
}
