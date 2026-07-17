import { describe, expect, it } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";
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
            structure: {
              id: sourcePlanId,
              version: 1,
              sport: ["run"],
              sessions: [
                {
                  offset_days: 0,
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
              ],
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
            structure: {
              id: "33333333-3333-4333-8333-333333333333",
              version: 1,
              sport: ["run"],
              sessions: [
                {
                  offset_days: 0,
                  activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
              ],
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

  it("rejects legacy system-template structures explicitly", async () => {
    const sourcePlanId = "6a6f5a93-b8f3-4fca-9d4f-56a55b913001";
    const { db, callLog } = createQueryMapDbMock({
      training_plans: [
        {
          data: {
            id: sourcePlanId,
            name: "Marathon Foundation (12 weeks)",
            description: "Legacy seeded structure",
            profile_id: null,
            template_visibility: "public",
            is_system_template: true,
            structure: {
              version: 1,
              start_date: "2026-01-05",
              target_weekly_tss_min: 280,
              target_weekly_tss_max: 420,
              target_activities_per_week: 4,
              max_consecutive_days: 3,
              min_rest_days_per_week: 2,
              sessions: [
                {
                  offset_days: 1,
                  title: "Easy Run",
                  session_type: "planned",
                  activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
                },
              ],
            },
          },
          error: null,
        },
        {
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Marathon Foundation (12 weeks) (Copy)",
            description: "Legacy seeded structure",
            profile_id: "profile-123",
            template_visibility: "private",
            is_system_template: false,
            structure: {
              version: 1,
              start_date: "2026-01-05",
              target_weekly_tss_min: 280,
              target_weekly_tss_max: 420,
              target_activities_per_week: 4,
              max_consecutive_days: 3,
              min_rest_days_per_week: 2,
              sessions: [
                {
                  offset_days: 1,
                  title: "Easy Run",
                  session_type: "planned",
                  activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
                },
              ],
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

    await expect(caller.duplicate({ id: sourcePlanId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Source training plan has invalid structure",
    });
    expect(
      callLog.some((call) => call.table === "training_plans" && call.operation === "insert"),
    ).toBe(false);
  });
});
