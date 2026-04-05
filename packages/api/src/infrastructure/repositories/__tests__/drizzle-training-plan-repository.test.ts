import type { InferredStateSnapshot } from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { createTrainingPlanRepository } from "../drizzle-training-plan-repository";

function createSnapshot(overrides: Partial<InferredStateSnapshot> = {}): InferredStateSnapshot {
  return {
    mean: {
      ctl: 64,
      atl: 71,
      tsb: -7,
      slb: 58,
      durability: 73,
      readiness: 66,
    },
    uncertainty: {
      state_variance: 0.18,
      confidence: 0.77,
    },
    evidence_quality: {
      score: 0.83,
      missingness_ratio: 0.12,
    },
    as_of: "2026-04-01T08:00:00.000Z",
    metadata: {
      updated_at: "2026-04-01T08:05:00.000Z",
      missingness_counter: 2,
      evidence_counter: 9,
    },
    ...overrides,
  };
}

function createTrainingPlanRow(overrides: Partial<TrainingPlanRow> = {}): TrainingPlanRow {
  return {
    id: "plan-1",
    idx: 1,
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
    profile_id: "profile-1",
    name: "Base plan",
    description: "Build fitness",
    structure: {},
    template_visibility: null,
    is_public: false,
    is_system_template: false,
    sessions_per_week_target: null,
    duration_hours: null,
    likes_count: 0,
    ...overrides,
  };
}

function createMissingReturningDb(method: "insert" | "update") {
  const chain = {
    values: () => chain,
    set: () => chain,
    where: () => chain,
    returning: async () => [],
  };

  return {
    insert: () => (method === "insert" ? chain : { values: () => chain }),
    select: () => {
      throw new Error("select should not be called");
    },
    update: () => (method === "update" ? chain : { set: () => chain }),
  };
}

describe("drizzle-training-plan-repository", () => {
  it("creates a training plan and returns the inserted row", async () => {
    const createdPlan = createTrainingPlanRow({
      name: "Spring build",
      description: "Target June event",
      structure: { block: "base" },
    });
    const { db, callLog } = createQueryMapDbMock({
      training_plans: { data: [createdPlan], error: null },
    });
    const repository = createTrainingPlanRepository(db);

    const result = await repository.createTrainingPlan({
      profileId: "profile-1",
      name: "Spring build",
      description: "Target June event",
      structure: { block: "base" },
    });

    expect(result).toEqual(createdPlan);
    expect(callLog).toContainEqual({
      table: "training_plans",
      operation: "insert",
      payload: {
        profile_id: "profile-1",
        name: "Spring build",
        description: "Target June event",
        structure: { block: "base" },
      },
    });
  });

  it("throws BAD_REQUEST when create returns no row", async () => {
    const repository = createTrainingPlanRepository(createMissingReturningDb("insert") as any);

    await expect(
      repository.createTrainingPlan({
        profileId: "profile-1",
        name: "Spring build",
        description: null,
        structure: {},
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Failed to create training plan",
    } satisfies Partial<TRPCError>);
  });

  it("gets an owned training plan and returns null when none resolves", async () => {
    const ownedPlan = createTrainingPlanRow({ id: "owned-plan" });
    const found = createTrainingPlanRepository(
      createQueryMapDbMock({
        training_plans: { data: [ownedPlan], error: null },
      }).db,
    );
    const missing = createTrainingPlanRepository(
      createQueryMapDbMock({
        training_plans: { data: [], error: null },
      }).db,
    );

    await expect(
      found.getOwnedTrainingPlan({ id: "owned-plan", profileId: "profile-1" }),
    ).resolves.toEqual(ownedPlan);
    await expect(
      missing.getOwnedTrainingPlan({ id: "missing-plan", profileId: "profile-1" }),
    ).resolves.toBeNull();
  });

  it("updates a training plan and returns the updated row", async () => {
    const updatedPlan = createTrainingPlanRow({
      id: "plan-2",
      name: "Peak block",
      description: "Sharpening",
      structure: { block: "peak" },
    });
    const { db, callLog } = createQueryMapDbMock({
      training_plans: { data: [updatedPlan], error: null },
    });
    const repository = createTrainingPlanRepository(db);

    const result = await repository.updateTrainingPlan({
      id: "plan-2",
      profileId: "profile-1",
      name: "Peak block",
      description: "Sharpening",
      structure: { block: "peak" },
    });

    expect(result).toEqual(updatedPlan);
    expect(callLog).toContainEqual({
      table: "training_plans",
      operation: "update",
      payload: {
        name: "Peak block",
        description: "Sharpening",
        structure: { block: "peak" },
      },
    });
  });

  it("throws BAD_REQUEST when update returns no row", async () => {
    const repository = createTrainingPlanRepository(createMissingReturningDb("update") as any);

    await expect(
      repository.updateTrainingPlan({
        id: "plan-1",
        profileId: "profile-1",
        name: "Updated",
        description: null,
        structure: {},
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Failed to update training plan",
    } satisfies Partial<TRPCError>);
  });

  it("gets the prior snapshot from the earliest active future-plan fallback", async () => {
    const snapshot = createSnapshot();
    const { db, callLog } = createQueryMapDbMock({
      events: {
        data: [
          {
            training_plan_id: "future-plan",
            starts_at: "2026-04-10T10:00:00.000Z",
          },
        ],
        error: null,
      },
      training_plans: {
        data: [
          {
            id: "future-plan",
            structure: {
              metadata: {
                inferred_state_snapshot: snapshot,
              },
            },
          },
        ],
        error: null,
      },
    });
    const repository = createTrainingPlanRepository(db);

    await expect(repository.getPriorInferredStateSnapshot("profile-1")).resolves.toEqual(snapshot);
    expect(callLog.map((entry) => `${entry.operation}:${entry.table}`)).toEqual([
      "select:events",
      "select:training_plans",
    ]);
  });

  it("returns null when prior snapshot metadata is missing or invalid", async () => {
    const missingMetadataRepository = createTrainingPlanRepository(
      createQueryMapDbMock({
        events: {
          data: [
            { training_plan_id: "plan-missing-metadata", starts_at: "2026-04-10T10:00:00.000Z" },
          ],
          error: null,
        },
        training_plans: {
          data: [{ id: "plan-missing-metadata", structure: {} }],
          error: null,
        },
      }).db,
    );
    const invalidMetadataRepository = createTrainingPlanRepository(
      createQueryMapDbMock({
        events: {
          data: [
            { training_plan_id: "plan-invalid-metadata", starts_at: "2026-04-10T10:00:00.000Z" },
          ],
          error: null,
        },
        training_plans: {
          data: [
            {
              id: "plan-invalid-metadata",
              structure: {
                metadata: {
                  inferred_state_snapshot: { mean: { ctl: "not-a-number" } },
                },
              },
            },
          ],
          error: null,
        },
      }).db,
    );

    await expect(
      missingMetadataRepository.getPriorInferredStateSnapshot("profile-1"),
    ).resolves.toBeNull();
    await expect(
      invalidMetadataRepository.getPriorInferredStateSnapshot("profile-1"),
    ).resolves.toBeNull();
  });

  it("persists a snapshot onto an explicitly resolved plan and preserves metadata", async () => {
    const snapshot = createSnapshot();
    const { db, callLog } = createQueryMapDbMock({
      training_plans: {
        data: [
          {
            id: "explicit-plan",
            structure: {
              blocks: [{ id: "block-1" }],
              metadata: {
                source: "generator",
                version: 3,
              },
            },
          },
        ],
        error: null,
      },
    });
    const repository = createTrainingPlanRepository(db);

    await repository.persistInferredStateSnapshot({
      profileId: "profile-1",
      trainingPlanId: "explicit-plan",
      inferredStateSnapshot: snapshot,
    });

    expect(callLog.map((entry) => `${entry.operation}:${entry.table}`)).toEqual([
      "select:training_plans",
      "update:training_plans",
    ]);
    expect(callLog[1]).toEqual({
      table: "training_plans",
      operation: "update",
      payload: {
        structure: {
          blocks: [{ id: "block-1" }],
          metadata: {
            source: "generator",
            version: 3,
            inferred_state_snapshot: snapshot,
          },
        },
      },
    });
  });

  it("does nothing when no target plan resolves", async () => {
    const { db, callLog } = createQueryMapDbMock({
      events: { data: [], error: null },
    });
    const repository = createTrainingPlanRepository(db);

    await repository.persistInferredStateSnapshot({
      profileId: "profile-1",
      inferredStateSnapshot: createSnapshot(),
    });

    expect(callLog).toEqual([{ table: "events", operation: "select" }]);
  });
});
