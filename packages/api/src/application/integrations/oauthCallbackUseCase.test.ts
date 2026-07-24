import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DrizzleTransactionClient } from "../../db";
import { getProviderOAuthConfig } from "../../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
} from "../../lib/integrations/oauth-pkce";
import type { IntegrationsRepositories } from "../../repositories/integrations-repository";
import type { ProviderSyncRepository } from "../../repositories/provider-sync-repository";
import { handleOAuthCallback } from "./oauthCallbackUseCase";

const STATE_ID = "55555555-5555-4555-8555-555555555555";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "77777777-7777-4777-8777-777777777777";
const originalEnv = { ...process.env };

function createDependencies(provider: "wahoo" | "strava" = "wahoo") {
  let available = true;
  const transaction = { kind: "test-transaction" } as unknown as DrizzleTransactionClient;
  const oauthStates = {
    deleteByState: vi.fn(async () => {
      available = false;
    }),
    findValidByState: vi.fn(async () =>
      available
        ? {
            profile_id: PROFILE_ID,
            provider,
            mobile_redirect_uri: "http://localhost:3000/integrations",
          }
        : null,
    ),
  };
  const integrations = {
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
  const runInTransaction = async <T>(operation: (value: DrizzleTransactionClient) => Promise<T>) =>
    operation(transaction);
  return {
    repositories: { integrations, oauthStates } as unknown as IntegrationsRepositories,
    providerSyncRepository: providerSyncRepository as unknown as ProviderSyncRepository,
    runInTransaction,
    integrations,
    oauthStates,
    providerSyncRepositoryMock: providerSyncRepository,
    transaction,
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
    );
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
  });

  it("finishes remote token exchange before opening the persistence transaction", async () => {
    useRemoteWahooConfig();
    const order: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
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

    expect(order).toEqual(["token_exchange", "transaction"]);
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
