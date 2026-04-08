import { describe, expect, it } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

const TRAINING_PLAN_ID = "11111111-1111-4111-8111-111111111111";

const VALID_TRAINING_PLAN_STRUCTURE = {
  id: TRAINING_PLAN_ID,
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
} as const;

function createCaller() {
  const { db, callLog } = createQueryMapDbMock({
    training_plans: [
      {
        data: {
          id: TRAINING_PLAN_ID,
          name: "Shared Build",
          description: "Shared plan",
          profile_id: "profile-123",
          template_visibility: "private",
          is_system_template: false,
          is_public: false,
          structure: VALID_TRAINING_PLAN_STRUCTURE,
        },
        error: null,
      },
      {
        data: {
          id: TRAINING_PLAN_ID,
          name: "Updated Build",
          description: "Shared plan",
          profile_id: "profile-123",
          template_visibility: "private",
          is_system_template: false,
          is_public: false,
          structure: VALID_TRAINING_PLAN_STRUCTURE,
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

  return { caller, callLog };
}

describe("trainingPlansRouter boundary validation", () => {
  it("rejects unknown keys on update before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.update({ id: TRAINING_PLAN_ID, name: "Updated Build", unexpected: true } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });

  it("rejects non-plan quick adjustments before ownership queries", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.applyQuickAdjustment({
        id: TRAINING_PLAN_ID,
        adjustedStructure: { plan_type: "periodized" },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });
});
