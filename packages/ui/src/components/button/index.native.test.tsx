import * as React from "react";

jest.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) => React.createElement("Slot.Text", props, props.children),
  };
});

import { fireEvent, renderNative } from "../../test/render-native";
import { Text } from "../text/index.native";
import { buttonFixtures } from "./fixtures";
import { Button, IconButton } from "./index.native";

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

  it("enforces a 48dp target and merges disabled accessibility state", () => {
    const { getByLabelText } = renderNative(
      <Button
        accessibilityLabel="Disabled action"
        accessibilityState={{ busy: true, selected: true }}
        className="rounded-full"
        disabled
      >
        <Text>Disabled</Text>
      </Button>,
    );

    const button = getByLabelText("Disabled action");

    expect(button.props.className).toContain("min-h-12");
    expect(button.props.className).toContain("min-w-12");
    expect(button.props.className).toContain("rounded-full");
    expect(button.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
      selected: true,
    });
  });

  it("provides a labeled, stable icon-only button contract", () => {
    const { getByLabelText } = renderNative(
      <IconButton {...buttonFixtures.moreActions}>
        <Text>⋯</Text>
      </IconButton>,
    );

    const button = getByLabelText(buttonFixtures.moreActions.accessibilityLabel);

    expect(button.props.testID).toBe(buttonFixtures.moreActions.testId);
    expect(button.props.nativeID).toBe(buttonFixtures.moreActions.id);
    expect(button.props.className).toContain("min-h-12");
    expect(button.props.className).toContain("min-w-12");
  });

  it("uses the contrast-safe destructive surface token", () => {
    const { getByLabelText } = renderNative(
      <Button accessibilityLabel="Delete item" variant="destructive">
        <Text>Delete</Text>
      </Button>,
    );

    expect(getByLabelText("Delete item").props.className).toContain("bg-destructive-surface");
  });
});
