import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile, type ProfileGoal } from "../../schemas";
import { resolveTrainingPrescription } from "../trainingPrescription";
import { resolveWeeklyAllocation, weeklyAllocationSchema } from "../weeklyAllocation";

const goal = (
  objective: ProfileGoal["objective"],
  activity_category: ProfileGoal["activity_category"],
): ProfileGoal =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "22222222-2222-4222-8222-222222222222",
    title: "Goal",
    target_date: "2027-10-01",
    priority: 9,
    activity_category,
    objective,
  }) as ProfileGoal;

describe("resolveWeeklyAllocation", () => {
  it("preserves canonical prescribed activity categories and load methods", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        goal({ type: "event_performance", activity_category: "run", distance_m: 42_195 }, "run"),
      ],
    });
    const allocation = resolveWeeklyAllocation({ prescription });
    expect(weeklyAllocationSchema.parse(allocation)).toBeTruthy();
    expect(allocation.activity_categories.run?.role).toBe("primary");
    expect(allocation.activity_categories.run?.load_model.load_method).toBe("run_pace");
  });

  it("respects canonical preference constraints", () => {
    const preferences = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        max_weekly_duration_minutes: 180,
      },
    };
    const prescription = resolveTrainingPrescription({
      preferences,
      goals: [
        goal({ type: "event_performance", activity_category: "run", distance_m: 10_000 }, "run"),
      ],
    });
    expect(
      resolveWeeklyAllocation({ prescription, preferences }).totals.target_duration_minutes,
    ).toBeLessThanOrEqual(180);
  });

  it("keeps strength and bike work in their canonical allocation buckets", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        goal(
          { type: "threshold", metric: "power", value: 1, activity_category: "strength" },
          "strength",
        ),
        goal({ type: "threshold", metric: "power", value: 250, activity_category: "bike" }, "bike"),
      ],
    });
    const allocation = resolveWeeklyAllocation({ prescription });
    expect(allocation.activity_categories.strength?.volume.unit).toBe("sets");
    expect(allocation.activity_categories.bike?.load_model.load_method).toBe("bike_power");
  });
});
