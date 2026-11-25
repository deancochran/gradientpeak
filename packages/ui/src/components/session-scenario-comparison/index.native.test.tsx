import mockReact from "react";
import { renderNative } from "../../test/render-native";
import { SessionScenarioComparison } from "./index.native";

type CanvasProps = {
  children: (value: { points: Record<string, unknown[]> }) => mockReact.ReactNode;
  data: Array<Record<string, number | null>>;
  yKeys: string[];
};

// Exercise both real presentation components; replace only the device canvas.
jest.mock("victory-native", () => ({
  CartesianChart: ({ children, data, yKeys }: CanvasProps) =>
    mockReact.createElement(
      "CartesianChart",
      { data, yKeys, testID: "scenario-canvas" },
      children({
        points: Object.fromEntries(
          yKeys.map((key) => [
            key,
            data.map((datum) => ({ x: datum.index, y: datum[key], yValue: datum[key] })),
          ]),
        ),
      }),
    ),
  Line: (props: Record<string, unknown>) =>
    mockReact.createElement("VictoryLine", { ...props, testID: "scenario-line" }),
  Scatter: (props: Record<string, unknown>) =>
    mockReact.createElement("VictoryScatter", { ...props, testID: "scenario-marker" }),
}));
jest.mock("@shopify/react-native-skia", () => ({
  DashPathEffect: (props: Record<string, unknown>) =>
    mockReact.createElement("DashPathEffect", { ...props, testID: "scenario-dash" }),
}));

describe("SessionScenarioComparison native", () => {
  it("preserves elapsed planning days, null gaps and singleton alternative markers", async () => {
    const state = { longTermLoad: 42, recentLoad: 57, loadBalance: -15 };
    const view = await renderNative(
      <SessionScenarioComparison
        baseline={{
          transitions: ["2026-11-23", "2026-11-25", "2026-11-30"].map((date) => ({
            toAsOf: `${date}T00:00:00.000Z`,
            state,
          })),
        }}
        alternative={{ transitions: [{ toAsOf: "2026-11-30T00:00:00.000Z", state }] }}
        timeZone="UTC"
      />,
    );
    expect(view.getByLabelText(/Baseline and alternative.*Planning timezone UTC/)).toBeTruthy();
    expect(view.getByText("● Baseline · solid")).toBeTruthy();
    expect(view.getByText("□ Alternative · dashed")).toBeTruthy();
    expect(view.getByText("Nov 23")).toBeTruthy();
    expect(view.getByText("Nov 30")).toBeTruthy();
    expect(view.getByText("training load")).toBeTruthy();
    expect(view.getByTestId("scenario-canvas").props.data).toEqual([
      expect.objectContaining({ index: 0, "recorded-form": -15, "projected-fitness": null }),
      expect.objectContaining({ index: 2, "recorded-form": -15, "projected-fitness": null }),
      expect.objectContaining({ index: 7, "recorded-form": -15, "projected-fitness": 42 }),
    ]);
    expect(view.getAllByTestId("scenario-line")).toHaveLength(6);
    expect(
      view.getAllByTestId("scenario-line").every((line) => line.props.connectMissingData === false),
    ).toBe(true);
    expect(view.getAllByTestId("scenario-marker").map((marker) => marker.props.shape)).toEqual([
      "circle",
      "square",
      "circle",
      "square",
      "circle",
      "square",
    ]);
    expect(view.getAllByTestId("scenario-dash")).toHaveLength(3);
  });

  it("renders an explicit unavailable state rather than an empty canvas", async () => {
    const view = await renderNative(
      <SessionScenarioComparison
        alternative={{ transitions: [] }}
        baseline={{ transitions: [] }}
        emptyMessage="No supported comparison"
        timeZone="UTC"
      />,
    );
    expect(view.getByText("No supported comparison")).toBeTruthy();
    expect(view.queryByTestId("scenario-canvas")).toBeNull();
  });
});
