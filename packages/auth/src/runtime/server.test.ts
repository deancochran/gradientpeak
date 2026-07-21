import { describe, expect, it } from "vitest";

import { AUTH_TOKEN_POLICY, verificationConsumptionId } from "./verification";

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
