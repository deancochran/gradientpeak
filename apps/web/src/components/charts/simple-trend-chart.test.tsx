// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SimpleTrendChart, type SimpleTrendChartPoint } from "./simple-trend-chart";

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
      "Power trend. Records: 2. First: 100 W. Latest: 125 W. Trend: Up 25 W",
    );
  });
});
