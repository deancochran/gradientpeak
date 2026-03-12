import { defaultAthletePreferenceProfile } from "../../../schemas/settings/profile_settings";

export const periodizationScenarioFixtures = {
  feasibleSingleAGoal: {
    currentCtl: 45,
    weeksToPeak: 4,
    goals: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Spring 10k",
        target_date: "2026-04-09",
        priority: 9,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 10000,
            target_time_s: 4125,
            activity_category: "run" as const,
          },
        ],
      },
    ],
    preferenceProfile: defaultAthletePreferenceProfile,
    expectedMode: "target_seeking" as const,
  },
  boundaryFeasible: {
    currentCtl: 45,
    weeksToPeak: 4,
    goals: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Boundary Goal",
        target_date: "2026-04-09",
        priority: 8,
        targets: [
          {
            target_type: "power_threshold" as const,
            target_watts: 256,
            test_duration_s: 3600,
            activity_category: "bike" as const,
          },
        ],
      },
    ],
    preferenceProfile: defaultAthletePreferenceProfile,
    expectedMode: "target_seeking" as const,
  },
  infeasibleBeginnerStretch: {
    currentCtl: 20,
    weeksToPeak: 2,
    goals: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Stretch Half Marathon",
        target_date: "2026-03-26",
        priority: 9,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 21097,
            target_time_s: 7200,
            activity_category: "run" as const,
          },
        ],
      },
    ],
    preferenceProfile: defaultAthletePreferenceProfile,
    expectedMode: "capacity_bounded" as const,
  },
  bBeforeA: {
    currentCtl: 40,
    weeksToPeak: 8,
    goals: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Tune-Up",
        target_date: "2026-04-01",
        priority: 6,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 5000,
            target_time_s: 1500,
            activity_category: "run" as const,
          },
        ],
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "A Race",
        target_date: "2026-04-29",
        priority: 9,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 10000,
            target_time_s: 4050,
            activity_category: "run" as const,
          },
        ],
      },
    ],
    preferenceProfile: defaultAthletePreferenceProfile,
    expectedMicroTaperDays: 4,
  },
  twoCloseAGoals: {
    currentCtl: 48,
    weeksToPeak: 6,
    goals: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Championship One",
        target_date: "2026-04-20",
        priority: 9,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 10000,
            target_time_s: 3900,
            activity_category: "run" as const,
          },
        ],
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Championship Two",
        target_date: "2026-05-04",
        priority: 10,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 10000,
            target_time_s: 3840,
            activity_category: "run" as const,
          },
        ],
      },
    ],
    preferenceProfile: defaultAthletePreferenceProfile,
  },
  sameDayAB: {
    currentCtl: 42,
    weeksToPeak: 5,
    goals: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Priority A",
        target_date: "2026-04-26",
        priority: 9,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 10000,
            target_time_s: 3960,
            activity_category: "run" as const,
          },
        ],
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        name: "Priority B",
        target_date: "2026-04-26",
        priority: 6,
        targets: [
          {
            target_type: "race_performance" as const,
            distance_m: 5000,
            target_time_s: 1380,
            activity_category: "run" as const,
          },
        ],
      },
    ],
    preferenceProfile: defaultAthletePreferenceProfile,
  },
  noGoals: {
    currentCtl: 32,
    weeksToPeak: 6,
    goals: [],
    preferenceProfile: defaultAthletePreferenceProfile,
    expectedMode: "capacity_bounded" as const,
  },
} as const;
