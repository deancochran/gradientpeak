import { SYSTEM_TEMPLATES } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import type { TrainingPlanRepository } from "../../../repositories";
import { applyTrainingPlanTemplateUseCase } from "../applyTemplateUseCase";

const { enqueueWahooPlannedActivitySyncAfterCalendarMutation } = vi.hoisted(() => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation: vi.fn(async () => null),
}));
vi.mock("../../../lib/provider-sync/planned-activities", () => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation,
}));

type TransactionClient = {
  execute: () => Promise<unknown>;
  select: () => {
    from: () => {
      where: () => { orderBy: () => Promise<Array<{ id: string }>> };
    };
  };
  delete: () => {
    where: () => { returning: () => Promise<Array<{ id: string }>> };
  };
  insert: () => {
    values: (rows: Array<Record<string, unknown>>) => {
      returning: () => Promise<Array<{ id: string }>>;
    };
  };
};

describe("applyTrainingPlanTemplateUseCase", () => {
  const linkedPlanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const activePlan = {
    nextEventAt: "2026-08-01T00:00:00.000Z",
    scheduleBatchId: "33333333-3333-4333-8333-333333333333",
    trainingPlanId: "22222222-2222-4222-8222-222222222222",
    trainingPlan: {},
  };

  function createApplicationDb(
    transaction: (callback: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>,
  ) {
    return {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: async () => [{ planningTimezone: "America/New_York" }] }),
        }),
      })),
      execute: vi.fn(async () => ({
        rows: [
          {
            id: linkedPlanId,
            name: "Tempo",
            ownerProfileId: null,
            isPublic: true,
            isSystem: true,
            routeId: null,
            structure: SYSTEM_TEMPLATES[0]?.structure,
          },
        ],
      })),
      transaction,
    };
  }

  function createRepository(
    active: Omit<typeof activePlan, "scheduleBatchId"> & {
      scheduleBatchId: string | null;
    } = activePlan,
  ) {
    return {
      getActivePlanFromFutureEvents: vi.fn(async () => active),
      getAccessibleTrainingPlan: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        profile_id: null,
        content_visibility: "public",
        is_system_template: true,
        structure: {
          id: "11111111-1111-4111-8111-111111111111",
          version: 1,
          sessions: [{ offset_days: 0, activity_plan_id: linkedPlanId }],
        },
      })),
    };
  }

  const applicationValues = {
    template_type: "training_plan" as const,
    template_id: "11111111-1111-4111-8111-111111111111",
    start_date: "2026-08-01",
    replace_existing: true,
    application_mode: "full" as const,
  };

  it("rolls back replacement and leaves external state untouched when replacement insertion fails", async () => {
    let oldScheduleExists = true;
    let insertedRows: Array<Record<string, unknown>> = [];
    const transaction = vi.fn(async (callback: (tx: TransactionClient) => Promise<unknown>) => {
      let stagedOldScheduleExists = oldScheduleExists;
      const deleteBuilder = {
        where: () => ({
          returning: async () => {
            stagedOldScheduleExists = false;
            return [{ id: "old-event" }];
          },
        }),
      };
      const insertBuilder = {
        values: (rows: Array<Record<string, unknown>>) => {
          insertedRows = rows;
          return { returning: async () => [] };
        },
      };

      const result = await callback({
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({ orderBy: async () => [{ id: "old-event" }] }),
          }),
        }),
        delete: () => deleteBuilder,
        insert: () => insertBuilder,
      });
      oldScheduleExists = stagedOldScheduleExists;
      return result;
    });
    const db = createApplicationDb(transaction);
    const permissions = {
      grantEventContentAccess: vi.fn(async () => undefined),
      revokeEventGrants: vi.fn(async () => undefined),
    };
    const repository = createRepository();

    await expect(
      applyTrainingPlanTemplateUseCase({
        db: db as unknown as DrizzleDbClient,
        permissions,
        profileId: "44444444-4444-4444-8444-444444444444",
        repository: repository as unknown as TrainingPlanRepository,
        values: {
          ...applicationValues,
        },
      }),
    ).rejects.toThrow("Failed to create the full scheduled training plan event set.");

    expect(transaction).toHaveBeenCalledOnce();
    expect(oldScheduleExists).toBe(true);
    expect(insertedRows[0]?.id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(permissions.revokeEventGrants).toHaveBeenCalledWith("old-event");
    expect(permissions.grantEventContentAccess).not.toHaveBeenCalled();
  });

  it("fails closed with an actionable conflict when an active schedule has no generation ID", async () => {
    const transaction = vi.fn(async (callback: (tx: TransactionClient) => Promise<unknown>) =>
      callback({ execute: async () => ({ rows: [] }) } as TransactionClient),
    );
    const repository = createRepository({ ...activePlan, scheduleBatchId: null });

    await expect(
      applyTrainingPlanTemplateUseCase({
        db: createApplicationDb(transaction) as unknown as DrizzleDbClient,
        permissions: { grantEventContentAccess: vi.fn(), revokeEventGrants: vi.fn() },
        profileId: "44444444-4444-4444-8444-444444444444",
        repository: repository as unknown as TrainingPlanRepository,
        values: applicationValues,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("generation ID"),
    });
  });

  it("does not replace an Event from another TrainingPlan that reuses the active batch ID", async () => {
    const candidateIds = ["event-from-active-plan-1", "event-from-active-plan-2"];
    const reusedBatchOtherPlanEventId = "event-from-other-plan-with-reused-batch";
    const deletedIds: string[][] = [];
    const transaction = vi.fn(async (callback: (tx: TransactionClient) => Promise<unknown>) =>
      callback({
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({ orderBy: async () => candidateIds.map((id) => ({ id })) }),
          }),
        }),
        delete: () => ({
          where: () => ({
            returning: async () => {
              deletedIds.push(candidateIds);
              return candidateIds.map((id) => ({ id }));
            },
          }),
        }),
        insert: () => ({
          values: () => ({ returning: async () => [{ id: "new-event" }] }),
        }),
      } as TransactionClient),
    );
    const permissions = {
      grantEventContentAccess: vi.fn(async () => undefined),
      revokeEventGrants: vi.fn(),
    };

    await applyTrainingPlanTemplateUseCase({
      db: createApplicationDb(transaction) as unknown as DrizzleDbClient,
      permissions,
      profileId: "44444444-4444-4444-8444-444444444444",
      repository: createRepository() as unknown as TrainingPlanRepository,
      values: applicationValues,
    });

    expect(permissions.revokeEventGrants).toHaveBeenNthCalledWith(1, candidateIds[0]);
    expect(permissions.revokeEventGrants).toHaveBeenNthCalledWith(2, candidateIds[1]);
    expect(permissions.revokeEventGrants).not.toHaveBeenCalledWith(reusedBatchOtherPlanEventId);
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: candidateIds, operation: "unsync" }),
    );
    expect(enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: expect.arrayContaining([reusedBatchOtherPlanEventId]) }),
    );
    expect(deletedIds).toEqual([candidateIds]);
  });

  it("rejects template application when the profile has no planning timezone", async () => {
    const db = {
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: null }] }) }),
      })),
    };

    await expect(
      applyTrainingPlanTemplateUseCase({
        db: db as unknown as DrizzleDbClient,
        permissions: { grantEventContentAccess: vi.fn(), revokeEventGrants: vi.fn() },
        profileId: "44444444-4444-4444-8444-444444444444",
        repository: {} as TrainingPlanRepository,
        values: {
          template_type: "training_plan",
          template_id: "11111111-1111-4111-8111-111111111111",
          start_date: "2026-08-01",
          replace_existing: false,
          application_mode: "full",
        },
      }),
    ).rejects.toMatchObject({
      message: "A valid planning timezone is required before applying a training plan.",
    });
  });

  it("rejects a legacy persisted template before materializing events", async () => {
    const db = {
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: "UTC" }] }) }),
      })),
    };
    const repository = {
      getActivePlanFromFutureEvents: vi.fn(async () => null),
      getAccessibleTrainingPlan: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        structure: {
          start_date: "2026-08-01",
          blocks: [{ sessions: [{ activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] }],
        },
      })),
    };

    await expect(
      applyTrainingPlanTemplateUseCase({
        db: db as unknown as DrizzleDbClient,
        permissions: { grantEventContentAccess: vi.fn(), revokeEventGrants: vi.fn() },
        profileId: "44444444-4444-4444-8444-444444444444",
        repository: repository as unknown as TrainingPlanRepository,
        values: {
          template_type: "training_plan",
          template_id: "11111111-1111-4111-8111-111111111111",
          start_date: "2026-08-01",
          replace_existing: false,
          application_mode: "full",
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "This training plan cannot be scheduled because its structure is not canonical version 1.",
    });
  });
});
