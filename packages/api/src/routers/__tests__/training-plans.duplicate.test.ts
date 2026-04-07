import { describe, expect, it } from "vitest";
import { createQueryMapDbMock, type QueryMap } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

describe("trainingPlansRouter.duplicate", () => {
  it("allows public plans and creates a private owned copy without scheduling", async () => {
    const sourcePlanId = "11111111-1111-4111-8111-111111111111";
    const { db, callLog } = createQueryMapDbMock({
      training_plans: [
        {
          data: {
            id: sourcePlanId,
            name: "Shared Build",
            description: "Shared plan",
            profile_id: "template-owner",
            template_visibility: "public",
            is_system_template: false,
            is_public: true,
            structure: {
              id: sourcePlanId,
              plan_type: "periodized",
              name: "Shared Build",
              start_date: "2026-01-01",
              end_date: "2026-03-01",
              fitness_progression: { starting_ctl: 45, target_ctl_at_peak: 60 },
              activity_distribution: { run: { target_percentage: 1 } },
              blocks: [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  name: "Base",
                  phase: "base",
                  start_date: "2026-01-01",
                  end_date: "2026-01-28",
                  goal_ids: [],
                  target_weekly_tss_range: { min: 280, max: 320 },
                  target_sessions_per_week_range: { min: 4, max: 5 },
                },
              ],
              goals: [],
            },
          },
          error: null,
        },
        {
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Shared Build (Copy)",
            description: "Shared plan",
            profile_id: "profile-123",
            template_visibility: "private",
            is_system_template: false,
            is_public: false,
            structure: {
              id: "33333333-3333-4333-8333-333333333333",
              plan_type: "periodized",
              name: "Shared Build",
              start_date: "2026-01-01",
              end_date: "2026-03-01",
              fitness_progression: { starting_ctl: 45, target_ctl_at_peak: 60 },
              activity_distribution: { run: { target_percentage: 1 } },
              blocks: [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  name: "Base",
                  phase: "base",
                  start_date: "2026-01-01",
                  end_date: "2026-01-28",
                  goal_ids: [],
                  target_weekly_tss_range: { min: 280, max: 320 },
                  target_sessions_per_week_range: { min: 4, max: 5 },
                },
              ],
              goals: [],
            },
          },
          error: null,
        },
      ],
    });

    const caller = trainingPlansRouter.createCaller({
      db: db as any,
      session: { user: { id: "profile-123" } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any);

    const result = await caller.duplicate({ id: sourcePlanId });

    expect(callLog.some((call) => call.table === "training_plans")).toBe(true);
    expect(result.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(result.id).not.toBe(sourcePlanId);
    expect(result.visibility).toBe("private");
  });
});
