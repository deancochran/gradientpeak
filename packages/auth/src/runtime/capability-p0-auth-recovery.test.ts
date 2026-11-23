import { beforeAll, describe, expect, it } from "vitest";

import { AUTH_TOKEN_POLICY } from "./verification";

let authRateLimitPolicy: typeof import("./server").AUTH_RATE_LIMIT_POLICY;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  ({ AUTH_RATE_LIMIT_POLICY: authRateLimitPolicy } = await import("./server"));
});

describe("P0 auth recovery runtime safeguards", () => {
  it("keeps account creation, email verification, password reset, and sign-out bounded", () => {
    expect(authRateLimitPolicy.customRules).toMatchObject({
      "/sign-up/email": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    });
    expect(AUTH_TOKEN_POLICY).toMatchObject({
      emailVerificationExpiresInSeconds: 900,
      resetPasswordExpiresInSeconds: 3600,
      revokeSessionsOnPasswordReset: true,
    });
  });
});
