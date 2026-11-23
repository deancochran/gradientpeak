import mockReact, { type ReactNode } from "react";
import { renderNative } from "../../test/render-native";
import { thresholdHistoryFixtures } from "./fixtures";
import { ThresholdHistoryChart } from "./index.native";

type ChartDatum = { timestamp: number; value: number | null };
type ChartPoint = { x: number; y: number | null; yValue: number | null };
type CartesianChartMockProps = {
  children: (input: { points: { value: readonly ChartPoint[] } }) => ReactNode;
  data: readonly ChartDatum[];
  xKey: string;
  yKeys: readonly string[];
};

jest.mock("victory-native", () => ({
  CartesianChart: ({ children, data, xKey, yKeys }: CartesianChartMockProps) =>
    mockReact.createElement(
      "CartesianChart",
      { data, testID: "threshold-history-cartesian-chart", xKey, yKeys },
      children({
        points: {
          value: data.map((datum) => ({
            x: datum.timestamp,
            y: datum.value,
            yValue: datum.value,
          })),
        },
      }),
    ),
  Line: (props: Record<string, unknown>) =>
    mockReact.createElement("VictoryLine", { ...props, testID: "victory-line" }),
  Scatter: (props: Record<string, unknown>) => mockReact.createElement("VictoryScatter", props),
}));

describe("ThresholdHistoryChart native", () => {
  it("announces metric identity, chronological records, and the latest formatted value", async () => {
    const { getByLabelText } = await renderNative(
      <ThresholdHistoryChart
        emptyMessage="No values"
        series={thresholdHistoryFixtures.bikePower}
        testId="threshold-history-native"
      />,
    );

    expect(getByLabelText(/bike power history with 2 chronological records.*260 W/i)).toBeTruthy();
  });

  it("keeps elapsed timestamp spacing and inserts a real gap for a policy change", async () => {
    const [firstPoint, secondPoint] = thresholdHistoryFixtures.bikePower.points;
    if (!firstPoint || !secondPoint) throw new Error("Threshold fixture is incomplete");
    const { getByTestId } = await renderNative(
      <ThresholdHistoryChart
        emptyMessage="No values"
        series={{
          activityCategory: "bike",
          id: "bike:power:watts",
          metric: "power",
          points: [
            {
              ...firstPoint,
              effectiveAt: "2026-01-01T00:00:00Z",
            },
            {
              ...secondPoint,
              effectiveAt: "2026-01-02T00:00:00Z",
            },
            {
              ...secondPoint,
              effectiveAt: "2026-01-11T00:00:00Z",
              policyVersion: "threshold-policy-v2",
              thresholdId: "bike-power-policy-change",
            },
          ],
          unit: "watts",
        }}
      />,
    );

    const data = getByTestId("threshold-history-cartesian-chart").props.data;
    expect(data.map((datum: { timestamp: number; value: number | null }) => datum.value)).toEqual([
      240,
      260,
      null,
      260,
    ]);
    expect(data[1].timestamp - data[0].timestamp).toBe(24 * 60 * 60 * 1000);
    expect(data[3].timestamp - data[1].timestamp).toBe(9 * 24 * 60 * 60 * 1000);
    expect(getByTestId("victory-line").props.connectMissingData).toBe(false);
  });
});
