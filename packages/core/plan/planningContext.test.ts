import { describe, expect, it } from "vitest";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import { planningContextSchema } from "./planningContext";
import { mapPlanningPreferencesToCreationConstraints } from "./planningPreferences";

describe("planningContext", () => {
  it("validates the canonical planning context shape", () => {
    const context = planningContextSchema.parse({
      anchorDate: "2026-01-01",
      athleteContext: createAthletePlanningContextFromSnapshot({
        profile: null,
        profileMetrics: [],
        activityEfforts: [],
      }),
      goals: [],
      preferences: {
        durationWeeks: 6,
        weeklySessionCount: 4,
        targetWeeklyHours: null,
        restDaysPerWeek: null,
      },
      sessions: [],
      scheduling: {
        startDate: "2026-01-01",
        preferredWeekdays: [1, 3, 5],
        sessionDateOverrides: {},
      },
    });

    expect(context.preferences.weeklySessionCount).toBe(4);
    expect(context.scheduling.preferredWeekdays).toEqual([1, 3, 5]);
  });

  it("maps simple planning preferences through canonical creation constraints", () => {
    expect(
      mapPlanningPreferencesToCreationConstraints({
        preferences: {
          durationWeeks: null,
          weeklySessionCount: 4,
          targetWeeklyHours: null,
          restDaysPerWeek: null,
        },
        preferredWeekdays: [1, 3, 5],
      }),
    ).toMatchObject({
      hard_rest_days: ["sunday", "tuesday", "thursday", "saturday"],
      min_sessions_per_week: 3,
      max_sessions_per_week: 4,
      goal_difficulty_preference: "balanced",
    });
  });
});
