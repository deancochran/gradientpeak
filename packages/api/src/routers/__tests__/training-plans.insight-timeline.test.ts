import { describe, expect, it, vi } from "vitest";
import { getPlanTabProjectionService } from "../planning/training-plans/base";

vi.mock("../../utils/estimation-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/estimation-helpers")>();

  return {
    ...actual,
    addEstimationToPlans: vi.fn(async (plans: any[]) =>
      plans.map((plan) => ({
        ...plan,
        estimated_tss: plan?.structure?.mock_estimated_tss ?? plan.estimated_tss ?? 70,
        estimated_duration:
          plan?.structure?.mock_estimated_duration ?? plan.estimated_duration ?? 3600,
        counts_toward_aggregation: !(plan?.structure?.shouldThrow ?? false),
        estimation_status: plan?.structure?.shouldThrow ? "failed" : "estimated",
      })),
    ),
  };
});

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
        eq: vi.fn(() => builder),
        or: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lt: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        in: vi.fn(() => builder),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        single: vi.fn(() => Promise.resolve(result)),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(result).then(onFulfilled),
      };

      return builder;
    },
  };
}

describe("getPlanTabProjectionService", () => {
  it("returns a deterministic baseline projection payload", async () => {
    const mockSupabase = createSupabaseMock({
      training_plans: {
        data: {
          id: "plan-1",
          structure: {
            plan_type: "periodized",
            goals: [
              {
                name: "Marathon",
                target_date: "2026-05-01",
                priority: 1,
              },
            ],
            blocks: [],
            fitness_progression: {
              starting_ctl: 40,
              target_ctl_at_peak: 80,
            },
            activity_distribution: { run: 1 },
          },
        },
        error: null,
      },
      profile_goals: { data: [], error: null },
      profile_training_settings: { data: null, error: null },
      events: { data: [], error: null },
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      profiles: {
        data: [{ id: "user-1", dob: null, gender: null }],
        error: null,
      },
    });

    const result = await getPlanTabProjectionService({
      supabase: mockSupabase as any,
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      profileId: "user-1",
      input: {
        training_plan_id: "plan-1",
        start_date: "2026-01-01",
        end_date: "2026-05-01",
        timezone: "UTC",
      },
    });

    expect(result).toBeDefined();
    expect(result.window.start_date).toBe("2026-01-01");
    expect(result.capability.category).toBe("run");
    expect(result.timeline).toBeInstanceOf(Array);
    expect(result.readiness_forecast).toMatchObject({
      series: {
        actual: { id: "actual" },
        scheduled: { id: "scheduled" },
        recommended: { id: "recommended" },
      },
    });
    expect(result.readiness_forecast.confidence_reason_codes).toContain("missing_recent_history");
    expect(result.load_comparison?.weeks.length).toBeGreaterThan(0);
    expect(result.load_comparison?.weeks[0]).toEqual(
      expect.objectContaining({
        week_start: expect.any(String),
        week_end: expect.any(String),
        recommended_load: expect.any(Number),
      }),
    );
    expect(result.upcoming_impact).toEqual([]);
    expect(result.activity_plan_matches).toEqual(
      expect.objectContaining({
        matches: [],
        empty_reason: "no_positive_gap",
      }),
    );
    expect(result.schedule_recommendation).toEqual(
      expect.objectContaining({
        label: expect.any(String),
        target_date: expect.any(String),
      }),
    );
    expect(result).toHaveProperty("schedule_simulation");
    expect(result.projection.diagnostics).toMatchObject({
      fallback_mode: "no_dated_goals",
      load_provenance: {
        source: "plan_structure",
      },
    });
  });

  it("simulates an arbitrary schedule adjustment from the projection inputs", async () => {
    const mockSupabase = createSupabaseMock({
      training_plans: {
        data: {
          id: "plan-1",
          structure: {
            plan_type: "periodized",
            goals: [
              {
                name: "Marathon",
                target_date: "2026-05-01",
                priority: 1,
              },
            ],
            blocks: [],
            fitness_progression: {
              starting_ctl: 40,
              target_ctl_at_peak: 80,
            },
            activity_distribution: { run: 1 },
          },
        },
        error: null,
      },
      profile_goals: { data: [], error: null },
      profile_training_settings: { data: null, error: null },
      events: { data: [], error: null },
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      profiles: {
        data: [{ id: "user-1", dob: null, gender: null }],
        error: null,
      },
    });

    const result = await getPlanTabProjectionService({
      supabase: mockSupabase as any,
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      profileId: "user-1",
      input: {
        training_plan_id: "plan-1",
        start_date: "2026-01-01",
        end_date: "2026-05-01",
        timezone: "UTC",
        schedule_adjustment: {
          date: "2026-04-06",
          tss_delta: 45,
          comparison_date: "2026-05-01",
        },
      },
    });

    expect(result.schedule_simulation).toEqual(
      expect.objectContaining({
        adjustment: {
          date: "2026-04-06",
          tss_delta: 45,
          resulting_scheduled_load: 45,
        },
        comparison_date: "2026-05-01",
        simulated_load: 45,
        confidence: expect.any(String),
      }),
    );
  });

  it("does not match activity plans when there is no positive schedule gap", async () => {
    const mockSupabase = createSupabaseMock({
      training_plans: {
        data: {
          id: "plan-1",
          structure: {
            plan_type: "periodized",
            goals: [{ name: "Marathon", target_date: "2026-05-01", priority: 1 }],
            blocks: [],
            fitness_progression: { starting_ctl: 40, target_ctl_at_peak: 80 },
            activity_distribution: { run: 1 },
          },
        },
        error: null,
      },
      profile_goals: { data: [], error: null },
      profile_training_settings: { data: null, error: null },
      events: { data: [], error: null },
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      profiles: { data: [{ id: "user-1", dob: null, gender: null }], error: null },
      activity_plans: {
        data: [
          {
            id: "plan-easy",
            profile_id: "user-1",
            name: "Easy Run",
            activity_category: "run",
            estimated_tss: 35,
            estimated_duration_seconds: 2400,
            created_at: "2026-04-10T00:00:00.000Z",
            structure: {},
          },
          {
            id: "plan-tempo",
            profile_id: "user-1",
            name: "Tempo Run",
            activity_category: "run",
            estimated_tss: 98,
            estimated_duration_seconds: 3600,
            created_at: "2026-04-12T00:00:00.000Z",
            structure: {},
          },
          {
            id: "plan-bike",
            profile_id: "user-1",
            name: "Bike Endurance",
            activity_category: "ride",
            estimated_tss: 100,
            estimated_duration_seconds: 5400,
            created_at: "2026-04-11T00:00:00.000Z",
            structure: {},
          },
        ],
        error: null,
      },
    });

    const result = await getPlanTabProjectionService({
      supabase: mockSupabase as any,
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [],
        }),
      },
      profileId: "user-1",
      input: {
        training_plan_id: "plan-1",
        start_date: "2026-01-01",
        end_date: "2026-05-01",
        timezone: "UTC",
      },
    });

    expect(result.activity_plan_matches).toEqual(
      expect.objectContaining({
        empty_reason: "no_positive_gap",
        matches: [],
        target_tss_delta: 0,
      }),
    );
  });
});
