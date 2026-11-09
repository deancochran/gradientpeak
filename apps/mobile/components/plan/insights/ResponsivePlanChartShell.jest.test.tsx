import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Line: createHost("Line"),
}));

const { ResponsivePlanChartShell } = require("./ResponsivePlanChartShell");

it("shares responsive labels, lifecycle state, and responder nearest selection", async () => {
  const onNearestX = jest.fn();
  await renderNative(
    <ResponsivePlanChartShell
      axisLabel="Load"
      emptyLabel="No points"
      endLabel="May 6"
      goalColor="goal"
      gridColor="grid"
      legend="Actual"
      onNearestX={onNearestX}
      selectedLabel="Apr 15"
      startLabel="Mar 26"
      summary="Load from Mar 26 to May 6"
      testID="shared-chart"
      todayColor="today"
      todayPosition={0.5}
      yLabels={["100", "50", "0"]}
    >
      {() => null}
    </ResponsivePlanChartShell>,
  );

  expect(screen.getByTestId("shared-chart-dates")).toBeTruthy();
  expect(screen.getByTestId("shared-chart-legend")).toBeTruthy();
  const interaction = screen.getByTestId("shared-chart-interaction");
  await fireEvent(interaction, "layout", { nativeEvent: { layout: { width: 100 } } });
  expect(screen.getByTestId("shared-chart-plot").props.viewBox).toBe("0 0 100 172");
  await fireEvent(interaction, "responderRelease", {
    nativeEvent: { locationX: 120 },
  });
  expect(onNearestX).toHaveBeenCalledWith(
    92,
    expect.objectContaining({ left: 42, right: 92, width: 100 }),
  );
});
