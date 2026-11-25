import { resolveOnboardingLifecycleStatus } from "./lifecycle-status";

describe("resolveOnboardingLifecycleStatus", () => {
  it("does not let stale processing progress override refreshed provider selection", () => {
    expect(
      resolveOnboardingLifecycleStatus({
        profileStatus: "provider_selection",
        progressStatus: "processing",
      }),
    ).toBe("provider_selection");
  });

  it("allows fresh progress to advance a processing profile to review", () => {
    expect(
      resolveOnboardingLifecycleStatus({
        profileStatus: "processing",
        progressStatus: "review",
      }),
    ).toBe("review");
  });

  it("uses a mutation result while profile refresh catches up", () => {
    expect(
      resolveOnboardingLifecycleStatus({
        overrideStatus: "provider_selection",
        profileStatus: "processing",
        progressStatus: "processing",
      }),
    ).toBe("provider_selection");
  });
});
