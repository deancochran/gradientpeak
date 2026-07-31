import { beforeAll, describe, expect, it } from "vitest";

import { AUTH_TOKEN_POLICY, verificationConsumptionId } from "./verification";

let authRateLimitPolicy: typeof import("./server").AUTH_RATE_LIMIT_POLICY;

beforeAll(async () => {
  // server.ts resolves the DB URL at module initialization; policy tests do not connect.
  process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  ({ AUTH_RATE_LIMIT_POLICY: authRateLimitPolicy } = await import("./server"));
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
    expect(id).toBe(
      "email-verification:a83d19d08d3c3f5374805ea28c59bcfdb4cf86519e23ac53b86f8ad01471e79f",
    );
    expect(id).not.toContain("sensitive-token");
  });
});
