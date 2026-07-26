import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const STATE_ID = "55555555-5555-4555-8555-555555555555";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  getProviderSyncOverview: vi.fn(),
  syncIntegrationNow: vi.fn(),
  refreshSetupData: vi.fn(),
  providerSyncRepository: { requestWahooDisconnect: vi.fn() },
  repositories: {
    integrations: { deleteByProfileIdAndProvider: vi.fn(), listByProfileId: vi.fn() },
    oauthStates: { create: vi.fn(), deleteExpired: vi.fn() },
  },
}));

vi.mock("../../application/integrations", () => ({
  getProviderSyncOverview: mocks.getProviderSyncOverview,
  syncIntegrationNow: mocks.syncIntegrationNow,
}));
vi.mock("../../application/onboarding-provider-enrichment", () => ({
  OnboardingProviderEnrichmentService: class {
    refreshSetupData(...args: Parameters<typeof mocks.refreshSetupData>) {
      return mocks.refreshSetupData(...args);
    }
  },
}));
vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => mocks.repositories),
  createProviderSyncRepository: vi.fn(() => mocks.providerSyncRepository),
}));
vi.mock("@repo/db", () => ({
  publicIntegrationProviderSchema: z.enum(["strava", "wahoo", "trainingpeaks", "garmin", "zwift"]),
  publicIntegrationsRowSchema: z.object({
    id: z.string().uuid(),
    profile_id: z.string().uuid(),
    provider: z.enum(["strava", "wahoo", "trainingpeaks", "garmin", "zwift"]),
    external_id: z.string(),
    created_at: z.date(),
    updated_at: z.date(),
  }),
}));

import { integrationsRouter } from "../integrations";

function createCaller() {
  return integrationsRouter.createCaller({
    db: {},
    session: { user: { id: PROFILE_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

const originalEnv = { ...process.env };

describe("integrationsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OAUTH_CALLBACK_BASE_URL = "https://app.example.com";
    process.env.OAUTH_MOBILE_CALLBACK_URL = "gradientpeak://integrations";
    process.env.WAHOO_CLIENT_ID = "wahoo-client-id";
    process.env.WAHOO_CLIENT_SECRET = "wahoo-client-secret";
    mocks.repositories.oauthStates.deleteExpired.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exposes only the six live integration leaves", () => {
    expect(Object.keys(integrationsRouter._def.procedures).sort()).toEqual([
      "disconnect",
      "getAuthUrl",
      "getSyncOverview",
      "list",
      "refreshSetupData",
      "syncNow",
    ]);
  });

  it("preserves list cleanup and its public row contract", async () => {
    mocks.repositories.integrations.listByProfileId.mockResolvedValue([
      {
        id: INTEGRATION_ID,
        profile_id: PROFILE_ID,
        provider: "wahoo",
        external_id: "42",
        created_at: new Date("2026-04-01T10:00:00.000Z"),
        updated_at: new Date("2026-04-01T11:00:00.000Z"),
      },
    ]);
    await expect(createCaller().list()).resolves.toHaveLength(1);
    expect(mocks.repositories.oauthStates.deleteExpired).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      now: expect.any(Date),
    });
  });

  it("preserves getAuthUrl and disconnect contracts", async () => {
    delete process.env.OAUTH_MOBILE_CALLBACK_URL;
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(STATE_ID);
    mocks.repositories.oauthStates.create.mockResolvedValue(undefined);
    mocks.repositories.integrations.deleteByProfileIdAndProvider.mockResolvedValue(undefined);
    const caller = createCaller();

    const authorization = await caller.getAuthUrl({
      provider: "wahoo",
      redirectUri: "gradientpeak-dev://integrations",
    });
    expect(authorization).toMatchObject({ state: STATE_ID });
    const authorizationUrl = new URL(authorization.url);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/integrations/callback/wahoo",
    );
    expect(authorizationUrl.searchParams.has("code_challenge")).toBe(false);
    expect(authorizationUrl.searchParams.has("code_challenge_method")).toBe(false);
    expect(mocks.repositories.oauthStates.create).toHaveBeenCalledWith(
      expect.objectContaining({ mobileRedirectUri: "gradientpeak-dev://integrations" }),
    );
    await expect(caller.disconnect({ provider: "wahoo" })).resolves.toEqual({ success: true });
  });

  it("defaults an omitted OAuth return to the installed development scheme", async () => {
    delete process.env.OAUTH_MOBILE_CALLBACK_URL;
    mocks.repositories.oauthStates.create.mockResolvedValue(undefined);

    await expect(createCaller().getAuthUrl({ provider: "wahoo" })).resolves.toMatchObject({
      state: expect.any(String),
    });
    expect(mocks.repositories.oauthStates.create).toHaveBeenCalledWith(
      expect.objectContaining({ mobileRedirectUri: "gradientpeak-dev://integrations" }),
    );
  });

  it("rejects an attacker-controlled OAuth return URI before storing state", async () => {
    await expect(
      createCaller().getAuthUrl({
        provider: "wahoo",
        redirectUri: "https://attacker.example/integrations",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.repositories.oauthStates.create).not.toHaveBeenCalled();
  });

  it("preserves a recoverable unqueued sync result at the public boundary", async () => {
    mocks.syncIntegrationNow.mockResolvedValue({ jobId: null, queued: false, setupRefresh: null });

    await expect(createCaller().syncNow({ provider: "wahoo" })).resolves.toEqual({
      jobId: null,
      queued: false,
      setupRefresh: null,
    });
  });
});
