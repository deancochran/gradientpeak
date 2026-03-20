import { fireEvent, renderNative } from "../../test/render-native";
import { Toggle } from "./index.native";

describe("Toggle native", () => {
  it("maps normalized test props and forwards pressed changes", () => {
    const onPressedChange = jest.fn();

    const { getByLabelText } = renderNative(
      <Toggle
        accessibilityLabel="Pin workout"
        onPressedChange={onPressedChange}
        pressed
        testId="pin-workout-toggle"
      >
        Pin
      </Toggle>,
    );

    const toggle = getByLabelText("Pin workout");

    expect(toggle.props.testID).toBe("pin-workout-toggle");
    fireEvent(toggle, "onPressedChange", false);
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });
});
