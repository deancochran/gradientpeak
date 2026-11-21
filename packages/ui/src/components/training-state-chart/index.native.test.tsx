import { View } from "react-native";
import { renderNative } from "../../test/render-native";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart } from "./index.native";

describe("TrainingStateChart native", () => {
  it("exposes the injected plot with shared recorded accessibility semantics", async () => {
    const { getByTestId } = await renderNative(
      <TrainingStateChart
        emptyMessage="No training state"
        metric="form"
        source="recorded"
        testId="training-state-native-chart"
        visual={trainingStateChartFixtures.mixedSeries}
      >
        <View testID="injected-native-plot" />
      </TrainingStateChart>,
    );

    expect(getByTestId("training-state-native-chart")).toBeTruthy();
    expect(getByTestId("injected-native-plot")).toBeTruthy();
  });

  it("uses the explicit empty state rather than fabricating a zero plot", async () => {
    const { getByText, queryByTestId } = await renderNative(
      <TrainingStateChart
        emptyMessage="No projected fatigue"
        metric="fatigue"
        source="projected"
        testId="training-state-native-chart"
        visual={{
          ...trainingStateChartFixtures.mixedSeries,
          points: trainingStateChartFixtures.mixedSeries.points.map((point) => ({
            ...point,
            projected: { ...point.projected, fatigue: null },
          })),
        }}
      >
        <View testID="injected-native-plot" />
      </TrainingStateChart>,
    );

    expect(getByText("No projected fatigue")).toBeTruthy();
    expect(queryByTestId("injected-native-plot")).toBeNull();
  });
});
