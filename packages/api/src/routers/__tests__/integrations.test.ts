import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createRouterCaller } from "../../test/router";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const STATE_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => ({
  IntegrationDisconnectPendingError: class IntegrationDisconnectPendingError extends Error {},
  assertIntegrationManagementOpen: vi.fn(),
  cancelPendingOAuthWithFence: vi.fn(),
  createPendingOAuthStateWithFence: vi.fn(),
  getProviderSyncOverview: vi.fn(),
  syncIntegrationNow: vi.fn(),
  refreshSetupData: vi.fn(),
  getSetupData: vi.fn(),
  requireProviderOAuthAuthorizationRuntime: vi.fn(),
  providerRuntimeComponents: {
    createOAuthAuthorization: vi.fn(),
    disconnect: vi.fn(),
    isOAuthConfigured: vi.fn(),
    readSetupEvidence: vi.fn(),
    refreshSetupEvidence: vi.fn(),
    syncNow: vi.fn(),
  },
  providerSyncRepository: { requestWahooDisconnect: vi.fn() },
  repositories: {
    integrations: { deleteByProfileIdAndProvider: vi.fn(), listByProfileId: vi.fn() },
    oauthStates: { create: vi.fn(), deleteExpired: vi.fn() },
  },
}));

vi.mock("../../application/integrations", () => ({
  assertIntegrationManagementOpen: mocks.assertIntegrationManagementOpen,
  cancelPendingOAuthWithFence: mocks.cancelPendingOAuthWithFence,
  createPendingOAuthStateWithFence: mocks.createPendingOAuthStateWithFence,
  IntegrationDisconnectPendingError: mocks.IntegrationDisconnectPendingError,
  IntegrationOnboardingClosedError: class IntegrationOnboardingClosedError extends Error {},
  getProviderSyncOverview: mocks.getProviderSyncOverview,
  getProviderSetupRuntime: vi.fn(() => mocks.providerRuntimeComponents),
  requireProviderDisconnectionRuntime: vi.fn(() => mocks.providerRuntimeComponents),
  requireProviderOAuthAuthorizationRuntime: mocks.requireProviderOAuthAuthorizationRuntime,
  requireProviderSetupRuntime: vi.fn(() => mocks.providerRuntimeComponents),
  requireProviderSynchronizationRuntime: vi.fn(() => mocks.providerRuntimeComponents),
  ProviderRuntimeUnavailableError: class ProviderRuntimeUnavailableError extends Error {},
}));
vi.mock("../../application/wahoo-profile-setup-service", () => ({
  WahooProfileSetupService: class {
    getSetupData(...args: Parameters<typeof mocks.getSetupData>) {
      return mocks.getSetupData(...args);
    }
    refreshSetupData(...args: Parameters<typeof mocks.refreshSetupData>) {
      return mocks.refreshSetupData(...args);
    }
  },
}));
vi.mock("../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => mocks.repositories),
  createWahooSyncRepository: vi.fn(() => mocks.providerSyncRepository),
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

import { attachProviderSetupEvidence, integrationsRouter } from "../integrations";

function createCaller() {
  return createRouterCaller(integrationsRouter, { db: {}, userId: PROFILE_ID });
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
    mocks.cancelPendingOAuthWithFence.mockResolvedValue({ cancelled: 0 });
    mocks.createPendingOAuthStateWithFence.mockResolvedValue(undefined);
    mocks.assertIntegrationManagementOpen.mockResolvedValue(undefined);
    mocks.repositories.integrations.listByProfileId.mockResolvedValue([]);
    mocks.getProviderSyncOverview.mockResolvedValue([]);
    mocks.getSetupData.mockResolvedValue({
      profile: { dob: null, gender: null, onboarding_status: "provider_selection" },
      sources: {},
      values: {},
    });
    mocks.providerRuntimeComponents.isOAuthConfigured.mockReturnValue(true);
    mocks.requireProviderOAuthAuthorizationRuntime.mockReturnValue({
      kind: "oauth2",
      provider: "wahoo",
      ...mocks.providerRuntimeComponents,
    });
    mocks.providerRuntimeComponents.createOAuthAuthorization.mockImplementation(({ state }) => ({
      binding: {
        callbackUri: "https://app.example.com/api/integrations/callback/wahoo",
        requestedScope: "user_read workouts_read offline_data",
        verifierHash: "binding-hash",
      },
      url: `https://api.wahooligan.com/oauth/authorize?state=${state}&redirect_uri=${encodeURIComponent("https://app.example.com/api/integrations/callback/wahoo")}`,
    }));
    mocks.providerRuntimeComponents.readSetupEvidence.mockImplementation(() =>
      mocks.getSetupData(),
    );
    mocks.providerRuntimeComponents.refreshSetupEvidence.mockImplementation(() =>
      mocks.refreshSetupData(),
    );
    mocks.providerRuntimeComponents.syncNow.mockImplementation(() => mocks.syncIntegrationNow());
    mocks.providerRuntimeComponents.disconnect.mockImplementation(() =>
      mocks.providerSyncRepository.requestWahooDisconnect(),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exposes the live integration leaves", () => {
    expect(Object.keys(integrationsRouter._def.procedures).sort()).toEqual([
      "cancelPendingOAuth",
      "disconnect",
      "getAuthUrl",
      "getSyncOverview",
      "refreshSetupData",
      "syncNow",
    ]);
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
    expect(mocks.createPendingOAuthStateWithFence).toHaveBeenCalledWith(
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
    expect(mocks.createPendingOAuthStateWithFence).toHaveBeenCalledWith(
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

  it("allows only the exact same-origin onboarding web return", async () => {
    await expect(
      createCaller().getAuthUrl({
        provider: "wahoo",
        redirectUri: "https://app.example.com/onboarding",
      }),
    ).resolves.toMatchObject({ state: expect.any(String) });
    for (const redirectUri of [
      "https://app.example.com/onboarding/child",
      "https://app.example.com/onboarding?redirect=/activities",
      "https://app.example.com/onboarding#return",
    ]) {
      await expect(
        createCaller().getAuthUrl({ provider: "wahoo", redirectUri }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("rejects OAuth initiation while the provider disconnect is pending", async () => {
    mocks.createPendingOAuthStateWithFence.mockRejectedValueOnce(
      new mocks.IntegrationDisconnectPendingError(),
    );

    await expect(
      createCaller().getAuthUrl({
        provider: "wahoo",
        redirectUri: "gradientpeak://integrations",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects OAuth initiation when no OAuth-only runtime is available", async () => {
    const application = await import("../../application/integrations");
    mocks.requireProviderOAuthAuthorizationRuntime.mockImplementationOnce(() => {
      throw new application.ProviderRuntimeUnavailableError("wahoo");
    });

    await expect(createCaller().getAuthUrl({ provider: "wahoo" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Integration is not configured on this server",
    });
    expect(mocks.createPendingOAuthStateWithFence).not.toHaveBeenCalled();
  });

  it("rejects an unqueued sync result at the public boundary", async () => {
    mocks.syncIntegrationNow.mockResolvedValue({ jobId: null, queued: false, setupRefresh: null });

    await expect(createCaller().syncNow({ provider: "wahoo" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Sync now result was invalid",
    });
  });

  it("rejects setup refresh for a disabled adapter before invoking the service", async () => {
    const unavailable = new Error("not executable");
    const application = await import("../../application/integrations");
    vi.mocked(application.requireProviderSetupRuntime).mockImplementationOnce(() => {
      throw unavailable;
    });

    await expect(createCaller().refreshSetupData({ provider: "wahoo" })).rejects.toBeTruthy();
    expect(mocks.refreshSetupData).not.toHaveBeenCalled();
  });

  it("attaches provider-specific setup evidence only to its matching catalog item", async () => {
    const base = {
      actions: [],
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
      providerHealth: { lastError: null, status: "disconnected" },
      configured: true,
      onboarding: {
        summary: "Import profile details and activity history.",
        evidence: { activityHistory: true, profileDetails: true },
      },
      setupData: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        status: "idle",
      },
      connected: false,
      integrationId: null,
      primaryAction: "connect",
      summary: {
        badge: "Ready",
        health: "unavailable",
        subtitle: "Connect",
        title: "Provider",
      },
    } as const;
    const setupData = {
      profile: { dob: "1990-01-01", gender: null, onboarding_status: "provider_selection" },
      sources: { dob: { label: "Wahoo" } },
      values: { dob: "1990-01-01" },
    };
    const result = attachProviderSetupEvidence({
      overview: [
        { ...base, provider: "wahoo", label: "Wahoo" },
        { ...base, provider: "future", label: "Future" },
      ],
      setupEvidence: new Map([
        ["wahoo", setupData],
        ["future", null],
      ]),
    });
    expect(result[0]?.setupData.values).toEqual({ dob: "1990-01-01" });
    expect(result[0]?.setupData.sources).toEqual({ dob: { label: "Wahoo" } });
    expect(result[1]?.setupData.values).toEqual({});
    expect(result[1]?.setupData.sources).toEqual({});
  });
});
