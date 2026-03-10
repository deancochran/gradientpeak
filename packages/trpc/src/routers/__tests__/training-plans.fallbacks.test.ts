import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/core/estimation", async () => {
  const actual = await vi.importActual<typeof import("@repo/core/estimation")>(
    "@repo/core/estimation",
  );

  return {
    ...actual,
    buildEstimationContext: vi.fn((input: unknown) => input),
    estimateActivity: vi.fn((context: any) => ({
      tss: context?.activityPlan?.structure?.mock_estimated_tss ?? 70,
      duration: 3600,
      intensityFactor: 0.75,
      confidence: "moderate",
      confidenceScore: 0.6,
      estimatedHRZones: [0, 0, 0, 0, 0],
    })),
    estimateMetrics: vi.fn(() => ({
      calories: 500,
      distance: 10000,
    })),
  };
});

import { getPlanTabProjectionService } from "../training-plans.base";
import { trainingPlansRouter } from "../training_plans";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

function createSupabaseMock(results: Record<string, QueryResult>) {
  return {
    from: (table: string) => {
      const result = results[table] ?? { data: [], error: null };
      const builder: any = {
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        not: vi.fn(() => builder),
        or: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lte: vi.fn(() => builder),
        lt: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve(result)),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(result).then(onFulfilled),
      };

      return builder;
    },
  };
}

function createTrainingPlansCaller(results: Record<string, QueryResult> = {}) {
  return trainingPlansRouter.createCaller({
    supabase: createSupabaseMock(results) as any,
    session: {
      user: {
        id: "profile-123",
      },
    },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

describe("training plan projection fallbacks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps no-goal no-history weekly targets to a conservative baseline", async () => {
    const result = await getPlanTabProjectionService({
      supabase: createSupabaseMock({
        training_plans: {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            structure: {
              start_date: "2026-01-01",
              target_weekly_tss_min: 140,
              target_weekly_tss_max: 210,
              sessions: [],
            },
          },
          error: null,
        },
        profile_goals: { data: [], error: null },
        profile_training_settings: { data: null, error: null },
        events: { data: [], error: null },
        activities: { data: [], error: null },
      }) as any,
      profileId: "profile-123",
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.ideal_tss)).toEqual([
      20, 20, 20,
    ]);
    expect(result.load_guidance).toMatchObject({
      mode: "baseline",
      goal_count: 0,
      dated_goal_count: 0,
      weekly_cap_tss: 140,
    });
  });

  it("uses scheduled activity estimates for baseline guidance when they stay within the conservative cap", async () => {
    const result = await getPlanTabProjectionService({
      supabase: createSupabaseMock({
        training_plans: {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            structure: {
              start_date: "2026-01-01",
              sessions: [],
            },
          },
          error: null,
        },
        profile_goals: { data: [], error: null },
        profile_training_settings: { data: null, error: null },
        events: {
          data: [
            {
              starts_at: "2026-01-02T00:00:00.000Z",
              activity_plan: {
                id: "22222222-2222-4222-8222-222222222222",
                profile_id: null,
                route_id: null,
                name: "Steady Run",
                activity_category: "run",
                structure: { mock_estimated_tss: 84 },
              },
            },
          ],
          error: null,
        },
        activities: { data: [], error: null },
        profiles: { data: { id: "profile-123", dob: null }, error: null },
        activity_efforts: { data: [], error: null },
        profile_metrics: { data: [], error: null },
      }) as any,
      profileId: "profile-123",
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.ideal_tss)).toEqual([
      20, 84, 20,
    ]);
    expect(result.timeline.map((point) => point.scheduled_tss)).toEqual([
      0, 84, 0,
    ]);
    expect(result.load_guidance).toMatchObject({
      mode: "baseline",
      weekly_cap_tss: 140,
    });
  });

  it("marks the load guidance as goal-driven when dated profile goals exist", async () => {
    const result = await getPlanTabProjectionService({
      supabase: createSupabaseMock({
        training_plans: {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            structure: {
              start_date: "2026-01-01",
              sessions: [],
            },
          },
          error: null,
        },
        profile_goals: {
          data: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              title: "10K",
              goal_type: "race_performance",
              target_metric: "target_speed_mps",
              target_value: 3.5,
              metadata: {},
              importance: 7,
              target_date: "2026-02-01",
            },
          ],
          error: null,
        },
        profile_training_settings: { data: null, error: null },
        events: { data: [], error: null },
        activities: { data: [], error: null },
        profiles: { data: { id: "profile-123", dob: null }, error: null },
        activity_efforts: { data: [], error: null },
        profile_metrics: { data: [], error: null },
      }) as any,
      profileId: "profile-123",
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.load_guidance).toMatchObject({
      mode: "goal_driven",
      goal_count: 1,
      dated_goal_count: 1,
      weekly_cap_tss: null,
    });
  });

  it("returns a non-null ideal curve for session-only plans with weekly targets", async () => {
    const caller = createTrainingPlansCaller({
      training_plans: {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          structure: {
            start_date: "2026-01-01",
            target_weekly_tss_min: 140,
            target_weekly_tss_max: 210,
            sessions: [],
          },
        },
        error: null,
      },
      activity_plans: { data: [], error: null },
      activities: { data: [], error: null },
    });

    const result = await caller.getIdealCurve({
      id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-01-01",
      end_date: "2026-03-01",
    });

    expect(result).toMatchObject({
      dataPoints: expect.any(Array),
      startCTL: expect.any(Number),
      targetCTL: expect.any(Number),
      targetDate: "2026-03-01",
    });
    expect(result.dataPoints.length).toBeGreaterThan(0);
  });

  it("derives the ideal curve from linked scheduled sessions without periodization data", async () => {
    const caller = createTrainingPlansCaller({
      training_plans: {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          structure: {
            start_date: "2026-01-06",
            sessions: [
              {
                offset_days: 0,
                title: "Workout A",
                session_type: "planned",
                activity_plan_id: "22222222-2222-4222-8222-222222222222",
              },
              {
                offset_days: 2,
                title: "Workout B",
                session_type: "planned",
                activity_plan_id: "33333333-3333-4333-8333-333333333333",
              },
            ],
          },
        },
        error: null,
      },
      activity_plans: {
        data: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            profile_id: null,
            route_id: null,
            name: "Workout A",
            activity_category: "run",
            structure: { mock_estimated_tss: 120 },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            profile_id: null,
            route_id: null,
            name: "Workout B",
            activity_category: "run",
            structure: { mock_estimated_tss: 150 },
          },
        ],
        error: null,
      },
      activities: { data: [], error: null },
      profiles: { data: { id: "profile-123", dob: null }, error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.getIdealCurve({
      id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-01-06",
      end_date: "2026-02-01",
    });

    expect(result.targetCTL).toBeGreaterThan(35);
    expect(result.targetDate).toBe("2026-02-01");
    expect(result.dataPoints.length).toBeGreaterThan(0);
  });
});
