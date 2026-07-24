import { beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  findByProfileIdAndProvider: vi.fn(),
  findGrantByProfileIdAndProvider: vi.fn(),
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

import { syncIntegrationNow } from "./syncNowUseCase";

describe("syncIntegrationNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByProfileIdAndProvider.mockResolvedValue({ id: INTEGRATION_ID });
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
});
