import * as React from "react";

jest.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) => React.createElement("Slot.Text", props, props.children),
  };
});

import { fireEvent, renderNative } from "../../test/render-native";
import { Text } from "../text/index.native";
import { buttonFixtures } from "./fixtures";
import { Button } from "./index.native";

describe("Button native", () => {
  it("maps normalized test props and handles presses", () => {
    const onPress = jest.fn();

    const { getByLabelText } = renderNative(
      <Button {...buttonFixtures.save} onPress={onPress}>
        <Text>{buttonFixtures.save.children}</Text>
      </Button>,
    );

    const button = getByLabelText(buttonFixtures.save.accessibilityLabel);

    expect(button.props.testID).toBe(buttonFixtures.save.testId);
    expect(button.props.nativeID).toBe(buttonFixtures.save.id);

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
