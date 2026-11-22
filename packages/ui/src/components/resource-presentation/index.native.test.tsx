import { fireEvent, renderNative } from "../../test/render-native";
import { Text } from "../text/index.native";
import { ResourceCardShell, ResourceMetricsRow } from "./index.native";

describe("Resource presentation native", () => {
  it("keeps secondary actions outside the primary 44dp navigation target", async () => {
    const onOpen = jest.fn();
    const onShare = jest.fn();
    const { getByLabelText } = await renderNative(
      <ResourceCardShell
        accessibilityLabel="Open route Ridge loop"
        actionRegion={
          <Text accessibilityLabel="Share route" accessibilityRole="button" onPress={onShare}>
            Share
          </Text>
        }
        onPress={onOpen}
      >
        <Text>Ridge loop</Text>
      </ResourceCardShell>,
    );

    await fireEvent.press(getByLabelText("Share route"));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    const navigation = getByLabelText("Open route Ridge loop");
    expect(navigation.props.accessibilityRole).toBe("button");
    await fireEvent.press(navigation);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders unavailable values supplied by the app presentation model", async () => {
    const { getByText } = await renderNative(
      <ResourceMetricsRow metrics={[{ label: "Distance", value: "—" }]} />,
    );

    expect(getByText("Distance")).toBeTruthy();
    expect(getByText("—")).toBeTruthy();
  });

  it("keeps all compact metrics unless the app asks for a limit", async () => {
    const { getByText } = await renderNative(
      <ResourceMetricsRow
        compact
        metrics={[
          { label: "Distance", value: "10 km" },
          { label: "Duration", value: "30m" },
          { label: "Load", value: "72" },
          { label: "Intensity", value: "0.80" },
        ]}
      />,
    );

    expect(getByText("Intensity")).toBeTruthy();
    expect(getByText("0.80")).toBeTruthy();
  });
});
