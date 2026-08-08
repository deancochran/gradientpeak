import { describe, expect, it } from "vitest";
import { getWahooOAuthConfig, isWahooIntegrationEnabled } from "./oauth-config";

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
  });
});
