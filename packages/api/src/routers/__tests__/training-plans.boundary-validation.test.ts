import { describe, expect, it } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

const TRAINING_PLAN_ID = "11111111-1111-4111-8111-111111111111";

const VALID_TRAINING_PLAN_STRUCTURE = {
  id: TRAINING_PLAN_ID,
  version: 1,
  sessions: [
    {
      offset_days: 0,
      activity_plan_id: "22222222-2222-4222-8222-222222222222",
    },
  ],
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

  it("rejects id-only no-op updates before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(caller.update({ id: TRAINING_PLAN_ID })).rejects.toThrow(
      "At least one training plan update field is required",
    );

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

  it("rejects old periodized create structures before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.create({
        name: "Old shape",
        structure: {
          plan_type: "periodized",
          name: "Old periodized plan",
          start_date: "2026-01-01",
          end_date: "2026-03-01",
          fitness_progression: { starting_ctl: 45 },
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
            },
          ],
        },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });
});
