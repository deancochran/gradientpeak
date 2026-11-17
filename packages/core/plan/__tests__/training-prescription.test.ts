import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile, type ProfileGoal } from "../../schemas";
import { resolveTrainingPrescription, trainingPrescriptionSchema } from "../trainingPrescription";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function profileGoal(
  overrides: Partial<ProfileGoal> & Pick<ProfileGoal, "objective">,
): ProfileGoal {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    profile_id: PROFILE_ID,
    title: "Goal",
    target_date: "2027-10-01",
    priority: 8,
    activity_category: "run",
    ...overrides,
  } as ProfileGoal;
}

describe("resolveTrainingPrescription", () => {
  it("derives marathon-specific durability from a canonical profile goal", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        profileGoal({
          objective: {
            type: "event_performance",
            activity_category: "run",
            distance_m: 42_195,
            target_time_s: 12_600,
          },
        }),
      ],
    });

    expect(trainingPrescriptionSchema.parse(prescription)).toBeTruthy();
    expect(prescription.goal_profile.primary_goal_type).toBe("event_performance");
    expect(prescription.activity_categories.run?.role).toBe("primary");
    expect(prescription.goal_profile.demand.durability).toBeGreaterThan(0.75);
  });

  it("keeps canonical goal activity categories distinct", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        profileGoal({
          objective: { type: "threshold", metric: "power", value: 300, activity_category: "bike" },
          activity_category: "bike",
        }),
        profileGoal({
          id: "33333333-3333-4333-8333-333333333333",
          objective: { type: "completion", distance_m: 1_500, activity_category: "swim" },
          activity_category: "swim",
        }),
      ],
    });

    expect(prescription.goal_profile.primary_goal_type).toBe("hybrid");
    expect(prescription.activity_categories.bike).toBeDefined();
    expect(prescription.activity_categories.swim).toBeDefined();
  });

  it("builds a balanced general prescription when goals are absent", () => {
    const prescription = resolveTrainingPrescription({ goals: [] });
    expect(prescription.goal_profile.primary_goal_type).toBe("general_fitness");
    expect(prescription.activity_categories.other).toBeDefined();
  });

  it("applies preferences to canonical goal prescriptions", () => {
    const prescription = resolveTrainingPrescription({
      preferences: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          max_weekly_duration_minutes: 300,
        },
      },
      goals: [
        profileGoal({
          objective: { type: "event_performance", activity_category: "run", distance_m: 10_000 },
        }),
      ],
    });

    expect(prescription.global_constraints.max_weekly_duration_minutes).toBe(300);
    expect(
      prescription.activity_categories.run?.volume.duration_minutes?.target ??
        prescription.activity_categories.run?.volume.target,
    ).toBeLessThanOrEqual(300);
  });
});
