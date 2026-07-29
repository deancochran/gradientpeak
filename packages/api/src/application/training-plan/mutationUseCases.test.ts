import { beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TRAINING_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  enqueuePlannedActivitySyncAfterCalendarMutation: vi.fn(),
}));

vi.mock("../../lib/provider-sync/planned-activities", () => ({
  enqueuePlannedActivitySyncAfterCalendarMutation:
    mocks.enqueuePlannedActivitySyncAfterCalendarMutation,
}));

import { deleteTrainingPlanUseCase } from "./mutationUseCases";

function fixture() {
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn(() => ({ where: deleteWhere }));
  const forUpdate = vi.fn().mockResolvedValue([{ id: EVENT_ID }]);
  const where = vi.fn(() => ({ for: forUpdate }));
  const from = vi.fn(() => ({ where }));
  const tx = {
    delete: del,
    execute,
    select: vi.fn(() => ({ from })),
  };
  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const repository = {
    getOwnedTrainingPlan: vi.fn().mockResolvedValue({ id: TRAINING_PLAN_ID }),
  };
  return { db, deleteWhere, del, execute, repository, tx };
}

describe("deleteTrainingPlanUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures cleanup intent in the deletion transaction before removing planned events", async () => {
    mocks.enqueuePlannedActivitySyncAfterCalendarMutation.mockResolvedValue(null);
    const { db, del, execute, repository, tx } = fixture();

    await expect(
      deleteTrainingPlanUseCase({
        db: db as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).resolves.toEqual({ success: true });

    expect(mocks.enqueuePlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith({
      db,
      eventIds: [EVENT_ID],
      operation: "unsync",
      profileId: PROFILE_ID,
      transaction: tx,
    });
    expect(del).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      mocks.enqueuePlannedActivitySyncAfterCalendarMutation.mock.invocationCallOrder[0],
    ).toBeLessThan(del.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
  });

  it("retains the events and plan when known remote cleanup cannot be queued", async () => {
    mocks.enqueuePlannedActivitySyncAfterCalendarMutation.mockResolvedValue({
      affectedCount: 1,
      error: "Wahoo planned-activity sync is unavailable",
      operation: "unsync",
      queued: false,
      success: false,
    });
    const { db, del, execute, repository } = fixture();

    await expect(
      deleteTrainingPlanUseCase({
        db: db as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).rejects.toThrow("Wahoo planned-activity sync is unavailable");
    expect(del).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
