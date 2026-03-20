import * as React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));
vi.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) =>
      React.createElement("Slot.Text", props, props.children),
  };
});

import { Text } from "../text/index.native";
import { fireEvent, renderNative } from "../../test/render-native";
import { Button } from "./index.native";

describe("Button native", () => {
  it("maps normalized test props and handles presses", () => {
    const onPress = vi.fn();

    const { getByLabelText } = renderNative(
      <Button
        accessibilityLabel="Save changes"
        id="save-button"
        onPress={onPress}
        testId="settings-save"
      >
        <Text>Save</Text>
      </Button>,
    );

    const button = getByLabelText("Save changes");

    expect(button.props.testID).toBe("settings-save");
    expect(button.props.nativeID).toBe("save-button");

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
