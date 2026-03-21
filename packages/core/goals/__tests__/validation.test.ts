import { describe, expect, it } from "vitest";
import { trainingPlanFormGoalValidationSchema, validateTrainingPlanFormGoals } from "../../goals";

describe("goal validation", () => {
  it("accepts valid race and threshold targets", () => {
    const parsed = trainingPlanFormGoalValidationSchema.safeParse({
      planStartDate: "2026-05-01",
      goals: [
        {
          id: "goal-1",
          name: "Spring 10K",
          targetDate: "2026-06-01",
          priority: 7,
          targets: [
            {
              id: "target-1",
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "10",
              completionTimeHms: "0:45:00",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("returns field-level errors for invalid target details", () => {
    const errors = validateTrainingPlanFormGoals({
      planStartDate: "2026-07-01",
      goals: [
        {
          id: "goal-1",
          name: "",
          targetDate: "2020-01-01",
          priority: 11,
          targets: [
            {
              id: "target-1",
              targetType: "pace_threshold",
              activityCategory: "run",
              paceMmSs: "bad",
              testDurationHms: "",
            },
          ],
        },
      ],
    });

    expect(errors["goals.0.name"]).toBe("Goal name is required");
    expect(errors["goals.0.targetDate"]).toBe("Target date must be in the future");
    expect(errors["goals.0.priority"]).toBe("Priority must be between 0 and 10");
    expect(errors["goals"]).toBe("Each goal must include valid target details");
  });
});
