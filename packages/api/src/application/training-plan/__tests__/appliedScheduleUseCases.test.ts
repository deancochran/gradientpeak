import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import {
  getAppliedScheduleUseCase,
  removeAppliedScheduleUseCase,
} from "../appliedScheduleUseCases";

const { enqueueWahooPlannedActivitySyncAfterCalendarMutation } = vi.hoisted(() => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation: vi.fn(async () => null),
}));
vi.mock("../../../lib/provider-sync/planned-activities", () => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation,
}));

const profileId = "99999999-9999-4999-8999-999999999999";
const trainingPlanId = "11111111-1111-4111-8111-111111111111";
const scheduleBatchId = "33333333-3333-4333-8333-333333333333";

function createDb(scheduleRows: Array<Record<string, unknown>>) {
  const profileLimit = vi.fn(async () => [{ planningTimezone: "UTC" }]);
  const scheduleLimit = vi.fn(async () => scheduleRows);
  const scheduleOrderBy = vi.fn(() => ({ limit: scheduleLimit }));
  const scheduleWhere = vi.fn(() => ({ orderBy: scheduleOrderBy }));
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: profileLimit }) }),
    })
    .mockReturnValueOnce({
      from: () => ({ where: scheduleWhere }),
    });

  return {
    db: { select } as unknown as DrizzleDbClient,
    scheduleLimit,
    scheduleOrderBy,
    scheduleWhere,
  };
}

describe("getAppliedScheduleUseCase", () => {
  it("returns the earliest future schedule batch selected for the requested owned plan", async () => {
    const startsAt = new Date("2026-09-03T06:00:00.000Z");
    const { db, scheduleLimit, scheduleOrderBy, scheduleWhere } = createDb([
      { scheduleBatchId, startsAt, trainingPlanId },
    ]);

    const result = await getAppliedScheduleUseCase({ db, profileId, trainingPlanId });

    expect(result).toEqual({
      schedule_batch_id: scheduleBatchId,
      starts_at: startsAt.toISOString(),
      training_plan_id: trainingPlanId,
    });
    expect(scheduleWhere).toHaveBeenCalledOnce();
    expect(scheduleOrderBy).toHaveBeenCalledOnce();
    expect(scheduleLimit).toHaveBeenCalledWith(1);
  });

  it("returns null when no future schedule exists", async () => {
    const { db } = createDb([]);

    await expect(getAppliedScheduleUseCase({ db, profileId, trainingPlanId })).resolves.toBeNull();
  });

  it("fails closed if a persistence adapter returns a different plan", async () => {
    const { db } = createDb([
      {
        scheduleBatchId,
        startsAt: new Date("2026-09-03T06:00:00.000Z"),
        trainingPlanId: "22222222-2222-4222-8222-222222222222",
      },
    ]);

    await expect(getAppliedScheduleUseCase({ db, profileId, trainingPlanId })).resolves.toBeNull();
  });
});

describe("removeAppliedScheduleUseCase", () => {
  it("cancels future scheduled records for the removed plan and preserves completed records", async () => {
    const futureScheduledSessionId = "66666666-6666-4666-8666-666666666666";
    const completedSessionId = "77777777-7777-4777-8777-777777777777";
    const sessionState = new Map([
      [futureScheduledSessionId, "scheduled"],
      [completedSessionId, "completed"],
    ]);
    const eventCandidates = [{ id: "88888888-8888-4888-8888-888888888888" }];
    const eventWhere = vi.fn(async () => eventCandidates);
    const plannedSessionOrderBy = vi.fn(async () => [
      { id: futureScheduledSessionId, sessionRevision: 3 },
    ]);
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: () => ({ where: eventWhere }) })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ orderBy: plannedSessionOrderBy }) }),
      });
    const execute = vi.fn(async () => ({ rows: [] }));
    const deleteWhere = vi.fn(async () => undefined);
    const transaction = vi.fn(async (callback: (tx: never) => Promise<unknown>) =>
      callback({
        execute,
        select,
        delete: () => ({ where: deleteWhere }),
      } as never),
    );
    const profileSelect = vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => [{ planningTimezone: "UTC" }] }) }),
    }));
    const mutateOwned = vi.fn(async (mutation: { action: string; sessionId: string }) => {
      if (mutation.action === "cancel") sessionState.set(mutation.sessionId, "cancelled");
      return { status: "updated" as const, session: {} as never };
    });
    const permissions = { revokeEventGrants: vi.fn(async () => undefined) };

    const result = await removeAppliedScheduleUseCase({
      db: { select: profileSelect, transaction } as unknown as DrizzleDbClient,
      permissions,
      plannedSessionRepositoryFactory: () => ({ mutateOwned }) as never,
      profileId,
      scheduleBatchId,
      trainingPlanId,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(mutateOwned).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cancel",
        profileId,
        sessionId: futureScheduledSessionId,
        expectedRevision: 3,
        reason: "user_requested",
      }),
    );
    expect(mutateOwned).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: completedSessionId }),
    );
    expect(sessionState.get(futureScheduledSessionId)).toBe("cancelled");
    expect(sessionState.get(completedSessionId)).toBe("completed");
    expect(result).toMatchObject({
      success: true,
      schedule_batch_id: scheduleBatchId,
      training_plan_id: trainingPlanId,
      scheduled_sessions_removed: 1,
    });
  });
});
