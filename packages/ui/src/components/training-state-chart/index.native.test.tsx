import mockReact from "react";
import { renderNative } from "../../test/render-native";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart } from "./index.native";

type HostProps = Record<string, unknown> & { children?: mockReact.ReactNode };

// Keep the canvas boundary local: shared setup is also imported by app suites
// whose Victory mocks expose different chart bounds and interaction hooks.
jest.mock("victory-native", () => ({
  CartesianChart: ({ children, data = [], xKey, yKeys }: HostProps) => {
    const render = children as
      | ((value: { points: Record<string, unknown> }) => mockReact.ReactNode)
      | undefined;
    return mockReact.createElement(
      "CartesianChart",
      { data, testID: "victory-cartesian-chart", xKey, yKeys },
      render
        ? render({
            points: Object.fromEntries(
              (yKeys as string[]).map((key) => [
                key,
                (data as Record<string, unknown>[]).map((datum) => ({
                  x: datum.index,
                  y: typeof datum[key] === "number" ? datum[key] : null,
                  yValue: typeof datum[key] === "number" ? datum[key] : null,
                })),
              ]),
            ),
          })
        : children,
    );
  },
  Line: (props: HostProps) =>
    mockReact.createElement("VictoryLine", { ...props, testID: "victory-line" }),
  Scatter: (props: HostProps) =>
    mockReact.createElement("VictoryScatter", { ...props, testID: "victory-scatter" }),
}));

jest.mock("@shopify/react-native-skia", () => ({
  DashPathEffect: (props: HostProps) =>
    mockReact.createElement("SkiaDashPathEffect", { ...props, testID: "skia-dash-path-effect" }),
}));

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
      expect.objectContaining({ index: 0, "recorded-fitness": 42, "recorded-form": -12 }),
      expect.objectContaining({ index: 2, "recorded-fatigue": 0, "projected-fitness": 44 }),
    ]);
    expect(getByText("Apr 13")).toBeTruthy();
    expect(getByText("Apr 15")).toBeTruthy();
    expect(getByText("Common Load points")).toBeTruthy();
    const lines = getAllByTestId("victory-line");
    expect(lines).toHaveLength(6);
    const markers = getAllByTestId("victory-scatter");
    expect(markers).toHaveLength(6);
    expect(markers[0]?.props.points).toEqual([
      expect.objectContaining({ y: 42 }),
      expect.objectContaining({ y: null }),
    ]);
    expect(markers[0]?.props.radius).toBe(2.5);
    expect(markers.slice(0, 3).every((marker) => marker.props.shape === "circle")).toBe(true);
    expect(markers.slice(3).every((marker) => marker.props.shape === "square")).toBe(true);
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

  it("keeps the compact chart's values and accessible data equivalent", async () => {
    const { getByLabelText, getByText } = await renderNative(
      <TrainingStateChart
        density="compact"
        emptyMessage="No training state"
        series={[
          { metric: "fitness", source: "recorded" },
          { metric: "fatigue", source: "recorded" },
          { metric: "form", source: "recorded" },
        ]}
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );

    expect(getByLabelText(/Planning timezone America\/Los_Angeles/)).toBeTruthy();
    expect(getByText(/Common Load points/)).toBeTruthy();
    expect(getByText("Apr 13")).toBeTruthy();
    expect(getByText("Apr 15")).toBeTruthy();
    expect(getByText("Fitness: 42.0")).toBeTruthy();
    expect(getByText("Fatigue: 0.0")).toBeTruthy();
  });

  it("keeps an accessibility override additive and announces supplied source labels with non-color encoding", async () => {
    const { getAllByTestId, getByLabelText, getByTestId, getByText } = await renderNative(
      <TrainingStateChart
        accessibilityLabel="Baseline and alternative comparison"
        emptyMessage="No training state"
        series={[
          { metric: "fitness", source: "recorded" },
          { metric: "fitness", source: "projected" },
        ]}
        sourceLabels={{ projected: "Alternative", recorded: "Baseline" }}
        testId="scenario-chart"
        visual={trainingStateChartFixtures.mixedSeries}
      />,
    );

    expect(
      getByLabelText(/Baseline and alternative comparison.*Planning timezone America\/Los_Angeles/),
    ).toBeTruthy();
    expect(getByTestId("victory-cartesian-chart").props.yKeys).toEqual([
      "recorded-fitness",
      "projected-fitness",
    ]);
    expect(getByTestId("scenario-chart-legend")).toBeTruthy();
    expect(getByText("● Baseline · solid")).toBeTruthy();
    expect(getByText("□ Alternative · dashed")).toBeTruthy();
    const dashEffects = getAllByTestId("skia-dash-path-effect");
    expect(dashEffects).toHaveLength(1);
    expect(dashEffects[0]?.props.intervals).toEqual([6, 4]);
  });
});
