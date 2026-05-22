import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { buildGoalAnchoredProjectionPlan, canonicalizeMinimalTrainingPlanCreate } from "..";

describe("buildGoalAnchoredProjectionPlan", () => {
  it("keeps a later A marathon out of a long global taper after an earlier B half marathon", () => {
    const plan = buildGoalAnchoredProjectionPlan({
      minimalPlan: canonicalizeMinimalTrainingPlanCreate({
        plan_start_date: "2026-04-12",
        goals: [
          {
            name: "Half Marathon",
            target_date: "2026-06-30",
            priority: 5,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 21_100,
                target_time_s: 5_400,
                activity_category: "run",
              },
            ],
          },
          {
            name: "Marathon",
            target_date: "2026-11-17",
            priority: 9,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 42_200,
                target_time_s: 10_800,
                activity_category: "run",
              },
            ],
          },
        ],
      }),
      startingCtl: 45,
    });

    const marathonTaper = plan.blocks.find(
      (block) => block.phase === "taper" && block.name.startsWith("Marathon"),
    );
    const marathonPeak = plan.blocks.find(
      (block) => block.phase === "peak" && block.name.startsWith("Marathon"),
    );
    const halfPeak = plan.blocks.find(
      (block) => block.phase === "peak" && block.name.startsWith("Half Marathon"),
    );

    expect((marathonTaper?.start_date ?? "") >= "2026-11-01").toBe(true);
    expect(marathonTaper?.end_date).toBe("2026-11-17");
    expect((marathonPeak?.end_date ?? "") < (marathonTaper?.start_date ?? "")).toBe(true);
    expect(marathonPeak?.target_weekly_tss_range.max ?? 0).toBeGreaterThan(
      halfPeak?.target_weekly_tss_range.max ?? 0,
    );
  });

  it("merges same-date goals into one shared event window", () => {
    const plan = buildGoalAnchoredProjectionPlan({
      minimalPlan: canonicalizeMinimalTrainingPlanCreate({
        plan_start_date: "2026-01-01",
        goals: [
          {
            name: "Run A",
            target_date: "2026-04-01",
            priority: 9,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10_000,
                target_time_s: 2_700,
                activity_category: "run",
              },
            ],
          },
          {
            name: "Bike B",
            target_date: "2026-04-01",
            priority: 5,
            targets: [
              {
                target_type: "power_threshold",
                target_watts: 280,
                test_duration_s: 1_200,
                activity_category: "bike",
              },
            ],
          },
        ],
      }),
    });

    const eventTapers = plan.blocks.filter(
      (block) => block.phase === "taper" && block.end_date === "2026-04-01",
    );

    expect(eventTapers).toHaveLength(1);
    expect(eventTapers[0]?.goal_ids).toHaveLength(2);
    expect(plan.activity_distribution).toEqual({
      bike: { target_percentage: 0.5 },
      run: { target_percentage: 0.5 },
    });
  });

  it("uses a micro taper for a lower-priority goal close before an A goal", () => {
    const plan = buildGoalAnchoredProjectionPlan({
      minimalPlan: canonicalizeMinimalTrainingPlanCreate({
        plan_start_date: "2026-01-01",
        goals: [
          {
            name: "Tune Up",
            target_date: "2026-04-01",
            priority: 4,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10_000,
                target_time_s: 2_700,
                activity_category: "run",
              },
            ],
          },
          {
            name: "A Race",
            target_date: "2026-04-22",
            priority: 9,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 21_100,
                target_time_s: 5_400,
                activity_category: "run",
              },
            ],
          },
        ],
      }),
    });

    const tuneUpTaper = plan.blocks.find(
      (block) => block.phase === "taper" && block.name.startsWith("Tune Up"),
    );

    expect(tuneUpTaper).toBeDefined();
    expect(tuneUpTaper ? diffDaysInclusive(tuneUpTaper.start_date, tuneUpTaper.end_date) : 0).toBe(
      4,
    );
  });

  it("makes training preference sliders change phase shape and load targets", () => {
    const minimalPlan = canonicalizeMinimalTrainingPlanCreate({
      plan_start_date: "2026-01-01",
      goals: [
        {
          name: "Marathon",
          target_date: "2026-05-30",
          priority: 9,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 42_200,
              target_time_s: 10_800,
              activity_category: "run",
            },
          ],
        },
      ],
    });
    const conservative = buildGoalAnchoredProjectionPlan({
      minimalPlan,
      startingCtl: 45,
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          max_weekly_duration_minutes: 300,
          max_single_session_duration_minutes: 60,
          max_sessions_per_week: 4,
        },
        training_style: {
          ...defaultAthletePreferenceProfile.training_style,
          progression_pace: 0.1,
          week_pattern_preference: 0.1,
        },
        recovery_preferences: {
          ...defaultAthletePreferenceProfile.recovery_preferences,
          recovery_priority: 0.9,
        },
        goal_strategy_preferences: {
          ...defaultAthletePreferenceProfile.goal_strategy_preferences,
          target_surplus_preference: 0,
        },
      },
    });
    const aggressive = buildGoalAnchoredProjectionPlan({
      minimalPlan,
      startingCtl: 45,
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          max_weekly_duration_minutes: 600,
          max_single_session_duration_minutes: 120,
          max_sessions_per_week: 6,
        },
        training_style: {
          ...defaultAthletePreferenceProfile.training_style,
          progression_pace: 0.9,
          week_pattern_preference: 0.9,
        },
        recovery_preferences: {
          ...defaultAthletePreferenceProfile.recovery_preferences,
          recovery_priority: 0.2,
        },
        goal_strategy_preferences: {
          ...defaultAthletePreferenceProfile.goal_strategy_preferences,
          target_surplus_preference: 0.8,
        },
      },
    });

    const conservativePeak = conservative.blocks.find((block) => block.phase === "peak");
    const aggressivePeak = aggressive.blocks.find((block) => block.phase === "peak");
    const conservativeBase = conservative.blocks.find((block) => block.phase === "base");
    const aggressiveBase = aggressive.blocks.find((block) => block.phase === "base");

    expect(aggressivePeak?.target_weekly_tss_range.max ?? 0).toBeGreaterThan(
      conservativePeak?.target_weekly_tss_range.max ?? 0,
    );
    expect(
      conservativeBase
        ? diffDaysInclusive(conservativeBase.start_date, conservativeBase.end_date)
        : 0,
    ).toBeGreaterThan(
      aggressiveBase ? diffDaysInclusive(aggressiveBase.start_date, aggressiveBase.end_date) : 0,
    );
  });

  it("scales post-goal recovery by goal demand and recovery preference", () => {
    const basePreferenceProfile = {
      ...defaultAthletePreferenceProfile,
      recovery_preferences: {
        ...defaultAthletePreferenceProfile.recovery_preferences,
        post_goal_recovery_days: 5,
        recovery_priority: 0.5,
      },
    };
    const shortGoalPlan = buildGoalAnchoredProjectionPlan({
      minimalPlan: canonicalizeMinimalTrainingPlanCreate({
        plan_start_date: "2026-01-01",
        goals: [
          {
            name: "5K",
            target_date: "2026-03-15",
            priority: 4,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 5_000,
                target_time_s: 1_500,
                activity_category: "run",
              },
            ],
          },
        ],
      }),
      preferenceProfile: basePreferenceProfile,
    });
    const marathonPlan = buildGoalAnchoredProjectionPlan({
      minimalPlan: canonicalizeMinimalTrainingPlanCreate({
        plan_start_date: "2026-01-01",
        goals: [
          {
            name: "Marathon",
            target_date: "2026-03-15",
            priority: 9,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 42_200,
                target_time_s: 10_800,
                activity_category: "run",
              },
            ],
          },
        ],
      }),
      preferenceProfile: basePreferenceProfile,
    });

    const shortRecovery = shortGoalPlan.blocks.find((block) => block.phase === "recovery");
    const marathonRecovery = marathonPlan.blocks.find((block) => block.phase === "recovery");

    expect(marathonRecovery).toBeDefined();
    expect(shortRecovery).toBeDefined();
    expect(
      marathonRecovery
        ? diffDaysInclusive(marathonRecovery.start_date, marathonRecovery.end_date)
        : 0,
    ).toBeGreaterThan(
      shortRecovery ? diffDaysInclusive(shortRecovery.start_date, shortRecovery.end_date) : 0,
    );
  });
});

function diffDaysInclusive(startDate: string, endDate: string): number {
  return (
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}
