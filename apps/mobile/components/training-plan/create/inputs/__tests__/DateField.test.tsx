import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DateField } from "../DateField";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function createModalHost(type: string) {
  return function MockModal(props: any) {
    if (!props.visible) {
      return null;
    }

    return React.createElement(type, props, props.children);
  };
}

const { androidOpenMock } = vi.hoisted(() => ({
  androidOpenMock: vi.fn(),
}));

vi.mock("react-native", () => ({
  Modal: createModalHost("Modal"),
  Platform: { OS: "ios", Version: "17" },
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@repo/ui/components/label", () => ({
  Label: createHost("Label"),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: createHost("DateTimePicker"),
  DateTimePickerAndroid: {
    open: androidOpenMock,
  },
}));

describe("DateField", () => {
  it("opens a modal picker and confirms the selected date", () => {
    const onChange = vi.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <DateField
          id="anchor-date"
          label="Start On"
          value="2026-03-12"
          onChange={onChange}
          pickerPresentation="modal"
        />,
      );
    });

    const trigger = renderer.root.find(
      (node: any) => node.type === "Pressable",
    );
    act(() => {
      trigger.props.onPress();
    });

    const picker = renderer.root.find(
      (node: any) => node.type === "DateTimePicker",
    );
    act(() => {
      picker.props.onChange(
        { type: "set" },
        new Date("2026-04-15T00:00:00.000Z"),
      );
    });

    const doneButton = renderer.root
      .findAll((node: any) => node.type === "Button")
      .find((node: any) => node.props.children?.props?.children === "Done");

    act(() => {
      doneButton?.props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith("2026-04-15");
  });
});
