import { describe, expect, it } from "vitest";
import { getOnboardingIntegrationsLoadState } from "./integration-load-state";

describe("getOnboardingIntegrationsLoadState", () => {
  it("distinguishes a valid empty catalog from a failed overview", () => {
    expect(getOnboardingIntegrationsLoadState({ status: "fulfilled", value: [] })).toEqual({
      integrations: [],
      integrationsError: null,
    });
    expect(
      getOnboardingIntegrationsLoadState({ status: "rejected", reason: new Error("private") }),
    ).toEqual({
      integrations: [],
      integrationsError: "Available training accounts could not be loaded. Try again.",
    });
  });
});
