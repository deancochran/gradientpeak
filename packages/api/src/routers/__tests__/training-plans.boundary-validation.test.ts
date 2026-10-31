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
          content_visibility: "private",
          is_system_template: false,
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
          content_visibility: "private",
          is_system_template: false,
          structure: VALID_TRAINING_PLAN_STRUCTURE,
        },
        error: null,
      },
    ],
  });

  const caller = trainingPlansRouter.createCaller({
    db,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);

  return { caller, callLog };
}

describe("trainingPlansRouter boundary validation", () => {
  it("rejects client-authored projected sessions from authoritative preview input", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.preview({
        kind: "create",
        draft: {
          name: "Forged preview",
          previewStartDate: "2026-08-03",
          structure: {
            version: 1,
            sessions: VALID_TRAINING_PLAN_STRUCTURE.sessions,
          },
          plannedSessions: [
            {
              sourceId: "forged",
              scheduledAt: "2026-08-03T00:00:00.000Z",
              commonLoad: 10_000,
            },
          ],
        },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });

  it("rejects unknown keys on update before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.commit({
        kind: "create",
        basePublishedRevision: 1,
        draft: {
          name: "Updated Build",
          previewStartDate: "2026-08-03",
          structure: { version: 1, sessions: VALID_TRAINING_PLAN_STRUCTURE.sessions },
        },
        unexpected: true,
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });

  it("rejects id-only no-op updates before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.commit({
        kind: "update",
        basePublishedRevision: 1,
        draft: {
          planId: TRAINING_PLAN_ID,
          expectedRevision: 1,
          expectedStructureHash: `v1:sha256:${"0".repeat(64)}`,
        },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });

  it("rejects old periodized create structures before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.commit({
        kind: "create",
        basePublishedRevision: 1,
        draft: {
          name: "Old shape",
          previewStartDate: "2026-08-03",
          structure: {
            plan_type: "periodized",
            name: "Old periodized plan",
            start_date: "2026-01-01",
            end_date: "2026-03-01",
            fitness_progression: { starting_ctl: 45 },
            activity_distribution: { run: { target_percentage: 1 } },
            blocks: [],
          },
        },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(callLog).toHaveLength(0);
  });
});
