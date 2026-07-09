import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas";
import { resolveTrainingPrescription } from "../trainingPrescription";
import { resolveWeeklyAllocation, weeklyAllocationSchema } from "../weeklyAllocation";

describe("resolveWeeklyAllocation", () => {
  it("preserves prescribed activity categories, sessions, key exposures, and load methods", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        {
          id: "11111111-1111-4111-8111-111111111111",
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

    const allocation = resolveWeeklyAllocation({ prescription });

    expect(weeklyAllocationSchema.parse(allocation)).toBeTruthy();
    expect(allocation.activity_categories.run?.role).toBe("primary");
    expect(allocation.activity_categories.run?.sessions.target).toBe(
      prescription.activity_categories.run?.sessions.target_per_week,
    );
    expect(
      allocation.activity_categories.run?.key_exposures.some(
        (exposure) => exposure.type === "long_session",
      ),
    ).toBe(true);
    expect(allocation.activity_categories.run?.load_model.load_method).toBe("run_pace");
  });

  it("respects max weekly duration without asking the scheduler to reinterpret goals", () => {
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
        {
          id: "22222222-2222-4222-8222-222222222222",
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

    const allocation = resolveWeeklyAllocation({ prescription, preferences });

    expect(allocation.totals.target_duration_minutes).toBeLessThanOrEqual(180);
    expect(allocation.activity_categories.run).toBeDefined();
    expect(allocation.activity_categories.strength).toBeDefined();
  });

  it("keeps strength volume as strength work instead of fake endurance TSS", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Strength",
          target_date: "2027-06-01",
          priority: 8,
          targets: [
            {
              target_type: "power_threshold",
              activity_category: "strength",
              target_watts: 1,
              test_duration_s: 1,
            },
          ],
        },
      ],
    });

    const allocation = resolveWeeklyAllocation({ prescription });

    expect(allocation.activity_categories.strength?.volume.unit).toBe("sets");
    expect(allocation.activity_categories.strength?.load_model.load_method).toBe("strength_volume");
    expect(allocation.activity_categories.run).toBeUndefined();
  });

  it("keeps mixed activity categories in their own allocation buckets", () => {
    const prescription = resolveTrainingPrescription({
      goals: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Duathlon Run",
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
          id: "55555555-5555-4555-8555-555555555555",
          name: "Bike FTP",
          target_date: "2027-09-01",
          priority: 7,
          targets: [
            {
              target_type: "power_threshold",
              activity_category: "bike",
              target_watts: 250,
              test_duration_s: 1200,
            },
          ],
        },
      ],
    });

    const allocation = resolveWeeklyAllocation({ prescription });

    expect(allocation.activity_categories.run?.role).toBe("primary");
    expect(allocation.activity_categories.bike?.role).toBe("secondary");
    expect(allocation.activity_categories.run?.load_model.load_method).toBe("run_pace");
    expect(allocation.activity_categories.bike?.load_model.load_method).toBe("bike_power");
    expect(allocation.totals.target_sessions).toBeGreaterThanOrEqual(
      (allocation.activity_categories.run?.sessions.target ?? 0) +
        (allocation.activity_categories.bike?.sessions.target ?? 0),
    );
  });
});
