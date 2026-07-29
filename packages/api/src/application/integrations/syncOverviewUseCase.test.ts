import { beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  findGrantByProfileIdAndProvider: vi.fn(),
  listByProfileId: vi.fn(),
  listJobs: vi.fn(),
  listSyncStateByIntegrationIds: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      findGrantByProfileIdAndProvider: mocks.findGrantByProfileIdAndProvider,
      listByProfileId: mocks.listByProfileId,
    },
  })),
  createProviderSyncRepository: vi.fn(() => ({
    listJobs: mocks.listJobs,
    listSyncStateByIntegrationIds: mocks.listSyncStateByIntegrationIds,
  })),
}));

vi.mock("../../lib/integrations/oauth-config", () => ({
  isProviderOAuthConfigured: vi.fn(() => true),
}));

import { getProviderSyncOverview } from "./syncOverviewUseCase";

describe("getProviderSyncOverview planned Wahoo delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listByProfileId.mockResolvedValue([
      {
        created_at: new Date("2026-07-28T10:00:00.000Z"),
        disconnect_requested_at: null,
        disconnected_at: null,
        external_id: "wahoo-user-1",
        generation: 3,
        id: INTEGRATION_ID,
        lifecycle_status: "active",
        profile_id: PROFILE_ID,
        provider: "wahoo",
        remote_revoked_at: null,
        updated_at: new Date("2026-07-28T10:00:00.000Z"),
      },
    ]);
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      reconnect_required_at: null,
      scope:
        "workouts_read workouts_write plans_read plans_write offline_data power_zones_read user_read",
    });
    mocks.listJobs.mockResolvedValue([]);
    mocks.listSyncStateByIntegrationIds.mockResolvedValue([]);
  });

  it("reports planned delivery as automatic when grants are ready", async () => {
    const overview = await getProviderSyncOverview({ db: {} as never, profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.plannedActivities).toEqual({
      lastError: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      queuedJobId: null,
      status: "automatic",
    });
    expect(wahoo?.summary).toMatchObject({ badge: "Auto", health: "connected" });
  });

  it("reports reconnect guidance without publish grants", async () => {
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      reconnect_required_at: null,
      scope: "workouts_read offline_data",
    });

    const overview = await getProviderSyncOverview({ db: {} as never, profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.plannedActivities).toMatchObject({
      lastError: "Reconnect Wahoo to grant planned activity permissions",
      status: "unsupported",
    });
  });

  it("surfaces an active planned-delivery job when grants are ready", async () => {
    mocks.listJobs.mockResolvedValue([
      {
        id: "66666666-6666-4666-8666-666666666666",
        integrationId: INTEGRATION_ID,
        jobType: "wahoo.publish_event",
        status: "queued",
      },
    ]);

    const overview = await getProviderSyncOverview({ db: {} as never, profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.plannedActivities).toMatchObject({
      lastError: null,
      queuedJobId: "66666666-6666-4666-8666-666666666666",
      status: "queued",
    });
    expect(wahoo?.summary).toMatchObject({ badge: "Queued", health: "queued" });
  });
});
