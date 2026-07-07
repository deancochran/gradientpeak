import { describe, expect, it } from "vitest";
import {
  evaluateTrainingPlanCreationReadiness,
  validateTrainingPlanCreationInput,
} from "./trainingPlanCreationValidation";

const publishedAccessiblePlan = {
  id: "activity-plan-1",
  accessible: true,
  published: true,
};

describe("trainingPlanCreationValidation", () => {
  it("returns a deterministic readiness result with blockers and warnings", () => {
    const readiness = evaluateTrainingPlanCreationReadiness({
      name: "",
      anchorDateValid: true,
      profileBirthDateValid: true,
      planPreferencesValid: true,
      preferences: {
        weeklySessionCount: 6,
        targetWeeklyHours: 1,
        restDaysPerWeek: 2,
      },
      sessions: [
        {
          localId: "session-1",
          offsetDays: 0,
          activityPlan: publishedAccessiblePlan,
          startTime: "09:00",
        },
      ],
      goals: [],
    });

    expect(readiness.canSave).toBe(false);
    expect(readiness.blockers.map((issue) => issue.code)).toEqual([
      "missing_plan_name",
      "weekly_session_rest_day_conflict",
    ]);
    expect(readiness.warnings.map((issue) => issue.code)).toEqual([
      "weekly_hours_session_mismatch",
    ]);
    expect(readiness.issues.every((issue) => issue.severity)).toBe(true);
  });

  it("keeps the legacy validation helper blocker-only", () => {
    const issues = validateTrainingPlanCreationInput({
      name: "Base build",
      anchorDateValid: true,
      profileBirthDateValid: true,
      planPreferencesValid: true,
      preferences: {
        weeklySessionCount: 4,
        targetWeeklyHours: 1,
        restDaysPerWeek: null,
      },
      sessions: [
        {
          localId: "session-1",
          offsetDays: 0,
          activityPlan: publishedAccessiblePlan,
        },
      ],
      goals: [],
    });

    expect(issues).toEqual([]);
  });

  it("allows a complete creation input", () => {
    const readiness = evaluateTrainingPlanCreationReadiness({
      name: "Base build",
      anchorDateValid: true,
      profileBirthDateValid: true,
      planPreferencesValid: true,
      preferences: {
        weeklySessionCount: 4,
        targetWeeklyHours: 5,
        restDaysPerWeek: 2,
      },
      sessions: [
        {
          localId: "session-1",
          offsetDays: 0,
          activityPlan: publishedAccessiblePlan,
          startTime: "09:00",
        },
      ],
      goals: [{ localId: "goal-1", targetDateValid: true, targetOffsetDays: 28 }],
    });

    expect(readiness).toMatchObject({ canSave: true, blockers: [], warnings: [] });
  });
});
