import { describe, expect, it, vi } from "vitest";
import { activityPlansRouter } from "../activity_plans";

// Mock the estimation helpers
vi.mock("../../utils/estimation-helpers", () => ({
  addEstimationToPlans: vi.fn().mockImplementation(async (plans) =>
    plans.map((p: any) => ({
      ...p,
      estimated_tss: p.id === "plan-1" ? 50 : 100,
      estimated_zones: p.id === "plan-1" ? ["Z2"] : ["Z4"],
      intensity_factor: p.id === "plan-1" ? 0.7 : 0.95,
    })),
  ),
}));

describe("activityPlans.recommendDailyActivity", () => {
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: "plan-1", name: "Easy Run", activity_category: "run" },
              { id: "plan-2", name: "Hard Run", activity_category: "run" },
            ],
            error: null,
          }),
        })),
      })),
    })),
  };

  const caller = activityPlansRouter.createCaller({
    supabase: mockSupabase as any,
    session: { user: { id: "user-1", email: "user@example.com" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  it("should return recommended activity plans based on target profile", async () => {
    const result = await caller.recommendDailyActivity({
      targetTss: 50,
      targetZones: ["Z2"],
      effortCategory: "easy",
      currentCtl: 50,
      currentAtl: 50,
      activityCategory: "run",
    });

    // Our mocked estimations returned:
    // plan-1: TSS 50, Z2, IF 0.7 (easy)
    // plan-2: TSS 100, Z4, IF 0.95 (hard)
    // Thus plan-1 perfectly matches targetTss 50, targetZones ["Z2"], effortCategory "easy".

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.planId).toBe("plan-1"); // Should score higher due to better match
  });
});
