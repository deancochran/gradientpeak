import { SYSTEM_TEMPLATES } from "@repo/core";
import {
  activityPlanDocumentSchema,
  initializeActivityPlanDocument,
} from "@repo/core/activity-plan";
import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it } from "vitest";
import { createPlanningTemplateRepository } from "../../../infrastructure";
import type { TrainingPlanRepository } from "../../../repositories";
import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { activityPlanStructureHash } from "../../activity-plans/structure-hash";
import {
  createTrainingPlanUseCase,
  materializeTrainingPlanActivityPlanVariants,
  updateTrainingPlanUseCase,
} from "../mutationUseCases";

describe("canonical training plan mutations", () => {
  const strictStructure = SYSTEM_TEMPLATES[0]?.structure;
  if (!strictStructure) throw new Error("Expected a strict system template fixture");
  const documentFor = (id: string, structure: unknown = strictStructure) =>
    initializeActivityPlanDocument({ activityPlanId: id, structure });

  it("pins omissions immediately, preserves prior pins after a default change, and never falls back for an explicit ID", () => {
    const activityPlanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const buildVariantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const unknownVariantId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const baseDocument = activityPlanDocumentSchema.parse({
      contractVersion: 1,
      defaultVariantId: activityPlanId,
      variants: [
        { id: activityPlanId, name: "Base", structure: strictStructure },
        { id: buildVariantId, name: "Build", structure: strictStructure },
      ],
    });
    const row = (document: typeof baseDocument) => ({
      activityCategory: "run",
      gpsRecordingEnabled: true,
      id: activityPlanId,
      isSystemTemplate: false,
      structure: document,
      structureHash: activityPlanStructureHash(document),
    });
    const inputStructure = {
      version: 1 as const,
      sessions: [
        { offset_days: 0, activity_plan_id: activityPlanId },
        {
          offset_days: 1,
          activity_plan_id: activityPlanId,
          activity_plan_variant_id: buildVariantId,
        },
      ],
    };

    const pinned = materializeTrainingPlanActivityPlanVariants({
      rows: [row(baseDocument)],
      structure: inputStructure,
    });
    expect(pinned.sessions.map((session) => session.activity_plan_variant_id)).toEqual([
      activityPlanId,
      buildVariantId,
    ]);

    const changedDefault = activityPlanDocumentSchema.parse({
      ...baseDocument,
      defaultVariantId: buildVariantId,
    });
    const newlyPinned = materializeTrainingPlanActivityPlanVariants({
      rows: [row(changedDefault)],
      structure: { version: 1, sessions: [{ offset_days: 0, activity_plan_id: activityPlanId }] },
    });
    expect(newlyPinned.sessions[0]?.activity_plan_variant_id).toBe(buildVariantId);
    expect(pinned.sessions[0]?.activity_plan_variant_id).toBe(activityPlanId);

    expect(() =>
      materializeTrainingPlanActivityPlanVariants({
        rows: [row(changedDefault)],
        structure: {
          version: 1,
          sessions: [
            {
              offset_days: 0,
              activity_plan_id: activityPlanId,
              activity_plan_variant_id: unknownVariantId,
            },
          ],
        },
      }),
    ).toThrow(`unknown activity-plan variant: ${unknownVariantId}`);
  });
  it("batch-rejects the whole create when any linked activity plan is not published", async () => {
    const publishedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const unpublishedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: publishedId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: documentFor(publishedId),
            structure_hash: activityPlanStructureHash(documentFor(publishedId)),
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
    const existingStructure = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 1 as const,
      sessions: [
        {
          offset_days: 0,
          activity_plan_id: unavailableId,
          activity_plan_variant_id: unavailableId,
        },
      ],
    };
    const repository = {
      getOwnedTrainingPlan: async () => ({
        id: "22222222-2222-4222-8222-222222222222",
        profile_id: "11111111-1111-4111-8111-111111111111",
        structure: existingStructure,
        structure_hash: activityPlanStructureHash(existingStructure),
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
          expectedStructureHash: activityPlanStructureHash(existingStructure),
          name: "Should not save",
        },
      }),
    ).rejects.toThrow(
      `Training plan contains missing, inaccessible, unpublished, or changed activity plans: ${unavailableId}`,
    );

    expect(callLog.some((call) => call.table === "training_plans")).toBe(false);
  });

  it("rejects a stale training-plan structure hash before locking templates or writing", async () => {
    const planId = "22222222-2222-4222-8222-222222222222";
    const structure = {
      id: planId,
      version: 1 as const,
      sessions: [{ offset_days: 0, activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    };
    const { db, callLog } = createQueryMapDbMock();

    await expect(
      updateTrainingPlanUseCase({
        db: db as unknown as DrizzleDbClient,
        planningTemplateRepository: createPlanningTemplateRepository(
          db as unknown as DrizzleDbClient,
        ),
        profileId: "11111111-1111-4111-8111-111111111111",
        repository: {
          getOwnedTrainingPlan: async () => ({
            id: planId,
            structure,
            structure_hash: activityPlanStructureHash(structure),
          }),
        } as unknown as TrainingPlanRepository,
        values: {
          id: planId,
          expectedStructureHash: `v1:sha256:${"f".repeat(64)}`,
          name: "Stale update",
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "STALE_STRUCTURE_HASH" });

    expect(callLog).toHaveLength(0);
  });

  it("rejects an ID-only published activity plan whose stored structure is not strict", async () => {
    const linkedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: linkedId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: { version: 2, intervals: [] },
            structure_hash: activityPlanStructureHash({ version: 2, intervals: [] }),
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

  it("rejects a system template ID whose stored semantics do not match the catalog", async () => {
    const expected = SYSTEM_TEMPLATES[0];
    const mismatched = SYSTEM_TEMPLATES[1];
    if (!expected?.id || !mismatched) throw new Error("Expected two system template fixtures");
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: expected.id,
            is_system_template: true,
            gps_recording_enabled: mismatched.gps_recording_enabled,
            structure: documentFor(expected.id, mismatched.structure),
            structure_hash: activityPlanStructureHash(
              documentFor(expected.id, mismatched.structure),
            ),
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

  it("rejects a strict linked plan when its persisted structure hash is stale", async () => {
    const linkedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { db, callLog } = createQueryMapDbMock({
      activity_plans: {
        data: [
          {
            id: linkedId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: documentFor(linkedId),
            structure_hash: activityPlanStructureHash({ version: 3, segments: [] }),
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
          name: "Reject stale structure hash",
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
          {
            id: linkedId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: documentFor(linkedId),
            structure_hash: activityPlanStructureHash(documentFor(linkedId)),
          },
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
          sessions: [
            {
              offset_days: 0,
              activity_plan_id: linkedId,
              activity_plan_variant_id: linkedId,
            },
          ],
        },
        structure_hash: activityPlanStructureHash({
          id: planId,
          version: 1,
          sessions: [
            {
              offset_days: 0,
              activity_plan_id: linkedId,
              activity_plan_variant_id: linkedId,
            },
          ],
        }),
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
          expectedStructureHash: activityPlanStructureHash({
            id: planId,
            version: 1,
            sessions: [
              {
                offset_days: 0,
                activity_plan_id: linkedId,
                activity_plan_variant_id: linkedId,
              },
            ],
          }),
          structure: { version: 1, sessions: [{ offset_days: 1, activity_plan_id: linkedId }] },
        },
      }),
    ).resolves.toMatchObject({ id: planId });
  });
});
