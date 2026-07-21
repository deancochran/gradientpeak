import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getProviderOAuthConfig } from "../../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
} from "../../lib/integrations/oauth-pkce";
import { handleOAuthCallback, type OAuthCallbackCaller } from "./oauthCallbackUseCase";

const state = "55555555-5555-4555-8555-555555555555";
const originalEnv = { ...process.env };

function createCaller() {
  let available = true;
  const caller: OAuthCallbackCaller = {
    integrations: {
      validateOAuthState: vi.fn(async () =>
        available
          ? {
              createdAt: "2026-07-20T10:00:00.000Z",
              mobileRedirectUri: "http://localhost:3000/integrations",
              provider: "wahoo" as const,
              userId: "11111111-1111-4111-8111-111111111111",
            }
          : null,
      ),
      deleteOAuthState: vi.fn(async () => {
        available = false;
        return { success: true };
      }),
      storeIntegration: vi.fn(async () => {
        available = false;
        return { success: true };
      }),
    },
  };
  return caller;
}

function createLocalCode() {
  const config = getProviderOAuthConfig("wahoo");
  if (!config) throw new Error("local adapter was not configured");
  const verifier = deriveOAuthCodeVerifier({
    clientSecret: config.clientSecret,
    provider: "wahoo",
    state,
  });
  return issueLocalOAuthAuthorizationCode({
    challenge: createOAuthCodeChallenge(verifier),
    config,
    provider: "wahoo",
  });
}

describe("OAuth callback", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.PROVIDER_OAUTH_TEST_ADAPTER = "1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("completes the local PKCE flow once and rejects replay without leaking callback material", async () => {
    const caller = createCaller();
    const code = createLocalCode();
    const first = await handleOAuthCallback({
      caller,
      code,
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state,
    });

    const firstRedirect = new URL(first.redirectUrl);
    expect(firstRedirect.searchParams.get("integration")).toBe("connected");
    expect(firstRedirect.searchParams.get("success")).toBe("true");
    expect(first.redirectUrl).not.toContain(code);
    expect(caller.integrations.storeIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "wahoo",
        scope: expect.stringContaining("workouts_read"),
        state,
      }),
    );

    const replay = await handleOAuthCallback({
      caller,
      code,
      error: null,
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state,
    });
    const replayRedirect = new URL(replay.redirectUrl);
    expect(replayRedirect.searchParams.get("error")).toBe("invalid_state");
    expect(caller.integrations.storeIntegration).toHaveBeenCalledTimes(1);
  });

  it("sanitizes provider denial details before redirecting", async () => {
    const caller = createCaller();
    const result = await handleOAuthCallback({
      caller,
      code: null,
      error: "access_denied: raw provider account detail",
      fallbackRedirect: "http://localhost:3000/integrations",
      provider: "wahoo",
      state,
    });

    expect(new URL(result.redirectUrl).searchParams.get("error")).toBe("authorization_denied");
    expect(result.redirectUrl).not.toContain("raw");
  });
});
