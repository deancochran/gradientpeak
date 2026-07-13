import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import type { TrainingPlanRepository } from "../../../repositories";
import { applyTrainingPlanTemplateUseCase } from "../applyTemplateUseCase";

type TransactionClient = {
  execute: () => Promise<unknown>;
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
  it("rolls back replacement and leaves external state untouched when replacement insertion fails", async () => {
    const linkedPlanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
        delete: () => deleteBuilder,
        insert: () => insertBuilder,
      });
      oldScheduleExists = stagedOldScheduleExists;
      return result;
    });
    const db = {
      execute: vi.fn(async () => ({
        rows: [
          {
            id: linkedPlanId,
            name: "Tempo",
            ownerProfileId: null,
            isPublic: true,
            isSystem: true,
            routeId: null,
          },
        ],
      })),
      transaction,
    };
    const permissions = {
      grantEventContentAccess: vi.fn(async () => undefined),
      revokeEventGrants: vi.fn(async () => undefined),
    };
    const repository = {
      getActivePlanFromFutureEvents: vi.fn(async () => ({
        nextEventAt: "2026-08-01T00:00:00.000Z",
        scheduleBatchId: "33333333-3333-4333-8333-333333333333",
        trainingPlanId: "22222222-2222-4222-8222-222222222222",
        trainingPlan: {},
      })),
      getAccessibleTrainingPlan: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        profile_id: null,
        template_visibility: "public",
        is_system_template: true,
        structure: {
          version: 1,
          sessions: [{ offset_days: 0, activity_plan_id: linkedPlanId }],
        },
      })),
    };

    await expect(
      applyTrainingPlanTemplateUseCase({
        db: db as unknown as DrizzleDbClient,
        permissions,
        profileId: "44444444-4444-4444-8444-444444444444",
        repository: repository as unknown as TrainingPlanRepository,
        values: {
          template_type: "training_plan",
          template_id: "11111111-1111-4111-8111-111111111111",
          start_date: "2026-08-01",
          replace_existing: true,
          application_mode: "full",
        },
      }),
    ).rejects.toThrow("Failed to create the full scheduled training plan event set.");

    expect(transaction).toHaveBeenCalledOnce();
    expect(oldScheduleExists).toBe(true);
    expect(insertedRows[0]?.id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(permissions.revokeEventGrants).not.toHaveBeenCalled();
    expect(permissions.grantEventContentAccess).not.toHaveBeenCalled();
  });
});
