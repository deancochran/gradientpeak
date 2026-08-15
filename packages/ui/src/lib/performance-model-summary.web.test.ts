import type { AthletePerformanceOverview } from "@repo/core/performance-model";
import { buildPerformanceOverviewFixture } from "@repo/core/testing/performance-model";
import { describe, expect, it } from "vitest";
import { buildPerformanceModelSummary } from "./performance-model-summary";

function overviewFixture(): AthletePerformanceOverview {
  const overview = buildPerformanceOverviewFixture({ asOf: "2026-07-31T12:00:00.000Z" });
  return {
    ...overview,
    thresholds: {
      ...overview.thresholds,
      run: {
        status: "unavailable",
        value: null,
        confidence: "unavailable",
        freshness: "unavailable",
        trainingImpact: "Training targets stay unchanged.",
        action: "Record more activity data.",
      },
      swim: {
        ...overview.thresholds.swim,
        freshness: "stale",
        action: "Record more recent activity data.",
      },
    },
  };
}

describe("buildPerformanceModelSummary", () => {
  it("aligns current, stale, and unavailable canonical target presentation", () => {
    const groups = buildPerformanceModelSummary(overviewFixture());

    expect(groups).toHaveLength(3);
    expect(groups[0]?.items).toEqual([
      expect.objectContaining({
        id: "bike_threshold_power",
        label: "Threshold Power",
        valueLabel: "250 W",
        statusLabel: "Available",
        confidenceLabel: "High",
        freshnessLabel: "Current",
      }),
      expect.objectContaining({
        id: "bike_lthr",
        status: "unavailable",
      }),
      expect.objectContaining({
        id: "bike_max_heart_rate",
        status: "unavailable",
      }),
    ]);
    expect(groups[1]?.items[0]).toMatchObject({
      id: "run_threshold_pace",
      label: "Threshold Pace",
      valueLabel: "Not available",
      statusLabel: "Not available",
      confidenceLabel: "Not available",
      freshnessLabel: "Not available",
      trainingImpact: "Training targets stay unchanged.",
      action: "Record more activity data.",
    });
    expect(groups[2]?.items[0]).toMatchObject({
      id: "swim_threshold_pace",
      label: "Swim Threshold Pace",
      valueLabel: "1:20 min/100m",
      status: "available",
      freshnessLabel: "Out of date",
      action: "Record more recent activity data.",
    });
    expect(JSON.stringify(groups)).not.toMatch(
      /canonical|as-of|evidence source|calculation|reason|source id|protocol|progressive|max-HR/i,
    );
  });
});
