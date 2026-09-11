import { CONTENT_VISIBILITY_VALUES } from "../../schemas/content_visibility";

/** Stable cross-boundary examples for the pre-launch correctness gates. */
export const PLAN_ZERO_CORRECTNESS_FIXTURE_VERSION = "plan-zero-correctness-v1" as const;

export const planZeroCorrectnessFixture = {
  contractVersion: PLAN_ZERO_CORRECTNESS_FIXTURE_VERSION,
  athlete: {
    baseline: {
      contractVersion: "athlete-state-projection-v1" as const,
      athleteId: "athlete-1",
      stateRevision: 7,
      asOf: "2026-06-01T00:00:00.000Z",
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
      evidenceConfidence: 0.8,
      capabilities: [
        {
          activityCategory: "run" as const,
          longestDistanceMeters: 42_195,
          longestDurationMinutes: 240,
          observedAt: "2026-05-01T00:00:00.000Z",
          evidenceConfidence: 0.9,
        },
      ],
      athleteAgeYears: 36,
    },
    goal: {
      goalId: "marathon",
      activityCategory: "run" as const,
      targetAt: "2026-07-01T08:00:00.000Z",
      targetDistanceMeters: 42_195,
      targetDurationMinutes: 240,
    },
  },
  dailyLoad: {
    perSessionLoads: [6_000, 6_000] as const,
    expectedAggregate: 12_000,
  },
  planApplication: {
    planId: "11111111-1111-4111-8111-111111111111",
    activityPlanId: "22222222-2222-4222-8222-222222222222",
    planningTimezone: "UTC",
    startDate: "2026-06-01",
    notBefore: "2026-06-01T00:00:00.000Z",
    structure: {
      version: 1 as const,
      sessions: [
        {
          activity_plan_id: "22222222-2222-4222-8222-222222222222",
          activity_plan_variant_id: "22222222-2222-4222-8222-222222222222",
          offset_days: 2,
        },
      ],
      goal_blueprints: [
        {
          title: "10K",
          priority: 8,
          activity_category: "run" as const,
          target_offset_days: 30,
          objective: {
            type: "event_performance" as const,
            activity_category: "run" as const,
            distance_m: 10_000,
            target_time_s: 3_600,
          },
        },
      ],
      builder_planning_snapshot: {
        version: 1 as const,
        plan_preferences: {
          duration_weeks: 1,
          weekly_session_count: 1,
          target_weekly_hours: null,
          rest_days_per_week: 6,
        },
        scheduling: { preferred_weekdays: [3] },
        goal_context: { selected_goals: [] },
      },
    },
    activityPlans: [
      {
        activityPlanId: "22222222-2222-4222-8222-222222222222",
        activityPlanVariantId: "22222222-2222-4222-8222-222222222222",
        activityCategory: "run" as const,
        commonLoad: 80,
      },
    ],
  },
  recurrence: {
    input: {
      startsAt: "2026-03-01T14:30:00.000Z",
      endsAt: "2026-03-01T15:30:00.000Z",
      frequency: "WEEKLY" as const,
      interval: 1,
      count: 3,
      recurrenceTimeZone: "America/New_York",
      eventTimeZone: "UTC",
    },
    expectedOccurrences: [
      {
        startsAt: "2026-03-01T14:30:00.000Z",
        endsAt: "2026-03-01T15:30:00.000Z",
        occurrenceKey: "2026-03-01",
      },
      {
        startsAt: "2026-03-08T13:30:00.000Z",
        endsAt: "2026-03-08T14:30:00.000Z",
        occurrenceKey: "2026-03-08",
      },
      {
        startsAt: "2026-03-15T13:30:00.000Z",
        endsAt: "2026-03-15T14:30:00.000Z",
        occurrenceKey: "2026-03-15",
      },
    ],
  },
  visibility: [...CONTENT_VISIBILITY_VALUES],
};
