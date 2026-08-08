import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  findByProfileIdAndProvider: vi.fn(),
  findGrantByProfileIdAndProvider: vi.fn(),
  enqueueWahooPlannedActivitySyncAfterCalendarMutation: vi.fn(),
  refreshSetupData: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      findByProfileIdAndProvider: mocks.findByProfileIdAndProvider,
      findGrantByProfileIdAndProvider: mocks.findGrantByProfileIdAndProvider,
    },
  })),
  createWahooSyncRepository: vi.fn(() => ({ enqueueJob: mocks.enqueueJob })),
}));

vi.mock("../wahoo-profile-setup-service", () => ({
  WahooProfileSetupService: class {
    refreshSetupData(...args: unknown[]) {
      return mocks.refreshSetupData(...args);
    }
  },
}));

vi.mock("../../lib/provider-sync/planned-activities", () => ({
  enqueueWahooPlannedActivitySyncAfterCalendarMutation:
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation,
}));

import { syncIntegrationNow } from "./syncNowUseCase";

describe("syncIntegrationNow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByProfileIdAndProvider.mockResolvedValue({
      generation: 3,
      id: INTEGRATION_ID,
      lifecycle_status: "active",
      profile_id: PROFILE_ID,
      provider: "wahoo",
    });
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      expires_at: null,
      scope: "workouts_read offline_data",
    });
    mocks.refreshSetupData.mockResolvedValue({
      fieldsFilled: [],
      fieldsKept: [],
      fieldsUpdated: [],
      keptExistingValues: false,
      status: "succeeded",
    });
    mocks.enqueueJob.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      status: "queued",
    });
    mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation.mockResolvedValue({
      affectedCount: 1,
      operation: "publish",
      queued: true,
      success: true,
    });
  });

  it("rejects a missing integration before reading grants or enqueuing", async () => {
    mocks.findByProfileIdAndProvider.mockResolvedValue(null);

    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.findGrantByProfileIdAndProvider).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects Wahoo history sync when required grants are absent", async () => {
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      expires_at: null,
      scope: "workouts_read",
    });

    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.refreshSetupData).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("propagates queue persistence failure instead of reporting successful sync admission", async () => {
    const failure = new Error("Failed query: provider_sync_jobs unavailable");
    mocks.enqueueJob.mockRejectedValue(failure);

    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).rejects.toBe(failure);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: `wahoo-history-reconcile:${INTEGRATION_ID}:3`,
        integrationGeneration: 3,
        profileId: PROFILE_ID,
        provider: "wahoo",
      }),
    );
  });

  it("always backfills a bounded profile-owned scheduled window when grants are ready", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T15:00:00.000Z"));
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      expires_at: null,
      scope: "workouts_read workouts_write plans_read plans_write offline_data user_read",
    });
    const limit = vi.fn().mockResolvedValue([{ id: "event-1" }]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const db = { select: vi.fn(() => ({ from })) };

    await expect(
      syncIntegrationNow({ db: db as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).resolves.toMatchObject({
      plannedActivitySync: { affectedCount: 1, queued: true, success: true },
    });

    expect(limit).toHaveBeenCalledWith(100);
    expect(mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith({
      db,
      eventIds: ["event-1"],
      operation: "publish",
      profileId: PROFILE_ID,
    });
  });

  it("returns reconnect guidance without reading planned events when publish grants are absent", async () => {
    const db = { select: vi.fn() };

    await expect(
      syncIntegrationNow({ db: db as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).resolves.toMatchObject({
      plannedActivitySync: {
        affectedCount: 0,
        queued: false,
        success: false,
      },
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.enqueueWahooPlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });
});
