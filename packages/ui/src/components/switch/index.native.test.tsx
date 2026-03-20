import * as React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));
vi.mock("@rn-primitives/switch", () => {
  return {
    Root: (props: any) =>
      React.createElement("SwitchRoot", props, props.children),
    Thumb: (props: any) =>
      React.createElement("SwitchThumb", props, props.children),
  };
});

import { fireEvent, renderNative } from "../../test/render-native";
import { Switch } from "./index.native";

describe("Switch native", () => {
  it("maps normalized test props for the native-only switch", () => {
    const onCheckedChange = vi.fn();

    const { getByLabelText } = renderNative(
      <Switch
        accessibilityLabel="Email notifications"
        checked
        onCheckedChange={onCheckedChange}
        testId="email-notifications"
      />,
    );

    const switchRoot = getByLabelText("Email notifications");

    expect(switchRoot.props.testID).toBe("email-notifications");

    fireEvent(switchRoot, "onCheckedChange", false);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
