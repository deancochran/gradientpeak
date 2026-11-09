import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deregisterGarminUser,
  exchangeGarminOAuthCode,
  refreshGarminAccessToken,
  resolveGarminOAuthIdentity,
} from "./oauth";

describe("Garmin OAuth boundary", () => {
  beforeEach(() => {
    vi.stubEnv("GARMIN_CLIENT_ID", "client");
    vi.stubEnv("GARMIN_CLIENT_SECRET", "secret");
    vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://dev.gradientpeak.com");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("uses confidential PKCE token exchange and rejects malformed tokens", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: "access" }), { status: 200 }));
    await expect(exchangeGarminOAuthCode("code", "state", fetchImpl)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://diauth.garmin.com/di-oauth2-service/oauth/token",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("code_verifier=") }),
    );
  });

  it("sends every required code-exchange field and rejects redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access",
          expires_in: 3600,
          refresh_token: "refresh-2",
          refresh_token_expires_in: 7200,
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );
    await expect(exchangeGarminOAuthCode("code", "state", fetchImpl)).resolves.toMatchObject({
      refresh_token: "refresh-2",
      token_type: "bearer",
    });
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(request.redirect).toBe("error");
    expect(String(request.body)).toMatch(/client_id=client.*client_secret=secret.*code=code/);
    expect(String(request.body)).toContain("grant_type=authorization_code");
    expect(String(request.body)).toContain(
      "redirect_uri=https%3A%2F%2Fdev.gradientpeak.com%2Fapi%2Fintegrations%2Fcallback%2Fgarmin",
    );
  });

  it("classifies only an exact invalid_grant as refresh revocation", async () => {
    const invalidClient = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }),
      );
    await expect(refreshGarminAccessToken("refresh", invalidClient)).rejects.toMatchObject({
      reason: "invalid_client",
    });
    const invalidGrant = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(refreshGarminAccessToken("refresh", invalidGrant)).rejects.toMatchObject({
      reason: "invalid_grant",
    });
  });

  it("persists only validated user identity and permission evidence", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ userId: "garmin-user" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ permissions: ["WORKOUT_IMPORT", "ACTIVITY_EXPORT"] }), {
          status: 200,
        }),
      );
    await expect(resolveGarminOAuthIdentity({ accessToken: "access", fetchImpl })).resolves.toEqual(
      {
        externalId: "garmin-user",
        permissions: ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"],
        requiresActivation: false,
      },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://apis.garmin.com/partner-gateway/rest/user/id",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://apis.garmin.com/partner-gateway/rest/user/permissions",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fails closed when remote deregistration does not succeed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("no", { status: 503 }));
    await expect(deregisterGarminUser("access", fetchImpl)).rejects.toMatchObject({
      reason: "http_503",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://apis.garmin.com/partner-gateway/rest/user/registration",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
