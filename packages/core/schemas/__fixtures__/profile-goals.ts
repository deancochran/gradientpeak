import type {
  GoalDemandProfile,
  ProfileGoal,
  ProfileGoalLinkedEvent,
  ProfileGoalRecordInput,
} from "../goals/profile_goals";

export interface CanonicalGoalFixture {
  name: string;
  record: ProfileGoalRecordInput;
  goal: ProfileGoal;
  linkedEvent: ProfileGoalLinkedEvent;
  resolvedEventDate: string;
  demandProfile: GoalDemandProfile;
}

export const canonicalGoalFixtures: CanonicalGoalFixture[] = [
  {
    name: "5k-time-goal",
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      milestone_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
      milestone_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
    linkedEvent: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      starts_at: "2026-09-13T13:00:00.000Z",
    },
    resolvedEventDate: "2026-09-13",
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
      milestone_event_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
      milestone_event_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
    linkedEvent: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      starts_at: "2026-07-01T08:30:00.000Z",
    },
    resolvedEventDate: "2026-07-01",
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
      milestone_event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
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
      milestone_event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
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
    linkedEvent: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      starts_at: "2026-11-08T07:00:00.000Z",
    },
    resolvedEventDate: "2026-11-08",
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
      milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
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
      milestone_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      title: "Train four times each week",
      priority: 4,
      activity_category: "run",
      objective: {
        type: "consistency",
        target_sessions_per_week: 4,
        target_weeks: 12,
      },
    },
    linkedEvent: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      starts_at: "2026-06-15T10:15:00.000Z",
    },
    resolvedEventDate: "2026-06-15",
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
