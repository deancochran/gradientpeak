import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TRAINING_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation: vi.fn(),
}));

vi.mock("../../lib/provider-sync/planned-activities", () => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation:
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation,
}));

import {
  deleteTrainingPlanUseCase,
  reorderTrainingPlanActivitiesUseCase,
} from "./mutationUseCases";

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
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mockResolvedValue(null);
    const { db, del, execute, repository, tx } = fixture();

    await expect(
      deleteTrainingPlanUseCase({
        db: db as never,
        id: TRAINING_PLAN_ID,
        profileId: PROFILE_ID,
        repository: repository as never,
      }),
    ).resolves.toEqual({ success: true });

    expect(mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith({
      db,
      eventIds: [EVENT_ID],
      operation: "unsync",
      profileId: PROFILE_ID,
      transaction: tx,
    });
    expect(del).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mock.invocationCallOrder[0],
    ).toBeLessThan(del.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
  });

  it("retains the events and plan when known remote cleanup cannot be queued", async () => {
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mockResolvedValue({
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

describe("reorderTrainingPlanActivitiesUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increments the plan revision and clears projection validation in the event transaction", async () => {
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mockResolvedValue(null);
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRAINING_PLAN_ID }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ends_at: new Date("2026-08-01T11:00:00.000Z"),
            event_id: EVENT_ID,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-02",
            starts_at: new Date("2026-08-01T10:00:00.000Z"),
            timezone: "UTC",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: EVENT_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const tx = { execute };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await expect(
      reorderTrainingPlanActivitiesUseCase({
        db: db as never,
        profileId: PROFILE_ID,
        trainingPlanId: TRAINING_PLAN_ID,
        changes: [
          {
            event_id: EVENT_ID,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-02",
          },
        ],
      }),
    ).resolves.toEqual({ affected_count: 1, affected_event_ids: [EVENT_ID] });

    const query = new PgDialect().sqlToQuery(execute.mock.calls[3]?.[0] as never).sql;
    expect(query).toContain("revision = revision + 1");
    expect(query).toContain("validated_state_revision = null");
    expect(query).toContain("validated_at = null");
    expect(query).toContain("projection_algorithm_version = null");
    expect(mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith({
      db,
      eventIds: [EVENT_ID],
      operation: "publish",
      profileId: PROFILE_ID,
      transaction: tx,
    });
    expect(
      mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mock.invocationCallOrder[0],
    ).toBeGreaterThan(execute.mock.invocationCallOrder[3] ?? Number.POSITIVE_INFINITY);
  });

  it("fails the reorder transaction when Wahoo publish admission cannot be queued", async () => {
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mockResolvedValue({
      affectedCount: 1,
      error: "Wahoo planned-activity sync is unavailable",
      operation: "publish",
      queued: false,
      success: false,
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRAINING_PLAN_ID }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ends_at: null,
            event_id: EVENT_ID,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-02",
            starts_at: new Date("2026-08-01T10:00:00.000Z"),
            timezone: "UTC",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: EVENT_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const tx = { execute };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await expect(
      reorderTrainingPlanActivitiesUseCase({
        db: db as never,
        profileId: PROFILE_ID,
        trainingPlanId: TRAINING_PLAN_ID,
        changes: [
          {
            event_id: EVENT_ID,
            expected_scheduled_date: "2026-08-01",
            requested_scheduled_date: "2026-08-02",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to queue planned activity synchronization",
    });
    expect(mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith(
      expect.objectContaining({ transaction: tx }),
    );
  });
});
