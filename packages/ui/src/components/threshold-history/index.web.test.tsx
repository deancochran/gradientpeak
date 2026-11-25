import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { thresholdHistoryFixtures } from "./fixtures";
import { ThresholdHistoryChart } from "./index.web";
import { groupThresholdHistory } from "./shared";

describe("threshold history presentation", () => {
  it("separates same-sport power and LTHR before charting and orders each series by date", () => {
    const [earlyPower, beforePolicyChange, latestPower] =
      thresholdHistoryFixtures.bikePowerWithPolicyGap.points;
    if (!earlyPower || !beforePolicyChange || !latestPower)
      throw new Error("Threshold fixture is incomplete");
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
      beforePolicyChange,
      earlyPower,
    ]);

    expect(series).toHaveLength(2);
    expect(
      series.find((item) => item.unit === "watts")?.points.map((point) => point.thresholdId),
    ).toEqual(["bike-power-early", "bike-power-before-policy-change", "bike-power-latest"]);
  });

  it("renders policy-gapped power and pace as separate, visibly labeled unit scales", () => {
    render(
      <>
        <ThresholdHistoryChart
          emptyMessage="No values"
          series={thresholdHistoryFixtures.bikePowerWithPolicyGap}
        />
        <ThresholdHistoryChart emptyMessage="No values" series={thresholdHistoryFixtures.runPace} />
      </>,
    );

    expect(
      screen.getByRole("img", { name: /bike power history.*260 W.*May 10, 2026/i }),
    ).toBeTruthy();
    expect(screen.getByText("bike power · watts")).toBeTruthy();
    expect(screen.getByText("run pace · pace (/km)")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /run pace history.*4:10 \/km.*Apr 12, 2026/i }),
    ).toBeTruthy();
  });
});
