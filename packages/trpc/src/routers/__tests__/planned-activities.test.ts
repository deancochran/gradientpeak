import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/core", async () => {
  const actual =
    await vi.importActual<typeof import("@repo/core")>("@repo/core");

  return {
    ...actual,
    buildEstimationContext: vi.fn((input: unknown) => input),
    estimateActivity: vi.fn(() => ({ tss: 90 })),
  };
});

import { plannedActivitiesRouter } from "../planned_activities";

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
        or: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lte: vi.fn(() => builder),
        lt: vi.fn(() => builder),
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

function createPlannedActivitiesCaller(results: Record<string, QueryResult>) {
  return plannedActivitiesRouter.createCaller({
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

describe("plannedActivitiesRouter.validateConstraints", () => {
  it("returns violated constraint statuses when adding activity breaches plan limits", async () => {
    const caller = createPlannedActivitiesCaller({
      training_plans: {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          structure: {
            target_weekly_tss_max: 120,
            target_activities_per_week: 1,
            max_consecutive_days: 1,
            min_rest_days_per_week: 6,
          },
        },
        error: null,
      },
      activity_plans: {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          route_id: null,
          name: "Steady Run",
          structure: {},
        },
        error: null,
      },
      planned_activities: {
        data: [
          {
            id: "a1",
            scheduled_date: "2026-01-06",
            activity_plan: {
              id: "plan-a",
              route_id: null,
              name: "Run A",
              structure: {},
            },
          },
          {
            id: "a2",
            scheduled_date: "2026-01-07",
            activity_plan: {
              id: "plan-b",
              route_id: null,
              name: "Run B",
              structure: {},
            },
          },
        ],
        error: null,
      },
      profiles: {
        data: {
          id: "profile-123",
          dob: "1990-01-01",
        },
        error: null,
      },
      activity_efforts: {
        data: null,
        error: null,
      },
      profile_metrics: {
        data: null,
        error: null,
      },
    });

    const result = await caller.validateConstraints({
      training_plan_id: "11111111-1111-4111-8111-111111111111",
      scheduled_date: "2026-01-08",
      activity_plan_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.canSchedule).toBe(false);
    expect(result.constraints.activitiesPerWeek.status).toBe("violated");
    expect(result.constraints.restDays.status).toBe("violated");
  });
});
