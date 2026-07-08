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
  it("prescribes marathon-specific run durability and long-session exposure", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Marathon",
          target_date: "2027-10-01",
          priority: 9,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12_600,
            },
          ],
        },
      ],
    });

    expect(trainingPrescriptionSchema.parse(prescription)).toBeTruthy();
    expect(prescription.goal_profile.primary_goal_type).toBe("event_performance");
    expect(prescription.goal_profile.primary_activity_categories).toContain("run");
    expect(prescription.goal_profile.demand.endurance).toBeGreaterThan(0.75);
    expect(prescription.goal_profile.demand.durability).toBeGreaterThan(0.75);
    expect(prescription.activity_categories.run?.role).toBe("primary");
    expect(
      prescription.activity_categories.run?.key_exposures.some(
        (exposure) => exposure.type === "long_session",
      ),
    ).toBe(true);
    expect(
      prescription.activity_categories.run?.intensity_distribution.aerobic_endurance,
    ).toBeGreaterThan(0.65);
  });

  it("prescribes 5K work with more VO2 and threshold than marathon work", () => {
    const fiveK = resolveTrainingPrescription({
      goals: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "5K",
          target_date: "2027-06-01",
          priority: 9,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1200,
            },
          ],
        },
      ],
    });
    const marathon = resolveTrainingPrescription({
      goals: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Marathon",
          target_date: "2027-10-01",
          priority: 9,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12_600,
            },
          ],
        },
      ],
    });

    expect(fiveK.activity_categories.run?.intensity_distribution.vo2 ?? 0).toBeGreaterThan(
      marathon.activity_categories.run?.intensity_distribution.vo2 ?? 0,
    );
    expect(fiveK.activity_categories.run?.intensity_distribution.threshold ?? 0).toBeGreaterThan(
      marathon.activity_categories.run?.intensity_distribution.threshold ?? 0,
    );
    expect(
      fiveK.activity_categories.run?.key_exposures.some(
        (exposure) => exposure.type === "vo2_interval",
      ),
    ).toBe(true);
  });

  it("keeps cycling threshold requirements sport-specific", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          name: "Raise FTP",
          target_date: "2027-08-01",
          priority: 8,
          targets: [
            {
              target_type: "power_threshold",
              activity_category: "bike",
              target_watts: 300,
              test_duration_s: 1200,
            },
          ],
        },
      ],
    });

    expect(prescription.activity_categories.bike?.role).toBe("primary");
    expect(prescription.activity_categories.bike?.load_model.load_method).toBe("bike_power");
    expect(
      prescription.activity_categories.bike?.key_exposures.some(
        (exposure) => exposure.type === "threshold_interval",
      ),
    ).toBe(true);
  });

  it("represents tri-style multi-sport goals without collapsing load to one sport", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: "Tri run",
          target_date: "2027-09-01",
          priority: 9,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 10_000,
              target_time_s: 2700,
            },
          ],
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          name: "Tri bike",
          target_date: "2027-09-01",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "bike",
              distance_m: 40_000,
              target_time_s: 4200,
            },
          ],
        },
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Tri swim",
          target_date: "2027-09-01",
          priority: 7,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "swim",
              distance_m: 1500,
              target_time_s: 1800,
            },
          ],
        },
      ],
    });

    expect(prescription.goal_profile.primary_goal_type).toBe("hybrid");
    expect(prescription.goal_profile.specificity_mode).toBe("multi_activity_category");
    expect(prescription.activity_categories.run).toBeDefined();
    expect(prescription.activity_categories.bike).toBeDefined();
    expect(prescription.activity_categories.swim).toBeDefined();
    expect(prescription.activity_categories.run?.priority_weight).toBeGreaterThan(
      prescription.activity_categories.swim?.priority_weight ?? 0,
    );
  });

  it("treats strength goals as first-class strength volume rather than endurance TSS", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        profileGoal({
          activity_category: "strength",
          objective: {
            type: "threshold",
            metric: "power",
            activity_category: "strength",
            value: 1,
          },
        }),
      ],
    });

    expect(prescription.goal_profile.primary_goal_type).toBe("strength");
    expect(prescription.activity_categories.strength?.role).toBe("primary");
    expect(prescription.activity_categories.strength?.volume.unit).toBe("sets");
    expect(prescription.activity_categories.strength?.load_model.load_method).toBe(
      "strength_volume",
    );
    expect(
      prescription.activity_categories.strength?.intensity_distribution.max_strength,
    ).toBeGreaterThan(0);
    expect(prescription.activity_categories.run).toBeUndefined();
  });

  it("builds a balanced general prescription when goals are absent", () => {
    const prescription = resolveTrainingPrescription({ goals: [] });

    expect(prescription.goal_profile.primary_goal_type).toBe("general_fitness");
    expect(prescription.goal_profile.specificity_mode).toBe("general");
    expect(prescription.activity_categories.other).toBeDefined();
    expect(prescription.activity_categories.strength).toBeDefined();
  });

  it("lets preferences alter support sports and global prescription constraints", () => {
    const preferences = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        max_weekly_duration_minutes: 300,
      },
      training_style: {
        ...defaultAthletePreferenceProfile.training_style,
        strength_integration_priority: 0.95,
      },
      recovery_preferences: {
        ...defaultAthletePreferenceProfile.recovery_preferences,
        recovery_priority: 0.8,
      },
    };

    const prescription = resolveTrainingPrescription({
      preferences,
      goals: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "10K",
          target_date: "2027-06-01",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 10_000,
              target_time_s: 2700,
            },
          ],
        },
      ],
    });

    expect(prescription.activity_categories.strength).toBeDefined();
    expect(prescription.global_constraints.max_weekly_duration_minutes).toBe(300);
    expect(
      prescription.activity_categories.run?.volume.duration_minutes?.target ??
        prescription.activity_categories.run?.volume.target,
    ).toBeLessThanOrEqual(300);
  });
});
