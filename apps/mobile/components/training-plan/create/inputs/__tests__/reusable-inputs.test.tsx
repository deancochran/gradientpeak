import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { PercentSliderInput } from "../PercentSliderInput";

vi.mock("react-native", () => ({
  View: (props: any) => React.createElement("View", props, props.children),
}));

vi.mock("@repo/ui/components/input", () => ({
  Input: (props: any) => React.createElement("Input", props),
}));

vi.mock("@repo/ui/components/label", () => ({
  Label: (props: any) => React.createElement("Label", props, props.children),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

vi.mock("@repo/ui/components/slider", () => ({
  Slider: (props: any) => React.createElement("Slider", props, props.children),
}));

const findMockNode = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.find((node: any) => node.type === type);

describe("training-plan reusable inputs", () => {
  it("commits numeric PercentSliderInput values and falls back on invalid blur", () => {
    const onChange = vi.fn();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PercentSliderInput
          id="tss-ramp"
          label="TSS ramp"
          value={12.5}
          min={0}
          max={20}
          decimals={1}
          onChange={onChange}
        />,
      );
    });

    const input = findMockNode(renderer!, "Input");

    act(() => {
      input.props.onChangeText("22.77");
    });

    act(() => {
      input.props.onBlur();
    });

    expect(onChange).toHaveBeenCalledWith(20);
    expect(findMockNode(renderer!, "Input").props.value).toBe("20");

    act(() => {
      renderer!.update(
        <PercentSliderInput
          id="tss-ramp"
          label="TSS ramp"
          value={12.5}
          min={0}
          max={20}
          decimals={1}
          onChange={onChange}
        />,
      );
    });

    const resetInput = findMockNode(renderer!, "Input");
    act(() => {
      resetInput.props.onChangeText("not-a-number");
    });

    act(() => {
      resetInput.props.onBlur();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(findMockNode(renderer!, "Input").props.value).toBe("12.5");
  });
});
