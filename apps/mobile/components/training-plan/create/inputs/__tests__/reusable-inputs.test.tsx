import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DurationInput } from "../DurationInput";
import { IntegerStepper } from "../IntegerStepper";
import { PaceInput } from "../PaceInput";
import { PercentSliderInput } from "../PercentSliderInput";

vi.mock("react-native", () => ({
  View: (props: any) => React.createElement("View", props, props.children),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => React.createElement("Input", props),
}));

vi.mock("@/components/ui/label", () => ({
  Label: (props: any) => React.createElement("Label", props, props.children),
}));

vi.mock("@/components/ui/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: (props: any) => React.createElement("Slider", props, props.children),
}));

const findMockNode = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.find((node: any) => node.type === type);

const findMockNodes = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node: any) => node.type === type);

describe("training-plan reusable inputs", () => {
  it("normalizes DurationInput on blur", () => {
    const onChange = vi.fn();
    const onDurationSecondsChange = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <DurationInput
          id="duration"
          label="Duration"
          value=""
          onChange={onChange}
          onDurationSecondsChange={onDurationSecondsChange}
        />,
      );
    });

    const input = findMockNode(renderer!, "Input");
    act(() => {
      input.props.onChangeText("20:00");
    });

    act(() => {
      input.props.onBlur();
    });

    expect(onChange).toHaveBeenNthCalledWith(1, "20:00");
    expect(onChange).toHaveBeenNthCalledWith(2, "0:20:00");
    expect(onDurationSecondsChange).toHaveBeenNthCalledWith(1, undefined);
    expect(onDurationSecondsChange).toHaveBeenNthCalledWith(2, 1200);
  });

  it("normalizes PaceInput on blur", () => {
    const onChange = vi.fn();
    const onPaceSecondsChange = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PaceInput
          id="pace"
          label="Pace"
          value=""
          onChange={onChange}
          onPaceSecondsChange={onPaceSecondsChange}
        />,
      );
    });

    const input = findMockNode(renderer!, "Input");
    act(() => {
      input.props.onChangeText("04:05");
    });

    act(() => {
      input.props.onBlur();
    });

    expect(onChange).toHaveBeenNthCalledWith(1, "04:05");
    expect(onChange).toHaveBeenNthCalledWith(2, "4:05");
    expect(onPaceSecondsChange).toHaveBeenNthCalledWith(1, 245);
    expect(onPaceSecondsChange).toHaveBeenNthCalledWith(2, 245);
  });

  it("enforces IntegerStepper increment and decrement boundaries", () => {
    const onChange = vi.fn();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IntegerStepper
          id="sessions"
          label="Sessions"
          value={3}
          min={3}
          max={6}
          step={2}
          onChange={onChange}
        />,
      );
    });

    const buttons = findMockNodes(renderer!, "Button");
    const decrease = buttons.find(
      (button: any) => button.props.accessibilityLabel === "Decrease Sessions",
    );
    const increase = buttons.find(
      (button: any) => button.props.accessibilityLabel === "Increase Sessions",
    );

    act(() => {
      decrease?.props.onPress();
      increase?.props.onPress();
    });

    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 5);
  });

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
