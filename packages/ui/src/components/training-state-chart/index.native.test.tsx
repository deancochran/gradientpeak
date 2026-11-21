import { renderNative } from "../../test/render-native";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart } from "./index.native";

describe("TrainingStateChart native", () => {
  const allSeries = [
    { metric: "fitness", source: "recorded" },
    { metric: "fatigue", source: "recorded" },
    { metric: "form", source: "recorded" },
    { metric: "fitness", source: "projected" },
    { metric: "fatigue", source: "projected" },
    { metric: "form", source: "projected" },
  ] as const;

  it("renders only the selected series with their values, gaps, and shared accessibility summary", async () => {
    const { getAllByTestId, getByLabelText, getByTestId, getByText } = await renderNative(
      <TrainingStateChart
        description="Only explicitly selected observations are displayed."
        emptyMessage="No training state"
        series={allSeries}
        testId="training-state-native-chart"
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );

    expect(getByTestId("training-state-native-chart")).toBeTruthy();
    expect(getByText("Only explicitly selected observations are displayed.")).toBeTruthy();
    expect(getByLabelText(/Planning timezone America\/Los_Angeles/)).toBeTruthy();
    const chart = getByTestId("victory-cartesian-chart");
    expect(chart.props.yKeys).toEqual([
      "recorded-fitness",
      "recorded-fatigue",
      "recorded-form",
      "projected-fitness",
      "projected-fatigue",
      "projected-form",
    ]);
    expect(chart.props.data).toEqual([
      expect.objectContaining({ "recorded-fitness": 42, "recorded-form": -12 }),
      expect.objectContaining({ "recorded-fatigue": 0, "projected-fitness": 44 }),
    ]);
    const lines = getAllByTestId("victory-line");
    expect(lines).toHaveLength(6);
    const markers = getAllByTestId("victory-scatter");
    expect(markers).toHaveLength(6);
    expect(markers[0]?.props.points).toEqual([
      expect.objectContaining({ y: 42 }),
      expect.objectContaining({ y: null }),
    ]);
    expect(markers[0]?.props.radius).toBe(2.5);
    expect(lines.every((line) => line.props.connectMissingData === false)).toBe(true);
    expect(lines.map((line) => line.props.color)).toEqual([
      "#2563eb",
      "#d97706",
      "#7c3aed",
      "#2563eb",
      "#d97706",
      "#7c3aed",
    ]);
  });

  it.each([
    "recorded",
    "projected",
  ] as const)("renders %s fatigue when fitness and the other source are unavailable", async (source) => {
    const { getByTestId, queryByText } = await renderNative(
      <TrainingStateChart
        emptyMessage="No training state"
        series={allSeries}
        visual={{
          ...trainingStateChartFixtures.mixedSeries,
          points: [
            {
              date: "2026-04-13",
              index: 0,
              recorded: { fitness: null, fatigue: null, form: null },
              projected: { fitness: null, fatigue: null, form: null },
              [source]: { fitness: null, fatigue: 0, form: null },
            },
          ],
        }}
      />,
    );
    expect(queryByText("No training state")).toBeNull();
    expect(getByTestId("victory-cartesian-chart").props.data[0][`${source}-fatigue`]).toBe(0);
  });

  it("uses the explicit empty state when every selected series is unavailable", async () => {
    const { getByText, queryByTestId } = await renderNative(
      <TrainingStateChart
        emptyMessage="No selected training state"
        series={[{ metric: "fatigue", source: "projected" }]}
        testId="training-state-native-chart"
        visual={{
          ...trainingStateChartFixtures.mixedSeries,
          points: trainingStateChartFixtures.mixedSeries.points.map((point) => ({
            ...point,
            projected: { ...point.projected, fatigue: null },
          })),
        }}
      />,
    );

    expect(getByText("No selected training state")).toBeTruthy();
    expect(queryByTestId("training-state-native-chart")).toBeTruthy();
  });
});
