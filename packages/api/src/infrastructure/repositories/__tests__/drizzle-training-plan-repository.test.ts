import type { InferredStateSnapshot } from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import type { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { activityPlanStructureHash } from "../../../application/activity-plans/structure-hash";
import { createQueryMapDbMock } from "../../../test/mock-query-db";
import { createTrainingPlanRepository } from "../drizzle-training-plan-repository";

function createRepository(db: unknown) {
  return createTrainingPlanRepository(db as DrizzleDbClient);
}

function addRepeatableReadTransaction<T extends { db: Record<string, unknown> }>(mock: T): T {
  Object.assign(mock.db, {
    $client: {},
    transaction: async (read: (tx: typeof mock.db) => Promise<unknown>) => read(mock.db),
  });
  return mock;
}

function createSnapshot(overrides: Partial<InferredStateSnapshot> = {}): InferredStateSnapshot {
  return {
    mean: {
      longTermLoad: 64,
      recentLoad: 71,
      loadBalance: -7,
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
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
    profile_id: "profile-1",
    name: "Base plan",
    description: "Build fitness",
    structure: {},
    structure_hash: activityPlanStructureHash({}),
    content_visibility: "private",
    is_system_template: false,
    system_content_key: null,
    system_content_version: null,
    system_content_hash: null,
    sessions_per_week_target: null,
    duration_hours: null,
    revision: 1,
    validated_state_revision: null,
    validated_at: null,
    projection_algorithm_version: null,
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
  it("reads a bounded page and an exact count through the same owner/search filter", async () => {
    const row = createTrainingPlanRow({ id: "page-plan" });
    const { db } = addRepeatableReadTransaction(
      createQueryMapDbMock({
        training_plans: [
          { data: [row], error: null },
          { data: [{ total: 2 }], error: null },
        ],
      }),
    );

    await expect(
      createRepository(db).listTrainingPlansPage({
        profileId: "profile-1",
        ownerScope: "own",
        search: "Base%_\\plan",
        offset: 20,
        limit: 10,
      }),
    ).resolves.toEqual({ items: [row], total: 2 });
  });

  it("applies the same owner, visibility, and escaped literal search predicate to page and count", async () => {
    const pageWhere = vi.fn();
    const countWhere = vi.fn();
    const limit = vi.fn();
    const offset = vi.fn();
    const pageBuilder = {
      from: vi.fn(() => pageBuilder),
      where: vi.fn((condition) => {
        pageWhere(condition);
        return pageBuilder;
      }),
      orderBy: vi.fn(() => pageBuilder),
      limit: vi.fn((value) => {
        limit(value);
        return pageBuilder;
      }),
      offset: vi.fn((value) => {
        offset(value);
        return Promise.resolve([]);
      }),
    };
    const countBuilder = {
      from: vi.fn(() => countBuilder),
      where: vi.fn((condition) => {
        countWhere(condition);
        return Promise.resolve([{ total: 0 }]);
      }),
    };
    const tx = {
      select: vi.fn().mockReturnValueOnce(pageBuilder).mockReturnValueOnce(countBuilder),
    };
    const transaction = vi.fn(async (read: (executor: typeof tx) => Promise<unknown>) => read(tx));
    const db = { $client: {}, select: vi.fn(), transaction };

    await createRepository(db).listTrainingPlansPage({
      profileId: "00000000-0000-4000-8000-000000000001",
      ownerScope: "own",
      visibility: "private",
      search: "Base%_\\plan",
      offset: 20,
      limit: 10,
    });

    expect(limit).toHaveBeenCalledWith(10);
    expect(offset).toHaveBeenCalledWith(20);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
    expect(db.select).not.toHaveBeenCalled();
    const dialect = new PgDialect();
    const pageQuery = dialect.sqlToQuery(pageWhere.mock.calls[0]?.[0] as never);
    const countQuery = dialect.sqlToQuery(countWhere.mock.calls[0]?.[0] as never);
    expect(pageQuery.sql).toBe(countQuery.sql);
    expect(pageQuery.params).toEqual(countQuery.params);
    expect(pageQuery.sql).toContain('"training_plans"."profile_id" = $1');
    expect(pageQuery.sql).toContain('"training_plans"."content_visibility" = $2');
    expect(pageQuery.sql).toContain("ilike");
    expect(pageQuery.params).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "private",
      "%Base\\%\\_\\\\plan%",
      "%Base\\%\\_\\\\plan%",
    ]);
  });

  it("returns schema-derived timestamp rows", async () => {
    const validatedAt = "2026-04-02T03:04:05.000Z";
    const row = createTrainingPlanRow({
      validated_at: new Date(validatedAt),
      created_at: new Date("2026-04-01T00:00:00.000Z"),
      updated_at: new Date("2026-04-01T01:00:00.000Z"),
    });
    const { db } = createQueryMapDbMock({
      training_plans: { data: [row], error: null },
    });

    const result = await createRepository(db).getAccessibleTrainingPlan({
      id: "11111111-1111-4111-8111-111111111111",
      profileId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toMatchObject({
      validated_at: new Date(validatedAt),
      created_at: new Date("2026-04-01T00:00:00.000Z"),
      updated_at: new Date("2026-04-01T01:00:00.000Z"),
    });
  });

  it("creates a training plan and returns the inserted row", async () => {
    const planId = "11111111-1111-4111-8111-111111111111";
    const createdPlan = createTrainingPlanRow({
      id: planId,
      name: "Spring build",
      description: "Target June event",
      structure: { id: planId, block: "base" },
    });
    const { db, callLog } = createQueryMapDbMock({
      training_plans: { data: [createdPlan], error: null },
    });
    const repository = createRepository(db);

    const result = await repository.createTrainingPlan({
      profileId: "profile-1",
      name: "Spring build",
      description: "Target June event",
      structure: { id: planId, block: "base" },
    });

    expect(result).toEqual(createdPlan);
    expect(callLog).toContainEqual({
      table: "training_plans",
      operation: "insert",
      payload: {
        id: planId,
        profile_id: "profile-1",
        name: "Spring build",
        description: "Target June event",
        structure: { id: planId, block: "base" },
        structure_hash: activityPlanStructureHash({ id: planId, block: "base" }),
      },
    });
  });

  it("generates a required relational id aligned with structure.id", async () => {
    const { db, callLog } = createQueryMapDbMock();
    const repository = createRepository(db);

    await repository.createTrainingPlan({
      profileId: "profile-1",
      name: "Generated id plan",
      description: null,
      structure: { block: "base" },
    });

    const insert = callLog.find(
      (call) => call.table === "training_plans" && call.operation === "insert",
    );
    const payload = insert?.payload as {
      id?: unknown;
      structure?: { id?: unknown };
      structure_hash?: unknown;
    };
    expect(payload.id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(payload.structure?.id).toBe(payload.id);
    expect(payload.structure_hash).toBe(activityPlanStructureHash(payload.structure));
  });

  it("throws BAD_REQUEST when create returns no row", async () => {
    const repository = createRepository(createMissingReturningDb("insert"));

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
    const found = createRepository(
      createQueryMapDbMock({
        training_plans: { data: [ownedPlan], error: null },
      }).db,
    );
    const missing = createRepository(
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
    const repository = createRepository(db);

    const result = await repository.updateTrainingPlan({
      id: "plan-2",
      expectedStructureHash: updatedPlan.structure_hash,
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
        structure_hash: activityPlanStructureHash({ block: "peak" }),
        revision: expect.anything(),
        updated_at: expect.any(Date),
        validated_state_revision: null,
        validated_at: null,
        projection_algorithm_version: null,
      },
    });
  });

  it("throws a stale conflict when update returns no row", async () => {
    const repository = createRepository(createMissingReturningDb("update"));

    await expect(
      repository.updateTrainingPlan({
        id: "plan-1",
        expectedStructureHash: `v1:sha256:${"a".repeat(64)}`,
        profileId: "profile-1",
        name: "Updated",
        description: null,
        structure: {},
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "STALE_STRUCTURE_HASH",
    } satisfies Partial<TRPCError>);
  });

  it("gets the prior snapshot from the earliest active future-plan fallback", async () => {
    const snapshot = createSnapshot();
    const { db, callLog } = createQueryMapDbMock({
      planned_sessions: {
        data: [
          {
            training_plan_id: "future-plan",
            planning_date: "2026-04-10",
            status: "scheduled",
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
    const repository = createRepository(db);

    await expect(repository.getPriorInferredStateSnapshot("profile-1")).resolves.toEqual(snapshot);
    expect(callLog.map((entry) => `${entry.operation}:${entry.table}`)).toEqual([
      "select:planned_sessions",
      "select:training_plans",
    ]);
  });

  it("returns null when prior snapshot metadata is missing or invalid", async () => {
    const missingMetadataRepository = createRepository(
      createQueryMapDbMock({
        planned_sessions: {
          data: [
            {
              training_plan_id: "plan-missing-metadata",
              planning_date: "2026-04-10",
              status: "scheduled",
            },
          ],
          error: null,
        },
        training_plans: {
          data: [{ id: "plan-missing-metadata", structure: {} }],
          error: null,
        },
      }).db,
    );
    const invalidMetadataRepository = createRepository(
      createQueryMapDbMock({
        planned_sessions: {
          data: [
            {
              training_plan_id: "plan-invalid-metadata",
              planning_date: "2026-04-10",
              status: "scheduled",
            },
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
    const repository = createRepository(db);

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
        structure_hash: activityPlanStructureHash({
          blocks: [{ id: "block-1" }],
          metadata: {
            source: "generator",
            version: 3,
            inferred_state_snapshot: snapshot,
          },
        }),
        revision: expect.anything(),
        validated_state_revision: null,
        validated_at: null,
        projection_algorithm_version: null,
        updated_at: expect.any(Date),
      },
    });
  });

  it("does nothing when no target plan resolves", async () => {
    const { db, callLog } = createQueryMapDbMock({
      planned_sessions: { data: [], error: null },
    });
    const repository = createRepository(db);

    await repository.persistInferredStateSnapshot({
      profileId: "profile-1",
      inferredStateSnapshot: createSnapshot(),
    });

    expect(callLog).toEqual([{ table: "planned_sessions", operation: "select" }]);
  });
});
