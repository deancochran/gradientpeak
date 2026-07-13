import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it } from "vitest";
import type { TrainingPlanRepository } from "../../../repositories";
import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { createTrainingPlanUseCase, updateTrainingPlanUseCase } from "../mutationUseCases";

describe("canonical training plan mutations", () => {
  it("batch-rejects the whole create when any linked activity plan is not published", async () => {
    const publishedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const unpublishedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: { data: [{ id: publishedId }], error: null },
    });

    await expect(
      createTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        profileId: "11111111-1111-4111-8111-111111111111",
        values: {
          name: "Mixed links",
          description: null,
          structure: {
            version: 1,
            sessions: [
              { offset_days: 0, activity_plan_id: publishedId },
              { offset_days: 1, activity_plan_id: unpublishedId },
            ],
          },
        },
      }),
    ).rejects.toThrow(
      `Training plan contains missing, inaccessible, or unpublished activity plans: ${unpublishedId}`,
    );

    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("rejects the whole update when an existing linked activity plan is no longer published", async () => {
    const unavailableId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: { data: [], error: null },
    });
    const repository = {
      getOwnedTrainingPlan: async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        profile_id: "11111111-1111-4111-8111-111111111111",
        structure: {
          id: "22222222-2222-4222-8222-222222222222",
          version: 1,
          sessions: [{ offset_days: 0, activity_plan_id: unavailableId }],
        },
      }),
    };

    await expect(
      updateTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        profileId: "11111111-1111-4111-8111-111111111111",
        repository: repository as unknown as TrainingPlanRepository,
        values: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Should not save",
        },
      }),
    ).rejects.toThrow(
      `Training plan contains missing, inaccessible, or unpublished activity plans: ${unavailableId}`,
    );

    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("accepts an id-less canonical update structure and restores the persisted plan id", async () => {
    const linkedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const planId = "22222222-2222-4222-8222-222222222222";
    const { db } = createQueryMapDbMock({
      activity_plans: { data: [{ id: linkedId }], error: null },
      training_plans: {
        data: [{ id: planId, structure: { id: planId, version: 1, sessions: [] } }],
        error: null,
      },
    });
    const repository = {
      getOwnedTrainingPlan: async () => ({
        id: planId,
        structure: {
          id: planId,
          version: 1,
          sessions: [{ offset_days: 0, activity_plan_id: linkedId }],
        },
      }),
    };

    await expect(
      updateTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        profileId: "11111111-1111-4111-8111-111111111111",
        repository: repository as unknown as TrainingPlanRepository,
        values: {
          id: planId,
          structure: { version: 1, sessions: [{ offset_days: 1, activity_plan_id: linkedId }] },
        },
      }),
    ).resolves.toMatchObject({ id: planId });
  });
});
