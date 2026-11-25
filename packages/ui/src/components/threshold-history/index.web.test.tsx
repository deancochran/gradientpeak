import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { thresholdHistoryFixtures } from "./fixtures";
import { ThresholdHistoryChart } from "./index.web";
import { groupThresholdHistory } from "./shared";

describe("threshold history presentation", () => {
  it("separates same-activity-category power and LTHR before charting and orders each series by date", () => {
    const [earlyPower, latestPower] = thresholdHistoryFixtures.bikePower.points;
    if (!earlyPower || !latestPower) throw new Error("Threshold fixture is incomplete");
    const series = groupThresholdHistory([
      latestPower,
      {
        activityCategory: "bike",
        confidence: 0.8,
        effectiveAt: "2026-03-11T00:00:00.000Z",
        method: "lthr_30m_final_20m",
        metric: "lthr",
        policyVersion: "threshold-policy-v1",
        sourceActivities: [],
        thresholdId: "bike-lthr",
        unit: "bpm",
        value: 163,
      },
      earlyPower,
    ]);

    expect(series).toHaveLength(2);
    expect(
      series.find((item) => item.unit === "watts")?.points.map((point) => point.thresholdId),
    ).toEqual(["bike-power-early", "bike-power-latest"]);
  });

  it("uses a pace label while preserving speed values on a dedicated speed scale", () => {
    render(
      <ThresholdHistoryChart
        emptyMessage="No values"
        series={thresholdHistoryFixtures.bikePower}
      />,
    );

    expect(
      screen.getByRole("img", { name: /bike power history.*260 W.*Apr 10, 2026/i }),
    ).toBeTruthy();
  });
});
