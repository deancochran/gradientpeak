import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it } from "vitest";
import { createPlanningTemplateRepository } from "../../../infrastructure";
import type { TrainingPlanRepository } from "../../../repositories";
import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { createTrainingPlanUseCase, updateTrainingPlanUseCase } from "../mutationUseCases";

describe("canonical training plan mutations", () => {
  const strictV3Structure = SYSTEM_TEMPLATES[0]?.structure;
  if (!strictV3Structure) throw new Error("Expected a strict V3 system template fixture");
  it("batch-rejects the whole create when any linked activity plan is not published", async () => {
    const publishedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const unpublishedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: publishedId,
            is_system_template: false,
            structure: strictV3Structure,
            version: "3.0",
          },
        ],
        error: null,
      },
    });

    await expect(
      createTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
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
      `Training plan contains missing, inaccessible, unpublished, or changed activity plans: ${unpublishedId}`,
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
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
        profileId: "11111111-1111-4111-8111-111111111111",
        repository: repository as unknown as TrainingPlanRepository,
        values: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Should not save",
        },
      }),
    ).rejects.toThrow(
      `Training plan contains missing, inaccessible, unpublished, or changed activity plans: ${unavailableId}`,
    );

    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("rejects an ID-only published activity plan whose stored structure is not strict V3", async () => {
    const linkedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: linkedId,
            is_system_template: false,
            structure: { version: 2, intervals: [] },
            version: "2.0",
          },
        ],
        error: null,
      },
    });

    await expect(
      createTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
        profileId: "11111111-1111-4111-8111-111111111111",
        values: {
          name: "Reject V2 link",
          description: null,
          structure: {
            version: 1,
            sessions: [{ offset_days: 0, activity_plan_id: linkedId }],
          },
        },
      }),
    ).rejects.toThrow(
      `Training plan contains missing, inaccessible, unpublished, or changed activity plans: ${linkedId}`,
    );
    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("rejects a system template ID whose stored V3 semantics do not match the catalog", async () => {
    const expected = SYSTEM_TEMPLATES[0];
    const mismatched = SYSTEM_TEMPLATES[1];
    if (!expected?.id || !mismatched) throw new Error("Expected two system template fixtures");
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: expected.id,
            is_system_template: true,
            structure: mismatched.structure,
            version: "3.0",
          },
        ],
        error: null,
      },
    });

    await expect(
      createTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
        profileId: "11111111-1111-4111-8111-111111111111",
        values: {
          name: "Reject mismatched system template",
          description: null,
          structure: {
            version: 1,
            sessions: [{ offset_days: 0, activity_plan_id: expected.id }],
          },
        },
      }),
    ).rejects.toThrow(
      `Training plan contains missing, inaccessible, unpublished, or changed activity plans: ${expected.id}`,
    );
    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("rejects a strict V3 linked plan when the persisted row version is stale", async () => {
    const linkedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: linkedId,
            is_system_template: false,
            structure: strictV3Structure,
            version: "2.0",
          },
        ],
        error: null,
      },
    });

    await expect(
      createTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
        profileId: "11111111-1111-4111-8111-111111111111",
        values: {
          name: "Reject stale row version",
          description: null,
          structure: {
            version: 1,
            sessions: [{ offset_days: 0, activity_plan_id: linkedId }],
          },
        },
      }),
    ).rejects.toThrow("changed activity plans");
    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("accepts an id-less canonical update structure and restores the persisted plan id", async () => {
    const linkedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const planId = "22222222-2222-4222-8222-222222222222";
    const { db } = createQueryMapDbMock({
      activity_plans: {
        data: [
          { id: linkedId, is_system_template: false, structure: strictV3Structure, version: "3.0" },
        ],
        error: null,
      },
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
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
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

import { SYSTEM_TEMPLATES } from "@repo/core";
