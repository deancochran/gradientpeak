import { describe, expect, it } from "vitest";

import type { ResolvedProviderOAuthConfig } from "./oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
  redeemLocalOAuthAuthorizationCode,
} from "./oauth-pkce";

const config: ResolvedProviderOAuthConfig = {
  adapter: "local-test",
  authUrl: "local-test://authorize",
  clientId: "local-client",
  clientSecret: "local-secret",
  scopes: ["workouts_read", "offline_data"],
  tokenUrl: "local-test://token",
};

describe("local OAuth PKCE adapter", () => {
  it("redeems a signed authorization code only with its S256 verifier", () => {
    const verifier = deriveOAuthCodeVerifier({
      clientSecret: config.clientSecret,
      provider: "wahoo",
      state: "55555555-5555-4555-8555-555555555555",
    });
    const code = issueLocalOAuthAuthorizationCode({
      challenge: createOAuthCodeChallenge(verifier),
      config,
      now: 1_000,
      provider: "wahoo",
    });

    expect(
      redeemLocalOAuthAuthorizationCode({
        code,
        config,
        now: 2_000,
        provider: "wahoo",
        verifier,
      }),
    ).toMatchObject({ scope: "workouts_read offline_data", userId: "local-test-provider-user" });
    expect(() =>
      redeemLocalOAuthAuthorizationCode({
        code,
        config,
        now: 2_000,
        provider: "wahoo",
        verifier: `${verifier}wrong`,
      }),
    ).toThrow("invalid_local_code");
  });

  it("rejects expired or tampered authorization codes", () => {
    const verifier = deriveOAuthCodeVerifier({
      clientSecret: config.clientSecret,
      provider: "wahoo",
      state: "55555555-5555-4555-8555-555555555555",
    });
    const code = issueLocalOAuthAuthorizationCode({
      challenge: createOAuthCodeChallenge(verifier),
      config,
      now: 1_000,
      provider: "wahoo",
    });

    expect(() =>
      redeemLocalOAuthAuthorizationCode({
        code,
        config,
        now: 5 * 60 * 1000 + 1_001,
        provider: "wahoo",
        verifier,
      }),
    ).toThrow("invalid_local_code");
    expect(() =>
      redeemLocalOAuthAuthorizationCode({
        code: `${code}tampered`,
        config,
        now: 2_000,
        provider: "wahoo",
        verifier,
      }),
    ).toThrow("invalid_local_code");
  });
});
