import { activityImportRuns, profileAthleteState } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  findGrantByProfileIdAndProvider: vi.fn(),
  listByProfileId: vi.fn(),
  listJobs: vi.fn(),
  listSyncStateByIntegrationIds: vi.fn(),
  readOverviewEvidence: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      findGrantByProfileIdAndProvider: mocks.findGrantByProfileIdAndProvider,
      listByProfileId: mocks.listByProfileId,
    },
  })),
  createWahooSyncRepository: vi.fn(() => ({
    listJobs: mocks.listJobs,
    listSyncStateByIntegrationIds: mocks.listSyncStateByIntegrationIds,
  })),
}));

vi.mock("./provider-runtime-registry", () => ({
  getProviderOverviewRuntime: vi.fn((provider: string) => ({
    availability: { isConfigured: () => provider === "wahoo" },
    actionAuthorization: {
      allowsAction: ({
        action,
        grantedScope,
      }: {
        action: string;
        grantedScope?: string | null;
      }) => {
        const scopes = new Set((grantedScope ?? "").split(/\s+/));
        return (
          action === "disconnect" ||
          (action === "sync_now" && scopes.has("workouts_read") && scopes.has("offline_data")) ||
          (action === "refresh_setup_data" && scopes.has("user_read"))
        );
      },
    },
    overview: {
      readOverviewEvidence:
        provider === "wahoo"
          ? mocks.readOverviewEvidence
          : vi.fn(async () => ({
              activityHistory: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "idle",
                importRun: null,
              },
              plannedActivities: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                queuedJobId: null,
                status: "unsupported",
              },
              setupData: {
                lastError: null,
                lastFailedAt: null,
                lastSucceededAt: null,
                status: "unsupported",
              },
            })),
    },
  })),
}));

import { getProviderSyncOverview } from "./syncOverviewUseCase";

function overviewDb(
  input: { importRuns?: unknown[]; failedBulkRuns?: unknown[]; athleteState?: unknown[] } = {},
) {
  return {
    select: vi.fn((selection?: { id?: unknown }) => {
      let selectedTable: unknown;
      const builder = {
        from: vi.fn((table: unknown) => {
          selectedTable = table;
          return builder;
        }),
        where: vi.fn(() => builder),
        groupBy: vi.fn(async () => []),
        orderBy: vi.fn(() => builder),
        limit: vi.fn(async () =>
          selectedTable === activityImportRuns
            ? selection?.id === activityImportRuns.id
              ? (input.failedBulkRuns ?? [])
              : (input.importRuns ?? [])
            : selectedTable === profileAthleteState
              ? (input.athleteState ?? [])
              : [],
        ),
      };
      return builder;
    }),
  } as never;
}

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
        wahoo_event_route_delivery_enabled: false,
      },
    ]);
    mocks.findGrantByProfileIdAndProvider.mockResolvedValue({
      reconnect_required_at: null,
      scope: "workouts_read workouts_write plans_read plans_write offline_data user_read",
    });
    mocks.listJobs.mockResolvedValue([]);
    mocks.listSyncStateByIntegrationIds.mockResolvedValue([]);
    mocks.readOverviewEvidence.mockResolvedValue({
      activityHistory: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "idle",
        importRun: null,
      },
      plannedActivities: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "automatic",
      },
      setupData: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        status: "idle",
      },
    });
  });

  it("reports planned delivery as automatic when grants are ready", async () => {
    const overview = await getProviderSyncOverview({ db: overviewDb(), profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(overview.map(({ provider }) => provider)).toEqual(["wahoo", "strava", "garmin"]);
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
    mocks.readOverviewEvidence.mockResolvedValueOnce({
      ...(await mocks.readOverviewEvidence()),
      plannedActivities: {
        lastError: "Reconnect Wahoo to grant planned activity permissions",
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "unsupported",
      },
    });

    const overview = await getProviderSyncOverview({ db: overviewDb(), profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.plannedActivities).toMatchObject({
      lastError: "Reconnect Wahoo to grant planned activity permissions",
      status: "unsupported",
    });
  });

  it("exposes pending Garmin disconnect recovery without permitting reconnect", async () => {
    const [row] = await mocks.listByProfileId();
    mocks.listByProfileId.mockResolvedValue([
      { ...row, provider: "garmin", lifecycle_status: "disconnect_pending" },
    ]);
    const overview = await getProviderSyncOverview({ db: overviewDb(), profileId: PROFILE_ID });
    expect(overview.find((item) => item.provider === "garmin")).toMatchObject({
      connected: false,
      primaryAction: "disconnect",
      actions: ["disconnect"],
      providerHealth: { status: "disconnecting" },
    });
  });

  it("reports a failed bulk import as incomplete before any state has published", async () => {
    mocks.readOverviewEvidence.mockResolvedValueOnce({
      ...(await mocks.readOverviewEvidence()),
      activityHistory: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "failed",
        importRun: {
          id: "88888888-8888-4888-8888-888888888888",
          status: "failed",
          importedCount: 2,
          skippedCount: 0,
          failedCount: 1,
        },
      },
    });
    const overview = await getProviderSyncOverview({
      db: overviewDb({
        failedBulkRuns: [{ id: "88888888-8888-4888-8888-888888888888" }],
        importRuns: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            integration_id: INTEGRATION_ID,
            kind: "history_sync",
            status: "failed",
            imported_count: 2,
            skipped_count: 0,
            failed_count: 1,
          },
        ],
      }),
      profileId: PROFILE_ID,
    });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");
    expect(wahoo?.activityHistory.importRun).toMatchObject({ status: "failed", importedCount: 2 });
  });

  it("surfaces an active planned-delivery job when grants are ready", async () => {
    mocks.readOverviewEvidence.mockResolvedValueOnce({
      ...(await mocks.readOverviewEvidence()),
      plannedActivities: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: "66666666-6666-4666-8666-666666666666",
        status: "queued",
      },
    });
    mocks.listJobs.mockResolvedValue([
      {
        id: "66666666-6666-4666-8666-666666666666",
        integrationId: INTEGRATION_ID,
        jobType: "wahoo.publish_event",
        status: "queued",
      },
    ]);

    const overview = await getProviderSyncOverview({ db: overviewDb(), profileId: PROFILE_ID });
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

    const overview = await getProviderSyncOverview({ db: overviewDb(), profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.activityHistory).toMatchObject({ lastError: null, status: "idle" });
    expect(wahoo?.providerHealth).toMatchObject({ lastError: null, status: "connected" });
    expect(JSON.stringify(overview)).not.toContain(diagnostic);
  });

  it("maps the current generic bounded sync category without exposing raw diagnostics", async () => {
    mocks.readOverviewEvidence.mockResolvedValueOnce({
      ...(await mocks.readOverviewEvidence()),
      activityHistory: {
        lastError: "Provider sync failed",
        lastFailedAt: "2026-07-28T11:00:00.000Z",
        lastSucceededAt: null,
        queuedJobId: null,
        status: "failed",
        importRun: null,
      },
    });
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

    const overview = await getProviderSyncOverview({ db: overviewDb(), profileId: PROFILE_ID });
    const wahoo = overview.find((provider) => provider.provider === "wahoo");

    expect(wahoo?.activityHistory).toMatchObject({
      lastError: "Provider sync failed",
      status: "failed",
    });
  });
});
