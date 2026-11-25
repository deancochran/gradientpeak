import { Text } from "react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { Toggle } from "./index.native";

describe("Toggle native", () => {
  it("maps normalized test props and forwards pressed changes", async () => {
    const onPressedChange = jest.fn();

    const { getByLabelText } = await renderNative(
      <Toggle
        accessibilityLabel="Pin activity"
        onPressedChange={onPressedChange}
        pressed
        testId="pin-activity-toggle"
      >
        <Text>Pin</Text>
      </Toggle>,
    );

    const toggle = getByLabelText("Pin activity");

    expect(toggle.props.testID).toBe("pin-activity-toggle");
    await fireEvent(toggle, "onPressedChange", false);
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });
});
