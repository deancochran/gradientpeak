import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  listIntegrationsByProfileId: vi.fn(),
}));
vi.mock(
  "../../../infrastructure/repositories/drizzle-integrations-repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../infrastructure/repositories/drizzle-integrations-repository")
    >()),
    listIntegrationsByProfileId: mocks.listIntegrationsByProfileId,
  }),
);
vi.mock("./wahoo-planned-activity-sync-service", () => ({
  WahooPlannedActivitySyncService: class {
    enqueue = mocks.enqueue;
  },
}));

import {
  enqueueWahooActivityPlanRefreshAfterMutation,
  enqueueWahooPlannedSessionSyncAfterMutation,
} from "./wahoo-calendar-mutation-sync";

describe("enqueueWahooPlannedSessionSyncAfterMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not block local cancellation when the planned session has no Wahoo resource link", async () => {
    mocks.listIntegrationsByProfileId.mockResolvedValue([{ provider: "wahoo" }]);
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));

    await expect(
      enqueueWahooPlannedSessionSyncAfterMutation({
        db: { select: vi.fn(() => ({ from })) } as never,
        plannedSessionIds: ["planned-session-1"],
        operation: "unsync",
        profileId: "profile-1",
      }),
    ).resolves.toBeNull();
  });

  it("refreshes only the current plan's owned, scheduled upcoming references", async () => {
    mocks.listIntegrationsByProfileId.mockResolvedValue([{ provider: "wahoo" }]);
    mocks.enqueue.mockResolvedValue({
      affectedCount: 2,
      operation: "publish",
      queued: true,
      success: true,
    });
    const selected = [{ id: "upcoming-1" }, { id: "upcoming-2" }];
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(selected) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(selected) }) });
    const transaction = { select } as never;

    await expect(
      enqueueWahooActivityPlanRefreshAfterMutation({
        activityPlanId: "plan-1",
        db: transaction,
        profileId: "profile-1",
        transaction,
        upcomingOnOrAfter: "2026-10-23",
      }),
    ).resolves.toMatchObject({ affectedCount: 2, success: true });

    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "publish",
        plannedSessionIds: ["upcoming-1", "upcoming-2"],
        profileId: "profile-1",
      }),
    );
  });

  it("does not enqueue when no scheduled upcoming reference survives the eligibility query", async () => {
    const transaction = {
      select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    } as never;

    await expect(
      enqueueWahooActivityPlanRefreshAfterMutation({
        activityPlanId: "plan-1",
        db: transaction,
        profileId: "profile-1",
        transaction,
        upcomingOnOrAfter: "2026-10-23",
      }),
    ).resolves.toBeNull();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
