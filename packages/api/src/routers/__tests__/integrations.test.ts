import type { TRPCError } from "@trpc/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const STATE_ID = "55555555-5555-4555-8555-555555555555";
const SYNC_ID = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => {
  const repositories = {
    integrations: {
      listByProfileId: vi.fn(),
      findByProfileIdAndProvider: vi.fn(),
      deleteByProfileIdAndProvider: vi.fn(),
      upsertByProfileIdAndProvider: vi.fn(),
    },
    oauthStates: {
      deleteExpired: vi.fn(),
      create: vi.fn(),
      findValidByState: vi.fn(),
      deleteByState: vi.fn(),
    },
  };
  const providerSyncRepository = {
    enqueueJob: vi.fn(),
    listJobs: vi.fn(),
    listSyncStateByIntegrationIds: vi.fn(),
  };

  return {
    repositories,
    providerSyncRepository,
    createIntegrationsRepositories: vi.fn(() => repositories),
    createProviderSyncRepository: vi.fn(() => providerSyncRepository),
    setupRefresh: {
      refreshSetupData: vi.fn(),
      instances: [] as Array<{ deps: unknown }>,
    },
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: mocks.createIntegrationsRepositories,
  createProviderSyncRepository: mocks.createProviderSyncRepository,
}));

vi.mock("../../application/onboarding-provider-enrichment", () => ({
  OnboardingProviderEnrichmentService: class MockOnboardingProviderEnrichmentService {
    constructor(deps: unknown) {
      mocks.setupRefresh.instances.push({ deps });
    }

    refreshSetupData(...args: Parameters<typeof mocks.setupRefresh.refreshSetupData>) {
      return mocks.setupRefresh.refreshSetupData(...args);
    }
  },
}));

vi.mock("@repo/db", () => {
  const publicIntegrationProviderSchema = z.enum([
    "strava",
    "wahoo",
    "trainingpeaks",
    "garmin",
    "zwift",
  ]);

  return {
    publicIntegrationProviderSchema,
    publicIntegrationsRowSchema: z.object({
      id: z.string().uuid(),
      idx: z.number().int(),
      profile_id: z.string().uuid(),
      provider: publicIntegrationProviderSchema,
      external_id: z.string().min(1),
      created_at: z.date(),
      updated_at: z.date(),
    }),
  };
});

import { integrationsRouter } from "../integrations";

function createCaller(userId = SESSION_USER_ID) {
  return integrationsRouter.createCaller({
    db: {},
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

const originalEnv = { ...process.env };

describe("integrationsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setupRefresh.instances.length = 0;

    process.env.OAUTH_CALLBACK_BASE_URL = "https://app.example.com";
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_URI = "gradientpeak://integrations";
    process.env.STRAVA_CLIENT_ID = "strava-client-id";
    process.env.STRAVA_CLIENT_SECRET = "strava-client-secret";
    process.env.WAHOO_CLIENT_ID = "wahoo-client-id";
    process.env.WAHOO_CLIENT_SECRET = "wahoo-client-secret";
    process.env.TRAININGPEAKS_CLIENT_ID = "tp-client-id";
    process.env.TRAININGPEAKS_CLIENT_SECRET = "tp-client-secret";
    process.env.GARMIN_CLIENT_ID = "garmin-client-id";
    process.env.GARMIN_CLIENT_SECRET = "garmin-client-secret";
    process.env.ZWIFT_CLIENT_ID = "zwift-client-id";
    process.env.ZWIFT_CLIENT_SECRET = "zwift-client-secret";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("list removes expired states before returning integrations", async () => {
    const caller = createCaller();
    const rows = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        idx: 1,
        profile_id: SESSION_USER_ID,
        provider: "strava",
        external_id: "ext-1",
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_at: new Date("2026-04-01T12:00:00.000Z"),
        scope: "activity:read_all",
        created_at: new Date("2026-04-01T10:00:00.000Z"),
        updated_at: new Date("2026-04-01T11:00:00.000Z"),
      },
    ];

    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(2);
    mocks.repositories.integrations.listByProfileId.mockResolvedValue(rows);

    await expect(caller.list()).resolves.toEqual([
      {
        id: "77777777-7777-4777-8777-777777777777",
        idx: 1,
        profile_id: SESSION_USER_ID,
        provider: "strava",
        external_id: "ext-1",
        created_at: new Date("2026-04-01T10:00:00.000Z"),
        updated_at: new Date("2026-04-01T11:00:00.000Z"),
      },
    ]);
    expect(mocks.repositories.oauthStates.deleteExpired).toHaveBeenCalledWith({
      profileId: SESSION_USER_ID,
      now: expect.any(Date),
    });
    expect(mocks.repositories.integrations.listByProfileId).toHaveBeenCalledWith(SESSION_USER_ID);
  });

  it("getSyncOverview returns connected provider actions and activity history status", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.listByProfileId.mockResolvedValue([
      {
        id: "77777777-7777-4777-8777-777777777777",
        idx: 1,
        profile_id: SESSION_USER_ID,
        provider: "wahoo",
        external_id: "77",
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_at: null,
        scope: "workouts_read",
        created_at: new Date("2026-04-01T10:00:00.000Z"),
        updated_at: new Date("2026-04-01T11:00:00.000Z"),
      },
    ]);
    mocks.providerSyncRepository.listSyncStateByIntegrationIds.mockResolvedValue([
      {
        consecutiveFailures: 0,
        cursor: null,
        highWatermark: null,
        id: "88888888-8888-4888-8888-888888888888",
        integrationId: "77777777-7777-4777-8777-777777777777",
        lastError: null,
        lastSyncFailedAt: null,
        lastSyncStartedAt: "2026-04-01T12:00:00.000Z",
        lastSyncSucceededAt: "2026-04-01T12:01:00.000Z",
        metadata: {},
        nextSyncAt: null,
        provider: "wahoo",
        publishHorizonDays: null,
        resource: "historical_activities",
        syncMode: "automatic",
      },
      {
        consecutiveFailures: 0,
        cursor: null,
        highWatermark: null,
        id: "99999999-9999-4999-8999-999999999999",
        integrationId: "77777777-7777-4777-8777-777777777777",
        lastError: null,
        lastSyncFailedAt: null,
        lastSyncStartedAt: "2026-04-01T12:00:00.000Z",
        lastSyncSucceededAt: "2026-04-01T12:02:00.000Z",
        metadata: { status: "succeeded" },
        nextSyncAt: null,
        provider: "wahoo",
        publishHorizonDays: null,
        resource: "profile_enrichment",
        syncMode: "manual_refresh",
      },
    ]);
    mocks.providerSyncRepository.listJobs.mockResolvedValue([
      {
        attempt: 0,
        dedupeKey: "provider-history-reconcile:77777777-7777-4777-8777-777777777777:activity",
        id: SYNC_ID,
        integrationId: "77777777-7777-4777-8777-777777777777",
        internalResourceId: null,
        jobType: "wahoo.activity_history_reconcile",
        maxAttempts: 8,
        payload: { trigger: "manual" },
        profileId: SESSION_USER_ID,
        provider: "wahoo",
        resourceKind: "activity",
        runAt: "2026-04-01T12:05:00.000Z",
        status: "queued",
      },
    ]);

    const result = await caller.getSyncOverview();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actions: ["disconnect", "sync_now"],
          activityHistory: expect.objectContaining({
            queuedJobId: SYNC_ID,
            status: "queued",
          }),
          plannedWorkouts: expect.objectContaining({ status: "automatic" }),
          providerHealth: expect.objectContaining({ status: "connected" }),
          setupData: expect.objectContaining({ status: "refreshed" }),
          connected: true,
          integrationId: "77777777-7777-4777-8777-777777777777",
          label: "Wahoo",
          provider: "wahoo",
        }),
        expect.objectContaining({
          actions: [],
          activityHistory: expect.objectContaining({ status: "unsupported" }),
          plannedWorkouts: expect.objectContaining({ status: "unsupported" }),
          setupData: expect.objectContaining({ status: "unsupported" }),
          connected: false,
          provider: "strava",
        }),
      ]),
    );
    expect(mocks.providerSyncRepository.listSyncStateByIntegrationIds).toHaveBeenCalledWith([
      "77777777-7777-4777-8777-777777777777",
    ]);
    expect(mocks.providerSyncRepository.listJobs).toHaveBeenCalledWith({
      limit: 50,
      profileId: SESSION_USER_ID,
      statuses: ["queued", "running"],
    });
  });

  it("getSyncOverview still renders when sync state tables are unavailable locally", async () => {
    const caller = createCaller();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.repositories.integrations.listByProfileId.mockResolvedValue([
      {
        id: "77777777-7777-4777-8777-777777777777",
        idx: 1,
        profile_id: SESSION_USER_ID,
        provider: "wahoo",
        external_id: "77",
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_at: null,
        scope: "workouts_read",
        created_at: new Date("2026-04-01T10:00:00.000Z"),
        updated_at: new Date("2026-04-01T11:00:00.000Z"),
      },
    ]);
    mocks.providerSyncRepository.listSyncStateByIntegrationIds.mockRejectedValue(
      new Error("column provider_sync_state.cursor does not exist"),
    );
    mocks.providerSyncRepository.listJobs.mockRejectedValue(
      new Error("relation provider_sync_jobs does not exist"),
    );

    await expect(caller.getSyncOverview()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityHistory: expect.objectContaining({ status: "idle" }),
          connected: true,
          provider: "wahoo",
        }),
      ]),
    );
  });

  it("syncNow enqueues manual Wahoo history reconciliation", async () => {
    const caller = createCaller();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T09:30:00.000Z"));
    mocks.repositories.integrations.findByProfileIdAndProvider.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      idx: 1,
      profile_id: SESSION_USER_ID,
      provider: "wahoo",
      external_id: "77",
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: null,
      scope: "workouts_read",
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      updated_at: new Date("2026-04-01T11:00:00.000Z"),
    });
    mocks.providerSyncRepository.enqueueJob.mockResolvedValue({ id: SYNC_ID, status: "queued" });
    mocks.setupRefresh.refreshSetupData.mockResolvedValue({
      fieldsFilled: ["weight_kg"],
      fieldsKept: ["dob"],
      fieldsUpdated: ["weight_kg", "ftp"],
      keptExistingValues: true,
      provider: "wahoo",
      status: "succeeded",
    });

    await expect(caller.syncNow({ provider: "wahoo" })).resolves.toEqual({
      jobId: SYNC_ID,
      queued: true,
      setupRefresh: {
        fieldsFilled: ["weight_kg"],
        fieldsKept: ["dob"],
        fieldsUpdated: ["weight_kg", "ftp"],
        keptExistingValues: true,
        status: "succeeded",
      },
    });
    expect(mocks.setupRefresh.refreshSetupData).toHaveBeenCalledWith(SESSION_USER_ID, "wahoo");

    expect(mocks.providerSyncRepository.enqueueJob).toHaveBeenCalledWith({
      dedupeKey: "provider-history-reconcile:77777777-7777-4777-8777-777777777777:activity",
      integrationId: "77777777-7777-4777-8777-777777777777",
      jobType: "wahoo.activity_history_reconcile",
      payload: {
        trigger: "manual",
        windowMonths: 12,
      },
      profileId: SESSION_USER_ID,
      provider: "wahoo",
      resourceKind: "activity",
      runAt: "2026-04-02T09:30:00.000Z",
    });
  });

  it("getSyncOverview surfaces reconnect and failed resource states", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.listByProfileId.mockResolvedValue([
      {
        id: "77777777-7777-4777-8777-777777777777",
        idx: 1,
        profile_id: SESSION_USER_ID,
        provider: "wahoo",
        external_id: "77",
        access_token: "access-1",
        refresh_token: null,
        expires_at: new Date("2026-04-01T10:00:00.000Z"),
        scope: "workouts_read",
        created_at: new Date("2026-04-01T10:00:00.000Z"),
        updated_at: new Date("2026-04-01T11:00:00.000Z"),
      },
    ]);
    mocks.providerSyncRepository.listSyncStateByIntegrationIds.mockResolvedValue([
      {
        consecutiveFailures: 1,
        cursor: null,
        highWatermark: null,
        id: "88888888-8888-4888-8888-888888888888",
        integrationId: "77777777-7777-4777-8777-777777777777",
        lastError: "401 unauthorized",
        lastSyncFailedAt: "2026-04-01T12:01:00.000Z",
        lastSyncStartedAt: "2026-04-01T12:00:00.000Z",
        lastSyncSucceededAt: null,
        metadata: {},
        nextSyncAt: null,
        provider: "wahoo",
        publishHorizonDays: null,
        resource: "historical_activities",
        syncMode: "automatic",
      },
      {
        consecutiveFailures: 1,
        cursor: null,
        highWatermark: null,
        id: "99999999-9999-4999-8999-999999999999",
        integrationId: "77777777-7777-4777-8777-777777777777",
        lastError: "Power zones unavailable",
        lastSyncFailedAt: "2026-04-01T12:01:00.000Z",
        lastSyncStartedAt: "2026-04-01T12:00:00.000Z",
        lastSyncSucceededAt: null,
        metadata: { status: "failed" },
        nextSyncAt: null,
        provider: "wahoo",
        publishHorizonDays: null,
        resource: "profile_enrichment",
        syncMode: "manual_refresh",
      },
    ]);
    mocks.providerSyncRepository.listJobs.mockResolvedValue([]);

    const result = await caller.getSyncOverview();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityHistory: expect.objectContaining({ status: "failed" }),
          provider: "wahoo",
          providerHealth: expect.objectContaining({ status: "needs_reconnect" }),
          setupData: expect.objectContaining({ status: "failed" }),
        }),
      ]),
    );
  });

  it("syncNow degrades when provider sync jobs are unavailable locally", async () => {
    const caller = createCaller();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.repositories.integrations.findByProfileIdAndProvider.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      idx: 1,
      profile_id: SESSION_USER_ID,
      provider: "wahoo",
      external_id: "77",
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: null,
      scope: "workouts_read",
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      updated_at: new Date("2026-04-01T11:00:00.000Z"),
    });
    mocks.providerSyncRepository.enqueueJob.mockRejectedValue(
      new Error('Failed query: select "id", "status" from "provider_sync_jobs"'),
    );
    mocks.setupRefresh.refreshSetupData.mockResolvedValue({
      fieldsFilled: [],
      fieldsKept: ["gender"],
      fieldsUpdated: [],
      keptExistingValues: true,
      provider: "wahoo",
      status: "succeeded",
    });

    await expect(caller.syncNow({ provider: "wahoo" })).resolves.toEqual({
      jobId: null,
      queued: false,
      setupRefresh: {
        fieldsFilled: [],
        fieldsKept: ["gender"],
        fieldsUpdated: [],
        keptExistingValues: true,
        status: "succeeded",
      },
    });
  });

  it("syncNow rejects providers without file-first history import", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.findByProfileIdAndProvider.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      idx: 1,
      profile_id: SESSION_USER_ID,
      provider: "strava",
      external_id: "strava-1",
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: null,
      scope: "activity:read_all",
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      updated_at: new Date("2026-04-01T11:00:00.000Z"),
    });

    await expect(caller.syncNow({ provider: "strava" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Activity history sync is not available for this provider",
    } satisfies Partial<TRPCError>);
    expect(mocks.providerSyncRepository.enqueueJob).not.toHaveBeenCalled();
  });

  it("getAuthUrl stores oauth state and builds the provider auth url", async () => {
    const caller = createCaller();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(STATE_ID);
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.create.mockResolvedValue(undefined);

    const result = await caller.getAuthUrl({ provider: "strava" });
    const url = new URL(result.url);

    expect(result.state).toBe(STATE_ID);
    expect(`${url.origin}${url.pathname}`).toBe("https://www.strava.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("strava-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/integrations/callback/strava",
    );
    expect(url.searchParams.get("scope")).toBe("activity:read_all");
    expect(url.searchParams.get("state")).toBe(STATE_ID);
    expect(mocks.repositories.oauthStates.create).toHaveBeenCalledWith({
      state: STATE_ID,
      profileId: SESSION_USER_ID,
      provider: "strava",
      mobileRedirectUri: "gradientpeak://integrations",
      createdAt: expect.any(Date),
      expiresAt: expect.any(Date),
    });
  });

  it("getAuthUrl rejects unexpected input keys", async () => {
    const caller = createCaller();

    await expect(
      caller.getAuthUrl({
        provider: "strava",
        redirectUri: "https://example.com",
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("disconnect deletes the integration for the current user", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.deleteByProfileIdAndProvider.mockResolvedValue(undefined);

    await expect(caller.disconnect({ provider: "wahoo" })).resolves.toEqual({ success: true });
    expect(mocks.repositories.integrations.deleteByProfileIdAndProvider).toHaveBeenCalledWith({
      profileId: SESSION_USER_ID,
      provider: "wahoo",
    });
  });

  it("validateOAuthState returns serialized oauth state data", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: OTHER_USER_ID,
      provider: "wahoo",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
    });

    await expect(caller.validateOAuthState({ state: STATE_ID })).resolves.toEqual({
      userId: OTHER_USER_ID,
      provider: "wahoo",
      mobileRedirectUri: "gradientpeak://callback",
      createdAt: "2026-04-01T12:00:00.000Z",
    });
  });

  it("validateOAuthState tolerates extra repository row columns", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: OTHER_USER_ID,
      provider: "wahoo",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
      expires_at: new Date("2026-04-01T12:10:00.000Z"),
      state: STATE_ID,
    });

    await expect(caller.validateOAuthState({ state: STATE_ID })).resolves.toEqual({
      userId: OTHER_USER_ID,
      provider: "wahoo",
      mobileRedirectUri: "gradientpeak://callback",
      createdAt: "2026-04-01T12:00:00.000Z",
    });
  });

  it("validateOAuthState rejects malformed oauth state rows", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: OTHER_USER_ID,
      provider: "not-a-provider",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
    });

    await expect(caller.validateOAuthState({ state: STATE_ID })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "OAuth state repository returned invalid data",
    } satisfies Partial<TRPCError>);
  });

  it("storeIntegration upserts the integration and deletes the consumed state", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: OTHER_USER_ID,
      provider: "trainingpeaks",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
    });
    mocks.repositories.integrations.upsertByProfileIdAndProvider.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      idx: 1,
      profile_id: OTHER_USER_ID,
      provider: "trainingpeaks",
      external_id: "ext-42",
      access_token: "access-42",
      refresh_token: "refresh-42",
      expires_at: new Date("2026-04-02T12:00:00.000Z"),
      scope: "activities:read",
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      updated_at: new Date("2026-04-01T10:00:00.000Z"),
    });
    mocks.repositories.oauthStates.deleteByState.mockResolvedValue(undefined);

    await expect(
      caller.storeIntegration({
        userId: OTHER_USER_ID,
        provider: "trainingpeaks",
        externalId: "ext-42",
        accessToken: "access-42",
        refreshToken: "refresh-42",
        expiresAt: "2026-04-02T12:00:00.000Z",
        scope: "activities:read",
        state: STATE_ID,
      }),
    ).resolves.toEqual({ success: true });

    expect(mocks.repositories.oauthStates.deleteExpired).toHaveBeenCalledWith({
      now: expect.any(Date),
    });
    expect(mocks.repositories.oauthStates.findValidByState).toHaveBeenCalledWith({
      state: STATE_ID,
      now: expect.any(Date),
    });
    expect(mocks.repositories.integrations.upsertByProfileIdAndProvider).toHaveBeenCalledWith({
      profileId: OTHER_USER_ID,
      provider: "trainingpeaks",
      externalId: "ext-42",
      accessToken: "access-42",
      refreshToken: "refresh-42",
      expiresAt: new Date("2026-04-02T12:00:00.000Z"),
      scope: "activities:read",
    });
    expect(mocks.providerSyncRepository.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.repositories.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("storeIntegration rejects missing or expired oauth state before writing tokens", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(1);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue(null);

    await expect(
      caller.storeIntegration({
        userId: OTHER_USER_ID,
        provider: "trainingpeaks",
        externalId: "ext-42",
        accessToken: "access-42",
        refreshToken: "refresh-42",
        expiresAt: "2026-04-02T12:00:00.000Z",
        scope: "activities:read",
        state: STATE_ID,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Invalid or expired OAuth state",
    } satisfies Partial<TRPCError>);

    expect(mocks.repositories.integrations.upsertByProfileIdAndProvider).not.toHaveBeenCalled();
    expect(mocks.repositories.oauthStates.deleteByState).not.toHaveBeenCalled();
  });

  it("storeIntegration rejects oauth state ownership mismatches before writing tokens", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: SESSION_USER_ID,
      provider: "trainingpeaks",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
    });

    await expect(
      caller.storeIntegration({
        userId: OTHER_USER_ID,
        provider: "trainingpeaks",
        externalId: "ext-42",
        accessToken: "access-42",
        refreshToken: "refresh-42",
        expiresAt: "2026-04-02T12:00:00.000Z",
        scope: "activities:read",
        state: STATE_ID,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "OAuth state does not match integration request",
    } satisfies Partial<TRPCError>);

    expect(mocks.repositories.integrations.upsertByProfileIdAndProvider).not.toHaveBeenCalled();
    expect(mocks.repositories.oauthStates.deleteByState).not.toHaveBeenCalled();
  });

  it("storeIntegration rejects oauth state provider mismatches before writing tokens", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: OTHER_USER_ID,
      provider: "wahoo",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
    });

    await expect(
      caller.storeIntegration({
        userId: OTHER_USER_ID,
        provider: "trainingpeaks",
        externalId: "ext-42",
        accessToken: "access-42",
        refreshToken: "refresh-42",
        expiresAt: "2026-04-02T12:00:00.000Z",
        scope: "activities:read",
        state: STATE_ID,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "OAuth state does not match integration request",
    } satisfies Partial<TRPCError>);

    expect(mocks.repositories.integrations.upsertByProfileIdAndProvider).not.toHaveBeenCalled();
    expect(mocks.repositories.oauthStates.deleteByState).not.toHaveBeenCalled();
  });

  it("storeIntegration enqueues Wahoo activity history reconciliation", async () => {
    const caller = createCaller();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T09:30:00.000Z"));
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
    mocks.repositories.oauthStates.findValidByState.mockResolvedValue({
      profile_id: OTHER_USER_ID,
      provider: "wahoo",
      mobile_redirect_uri: "gradientpeak://callback",
      created_at: new Date("2026-04-01T12:00:00.000Z"),
    });
    mocks.repositories.integrations.upsertByProfileIdAndProvider.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      idx: 1,
      profile_id: OTHER_USER_ID,
      provider: "wahoo",
      external_id: "wahoo-user-42",
      access_token: "access-42",
      refresh_token: "refresh-42",
      expires_at: new Date("2026-04-02T12:00:00.000Z"),
      scope: "user_read workouts_read",
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      updated_at: new Date("2026-04-01T10:00:00.000Z"),
    });
    mocks.providerSyncRepository.enqueueJob.mockResolvedValue({ id: SYNC_ID, status: "queued" });
    mocks.repositories.oauthStates.deleteByState.mockResolvedValue(undefined);

    await expect(
      caller.storeIntegration({
        userId: OTHER_USER_ID,
        provider: "wahoo",
        externalId: "wahoo-user-42",
        accessToken: "access-42",
        refreshToken: "refresh-42",
        expiresAt: "2026-04-02T12:00:00.000Z",
        scope: "user_read workouts_read",
        state: STATE_ID,
      }),
    ).resolves.toEqual({ success: true });

    expect(mocks.providerSyncRepository.enqueueJob).toHaveBeenCalledWith({
      dedupeKey: "provider-history-reconcile:77777777-7777-4777-8777-777777777777:activity",
      integrationId: "77777777-7777-4777-8777-777777777777",
      jobType: "wahoo.activity_history_reconcile",
      payload: {
        trigger: "connect",
        windowMonths: 12,
      },
      profileId: OTHER_USER_ID,
      provider: "wahoo",
      resourceKind: "activity",
      runAt: "2026-04-02T09:30:00.000Z",
    });
    expect(mocks.repositories.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("deleteOAuthState deletes the supplied state token", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteByState.mockResolvedValue(undefined);

    await expect(caller.deleteOAuthState({ state: STATE_ID })).resolves.toEqual({ success: true });
    expect(mocks.repositories.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });
});
