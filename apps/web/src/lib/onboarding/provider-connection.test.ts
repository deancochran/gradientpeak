import { describe, expect, it, vi } from "vitest";
import { startOnboardingProviderConnection } from "./provider-connection";

describe("startOnboardingProviderConnection", () => {
  it("surfaces a safe actionable error when OAuth initiation fails", async () => {
    const onError = vi.fn();
    const navigate = vi.fn();
    await expect(
      startOnboardingProviderConnection({
        provider: "alpha",
        redirectUri: "https://app.example.test/onboarding",
        getAuthUrl: vi.fn().mockRejectedValue(new Error("private provider failure")),
        navigate,
        onError,
      }),
    ).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Unable to start this connection. Check provider availability and try again.",
    );
  });
});
