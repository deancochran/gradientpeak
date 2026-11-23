import { renderNative } from "../../test/render-native";
import { thresholdHistoryFixtures } from "./fixtures";
import { ThresholdHistoryChart } from "./index.native";

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
