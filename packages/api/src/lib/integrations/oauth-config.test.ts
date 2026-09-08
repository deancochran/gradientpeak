import { describe, expect, it } from "vitest";
import {
  createProviderOAuthConfigRegistry,
  getProviderOAuthConfig,
  getStravaOAuthConfig,
  getWahooOAuthConfig,
  isStravaIntegrationEnabled,
  isWahooIntegrationEnabled,
} from "./oauth-config";

describe("Wahoo server enablement", () => {
  it.each([
    [{}, false],
    [{ WAHOO_CLIENT_ID: "client" }, false],
    [{ WAHOO_CLIENT_SECRET: "secret" }, false],
    [{ WAHOO_CLIENT_ID: " ", WAHOO_CLIENT_SECRET: "secret" }, false],
    [{ WAHOO_CLIENT_ID: "undefined", WAHOO_CLIENT_SECRET: "secret" }, false],
    [{ WAHOO_CLIENT_ID: "client", WAHOO_CLIENT_SECRET: "secret" }, true],
  ] as const)("requires both confidential OAuth values for %j", (env, expected) => {
    expect(isWahooIntegrationEnabled(env)).toBe(expected);
    expect(getWahooOAuthConfig(env) !== null).toBe(expected);
  });

  it("does not infer Wahoo runtime enablement from unsupported provider credentials", () => {
    const unsupportedEnv = {
      STRAVA_CLIENT_ID: "client",
      STRAVA_CLIENT_SECRET: "secret",
    };
    expect(isWahooIntegrationEnabled(unsupportedEnv)).toBe(false);
    expect(getWahooOAuthConfig(unsupportedEnv)).toBeNull();
    expect(getProviderOAuthConfig("strava", unsupportedEnv)).toBeNull();
  });

  it("resolves configured providers through the provider-neutral seam", () => {
    const env = { WAHOO_CLIENT_ID: "client", WAHOO_CLIENT_SECRET: "secret" };
    expect(getProviderOAuthConfig("wahoo", env)).toMatchObject({
      adapter: "remote",
      clientId: "client",
    });
  });

  it("resolves a second provider without adding provider branches to consumers", () => {
    const config = {
      adapter: "remote" as const,
      authUrl: "https://provider.test/authorize",
      clientId: "second-client",
      clientSecret: "second-secret",
      pkce: true,
      scopes: ["activity:read"],
      tokenClientAuthentication: "client_secret_basic" as const,
      tokenUrl: "https://provider.test/token",
    };
    const resolvers = new Map<"first" | "second", () => typeof config | null>([
      ["first", () => null],
      ["second", () => config],
    ]);
    const registry = createProviderOAuthConfigRegistry(resolvers);

    expect(registry.get("second", {})).toEqual(config);
    expect(registry.get("first", {})).toBeNull();
  });

  it.each([
    [{}, false],
    [{ STRAVA_CLIENT_ID: "client", STRAVA_CLIENT_SECRET: "secret" }, false],
    [
      {
        STRAVA_CLIENT_ID: "client",
        STRAVA_CLIENT_SECRET: "secret",
        OAUTH_CALLBACK_BASE_URL: "not-a-url",
      },
      false,
    ],
    [
      {
        STRAVA_CLIENT_ID: "client",
        STRAVA_CLIENT_SECRET: "secret",
        OAUTH_CALLBACK_BASE_URL: "https://app.example.test/callback?next=unsafe",
      },
      false,
    ],
    [
      {
        STRAVA_CLIENT_ID: "client",
        STRAVA_CLIENT_SECRET: "secret",
        OAUTH_CALLBACK_BASE_URL: "http://localhost:3000",
      },
      true,
    ],
  ] as const)("requires Strava credentials and an explicit callback base for %j", (env, expected) => {
    expect(isStravaIntegrationEnabled(env)).toBe(expected);
    expect(getStravaOAuthConfig(env) !== null).toBe(expected);
  });

  it("requests private history and completed activity upload scope from Strava", () => {
    expect(
      getStravaOAuthConfig({
        STRAVA_CLIENT_ID: "client",
        STRAVA_CLIENT_SECRET: "secret",
        OAUTH_CALLBACK_BASE_URL: "https://app.example.test",
      }),
    ).toMatchObject({ scopes: ["activity:read_all", "activity:write"], pkce: false });
  });
});
