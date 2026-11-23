import mockReact from "react";
import { renderNative } from "../../test/render-native";
import { thresholdHistoryFixtures } from "./fixtures";
import { ThresholdHistoryChart } from "./index.native";

jest.mock("victory-native", () => ({
  CartesianChart: ({ children, data, xKey, yKeys }: any) =>
    mockReact.createElement(
      "CartesianChart",
      { data, testID: "threshold-history-cartesian-chart", xKey, yKeys },
      children({
        points: {
          value: data.map((datum: any) => ({
            x: datum.timestamp,
            y: datum.value,
            yValue: datum.value,
          })),
        },
      }),
    ),
  Line: (props: any) => mockReact.createElement("VictoryLine", props),
  Scatter: (props: any) => mockReact.createElement("VictoryScatter", props),
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
});
