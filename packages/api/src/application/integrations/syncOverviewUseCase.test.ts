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
      scope: "workouts_read workouts_write plans_read plans_write offline_data user_read",
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

  it("does not interpret or expose unknown persisted sync diagnostics", async () => {
    const diagnostic = "legacy provider failure token=secret https://provider.test/private";
    mocks.listSyncStateByIntegrationIds.mockResolvedValue([
      {
        integrationId: INTEGRATION_ID,
        lastError: diagnostic,
        lastSyncFailedAt: "2026-07-28T11:00:00.000Z",
        lastSyncSucceededAt: null,
        metadata: null,
        resource: "historical_activities",
      },
    ]);

    const overview = await getProviderSyncOverview({ db: {} as never, profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.activityHistory).toMatchObject({ lastError: null, status: "idle" });
    expect(wahoo?.providerHealth).toMatchObject({ lastError: null, status: "connected" });
    expect(JSON.stringify(overview)).not.toContain(diagnostic);
  });

  it("maps the current generic bounded sync category without exposing raw diagnostics", async () => {
    mocks.listSyncStateByIntegrationIds.mockResolvedValue([
      {
        integrationId: INTEGRATION_ID,
        lastError: "provider_sync_failed",
        lastSyncFailedAt: "2026-07-28T11:00:00.000Z",
        lastSyncSucceededAt: null,
        metadata: null,
        resource: "historical_activities",
      },
    ]);

    const overview = await getProviderSyncOverview({ db: {} as never, profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.activityHistory).toMatchObject({
      lastError: "Provider sync failed",
      status: "failed",
    });
  });
});
