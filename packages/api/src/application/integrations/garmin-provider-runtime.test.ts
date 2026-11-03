import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { garminProviderRuntime } from "./garmin-provider-runtime";

describe("Garmin provider runtime", () => {
  beforeEach(() => {
    vi.stubEnv("GARMIN_CLIENT_ID", "client");
    vi.stubEnv("GARMIN_CLIENT_SECRET", "secret");
    vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "https://dev.gradientpeak.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses one state-bound S256 PKCE request without a synthetic scope", () => {
    if (garminProviderRuntime.connection.kind !== "oauth2")
      throw new Error("Expected OAuth runtime");
    const authorization = garminProviderRuntime.connection.createOAuthAuthorization({
      returnUri: "https://dev.gradientpeak.com/integrations",
      state: "d584e8a5-fd8e-467b-8d89-13315b1bdc1d",
    });
    const url = new URL(authorization.url);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has("scope")).toBe(false);
    expect(authorization.binding.requestedScope).toBe("");
  });

  it("does not advertise planned delivery for a disconnected account", async () => {
    if (garminProviderRuntime.execution.kind !== "server")
      throw new Error("Expected server runtime");
    await expect(
      garminProviderRuntime.execution.server.overview.readOverviewEvidence({
        db: {} as never,
        profileId: "profile",
        integration: null,
        scope: null,
      }),
    ).resolves.toMatchObject({
      plannedActivities: { status: "unsupported" },
    });
  });
});
