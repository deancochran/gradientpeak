import { describe, expect, it } from "vitest";
import { buildTrendInsights } from "./trend-insights";

describe("buildTrendInsights", () => {
  it("owns profile and activity insight semantics in the server read model", () => {
    const result = buildTrendInsights({
      analytics: { status: "unavailable", reason: "row_limit_exceeded" },
      loadHistory: null,
      observations: [
        {
          metric_type: "weight_kg",
          recorded_at: new Date("2026-08-01T08:00:00.000Z"),
          value: 72.4,
        },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.items).toHaveLength(11);
    expect(result.items.find((item) => item.id === "profile-weight_kg")).toMatchObject({
      source: "profileMetric",
      value: "72.4 kg",
      visualType: "line",
    });
    expect(result.items.find((item) => item.id === "training-load")).toMatchObject({
      source: "activityAnalysis",
      value: "--",
      visualType: "loadMultiLine",
    });
  });
});
