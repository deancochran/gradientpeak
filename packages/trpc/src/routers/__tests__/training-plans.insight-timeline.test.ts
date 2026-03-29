import { describe, expect, it, vi } from "vitest";
import { getPlanTabProjectionService } from "../planning/training-plans/base";

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
    expect(result.projection.diagnostics).toMatchObject({
      fallback_mode: "no_dated_goals",
      load_provenance: {
        source: "plan_structure",
      },
    });
  });
});
