import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { PaceSecondsField } from "../PaceSecondsField";
import { WeightInputField } from "../WeightInputField";

vi.mock("react-native", () => ({
  View: (props: any) => React.createElement("View", props, props.children),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@repo/ui/components/bounded-number-input", () => ({
  BoundedNumberInput: (props: any) => React.createElement("BoundedNumberInput", props),
}));

vi.mock("@repo/ui/components/pace-input", () => ({
  PaceInput: (props: any) => React.createElement("PaceInput", props),
}));

const findNode = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.find((node: any) => node.type === type);

const findNodes = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node: any) => node.type === type);

describe("profile input wrappers", () => {
  it("converts displayed imperial weight back to kilograms", () => {
    const onChangeKg = vi.fn();
    const onUnitChange = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeightInputField
          id="weight"
          label="Weight"
          valueKg={72}
          onChangeKg={onChangeKg}
          unit="lbs"
          onUnitChange={onUnitChange}
        />,
      );
    });

    const input = findNode(renderer!, "BoundedNumberInput");
    expect(input.props.value).toBe("158.7");

    act(() => {
      input.props.onNumberChange(160);
    });

    expect(onChangeKg).toHaveBeenCalledWith(72.6);

    const buttons = findNodes(renderer!, "Button");
    act(() => {
      buttons[0]?.props.onPress();
    });

    expect(onUnitChange).toHaveBeenCalledWith("kg");
  });

  it("formats pace seconds for editing and maps cleared values to null", () => {
    const onChangeSeconds = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PaceSecondsField
          id="pace"
          label="Threshold pace"
          valueSeconds={255}
          onChangeSeconds={onChangeSeconds}
          unitLabel="/100m"
        />,
      );
    });

    const input = findNode(renderer!, "PaceInput");
    expect(input.props.value).toBe("4:15");
    expect(input.props.unitLabel).toBe("/100m");

    act(() => {
      input.props.onPaceSecondsChange(undefined);
    });

    expect(onChangeSeconds).toHaveBeenCalledWith(null);
  });
});
