import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import {
  getAppliedScheduleUseCase,
  listAppliedSchedulesUseCase,
  removalFingerprint,
  removeAppliedScheduleUseCase,
} from "../appliedScheduleUseCases";

const profileId = "99999999-9999-4999-8999-999999999999";
const trainingPlanId = "11111111-1111-4111-8111-111111111111";

function scheduleDb(rows: unknown[]) {
  const limit = vi.fn(async () => rows);
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: "UTC" }] }) }),
    })
    .mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit }) }) }),
      }),
    });
  return { db: { select } as unknown as DrizzleDbClient, limit };
}

describe("applied training-plan schedules", () => {
  it("reads the earliest future training-plan planned-session receipt", async () => {
    const applicationId = "55555555-5555-4555-8555-555555555555";
    const { db, limit } = scheduleDb([
      { applicationId, planningDate: "2026-09-03", trainingPlanRevision: 2 },
    ]);
    await expect(getAppliedScheduleUseCase({ db, profileId, trainingPlanId })).resolves.toEqual({
      application_id: applicationId,
      application_receipt: applicationId,
      planning_date: "2026-09-03",
      training_plan_id: trainingPlanId,
    });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("returns null when no planned session remains", async () => {
    const { db } = scheduleDb([]);
    await expect(getAppliedScheduleUseCase({ db, profileId, trainingPlanId })).resolves.toBeNull();
  });

  it("lists only the caller-scoped application history", async () => {
    const limit = vi.fn(async () => [
      {
        applicationId: "55555555-5555-4555-8555-555555555555",
        applicationRevision: 2,
        eligibleFutureCount: 1,
        nextPlanningDate: "2026-09-20",
        protectedCount: 3,
        sourceRevision: 4,
        startDate: "2026-09-01",
      },
    ]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: "UTC" }] }) }),
        })
        .mockReturnValueOnce({
          from: () => ({
            innerJoin: () => ({
              where: () => ({ groupBy: () => ({ orderBy: () => ({ limit }) }) }),
            }),
          }),
        }),
    } as unknown as DrizzleDbClient;

    await expect(
      listAppliedSchedulesUseCase({ db, limit: 100, profileId, trainingPlanId }),
    ).resolves.toEqual({
      items: [
        {
          application_id: "55555555-5555-4555-8555-555555555555",
          application_revision: 2,
          eligible_future_count: 1,
          next_planning_date: "2026-09-20",
          protected_count: 3,
          source_revision: 4,
          start_date: "2026-09-01",
        },
      ],
      nextCursor: null,
    });
    expect(limit).toHaveBeenCalledWith(101);
  });

  it("locks and cancels reviewed application sessions without event writes", async () => {
    const sessionId = "66666666-6666-4666-8666-666666666666";
    const orderBy = vi.fn(async () => [{ id: sessionId, sessionRevision: 3 }]);
    const execute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(async (callback: (tx: never) => Promise<unknown>) =>
      callback({
        execute,
        select: vi
          .fn()
          .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
          .mockReturnValueOnce({
            from: () => ({ where: () => ({ limit: async () => [{ applicationRevision: 1 }] }) }),
          })
          .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy }) }) }),
        insert: () => ({ values: async () => undefined }),
      } as never),
    );
    const mutateOwned = vi.fn(async () => ({ status: "updated" as const, session: {} as never }));
    const enqueue = vi.fn(async () => null);
    const previewFingerprint = removalFingerprint({
      applicationId: "55555555-5555-4555-8555-555555555555",
      applicationRevision: 1,
      todayDate: "2026-09-14",
      sessions: [{ id: sessionId, sessionRevision: 3 }],
    });
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: "UTC" }] }) }),
      }),
      transaction,
    } as unknown as DrizzleDbClient;
    await expect(
      removeAppliedScheduleUseCase({
        db,
        profileId,
        applicationId: "55555555-5555-4555-8555-555555555555",
        operationId: "remove_training_plan_application_test_0001",
        previewFingerprint,
        now: new Date("2026-09-14T12:00:00.000Z"),
        plannedSessionRepositoryFactory: () => ({ mutateOwned }) as never,
        enqueueWahooPlannedSessionSyncAfterMutation: enqueue,
      }),
    ).resolves.toMatchObject({
      success: true,
      application_id: "55555555-5555-4555-8555-555555555555",
      scheduled_sessions_removed: 1,
    });
    expect(mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel", sessionId, expectedRevision: 3 }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ plannedSessionIds: [sessionId], operation: "unsync", profileId }),
    );
  });

  it("fails the schedule removal transaction when provider cleanup cannot be queued", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: "UTC" }] }) }),
      }),
      transaction: async (callback: (tx: never) => Promise<unknown>) =>
        callback({
          execute,
          select: vi
            .fn()
            .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
            .mockReturnValueOnce({
              from: () => ({ where: () => ({ limit: async () => [{ applicationRevision: 1 }] }) }),
            })
            .mockReturnValueOnce({
              from: () => ({
                where: () => ({
                  orderBy: async () => [
                    { id: "66666666-6666-4666-8666-666666666666", sessionRevision: 3 },
                  ],
                }),
              }),
            }),
        } as never),
    } as unknown as DrizzleDbClient;

    await expect(
      removeAppliedScheduleUseCase({
        db,
        profileId,
        applicationId: "55555555-5555-4555-8555-555555555555",
        operationId: "remove_training_plan_application_test_0002",
        previewFingerprint: removalFingerprint({
          applicationId: "55555555-5555-4555-8555-555555555555",
          applicationRevision: 1,
          todayDate: "2026-09-14",
          sessions: [{ id: "66666666-6666-4666-8666-666666666666", sessionRevision: 3 }],
        }),
        now: new Date("2026-09-14T12:00:00.000Z"),
        plannedSessionRepositoryFactory: () =>
          ({ mutateOwned: vi.fn(async () => ({ status: "updated", session: {} })) }) as never,
        enqueueWahooPlannedSessionSyncAfterMutation: vi.fn(async () => ({
          success: false,
        })) as never,
      }),
    ).rejects.toThrow("Unable to durably enqueue planned-session provider cleanup");
  });
});
