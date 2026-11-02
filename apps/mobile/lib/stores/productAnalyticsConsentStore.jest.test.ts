import { useProductAnalyticsConsentStore } from "./productAnalyticsConsentStore";

describe("product analytics consent store", () => {
  beforeEach(() => {
    useProductAnalyticsConsentStore.setState({ consent: "denied", hasHydrated: false });
  });

  it("defaults to denied while persisted consent is unknown", () => {
    expect(useProductAnalyticsConsentStore.getState()).toMatchObject({
      consent: "denied",
      hasHydrated: false,
    });
  });

  it("persists explicit opt-in and opt-out state transitions", () => {
    useProductAnalyticsConsentStore.getState().setConsent(true);
    expect(useProductAnalyticsConsentStore.getState().consent).toBe("granted");

    useProductAnalyticsConsentStore.getState().setConsent(false);
    expect(useProductAnalyticsConsentStore.getState().consent).toBe("denied");
  });
});
