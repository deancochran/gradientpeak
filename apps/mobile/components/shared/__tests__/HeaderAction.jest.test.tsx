import React from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: ({ as: Icon }: { as: React.ElementType }) => React.createElement(Icon),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: "Text",
}));

const { HeaderIconAction, HeaderTextAction } = require("../HeaderAction");

describe("header actions", () => {
  it("labels and invokes a text action", () => {
    const onPress = jest.fn();

    renderNative(
      <HeaderTextAction
        accessibilityLabel="Create goal"
        label="Create"
        onPress={onPress}
        testID="create-goal"
      />,
    );

    fireEvent.press(screen.getByTestId("create-goal"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("create-goal").props.accessibilityLabel).toBe("Create goal");
  });

  it("disables an icon action while loading", () => {
    const onPress = jest.fn();
    const Add = () => null;

    renderNative(
      <HeaderIconAction
        accessibilityLabel="Add item"
        icon={Add}
        loading
        onPress={onPress}
        testID="add-item"
      />,
    );

    expect(screen.getByTestId("add-item").props.disabled).toBe(true);
    expect(screen.getByTestId("add-item").props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
  });
});
