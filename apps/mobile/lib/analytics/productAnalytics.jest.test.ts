const capture = jest.fn();

jest.mock("@/lib/stores/productAnalyticsConsentStore", () => ({
  useProductAnalyticsConsentStore: {
    getState: () => ({ consent: "granted" }),
  },
}));

const { captureProductAnalytics } = require("./productAnalytics");

describe("captureProductAnalytics", () => {
  beforeEach(() => capture.mockReset());

  it("captures only exact allowlisted event payloads", () => {
    captureProductAnalytics({ capture }, "plan.range_selected", { range: "6w" });

    expect(capture).toHaveBeenCalledWith("plan.range_selected", { range: "6w" });
  });

  it("rejects unknown events and properties", () => {
    captureProductAnalytics({ capture }, "plan.unknown", { range: "6w" });
    captureProductAnalytics({ capture }, "plan.range_selected", {
      range: "6w",
      title: "Private plan title",
    });
    captureProductAnalytics({ capture }, "plan.range_selected", { range: "forever" });

    expect(capture).not.toHaveBeenCalled();
  });

  it("does not capture before consent and swallows transport failure", () => {
    const store =
      require("@/lib/stores/productAnalyticsConsentStore").useProductAnalyticsConsentStore;
    store.getState = () => ({ consent: "denied" });
    captureProductAnalytics({ capture }, "plan.range_selected", { range: "6w" });
    expect(capture).not.toHaveBeenCalled();

    store.getState = () => ({ consent: "granted" });
    capture.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    expect(() =>
      captureProductAnalytics({ capture }, "plan.range_selected", { range: "6w" }),
    ).not.toThrow();
  });
});
