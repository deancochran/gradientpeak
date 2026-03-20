import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/ui/components/button", () => ({
  Button: (props: any) =>
    React.createElement(
      "Button",
      { ...props, testID: props.testId },
      props.children,
    ),
}));

vi.mock("@repo/ui/components/card", () => ({
  Card: (props: any) =>
    React.createElement(
      "Card",
      { ...props, testID: props.testId },
      props.children,
    ),
  CardContent: (props: any) =>
    React.createElement("CardContent", props, props.children),
  CardDescription: (props: any) =>
    React.createElement("CardDescription", props, props.children),
  CardHeader: (props: any) =>
    React.createElement("CardHeader", props, props.children),
  CardTitle: (props: any) =>
    React.createElement("CardTitle", props, props.children),
}));

vi.mock("@repo/ui/components/separator", () => ({
  Separator: (props: any) =>
    React.createElement("Separator", props, props.children),
}));

vi.mock("@repo/ui/components/switch", () => ({
  Switch: (props: any) =>
    React.createElement(
      "Switch",
      { ...props, testID: props.testId },
      props.children,
    ),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

import { SettingItem, SettingsGroup } from "../SettingsGroup";

describe("SettingsGroup", () => {
  it("adopts shared testId props and still exposes native testID hooks", () => {
    const onPress = vi.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SettingsGroup testID="account-section" title="Account">
          <SettingItem
            buttonLabel="Edit"
            label="Profile"
            onPress={onPress}
            testID="edit-profile"
            type="button"
          />
        </SettingsGroup>,
      );
    });

    const card = renderer!.root.findByProps({ testID: "account-section" });
    const button = renderer!.root.findByProps({
      testID: "edit-profile-button",
    });

    expect(card.props.testID).toBe("account-section");

    act(() => {
      button.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
