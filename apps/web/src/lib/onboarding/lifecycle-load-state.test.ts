import { describe, expect, it } from "vitest";
import { resolveLoadedOnboardingStatus } from "./lifecycle-load-state";

describe("resolveLoadedOnboardingStatus", () => {
  it("keeps persisted processing locked when readiness temporarily fails", () => {
    expect(
      resolveLoadedOnboardingStatus({ readinessStatus: null, profileStatus: "processing" }),
    ).toBe("processing");
  });

  it("prefers readiness and never invents provider selection", () => {
    expect(
      resolveLoadedOnboardingStatus({ readinessStatus: "review", profileStatus: "processing" }),
    ).toBe("review");
    expect(
      resolveLoadedOnboardingStatus({ readinessStatus: null, profileStatus: null }),
    ).toBeNull();
  });
});
