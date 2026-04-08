import { TRPCError } from "@trpc/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const FEED_ID = "44444444-4444-4444-8444-444444444444";
const STATE_ID = "55555555-5555-4555-8555-555555555555";
const SYNC_ID = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => {
  const repositories = {
    integrations: {
      listByProfileId: vi.fn(),
      findByProfileIdAndProvider: vi.fn(),
      updateTokensByProfileIdAndProvider: vi.fn(),
      deleteByProfileIdAndProvider: vi.fn(),
      upsertByProfileIdAndProvider: vi.fn(),
    },
    oauthStates: {
      deleteExpired: vi.fn(),
      create: vi.fn(),
      deleteCreatedBefore: vi.fn(),
      findValidByState: vi.fn(),
      deleteByState: vi.fn(),
    },
  };

  return {
    repositories,
    createIntegrationsRepositories: vi.fn(() => repositories),
    createIcalFeedRepository: vi.fn((input) => ({ kind: "ical-repository", input })),
    createWahooRepository: vi.fn((input) => ({ kind: "wahoo-repository", input })),
    createWahooRouteStorage: vi.fn((storage) => storage),
    getApiStorageService: vi.fn(() => ({
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(),
        })),
      },
    })),
    ical: {
      instances: [] as Array<{ repository: unknown }>,
      syncFeed: vi.fn(),
      listFeeds: vi.fn(),
      removeFeed: vi.fn(),
    },
    wahoo: {
      instances: [] as Array<{ deps: unknown }>,
      syncEvent: vi.fn(),
      unsyncEvent: vi.fn(),
      getEventSyncStatus: vi.fn(),
    },
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: mocks.createIntegrationsRepositories,
  createIcalFeedRepository: mocks.createIcalFeedRepository,
  createWahooRepository: mocks.createWahooRepository,
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
    publicIntegrationsRowSchema: z
      .object({
        id: z.string().uuid(),
        idx: z.number().int(),
        profile_id: z.string().uuid(),
        provider: publicIntegrationProviderSchema,
        external_id: z.string().min(1),
        access_token: z.string().min(1),
        refresh_token: z.string().min(1).nullable(),
        expires_at: z.date().nullable(),
        scope: z.string().min(1).nullable(),
        created_at: z.date(),
        updated_at: z.date(),
      })
      .passthrough(),
  };
});

vi.mock("../../storage-service", () => ({
  getApiStorageService: mocks.getApiStorageService,
}));

vi.mock("../../lib/integrations/ical/sync-service", () => {
  class MockIcalSyncError extends Error {
    code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR";

    constructor(message: string, code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR") {
      super(message);
      this.name = "IcalSyncError";
      this.code = code;
    }
  }

  class MockIcalSyncService {
    repository: unknown;

    constructor(repository: unknown) {
      this.repository = repository;
      mocks.ical.instances.push({ repository });
    }

    syncFeed(...args: Parameters<typeof mocks.ical.syncFeed>) {
      return mocks.ical.syncFeed(...args);
    }

    listFeeds(...args: Parameters<typeof mocks.ical.listFeeds>) {
      return mocks.ical.listFeeds(...args);
    }

    removeFeed(...args: Parameters<typeof mocks.ical.removeFeed>) {
      return mocks.ical.removeFeed(...args);
    }
  }

  return {
    IcalSyncError: MockIcalSyncError,
    IcalSyncService: MockIcalSyncService,
  };
});

vi.mock("../../lib/integrations/wahoo/sync-service", () => ({
  createWahooRouteStorage: mocks.createWahooRouteStorage,
  WahooSyncService: class MockWahooSyncService {
    deps: unknown;

    constructor(deps: unknown) {
      this.deps = deps;
      mocks.wahoo.instances.push({ deps });
    }

    syncEvent(...args: Parameters<typeof mocks.wahoo.syncEvent>) {
      return mocks.wahoo.syncEvent(...args);
    }

    unsyncEvent(...args: Parameters<typeof mocks.wahoo.unsyncEvent>) {
      return mocks.wahoo.unsyncEvent(...args);
    }

    getEventSyncStatus(...args: Parameters<typeof mocks.wahoo.getEventSyncStatus>) {
      return mocks.wahoo.getEventSyncStatus(...args);
    }
  },
}));

import { IcalSyncError } from "../../lib/integrations/ical/sync-service";
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
    mocks.ical.instances.length = 0;
    mocks.wahoo.instances.length = 0;

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

    await expect(caller.list()).resolves.toEqual(rows);
    expect(mocks.repositories.oauthStates.deleteExpired).toHaveBeenCalledWith({
      profileId: SESSION_USER_ID,
      now: expect.any(Date),
    });
    expect(mocks.repositories.integrations.listByProfileId).toHaveBeenCalledWith(SESSION_USER_ID);
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
      caller.getAuthUrl({ provider: "strava", redirectUri: "https://example.com", extra: true } as any),
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

  it("refreshToken refreshes and persists new provider tokens", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.findByProfileIdAndProvider.mockResolvedValue({
      refresh_token: "refresh-1",
    });
    mocks.repositories.integrations.updateTokensByProfileIdAndProvider.mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );

    await expect(caller.refreshToken({ provider: "strava" })).resolves.toEqual({ success: true });
    expect(mocks.repositories.integrations.findByProfileIdAndProvider).toHaveBeenCalledWith({
      profileId: SESSION_USER_ID,
      provider: "strava",
    });
    expect(mocks.repositories.integrations.updateTokensByProfileIdAndProvider).toHaveBeenCalledWith(
      {
        profileId: SESSION_USER_ID,
        provider: "strava",
        accessToken: "access-2",
        refreshToken: "refresh-2",
        expiresAt: expect.any(Date),
      },
    );
  });

  it("refreshToken tolerates extra provider token fields", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.findByProfileIdAndProvider.mockResolvedValue({
      refresh_token: "refresh-1",
    });
    mocks.repositories.integrations.updateTokensByProfileIdAndProvider.mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: "3600",
          token_type: "Bearer",
          athlete: { id: 42 },
        }),
        { status: 200 },
      ),
    );

    await expect(caller.refreshToken({ provider: "strava" })).resolves.toEqual({ success: true });
    expect(mocks.repositories.integrations.updateTokensByProfileIdAndProvider).toHaveBeenCalledWith(
      {
        profileId: SESSION_USER_ID,
        provider: "strava",
        accessToken: "access-2",
        refreshToken: "refresh-2",
        expiresAt: expect.any(Date),
      },
    );
  });

  it("refreshToken rejects malformed provider token payloads", async () => {
    const caller = createCaller();
    mocks.repositories.integrations.findByProfileIdAndProvider.mockResolvedValue({
      refresh_token: "refresh-1",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: "refresh-2" }), { status: 200 }),
    );

    await expect(caller.refreshToken({ provider: "strava" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to refresh integration token",
    } satisfies Partial<TRPCError>);
    expect(mocks.repositories.integrations.updateTokensByProfileIdAndProvider).not.toHaveBeenCalled();
  });

  it("cleanupExpiredStates sums both cleanup strategies", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(2);
    mocks.repositories.oauthStates.deleteCreatedBefore.mockResolvedValue(3);

    await expect(caller.cleanupExpiredStates({ userId: OTHER_USER_ID })).resolves.toEqual({
      success: true,
      cleaned: 5,
    });
    expect(mocks.repositories.oauthStates.deleteExpired).toHaveBeenCalledWith({
      profileId: OTHER_USER_ID,
      now: expect.any(Date),
    });
    expect(mocks.repositories.oauthStates.deleteCreatedBefore).toHaveBeenCalledWith({
      profileId: OTHER_USER_ID,
      before: expect.any(Date),
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
    mocks.repositories.integrations.upsertByProfileIdAndProvider.mockResolvedValue(undefined);
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

    expect(mocks.repositories.integrations.upsertByProfileIdAndProvider).toHaveBeenCalledWith({
      profileId: OTHER_USER_ID,
      provider: "trainingpeaks",
      externalId: "ext-42",
      accessToken: "access-42",
      refreshToken: "refresh-42",
      expiresAt: new Date("2026-04-02T12:00:00.000Z"),
      scope: "activities:read",
    });
    expect(mocks.repositories.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("deleteOAuthState deletes the supplied state token", async () => {
    const caller = createCaller();
    mocks.repositories.oauthStates.deleteByState.mockResolvedValue(undefined);

    await expect(caller.deleteOAuthState({ state: STATE_ID })).resolves.toEqual({ success: true });
    expect(mocks.repositories.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("ical.addFeed syncs a new feed for the signed-in user", async () => {
    const caller = createCaller();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(FEED_ID);
    mocks.ical.syncFeed.mockResolvedValue({
      feed_id: FEED_ID,
      feed_url: "https://example.com/calendar.ics",
      imported: 2,
      updated: 0,
      removed: 0,
      synced_at: "2026-04-01T10:00:00.000Z",
      cache_tags: ["integrations.ical.feeds"],
    });

    await expect(
      caller.ical.addFeed({ url: "https://example.com/calendar.ics" }),
    ).resolves.toMatchObject({ feed_id: FEED_ID, imported: 2 });
    expect(mocks.ical.syncFeed).toHaveBeenCalledWith({
      profileId: SESSION_USER_ID,
      feedId: FEED_ID,
      feedUrl: "https://example.com/calendar.ics",
    });
  });

  it("ical.listFeeds lists feeds for the signed-in user", async () => {
    const caller = createCaller();
    const feeds = [
      {
        feed_id: FEED_ID,
        feed_url: "https://example.com/calendar.ics",
        event_count: 3,
        last_event_updated_at: "2026-04-01T10:00:00.000Z",
      },
    ];
    mocks.ical.listFeeds.mockResolvedValue(feeds);

    await expect(caller.ical.listFeeds({})).resolves.toEqual(feeds);
    expect(mocks.ical.listFeeds).toHaveBeenCalledWith(SESSION_USER_ID);
  });

  it("ical.listFeeds rejects malformed service output", async () => {
    const caller = createCaller();
    mocks.ical.listFeeds.mockResolvedValue([
      {
        feed_id: FEED_ID,
        feed_url: "https://example.com/calendar.ics",
        event_count: "3",
        last_event_updated_at: "2026-04-01T10:00:00.000Z",
      },
    ]);

    await expect(caller.ical.listFeeds({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "iCal sync service returned invalid feed list data",
    } satisfies Partial<TRPCError>);
  });

  it("ical.updateFeed maps sync errors to TRPC errors", async () => {
    const caller = createCaller();
    mocks.ical.syncFeed.mockRejectedValue(new IcalSyncError("Invalid iCal feed", "BAD_REQUEST"));

    await expect(
      caller.ical.updateFeed({
        feed_id: FEED_ID,
        url: "https://example.com/updated.ics",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid iCal feed",
    } satisfies Partial<TRPCError>);
  });

  it("ical.removeFeed defaults purge_events to true", async () => {
    const caller = createCaller();
    mocks.ical.removeFeed.mockResolvedValue({
      success: true,
      removed_events: 4,
      cache_tags: ["integrations.ical.feeds", "events.imported"],
    });

    await expect(caller.ical.removeFeed({ feed_id: FEED_ID })).resolves.toMatchObject({
      success: true,
      removed_events: 4,
    });
    expect(mocks.ical.removeFeed).toHaveBeenCalledWith({
      profileId: SESSION_USER_ID,
      feedId: FEED_ID,
      purgeEvents: true,
    });
  });

  it("wahoo.syncEvent returns the sync result", async () => {
    const caller = createCaller();
    mocks.wahoo.syncEvent.mockResolvedValue({
      success: true,
      action: "created",
      workoutId: "workout-1",
    });

    await expect(caller.wahoo.syncEvent({ eventId: EVENT_ID })).resolves.toEqual({
      success: true,
      action: "created",
      workoutId: "workout-1",
    });
    expect(mocks.wahoo.syncEvent).toHaveBeenCalledWith(EVENT_ID, SESSION_USER_ID);
  });

  it("wahoo.unsyncEvent maps failed unsyncs to BAD_REQUEST", async () => {
    const caller = createCaller();
    mocks.wahoo.unsyncEvent.mockResolvedValue({
      success: false,
      action: "no_change",
      error: "Unable to unsync workout",
    });

    await expect(caller.wahoo.unsyncEvent({ eventId: EVENT_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Unable to unsync workout",
    } satisfies Partial<TRPCError>);
  });

  it("wahoo.getEventSyncStatus returns sync status details", async () => {
    const caller = createCaller();
    mocks.wahoo.getEventSyncStatus.mockResolvedValue({
      id: SYNC_ID,
      externalId: "workout-1",
      updatedAt: new Date("2026-04-03T09:15:00.000Z"),
    });

    await expect(caller.wahoo.getEventSyncStatus({ eventId: EVENT_ID })).resolves.toEqual({
      synced: true,
      provider: "wahoo",
      externalId: "workout-1",
      id: SYNC_ID,
      updatedAt: "2026-04-03T09:15:00.000Z",
      syncedAt: null,
    });
    expect(mocks.wahoo.getEventSyncStatus).toHaveBeenCalledWith(EVENT_ID, SESSION_USER_ID);
  });

  it("wahoo.syncEvent rejects malformed sync results", async () => {
    const caller = createCaller();
    mocks.wahoo.syncEvent.mockResolvedValue({
      success: true,
      action: "created",
      workoutId: 42,
    });

    await expect(caller.wahoo.syncEvent({ eventId: EVENT_ID })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Wahoo sync service returned invalid sync data",
    } satisfies Partial<TRPCError>);
  });

  it("wahoo.testSync returns sync diagnostics with a timestamp", async () => {
    const caller = createCaller();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T09:15:00.000Z"));
    mocks.wahoo.syncEvent.mockResolvedValue({
      success: true,
      action: "updated",
      workoutId: "workout-9",
      warnings: ["Route omitted"],
      error: undefined,
    });

    await expect(caller.wahoo.testSync({ eventId: EVENT_ID })).resolves.toEqual({
      success: true,
      action: "updated",
      workoutId: "workout-9",
      error: undefined,
      warnings: ["Route omitted"],
      timestamp: "2026-04-03T09:15:00.000Z",
    });

    vi.useRealTimers();
  });
});
