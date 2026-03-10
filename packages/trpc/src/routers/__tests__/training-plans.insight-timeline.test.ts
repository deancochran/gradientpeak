import { describe, expect, it, vi } from "vitest";
import { getPlanTabProjectionService } from "../training-plans.base";

describe("getPlanTabProjectionService", () => {
  it("returns a deterministic baseline projection payload", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
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
              }),
            }),
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            gte: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

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
  });
});
