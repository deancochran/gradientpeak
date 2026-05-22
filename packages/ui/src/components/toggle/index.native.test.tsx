import { fireEvent, renderNative } from "../../test/render-native";
import { Toggle } from "./index.native";

describe("Toggle native", () => {
  it("maps normalized test props and forwards pressed changes", () => {
    const onPressedChange = jest.fn();

    const { getByLabelText } = renderNative(
      <Toggle
        accessibilityLabel="Pin activity"
        onPressedChange={onPressedChange}
        pressed
        testId="pin-activity-toggle"
      >
        Pin
      </Toggle>,
    );

    const toggle = getByLabelText("Pin activity");

    expect(toggle.props.testID).toBe("pin-activity-toggle");
    fireEvent(toggle, "onPressedChange", false);
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });
});
