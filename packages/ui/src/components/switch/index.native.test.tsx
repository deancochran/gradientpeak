import * as React from "react";

jest.mock("@rn-primitives/switch", () => {
  return {
    Root: (props: any) => React.createElement("SwitchRoot", props, props.children),
    Thumb: (props: any) => React.createElement("SwitchThumb", props, props.children),
  };
});

import { fireEvent, renderNative } from "../../test/render-native";
import { switchFixtures } from "./fixtures";
import { Switch } from "./index.native";

describe("Switch native", () => {
  it("maps normalized test props for the native-only switch", () => {
    const onCheckedChange = jest.fn();

    const { getByLabelText } = renderNative(
      <Switch {...switchFixtures.notifications} checked onCheckedChange={onCheckedChange} />,
    );

    const switchRoot = getByLabelText(switchFixtures.notifications.accessibilityLabel);

    expect(switchRoot.props.testID).toBe(switchFixtures.notifications.testId);
    expect(switchRoot.props.nativeID).toBe(switchFixtures.notifications.id);

    fireEvent(switchRoot, "onCheckedChange", false);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
