import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryMapDbMock, type QueryMap, type QueryResult } from "../../test/mock-query-db";

vi.mock("@repo/core/estimation", async () => {
  const actual =
    await vi.importActual<typeof import("@repo/core/estimation")>("@repo/core/estimation");

  return {
    ...actual,
    buildEstimationContext: vi.fn((input: unknown) => input),
    estimateActivity: vi.fn((context: any) => {
      if (context?.activityPlan?.structure?.shouldThrow) {
        throw new Error("estimation failed");
      }

      return {
        tss: context?.activityPlan?.structure?.mock_estimated_tss ?? 70,
        duration: 3600,
        intensityFactor: 0.75,
        confidence: "moderate",
        confidenceScore: 0.6,
        estimatedHRZones: [0, 0, 0, 0, 0],
      };
    }),
    estimateMetrics: vi.fn(() => ({
      calories: 500,
      distance: 10000,
    })),
  };
});

vi.mock("../../utils/activity-plan-derived-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/activity-plan-derived-metrics")>();

  return {
    ...actual,
    getActivityPlansDerivedMetrics: vi.fn(async (plans: any[]) =>
      plans.map((plan) => ({
        ...plan,
        estimated_tss: plan?.structure?.mock_estimated_tss ?? 70,
        estimated_duration: 3600,
        intensity_factor: 0.75,
        counts_toward_aggregation: !(plan?.structure?.shouldThrow ?? false),
        estimation_status: plan?.structure?.shouldThrow ? "failed" : "estimated",
      })),
    ),
  };
});

vi.mock("../../utils/estimation-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/estimation-helpers")>();

  return {
    ...actual,
    addEstimationToPlans: vi.fn(async (plans: any[]) =>
      plans.map((plan) => ({
        ...plan,
        estimated_tss: plan?.structure?.mock_estimated_tss ?? 70,
        estimated_duration: 3600,
        intensity_factor: 0.75,
        counts_toward_aggregation: !(plan?.structure?.shouldThrow ?? false),
        estimation_status: plan?.structure?.shouldThrow ? "failed" : "estimated",
      })),
    ),
  };
});

import { trainingPlansRouter } from "../planning/training-plans";
import { getPlanTabProjectionService } from "../planning/training-plans/base";

function createSupabaseMock(results: QueryMap) {
  const counters = new Map<string, number>();

  return {
    from: (table: string) => {
      const entry = results[table];
      const result =
        !entry || !Array.isArray(entry)
          ? (entry ?? { data: [], error: null })
          : (() => {
              const index = counters.get(table) ?? 0;
              counters.set(table, index + 1);
              return entry[index] ?? entry[entry.length - 1] ?? { data: [], error: null };
            })();
      const filters: Array<
        | { type: "eq"; column: string; value: unknown }
        | { type: "gte"; column: string; value: unknown }
        | { type: "lt"; column: string; value: unknown }
      > = [];

      const applyFilters = () => {
        if (!Array.isArray(result.data)) {
          return result;
        }

        const data = result.data.filter((row) => {
          if (!row || typeof row !== "object") {
            return true;
          }

          return filters.every((filter) => {
            const candidate = (row as Record<string, unknown>)[filter.column];
            if (typeof candidate === "undefined") {
              return true;
            }

            if (filter.type === "eq") {
              return candidate === filter.value;
            }

            if (typeof candidate === "string" && typeof filter.value === "string") {
              return filter.type === "gte" ? candidate >= filter.value : candidate < filter.value;
            }

            return true;
          });
        });

        return {
          ...result,
          data,
        };
      };

      const builder: any = {
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push({ type: "eq", column, value });
          return builder;
        }),
        neq: vi.fn(() => builder),
        not: vi.fn(() => builder),
        or: vi.fn(() => builder),
        gte: vi.fn((column: string, value: unknown) => {
          filters.push({ type: "gte", column, value });
          return builder;
        }),
        lte: vi.fn(() => builder),
        lt: vi.fn((column: string, value: unknown) => {
          filters.push({ type: "lt", column, value });
          return builder;
        }),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve(applyFilters())),
        maybeSingle: vi.fn(() => Promise.resolve(applyFilters())),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(applyFilters()).then(onFulfilled),
      };

      return builder;
    },
  };
}

function createTrainingPlansCaller(results: QueryMap = {}) {
  const { db } = createQueryMapDbMock(results);

  return trainingPlansRouter.createCaller({
    db: db as any,
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
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.ideal_tss)).toEqual([20, 20, 20]);
    expect(result.load_guidance).toMatchObject({
      mode: "baseline",
      goal_count: 0,
      dated_goal_count: 0,
      weekly_cap_tss: 140,
    });
    expect(result.projection.diagnostics).toMatchObject({
      fallback_mode: "no_dated_goals",
      load_provenance: {
        source: "plan_structure",
      },
    });
  });

  it("builds planned load guidance without a training plan id when scheduled events exist", async () => {
    const result = await getPlanTabProjectionService({
      supabase: createSupabaseMock({
        profile_goals: { data: [], error: null },
        profile_training_settings: { data: null, error: null },
        events: {
          data: [
            {
              starts_at: "2026-01-02T00:00:00.000Z",
              activity_plan: {
                id: "plan-a",
                structure: { mock_estimated_tss: 55 },
              },
            },
          ],
          error: null,
        },
        activities: { data: [], error: null },
      }) as any,
      profileId: "profile-123",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.scheduled_tss)).toEqual([0, 55, 0]);
    expect(result.timeline.map((point) => point.ideal_tss)).toEqual([20, 20, 20]);
  });

  it("logs and skips invalid canonical profile goals before returning a safe fallback response", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
        profile_goals: {
          data: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              profile_id: "profile-123",
              milestone_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              target_date: "2026-09-14",
              title: "Broken goal",
              priority: 7,
              activity_category: "run",
              target_payload: {
                type: "event_performance",
                activity_category: "run",
              },
            },
          ],
          error: null,
        },
        profile_training_settings: { data: null, error: null },
        events: {
          data: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              starts_at: "2026-02-01T07:00:00.000Z",
            },
          ],
          error: null,
        },
        activities: { data: [], error: null },
      }) as any,
      profileId: "profile-123",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "Skipping invalid canonical profile goal for insight timeline projection.",
      expect.anything(),
    );
    expect(result.timeline.map((point) => point.ideal_tss)).toEqual([20, 20, 20]);
    expect(result.load_guidance).toMatchObject({
      mode: "baseline",
      goal_count: 0,
      dated_goal_count: 0,
      weekly_cap_tss: 140,
    });
    expect(result.projection.diagnostics).toMatchObject({
      fallback_mode: "no_dated_goals",
      load_provenance: {
        source: "plan_structure",
        projection_curve_available: false,
        projection_floor_applied: false,
      },
      confidence: {
        rationale_codes: expect.arrayContaining(["no_dated_goals"]),
      },
    });

    warnSpy.mockRestore();
  });

  it("keeps scheduled load as a separate comparison series from conservative guidance", async () => {
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
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.ideal_tss)).toEqual([20, 20, 20]);
    expect(result.timeline.map((point) => point.scheduled_tss)).toEqual([0, 84, 0]);
    expect(result.load_guidance).toMatchObject({
      mode: "baseline",
      weekly_cap_tss: 140,
    });
    expect(result.projection.diagnostics).toMatchObject({
      load_provenance: {
        source: "conservative_baseline",
      },
    });
  });

  it("keeps recommended load stable when scheduled event load changes", async () => {
    const baseResults = {
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
      activities: { data: [], error: null },
      profiles: { data: { id: "profile-123", dob: null }, error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    } satisfies Record<string, QueryResult>;

    const lowScheduled = await getPlanTabProjectionService({
      supabase: createSupabaseMock({
        ...baseResults,
        events: {
          data: [
            {
              starts_at: "2026-01-02T00:00:00.000Z",
              activity_plan: {
                id: "22222222-2222-4222-8222-222222222222",
                profile_id: null,
                route_id: null,
                name: "Easy Run",
                activity_category: "run",
                structure: { mock_estimated_tss: 36 },
              },
            },
          ],
          error: null,
        },
      }) as any,
      profileId: "profile-123",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    const highScheduled = await getPlanTabProjectionService({
      supabase: createSupabaseMock({
        ...baseResults,
        events: {
          data: [
            {
              starts_at: "2026-01-02T00:00:00.000Z",
              activity_plan: {
                id: "33333333-3333-4333-8333-333333333333",
                profile_id: null,
                route_id: null,
                name: "Long Run",
                activity_category: "run",
                structure: { mock_estimated_tss: 96 },
              },
            },
          ],
          error: null,
        },
      }) as any,
      profileId: "profile-123",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(lowScheduled.timeline.map((point) => point.ideal_tss)).toEqual([20, 20, 20]);
    expect(highScheduled.timeline.map((point) => point.ideal_tss)).toEqual(
      lowScheduled.timeline.map((point) => point.ideal_tss),
    );
    expect(lowScheduled.timeline.map((point) => point.scheduled_tss)).toEqual([0, 36, 0]);
    expect(highScheduled.timeline.map((point) => point.scheduled_tss)).toEqual([0, 96, 0]);
  });

  it("scopes scheduled load to the requested training plan when a training_plan_id is provided", async () => {
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
              profile_id: "profile-123",
              event_type: "planned_activity",
              training_plan_id: "11111111-1111-4111-8111-111111111111",
              starts_at: "2026-01-02T00:00:00.000Z",
              activity_plan: {
                id: "22222222-2222-4222-8222-222222222222",
                profile_id: null,
                route_id: null,
                name: "In Scope",
                activity_category: "run",
                structure: { mock_estimated_tss: 42 },
              },
            },
            {
              profile_id: "profile-123",
              event_type: "planned_activity",
              training_plan_id: "33333333-3333-4333-8333-333333333333",
              starts_at: "2026-01-02T00:00:00.000Z",
              activity_plan: {
                id: "44444444-4444-4444-8444-444444444444",
                profile_id: null,
                route_id: null,
                name: "Out Of Scope",
                activity_category: "run",
                structure: { mock_estimated_tss: 99 },
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
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.scheduled_tss)).toEqual([0, 42, 0]);
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
              profile_id: "profile-123",
              milestone_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              target_date: "2026-09-14",
              title: "10K",
              priority: 7,
              activity_category: "run",
              target_payload: {
                type: "event_performance",
                activity_category: "run",
                distance_m: 10000,
                target_time_s: 2857,
              },
            },
          ],
          error: null,
        },
        profile_training_settings: { data: null, error: null },
        events: {
          data: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              starts_at: "2026-02-01T07:00:00.000Z",
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
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
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
    expect(result.projection.diagnostics).toMatchObject({
      fallback_mode: "conservative_priors",
      load_provenance: {
        source: "canonical_goal_projection",
        projection_curve_available: true,
        projection_floor_applied: true,
      },
      confidence: {
        overall: expect.any(Number),
        adherence: expect.any(Number),
        capability: expect.any(Number),
      },
    });
  });

  it("excludes failed session estimations from scheduled load and reports diagnostics", async () => {
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
              training_plan_id: "11111111-1111-4111-8111-111111111111",
              activity_plan: {
                id: "44444444-4444-4444-8444-444444444444",
                profile_id: null,
                route_id: null,
                name: "Broken plan",
                activity_category: "run",
                structure: { shouldThrow: true },
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
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      input: {
        training_plan_id: "11111111-1111-4111-8111-111111111111",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.scheduled_tss)).toEqual([0, 0, 0]);
    expect(result.projection.diagnostics.estimation).toMatchObject({
      failed_plan_count: 1,
      excluded_from_scheduled_load_count: 1,
      affected_plan_ids: ["44444444-4444-4444-8444-444444444444"],
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
