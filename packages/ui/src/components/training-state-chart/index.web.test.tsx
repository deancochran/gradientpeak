import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart, TrainingStateLegend } from "./index.web";

afterEach(cleanup);

describe("TrainingStateLegend", () => {
  it("announces stable metric identities and recorded/projected source labels", () => {
    render(<TrainingStateLegend sources={["recorded", "projected"]} />);

    expect(screen.getByLabelText("Training-state legend")).toHaveTextContent(
      "FitnessFatigueForm━ Recorded━ Projected",
    );
  });
});

describe("TrainingStateChart", () => {
  it("renders every selected metric and source rather than treating multiple series as empty", () => {
    render(
      <TrainingStateChart
        emptyMessage="No training state"
        series={[
          { metric: "fitness", source: "recorded" },
          { metric: "fatigue", source: "recorded" },
          { metric: "form", source: "recorded" },
          { metric: "fitness", source: "projected" },
          { metric: "fatigue", source: "projected" },
          { metric: "form", source: "projected" },
        ]}
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(/Fitness Recorded.*Fatigue Recorded.*Form Recorded/);
    expect(chart).toHaveAccessibleName(/Fitness Projected.*Fatigue Projected.*Form Projected/);
    expect(screen.queryByText("No training state")).toBeNull();
    expect(document.querySelectorAll("polyline")).toHaveLength(6);
    expect(document.querySelectorAll('polyline[stroke-dasharray="6 4"]')).toHaveLength(3);
    expect(screen.getByLabelText("Chart legend")).toHaveTextContent("Form · Projected");
    expect(screen.getAllByText("0.0 Common Load points")).toHaveLength(1);
  });

  it("renders authorized recorded values with a semantic color and accessible units", () => {
    render(
      <TrainingStateChart
        emptyMessage="No training state"
        series={[{ metric: "form", source: "recorded" }]}
        title="Historical Form"
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );

    expect(
      screen.getByRole("img", { name: /Historical Form.*Common Load points.*-12.0/ }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Chart legend")).toHaveTextContent("Form");
    expect(document.querySelector("polyline")?.getAttribute("stroke")).toBe("var(--chart-5)");
  });

  it("keeps empty values unavailable instead of rendering a zero line", () => {
    render(
      <TrainingStateChart
        emptyMessage="No projected fatigue"
        series={[{ metric: "fatigue", source: "projected" }]}
        title="Projected Fatigue"
        visual={{
          ...trainingStateChartFixtures.mixedSeries,
          points: trainingStateChartFixtures.mixedSeries.points.map((point) => ({
            ...point,
            projected: { ...point.projected, fatigue: null },
          })),
        }}
      />,
    );

    expect(screen.getByText("No projected fatigue")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps sparse zero and negative recorded values separated by gaps", () => {
    render(
      <TrainingStateChart
        emptyMessage="No recorded fatigue"
        series={[{ metric: "fatigue", source: "recorded" }]}
        title="Historical Fatigue"
        visual={{
          ...trainingStateChartFixtures.mixedSeries,
          points: [
            {
              date: "2026-04-13",
              index: 0,
              projected: { fatigue: null, fitness: null, form: null },
              recorded: { fatigue: 30, fitness: 42, form: -12 },
            },
            {
              date: "2026-04-15",
              index: 2,
              projected: { fatigue: 32, fitness: 44, form: -12 },
              recorded: { fatigue: null, fitness: null, form: null },
            },
            {
              date: "2026-04-17",
              index: 4,
              projected: { fatigue: 32, fitness: 44, form: -12 },
              recorded: { fatigue: -4, fitness: 0, form: null },
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("img", { name: /2 values.*-4.0 Common Load points/ })).toBeTruthy();
    expect(document.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("visually distinguishes the selected projected source", () => {
    render(
      <TrainingStateChart
        emptyMessage="No projected fitness"
        series={[{ metric: "fitness", source: "projected" }]}
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );

    expect(document.querySelector("polyline")?.getAttribute("stroke-dasharray")).toBe("6 4");
    expect(screen.getByLabelText("Chart legend")).toHaveTextContent("Fitness · Projected");
  });

  it("keeps comparable series and the full accessible summary in compact density", () => {
    render(
      <TrainingStateChart
        density="compact"
        emptyMessage="No training state"
        series={[
          { metric: "fitness", source: "recorded" },
          { metric: "fatigue", source: "recorded" },
          { metric: "form", source: "recorded" },
        ]}
        title="Recent training state"
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );

    expect(
      screen.getByRole("img", { name: /Planning timezone America\/Los_Angeles/ }),
    ).toBeTruthy();
    expect(screen.getByText("Fitness · Recorded")).toBeTruthy();
    expect(screen.getByText("42.0 Common Load points")).toBeTruthy();
    expect(screen.getByText("0.0 Common Load points")).toBeTruthy();
    expect(screen.queryByLabelText("Chart legend")).toBeNull();
    expect(document.querySelector('[role="img"]')?.className).toContain("h-24");
  });
});
