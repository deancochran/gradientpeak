import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  findByProfileIdAndProvider: vi.fn(),
  findGrantByProfileIdAndProvider: vi.fn(),
  enqueueWahooOwnedRouteReconcile: vi.fn(),
  enqueuePlannedActivitySyncAfterCalendarMutation: vi.fn(),
  refreshSetupData: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      findByProfileIdAndProvider: mocks.findByProfileIdAndProvider,
      findGrantByProfileIdAndProvider: mocks.findGrantByProfileIdAndProvider,
    },
  })),
  createProviderSyncRepository: vi.fn(() => ({ enqueueJob: mocks.enqueueJob })),
}));

vi.mock("../onboarding-provider-enrichment", () => ({
  OnboardingProviderEnrichmentService: class {
    refreshSetupData(...args: unknown[]) {
      return mocks.refreshSetupData(...args);
    }
  },
}));

vi.mock("../../lib/provider-sync/planned-activities", () => ({
  enqueuePlannedActivitySyncAfterCalendarMutation:
    mocks.enqueuePlannedActivitySyncAfterCalendarMutation,
}));

vi.mock("../../lib/provider-sync/owned-routes", () => ({
  enqueueWahooOwnedRouteReconcile: mocks.enqueueWahooOwnedRouteReconcile,
}));

import { syncIntegrationNow } from "./syncNowUseCase";

describe("syncIntegrationNow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByProfileIdAndProvider.mockResolvedValue({ generation: 3, id: INTEGRATION_ID });
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
    mocks.enqueuePlannedActivitySyncAfterCalendarMutation.mockResolvedValue({
      affectedCount: 1,
      operation: "publish",
      queued: true,
      success: true,
    });
    mocks.enqueueWahooOwnedRouteReconcile.mockResolvedValue({
      jobId: "88888888-8888-4888-8888-888888888888",
      queued: true,
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

  it("returns a recoverable unqueued result when queue persistence is unavailable", async () => {
    mocks.enqueueJob.mockRejectedValue(new Error("Failed query: provider_sync_jobs unavailable"));

    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).resolves.toMatchObject({ jobId: null, queued: false });
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: `provider-history-reconcile:${INTEGRATION_ID}:activity`,
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
    expect(mocks.enqueuePlannedActivitySyncAfterCalendarMutation).toHaveBeenCalledWith({
      db,
      eventIds: ["event-1"],
      operation: "publish",
      profileId: PROFILE_ID,
    });
  });

  it("queues an owned-route reconciliation when route-library grants are ready", async () => {
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      expires_at: null,
      scope: "workouts_read routes_read routes_write offline_data",
    });

    await expect(
      syncIntegrationNow({ db: {} as never, profileId: PROFILE_ID, provider: "wahoo" }),
    ).resolves.toMatchObject({
      ownedRouteSync: {
        jobId: "88888888-8888-4888-8888-888888888888",
        queued: true,
      },
    });

    expect(mocks.enqueueWahooOwnedRouteReconcile).toHaveBeenCalledWith({
      integrationGeneration: 3,
      integrationId: INTEGRATION_ID,
      profileId: PROFILE_ID,
      providerSyncRepository: expect.any(Object),
      trigger: "manual",
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
    expect(mocks.enqueuePlannedActivitySyncAfterCalendarMutation).not.toHaveBeenCalled();
  });
});
