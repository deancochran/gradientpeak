import { describe, expect, it } from "vitest";
import {
  mapPlanningPreferencesToCreationConstraints,
  PLANNING_PREFERENCE_FIELD_METADATA,
  validatePlanningPreferencesConsistency,
  validateTrainingDoseLimitsConsistency,
} from "./planningPreferences";

describe("planning preference validation", () => {
  it("uses one field metadata source for plan-local builder preferences", () => {
    expect(PLANNING_PREFERENCE_FIELD_METADATA.weeklySessionCount.label).toBe("Sessions per week");
    expect(PLANNING_PREFERENCE_FIELD_METADATA.targetWeeklyHours.max).toBe(168);
    expect(PLANNING_PREFERENCE_FIELD_METADATA.restDaysPerWeek.max).toBe(7);
  });

  it("blocks impossible session and rest-day combinations", () => {
    const issues = validatePlanningPreferencesConsistency({
      durationWeeks: 8,
      weeklySessionCount: 6,
      targetWeeklyHours: null,
      restDaysPerWeek: 2,
    });

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "sessions_and_rest_days_exceed_week",
        severity: "blocking",
        fields: ["weeklySessionCount", "restDaysPerWeek"],
      }),
    );
  });

  it("maps plan-local rest-day overrides to creation constraints when no weekday preference is stronger", () => {
    const constraints = mapPlanningPreferencesToCreationConstraints({
      preferences: {
        durationWeeks: null,
        weeklySessionCount: 4,
        targetWeeklyHours: null,
        restDaysPerWeek: 2,
      },
      preferredWeekdays: [],
    });

    expect(constraints.hard_rest_days).toEqual(["sunday", "monday"]);
    expect(constraints.min_sessions_per_week).toBe(3);
    expect(constraints.max_sessions_per_week).toBe(4);
  });

  it("validates standalone schedule dose-limit consistency with shared messages", () => {
    const issues = validateTrainingDoseLimitsConsistency({
      min_sessions_per_week: 5,
      max_sessions_per_week: 3,
      max_single_session_duration_minutes: 180,
      max_weekly_duration_minutes: 120,
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "min_sessions_exceeds_max_sessions",
      "single_session_exceeds_weekly_budget",
    ]);
    expect(issues.every((issue) => issue.severity === "blocking")).toBe(true);
  });
});
