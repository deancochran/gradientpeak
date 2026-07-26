import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DrizzleTransactionClient } from "../../db";
import { getProviderOAuthConfig } from "../../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
} from "../../lib/integrations/oauth-pkce";
import { createOAuthStateBinding } from "../../lib/integrations/oauth-state-binding";
import {
  IntegrationDisconnectPendingError,
  IntegrationLifecycleChangedError,
  type IntegrationsRepositories,
} from "../../repositories/integrations-repository";
import type { ProviderSyncRepository } from "../../repositories/provider-sync-repository";
import { handleOAuthCallback } from "./oauthCallbackUseCase";

const STATE_ID = "55555555-5555-4555-8555-555555555555";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";
const originalEnv = { ...process.env };

function createDependencies(
  provider: "wahoo" | "strava" = "wahoo",
  bindingOverride: Partial<{
    callback_uri: string;
    requested_scope: string;
    verifier_hash: string;
  }> = {},
) {
  let available = true;
  const config = getProviderOAuthConfig(provider);
  const transaction = { kind: "test-transaction" } as unknown as DrizzleTransactionClient;
  const oauthStates = {
    deleteByState: vi.fn(async () => {
      available = false;
    }),
    findValidByState: vi.fn(async () =>
      available
        ? {
            ...(config
              ? Object.fromEntries(
                  Object.entries(
                    createOAuthStateBinding({
                      config,
                      provider,
                      state: STATE_ID,
                    }),
                  ).map(([key, value]) => [
                    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
                    value,
                  ]),
                )
              : {}),
            ...bindingOverride,
            profile_id: PROFILE_ID,
            provider,
            mobile_redirect_uri: "http://localhost:3000/integrations",
          }
        : null,
    ),
  };
  const integrations = {
    listByProfileId: vi.fn(async () => []),
    upsertFromOAuthStateInTransaction: vi.fn(async () => {
      if (!available) return null;
      available = false;
      return { id: INTEGRATION_ID };
    }),
  };
  const providerSyncRepository = {
    enqueueJobInTransaction: vi.fn(async () => ({
      id: "66666666-6666-4666-8666-666666666666",
      status: "queued",
    })),
  };
  let transactionCallCount = 0;
  const runInTransaction = async <T>(
    operation: (value: DrizzleTransactionClient) => Promise<T>,
  ) => {
    transactionCallCount += 1;
    return operation(transaction);
  };
  return {
    repositories: { integrations, oauthStates } as unknown as IntegrationsRepositories,
    providerSyncRepository: providerSyncRepository as unknown as ProviderSyncRepository,
    runInTransaction,
    integrations,
    oauthStates,
    providerSyncRepositoryMock: providerSyncRepository,
    transaction,
    getTransactionCallCount: () => transactionCallCount,
  };
}

function createLocalCode() {
  const config = getProviderOAuthConfig("wahoo");
  if (!config) throw new Error("local adapter was not configured");
  return issueLocalOAuthAuthorizationCode({
    challenge: createOAuthCodeChallenge(
      deriveOAuthCodeVerifier({
        clientSecret: config.clientSecret,
        provider: "wahoo",
        state: STATE_ID,
      }),
    ),
    config,
    provider: "wahoo",
  });
}

function useRemoteWahooConfig() {
  delete process.env.PROVIDER_OAUTH_TEST_ADAPTER;
  process.env.WAHOO_CLIENT_ID = "wahoo-client-id";
  process.env.WAHOO_CLIENT_SECRET = "wahoo-client-secret";
}

function useRemoteStravaConfig() {
  delete process.env.PROVIDER_OAUTH_TEST_ADAPTER;
  process.env.STRAVA_CLIENT_ID = "strava-client-id";
  process.env.STRAVA_CLIENT_SECRET = "strava-client-secret";
}

describe("OAuth callback use case", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.PROVIDER_OAUTH_TEST_ADAPTER = "1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("atomically consumes state while storing credentials and enqueues Wahoo history", async () => {
    const deps = createDependencies();
    const code = createLocalCode();

    const result = await handleOAuthCallback({
      ...deps,
      code,
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("integration")).toBe("connected");
    expect(result.redirectUrl).not.toContain(code);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).toHaveBeenCalledWith(
      deps.transaction,
      expect.objectContaining({
        state: STATE_ID,
        expectedIntegration: { kind: "absent" },
        profileId: PROFILE_ID,
        provider: "wahoo",
        accessToken: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
    expect(deps.providerSyncRepositoryMock.enqueueJobInTransaction).toHaveBeenCalledWith(
      deps.transaction,
      expect.objectContaining({
        integrationId: INTEGRATION_ID,
        profileId: PROFILE_ID,
        provider: "wahoo",
        payload: { trigger: "connect", windowMonths: 12 },
      }),
    );
  });

  it("rejects a provider mismatch and clears the stored state", async () => {
    const deps = createDependencies("strava");
    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("invalid_state");
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["callback", { callback_uri: "https://attacker.example/callback" }],
    ["scope", { requested_scope: "workouts_read" }],
    ["verifier", { verifier_hash: "not-a-verifier-hash" }],
  ])("consumes a %s-bound state before token exchange", async (_name, bindingOverride) => {
    const deps = createDependencies("wahoo", bindingOverride);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("invalid_state");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
    expect(result.redirectUrl).not.toContain("wahoo-client-secret");
  });

  it("rejects a replay after the atomic consume", async () => {
    const deps = createDependencies();
    const code = createLocalCode();
    await handleOAuthCallback({
      ...deps,
      code,
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    const replay = await handleOAuthCallback({
      ...deps,
      code,
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(replay.redirectUrl).searchParams.get("error")).toBe("invalid_state");
    expect(deps.integrations.upsertFromOAuthStateInTransaction).toHaveBeenCalledTimes(1);
  });

  it("cleans up state when credential storage fails", async () => {
    const deps = createDependencies();
    deps.integrations.upsertFromOAuthStateInTransaction.mockRejectedValueOnce(
      new Error("persistence unavailable"),
    );
    const result = await handleOAuthCallback({
      ...deps,
      code: createLocalCode(),
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("store_integration_failed");
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("returns an actionable error for Wahoo's unrevoked access-token limit", async () => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Maximum unrevoked access token limit exceeded",
        }),
        { status: 400 },
      ),
    );
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get("error")).toBe("wahoo_token_limit_exceeded");
    expect(redirect.searchParams.has("error_detail")).toBe(false);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
  });

  it("returns a generic failure when provider-account ownership conflicts", async () => {
    const deps = createDependencies();
    deps.integrations.upsertFromOAuthStateInTransaction.mockRejectedValueOnce(
      new Error(
        'duplicate key value violates unique constraint "integrations_provider_external_id_unique"',
      ),
    );
    const result = await handleOAuthCallback({
      ...deps,
      code: createLocalCode(),
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get("error")).toBe("store_integration_failed");
    expect(redirect.toString()).not.toContain("integrations_provider_external_id_unique");
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("reports a pending disconnect without activating the integration", async () => {
    const deps = createDependencies();
    deps.integrations.upsertFromOAuthStateInTransaction.mockRejectedValueOnce(
      new IntegrationDisconnectPendingError(),
    );
    const result = await handleOAuthCallback({
      ...deps,
      code: createLocalCode(),
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get("error")).toBe("disconnect_in_progress");
    expect(redirect.searchParams.get("integration")).toBe("failed");
    expect(deps.providerSyncRepositoryMock.enqueueJobInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("rejects a lifecycle change that races the provider token exchange", async () => {
    const deps = createDependencies();
    deps.integrations.upsertFromOAuthStateInTransaction.mockRejectedValueOnce(
      new IntegrationLifecycleChangedError(),
    );
    const result = await handleOAuthCallback({
      ...deps,
      code: createLocalCode(),
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("integration_state_changed");
    expect(deps.providerSyncRepositoryMock.enqueueJobInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("does not redeem a provider code while disconnect is already pending", async () => {
    useRemoteWahooConfig();
    const deps = createDependencies();
    deps.integrations.listByProfileId.mockResolvedValueOnce([
      {
        generation: 2,
        lifecycle_status: "disconnect_pending",
        provider: "wahoo",
      },
    ] as never);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("disconnect_in_progress");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("does not report a connected integration when the initial history enqueue fails", async () => {
    const deps = createDependencies();
    deps.providerSyncRepositoryMock.enqueueJobInTransaction.mockRejectedValueOnce(
      new Error("provider_sync_jobs unavailable"),
    );

    const result = await handleOAuthCallback({
      ...deps,
      code: createLocalCode(),
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get("error")).toBe("store_integration_failed");
    expect(redirect.searchParams.get("success")).toBeNull();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it.each([
    { access_token: "", athlete: { id: 42 } },
    { access_token: "access-token", athlete: { id: 42 }, expires_in: "not-a-duration" },
  ])("rejects malformed remote token responses before persistence", async (tokenResponse) => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(tokenResponse), { status: 200 }),
    );
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("token_exchange_failed");
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("normalizes compatible remote expiry strings and tolerates extra provider fields", async () => {
    useRemoteWahooConfig();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "remote-access-token",
            athlete: { id: 42 },
            expires_in: "3600",
            provider_specific_metadata: { ignored: true },
            refresh_token: null,
            scope: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42 }), { status: 200 }));
    const deps = createDependencies();

    await expect(
      handleOAuthCallback({
        ...deps,
        code: "provider-code",
        error: null,
        fallbackRedirect: "http://localhost:3000/integrations",
        provider: "wahoo",
        state: STATE_ID,
      }),
    ).resolves.toMatchObject({ status: 302 });

    expect(deps.integrations.upsertFromOAuthStateInTransaction).toHaveBeenCalledWith(
      deps.transaction,
      expect.objectContaining({
        accessToken: "remote-access-token",
        expiresAt: expect.any(Date),
        refreshToken: null,
        scope: null,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, request] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(request?.headers);
    const body = new URLSearchParams(String(request?.body));
    expect(headers.has("Authorization")).toBe(false);
    expect(body.get("client_id")).toBe("wahoo-client-id");
    expect(body.get("client_secret")).toBe("wahoo-client-secret");
    expect(body.get("redirect_uri")).toBe("http://localhost:3000/api/integrations/callback/wahoo");
    expect(body.has("code_verifier")).toBe(false);
  });

  it("fails closed when a supplied token identity is malformed", async () => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "remote-access-token", athlete: { id: "   " } }),
        {
          status: 200,
        },
      ),
    );
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("provider_identity_failed");
    expect(deps.getTransactionCallCount()).toBe(0);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.providerSyncRepositoryMock.enqueueJobInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("uses a valid Wahoo profile identity when the token omits one", async () => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "remote-access-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "  wahoo-account-42  " }), { status: 200 }),
      );
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("integration")).toBe("connected");
    expect(deps.integrations.upsertFromOAuthStateInTransaction).toHaveBeenCalledWith(
      deps.transaction,
      expect.objectContaining({ externalId: "wahoo-account-42" }),
    );
  });

  it.each([
    ["missing", new Response(JSON.stringify({}), { status: 200 })],
    ["invalid", new Response("not json", { status: 200 })],
    ["non-2xx", new Response(null, { status: 401 })],
  ])("fails closed when the Wahoo profile identity response is %s", async (_case, profileResponse) => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "remote-access-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(profileResponse);
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("provider_identity_failed");
    expect(deps.getTransactionCallCount()).toBe(0);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.providerSyncRepositoryMock.enqueueJobInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("fails closed when fetching the Wahoo profile identity fails", async () => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "remote-access-token" }), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("provider_identity_failed");
    expect(deps.getTransactionCallCount()).toBe(0);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.providerSyncRepositoryMock.enqueueJobInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
  });

  it("fails closed when a non-Wahoo token omits the provider identity", async () => {
    useRemoteStravaConfig();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: "remote-access-token" }), { status: 200 }),
      );
    const deps = createDependencies("strava");

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "strava",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("provider_identity_failed");
    expect(deps.getTransactionCallCount()).toBe(0);
    expect(deps.integrations.upsertFromOAuthStateInTransaction).not.toHaveBeenCalled();
    expect(deps.oauthStates.deleteByState).toHaveBeenCalledWith(STATE_ID);
    const [, request] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(request?.headers);
    const body = new URLSearchParams(String(request?.body));
    expect(headers.get("Authorization")).toMatch(/^Basic /);
    expect(body.has("client_secret")).toBe(false);
    expect(body.has("code_verifier")).toBe(true);
  });

  it("persists an identity-bearing Wahoo token before activation", async () => {
    useRemoteWahooConfig();
    const order: string[] = [];
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        order.push("token_exchange");
        return new Response(
          JSON.stringify({
            access_token: "remote-access-token",
            athlete: { id: 42 },
            expires_in: 3600,
            refresh_token: "remote-refresh-token",
            scope: "workouts_read offline_data",
          }),
          { status: 200 },
        );
      })
      .mockImplementationOnce(async () => {
        order.push("token_activation");
        return new Response(JSON.stringify({ id: 42 }), { status: 200 });
      });
    const deps = createDependencies();
    const baseRunInTransaction = deps.runInTransaction;
    const runInTransaction = async <T>(
      operation: (transaction: DrizzleTransactionClient) => Promise<T>,
    ) => {
      order.push("transaction");
      return baseRunInTransaction(operation);
    };

    await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      runInTransaction,
      state: STATE_ID,
    });

    expect(order).toEqual(["token_exchange", "transaction", "token_activation"]);
  });

  it("keeps a Wahoo connection recoverable when post-persistence activation is unavailable", async () => {
    useRemoteWahooConfig();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "remote-access-token", athlete: { id: 42 } }), {
          status: 200,
        }),
      )
      .mockRejectedValueOnce(new TypeError("provider temporarily unavailable"));
    const deps = createDependencies();

    const result = await handleOAuthCallback({
      ...deps,
      code: "provider-code",
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("integration")).toBe("connected");
    expect(deps.integrations.upsertFromOAuthStateInTransaction).toHaveBeenCalledWith(
      deps.transaction,
      expect.objectContaining({ accessToken: "remote-access-token", externalId: "42" }),
    );
  });

  it("sanitizes provider denial details before redirecting", async () => {
    const deps = createDependencies();
    const result = await handleOAuthCallback({
      ...deps,
      code: null,
      error: "access_denied: raw provider account detail",
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state: STATE_ID,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("authorization_denied");
    expect(result.redirectUrl).not.toContain("raw");
  });
});
