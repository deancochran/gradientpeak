import {
  onboardingOverviewEnabled,
  onboardingProgressRefetchInterval,
} from "./processing-query-policy";

describe("onboarding processing query policy", () => {
  it("uses one two-second focused progress cadence while processing", () => {
    expect(
      onboardingProgressRefetchInterval({
        status: "processing",
        phase: "importing_activities",
      }),
    ).toBe(2000);
    expect(
      onboardingProgressRefetchInterval({ status: "processing", phase: "building_targets" }),
    ).toBe(2000);
    expect(onboardingProgressRefetchInterval({ status: "review", phase: "ready" })).toBe(false);
  });

  it("disables broad integration overview reads during processing", () => {
    expect(onboardingOverviewEnabled({ authenticated: true, status: "processing" })).toBe(false);
    expect(onboardingOverviewEnabled({ authenticated: true, status: "provider_selection" })).toBe(
      true,
    );
    expect(onboardingOverviewEnabled({ authenticated: true, status: "review" })).toBe(true);
  });
});
