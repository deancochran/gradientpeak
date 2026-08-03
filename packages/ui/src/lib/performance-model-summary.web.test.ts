import type { AthletePerformanceOverview } from "@repo/core/performance-model";
import { buildPerformanceOverviewFixture } from "@repo/core/testing/performance-model";
import { describe, expect, it } from "vitest";
import { buildPerformanceModelSummary } from "./performance-model-summary";

function overviewFixture(): AthletePerformanceOverview {
  const overview = buildPerformanceOverviewFixture({ asOf: "2026-07-31T12:00:00.000Z" });
  return {
    ...overview,
    bike: {
      ...overview.bike,
      fiveSecondPower: {
        status: "partial",
        value: "1,200 W",
        confidence: "low",
        freshness: "current",
        trainingImpact: "Training targets stay unchanged.",
        action: "Record more activity data.",
      },
    },
  };
}

describe("buildPerformanceModelSummary", () => {
  it("aligns available, limited, and unavailable athlete presentation", () => {
    const groups = buildPerformanceModelSummary(overviewFixture());

    expect(groups).toHaveLength(3);
    expect(groups[0]?.items.slice(0, 4)).toEqual([
      expect.objectContaining({
        id: "bike_five_second_power",
        label: "Five-second power",
        valueLabel: "1,200 W",
        statusLabel: "Limited",
        confidenceLabel: "Low",
        freshnessLabel: "Current",
        action: "Record more activity data.",
      }),
      expect.objectContaining({
        id: "bike_planning_threshold_power",
        label: "Planning threshold power",
        valueLabel: "247 W",
        statusLabel: "Available",
        confidenceLabel: "High",
        freshnessLabel: "Current",
      }),
      expect.objectContaining({
        id: "bike_estimated_threshold_duration",
        label: "Estimated threshold duration",
        status: "available",
      }),
      expect.objectContaining({
        id: "bike_duration_retention",
        label: "Duration retention",
        valueLabel: "94.9%",
      }),
    ]);
    expect(groups[1]?.items[0]).toMatchObject({
      id: "run_planning_threshold_pace",
      valueLabel: "Not available",
      statusLabel: "Not available",
      confidenceLabel: "Not available",
      freshnessLabel: "Not available",
      trainingImpact: "Training targets stay unchanged.",
      action: "Record more activity data.",
    });
    expect(groups[2]?.items[0]).toMatchObject({
      id: "swim_css_pace",
      status: "unavailable",
      action: null,
    });
    expect(JSON.stringify(groups)).not.toMatch(
      /canonical|as-of|evidence source|calculation|reason|source id|protocol|progressive|max-HR/i,
    );
  });
});
