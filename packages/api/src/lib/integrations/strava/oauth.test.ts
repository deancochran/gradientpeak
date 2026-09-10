import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stravaProviderRuntime } from "../../../application/integrations/strava-provider-runtime";
import {
  deauthorizeStravaAccessToken,
  exchangeStravaOAuthCode,
  refreshStravaAccessToken,
  resolveStravaOAuthIdentity,
  type StravaOAuthError,
} from "./oauth";

beforeEach(() => {
  vi.stubEnv("STRAVA_CLIENT_ID", "client-id");
  vi.stubEnv("STRAVA_CLIENT_SECRET", "client-secret");
  vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://app.example.test");
});

afterEach(() => vi.unstubAllEnvs());

describe("Strava OAuth contract", () => {
  it("requests read and explicit activity upload scope and binds the full grant", () => {
    const authorization = stravaProviderRuntime.connection.createOAuthAuthorization({
      returnUri: "gradientpeak://integrations",
      state: "one-time-state",
    });
    const url = new URL(authorization.url);
    expect(url.origin + url.pathname).toBe("https://www.strava.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("activity:read_all,activity:write");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/callback/strava",
    );
    expect(url.searchParams.get("state")).toBe("one-time-state");
    expect(authorization.binding).toMatchObject({
      callbackUri: "https://app.example.test/api/integrations/callback/strava",
      requestedScope: "activity:read_all activity:write",
    });
    expect(
      stravaProviderRuntime.connection.validateOAuthStateBinding({
        binding: authorization.binding,
        state: "one-time-state",
      }),
    ).toBe(true);
    expect(
      stravaProviderRuntime.connection.validateOAuthStateBinding({
        binding: { ...authorization.binding, requestedScope: "read" },
        state: "one-time-state",
      }),
    ).toBe(false);
  });

  it("validates the athlete identity and short-lived expiry in token responses", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).toContain("grant_type=authorization_code");
      expect(String(init?.body)).toContain("redirect_uri=https%3A%2F%2Fapp.example.test");
      return Response.json({
        token_type: "Bearer",
        access_token: "access",
        refresh_token: "refresh",
        expires_at: 2_000_000_000,
        expires_in: 21_600,
        athlete: { id: 123 },
      });
    });
    const tokens = await exchangeStravaOAuthCode("authorization-code", fetchImpl as typeof fetch);
    expect(tokens).toMatchObject({ expires_in: 21_600, athlete: { id: 123 } });
    await expect(resolveStravaOAuthIdentity(tokens)).resolves.toEqual({
      externalId: "123",
      requiresActivation: false,
    });
  });

  it("rotates refresh credentials and classifies invalid_grant without exposing response data", async () => {
    const success = vi.fn(async () =>
      Response.json({
        token_type: "Bearer",
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_at: 2_000_000_000,
        expires_in: 21_600,
      }),
    );
    await expect(
      refreshStravaAccessToken("old-refresh", success as typeof fetch),
    ).resolves.toMatchObject({
      refresh_token: "new-refresh",
    });
    const rejection = vi.fn(async () =>
      Response.json({ error: "invalid_grant", private_detail: "never logged" }, { status: 400 }),
    );
    await expect(
      refreshStravaAccessToken("old-refresh", rejection as typeof fetch),
    ).rejects.toEqual(
      expect.objectContaining<Partial<StravaOAuthError>>({ reason: "invalid_grant" }),
    );
  });

  it("rejects oversized token responses before parsing them", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { token_type: "Bearer" },
        { headers: { "content-length": String(64 * 1_024 + 1) } },
      ),
    );
    await expect(
      exchangeStravaOAuthCode("authorization-code", fetchImpl as typeof fetch),
    ).rejects.toEqual(
      expect.objectContaining<Partial<StravaOAuthError>>({ reason: "invalid_token_response" }),
    );
  });

  it("uses the documented athlete deauthorization endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await deauthorizeStravaAccessToken("access", fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.strava.com/oauth/deauthorize",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("access_token=access"),
      }),
    );
  });
});
