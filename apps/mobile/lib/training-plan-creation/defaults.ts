import { createAthletePlanningContextFromSnapshot } from "@repo/core";
import { toDateKey } from "@/lib/calendar/dateMath";
import { trainingPlanBuilderStateSchema } from "./schemas";
import type { TrainingPlanBuilderState } from "./types";

export const DEFAULT_TRAINING_PLAN_NAME = "";

function getDefaultAnchorDate() {
  return toDateKey(new Date());
}

export function createDefaultTrainingPlanBuilderState(): TrainingPlanBuilderState {
  return trainingPlanBuilderStateSchema.parse({
    details: {
      name: DEFAULT_TRAINING_PLAN_NAME,
      description: "",
      templateVisibility: "private",
    },
    anchorDate: getDefaultAnchorDate(),
    athleteContext: createAthletePlanningContextFromSnapshot({
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
    }),
    planPreferences: {
      durationWeeks: null,
      weeklySessionCount: null,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
      maxSingleSessionDurationMinutes: null,
      progressionPace: null,
      recoveryPriority: null,
      weekPatternPreference: null,
      strengthIntegrationPriority: null,
      doubleDayTolerance: null,
      longSessionFatigueTolerance: null,
      taperStylePreference: null,
    },
    goalContext: {
      selectedGoals: [],
    },
    structure: {
      sessions: [],
    },
    scheduling: {
      startDate: getDefaultAnchorDate(),
      preferredWeekdays: [],
      sessionDateOverrides: {},
    },
    selection: { type: "overview" },
  });
}
