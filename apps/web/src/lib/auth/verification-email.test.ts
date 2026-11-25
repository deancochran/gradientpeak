import { describe, expect, it } from "vitest";

import { getVerificationEmail } from "./verification-email";

describe("getVerificationEmail", () => {
  it("uses the authenticated user's email when the verification URL has no email", () => {
    expect(getVerificationEmail(undefined, "athlete@example.com")).toBe("athlete@example.com");
  });

  it("prefers the authenticated user's email over an untrusted URL value", () => {
    expect(getVerificationEmail("other@example.com", "athlete@example.com")).toBe(
      "athlete@example.com",
    );
  });

  it("retains the URL email for a signed-up user without a session", () => {
    expect(getVerificationEmail("athlete@example.com")).toBe("athlete@example.com");
  });
});
