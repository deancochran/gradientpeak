import type {
  GoalDemandProfile,
  ProfileGoal,
  ProfileGoalRecordInput,
} from "../goals/profile_goals";

export interface CanonicalGoalFixture {
  name: string;
  record: ProfileGoalRecordInput;
  goal: ProfileGoal;
  demandProfile: GoalDemandProfile;
}

export const canonicalGoalFixtures: CanonicalGoalFixture[] = [
  {
    name: "5k-time-goal",
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-09-13",
      title: "Break 20 for 5K",
      priority: 1,
      activity_category: "run",
      target_payload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1200,
        tolerance_pct: 0.02,
        environment: "road",
      },
    },
    goal: {
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-09-13",
      title: "Break 20 for 5K",
      priority: 1,
      activity_category: "run",
      objective: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1200,
        tolerance_pct: 0.02,
        environment: "road",
      },
    },
    demandProfile: {
      endurance_demand: 0.5,
      threshold_demand: 0.9,
      high_intensity_demand: 0.74,
      durability_demand: 0.35,
      technical_demand: 0.2,
      specificity_demand: 0.8,
    },
  },
  {
    name: "ftp-goal",
    record: {
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-07-01",
      title: "Raise FTP to 280W",
      priority: 2,
      activity_category: "bike",
      target_payload: {
        type: "threshold",
        metric: "power",
        activity_category: "bike",
        value: 280,
        test_duration_s: 1200,
        tolerance_pct: 0.03,
      },
    },
    goal: {
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-07-01",
      title: "Raise FTP to 280W",
      priority: 2,
      activity_category: "bike",
      objective: {
        type: "threshold",
        metric: "power",
        activity_category: "bike",
        value: 280,
        test_duration_s: 1200,
        tolerance_pct: 0.03,
      },
    },
    demandProfile: {
      endurance_demand: 0.62,
      threshold_demand: 0.95,
      high_intensity_demand: 0.55,
      durability_demand: 0.48,
      technical_demand: 0.25,
      specificity_demand: 0.88,
    },
  },
  {
    name: "marathon-completion-goal",
    record: {
      id: "33333333-3333-4333-8333-333333333333",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-11-08",
      title: "Finish my first marathon",
      priority: 3,
      activity_category: "run",
      target_payload: {
        type: "completion",
        activity_category: "run",
        distance_m: 42195,
        duration_s: 16200,
      },
    },
    goal: {
      id: "33333333-3333-4333-8333-333333333333",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-11-08",
      title: "Finish my first marathon",
      priority: 3,
      activity_category: "run",
      objective: {
        type: "completion",
        activity_category: "run",
        distance_m: 42195,
        duration_s: 16200,
      },
    },
    demandProfile: {
      endurance_demand: 0.9,
      threshold_demand: 0.4,
      high_intensity_demand: 0.2,
      durability_demand: 0.95,
      technical_demand: 0.2,
      specificity_demand: 0.8,
    },
  },
  {
    name: "consistency-goal",
    record: {
      id: "44444444-4444-4444-8444-444444444444",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-06-15",
      title: "Train four times each week",
      priority: 4,
      activity_category: "run",
      target_payload: {
        type: "consistency",
        target_sessions_per_week: 4,
        target_weeks: 12,
      },
    },
    goal: {
      id: "44444444-4444-4444-8444-444444444444",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-06-15",
      title: "Train four times each week",
      priority: 4,
      activity_category: "run",
      objective: {
        type: "consistency",
        target_sessions_per_week: 4,
        target_weeks: 12,
      },
    },
    demandProfile: {
      endurance_demand: 0.5,
      threshold_demand: 0.2,
      high_intensity_demand: 0.12,
      durability_demand: 0.675,
      technical_demand: 0.15,
      specificity_demand: 0.437,
    },
  },
];
