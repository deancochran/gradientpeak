import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { AUTH_TOKEN_POLICY, verificationConsumptionId } from "./verification";

let authRateLimitPolicy: typeof import("./server").AUTH_RATE_LIMIT_POLICY;
let getGradientPeakAuth: typeof import("./server").getGradientPeakAuth;

const originalNodeEnv = process.env["NODE_ENV"];
const originalAppUrl = process.env["APP_URL"];
const originalMobileScheme = process.env["AUTH_MOBILE_SCHEME"];

beforeAll(async () => {
  // server.ts resolves the DB URL at module initialization; policy tests do not connect.
  process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  ({ AUTH_RATE_LIMIT_POLICY: authRateLimitPolicy, getGradientPeakAuth } = await import("./server"));
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = originalNodeEnv;
  if (originalAppUrl === undefined) delete process.env["APP_URL"];
  else process.env["APP_URL"] = originalAppUrl;
  if (originalMobileScheme === undefined) delete process.env["AUTH_MOBILE_SCHEME"];
  else process.env["AUTH_MOBILE_SCHEME"] = originalMobileScheme;
});

describe("production auth bootstrap", () => {
  it("throws for missing production APP_URL before constructing an auth handler", () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["APP_URL"];
    process.env["AUTH_MOBILE_SCHEME"] = "gradientpeak";

    expect(() => getGradientPeakAuth()).toThrow("APP_URL is required");
  });

  it("throws for HTTP production APP_URL before constructing an auth handler", () => {
    process.env["NODE_ENV"] = "production";
    process.env["APP_URL"] = "http://app.example.com";
    process.env["AUTH_MOBILE_SCHEME"] = "gradientpeak";

    expect(() => getGradientPeakAuth()).toThrow("APP_URL must use HTTPS");
  });
});

describe("AUTH_RATE_LIMIT_POLICY", () => {
  it("keeps the global and sensitive mutation limits strict while allowing bounded session reads", () => {
    expect(authRateLimitPolicy).toEqual({
      global: { window: 60, max: 10 },
      customRules: {
        // 120/minute permits normal SPA/SSR route navigation (up to two reads/second)
        // without making the session endpoint unlimited.
        "/get-session": { window: 60, max: 120 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    });
    expect(authRateLimitPolicy.customRules["/get-session"].max).toBeGreaterThan(
      authRateLimitPolicy.global.max,
    );
    expect(authRateLimitPolicy.customRules["/get-session"].max).toBeLessThanOrEqual(120);
    expect(Object.isFrozen(authRateLimitPolicy)).toBe(true);
    expect(Object.isFrozen(authRateLimitPolicy.customRules)).toBe(true);
  });
});

describe("verificationConsumptionId", () => {
  it("keeps verification short-lived and reset explicitly session-revoking", () => {
    expect(AUTH_TOKEN_POLICY).toEqual({
      emailVerificationExpiresInSeconds: 900,
      resetPasswordExpiresInSeconds: 3600,
      revokeSessionsOnPasswordReset: true,
    });
  });

  it("creates a stable non-secret identifier for one-time verification consumption", () => {
    const id = verificationConsumptionId("sensitive-token");
    expect(id).toBe("a83d19d0-8d3c-3f53-7480-5ea28c59bcfd");
    expect(id).not.toContain("sensitive-token");
  });
});
