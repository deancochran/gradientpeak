// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSmoothChartPath,
  SimpleTrendChart,
  type SimpleTrendChartPoint,
} from "./simple-trend-chart";

afterEach(cleanup);

const formatWatts = (value: number) => `${value} W`;

function renderChart(points: readonly SimpleTrendChartPoint[]) {
  return render(
    <SimpleTrendChart
      emptyMessage="No trend data yet."
      formatValue={formatWatts}
      points={points}
      title="Power trend"
    />,
  );
}

describe("SimpleTrendChart", () => {
  it("builds a smooth curve without overshooting its point coordinates", () => {
    expect(
      buildSmoothChartPath([
        { plotX: 10, plotY: 20 },
        { plotX: 30, plotY: 40 },
        { plotX: 70, plotY: 25 },
      ]),
    ).toBe("M 10,20 C 20,20 20,40 30,40 C 50,40 50,25 70,25");
  });

  it("renders labeled logarithmic axes and a smooth path", () => {
    const { container } = render(
      <SimpleTrendChart
        axisLabels={{ x: "Duration", y: "Pace (/km)" }}
        emptyMessage="No trend data yet."
        formatX={(value) => `${value}s`}
        formatValue={formatWatts}
        points={[
          { id: "one", value: 240, x: 60 },
          { id: "two", value: 270, x: 600 },
          { id: "three", value: 300, x: 6000 },
        ]}
        invertY
        lowerIsBetter
        smooth
        summaryLabels={{
          first: "Shortest",
          latest: "Longest",
          trend: "Change",
        }}
        title="Run pace curve"
        xScale="log"
      />,
    );

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Pace (/km)")).toBeTruthy();
    expect(screen.getByText("60s")).toBeTruthy();
    expect(screen.getByText("6000s")).toBeTruthy();
    expect(screen.getByText("Shortest")).toBeTruthy();
    expect(screen.getByText("Slower 60 W")).toBeTruthy();
    expect(container.querySelector("path")?.getAttribute("d")).toContain(" C ");
    const pointLefts = [...container.querySelectorAll<HTMLElement>("[data-chart-point]")].map(
      (point) => Number.parseFloat(point.style.left),
    );
    expect(pointLefts[0]).toBe(12);
    expect(pointLefts[1]).toBeCloseTo(55);
    expect(pointLefts[2]).toBe(98);
    const pointTops = [...container.querySelectorAll<HTMLElement>("[data-chart-point]")].map(
      (point) => Number.parseFloat(point.style.top),
    );
    expect(pointTops[0]).toBeLessThan(pointTops[2] ?? 0);
  });

  it("renders an intentional empty state when no finite values exist", () => {
    renderChart([{ id: "missing", value: null, x: 1 }]);

    expect(screen.getByText("No trend data yet.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("centers single and constant high values without forcing the domain to zero", () => {
    const { container, rerender } = renderChart([{ id: "one", value: 100, x: 1 }]);

    expect(container.querySelector<HTMLElement>("[data-chart-point]")?.style.left).toBe("50%");
    expect(container.querySelector<HTMLElement>("[data-chart-point]")?.style.top).toBe("50%");

    rerender(
      <SimpleTrendChart
        emptyMessage="No trend data yet."
        formatValue={formatWatts}
        points={[
          { id: "one", value: 100, x: 1 },
          { id: "two", value: 100, x: 2 },
        ]}
        title="Power trend"
      />,
    );

    expect(
      [...container.querySelectorAll<HTMLElement>("[data-chart-point]")].map(
        (point) => point.style.top,
      ),
    ).toEqual(["50%", "50%"]);
  });

  it("preserves missing-value gaps as separate line segments", () => {
    const { container } = renderChart([
      { id: "one", value: 100, x: 1 },
      { id: "two", value: 110, x: 2 },
      { id: "gap", value: null, x: 3 },
      { id: "three", value: 120, x: 4 },
      { id: "four", value: 130, x: 5 },
    ]);

    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(container.querySelectorAll("[data-chart-point]")).toHaveLength(4);
  });

  it("exposes visible summary values and a matching chart accessibility label", () => {
    renderChart([
      { id: "one", value: 100, x: 1 },
      { id: "two", value: 125, x: 2 },
    ]);

    expect(screen.getByText("100 W")).toBeTruthy();
    expect(screen.getByText("125 W")).toBeTruthy();
    expect(screen.getByText("Up 25 W")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Power trend. Records: 2. First: 100 W. Latest: 125 W. Trend: Up 25 W. Points: 1: 100 W; 2: 125 W",
    );
  });
});
