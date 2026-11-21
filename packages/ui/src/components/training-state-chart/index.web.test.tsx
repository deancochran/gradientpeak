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
  it("renders authorized recorded values with a semantic color and accessible units", () => {
    render(
      <TrainingStateChart
        emptyMessage="No training state"
        metric="form"
        source="recorded"
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
        metric="fatigue"
        source="projected"
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
});
