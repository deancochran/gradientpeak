import { describe, expect, it } from "vitest";
import {
  getOnboardingOAuthErrorMessage,
  parseOnboardingOAuthError,
} from "../lib/onboarding/oauth-error";

describe("onboarding OAuth callback messages", () => {
  it("maps provider denial to safe actionable copy", () => {
    expect(getOnboardingOAuthErrorMessage("authorization_denied")).toContain("cancelled or denied");
  });

  it("does not reflect callback error details", () => {
    expect(parseOnboardingOAuthError("raw-token-detail")).toBeUndefined();
    expect(getOnboardingOAuthErrorMessage("raw-token-detail")).toBe(
      "Wahoo could not be connected safely. Try again, cancel the pending connection if needed, or continue without Wahoo.",
    );
  });
});
