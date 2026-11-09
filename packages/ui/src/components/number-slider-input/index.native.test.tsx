import { fireEvent, renderNative, screen } from "@repo/ui/test/render-native";
import { act, createRef } from "react";
import { NumberSliderInput } from "./index.native";

describe("NumberSliderInput", () => {
  it("supports an exact-entry-only row without sliders or nudges and preserves invalid focus", async () => {
    const ref = createRef<{ focus: () => void }>();
    const change = jest.fn();
    await renderNative(
      <NumberSliderInput
        ref={ref}
        compactHeader
        inlineValueEditor
        showSlider={false}
        label="Effort"
        min={1}
        max={10}
        value={5.1234}
        onChange={change}
        testId="effort"
      />,
    );
    expect(screen.queryByTestId("effort-slider")).toBeNull();
    expect(screen.queryAllByLabelText(/^(Increase|Decrease) /)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText("Effort: 5.1234"));
    await fireEvent(screen.getByLabelText("Effort exact value"), "changeText", "bad");
    await act(() => ref.current?.focus());
    expect(screen.getByLabelText("Effort exact value").props.value).toBe("bad");
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Effort exact value"), "changeText", "5.5");
    expect(change).toHaveBeenCalledWith(5.5);
  });
  it("opens exact entry for error focus without replacing invalid text, until explicit adjustment", async () => {
    const ref = createRef<{ focus: () => void }>();
    const change = jest.fn();
    const invalid = jest.fn();
    await renderNative(
      <NumberSliderInput
        ref={ref}
        inlineValueEditor
        label="Dose"
        min={1}
        max={10}
        value={5}
        onChange={change}
        onExactValueInvalidChange={invalid}
        showAdjustmentButtons
        adjustmentStep={1}
      />,
    );
    await act(() => ref.current?.focus());
    await fireEvent(screen.getByLabelText("Dose exact value"), "changeText", "bad");
    await act(() => ref.current?.focus());
    expect(screen.getByLabelText("Dose exact value").props.value).toBe("bad");
    expect(change).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenLastCalledWith(true);
    await fireEvent.press(screen.getByLabelText("Increase Dose"));
    expect(change).toHaveBeenLastCalledWith(6);
    expect(invalid).toHaveBeenLastCalledWith(false);
    expect(screen.queryByLabelText("Dose exact value")).toBeNull();
  });
  it("puts one current value beside the label without endpoint labels in compact mode", async () => {
    await renderNative(
      <NumberSliderInput
        compactHeader
        inlineValueEditor
        label="Intensity"
        max={10}
        min={0}
        onChange={jest.fn()}
        testId="intensity"
        value={5}
      />,
    );

    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByTestId("intensity-current-value")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("10")).toBeNull();
    expect(screen.queryByTestId("intensity-inline-value")).toBeNull();
  });

  it("uses the same anchored +/- adjustment contract on native", async () => {
    const onChange = jest.fn();
    await renderNative(
      <NumberSliderInput
        adjustmentStep={5}
        label="Heart rate"
        max={200}
        min={1}
        onChange={onChange}
        showAdjustmentButtons
        step={5}
        value={153}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Increase Heart rate"));
    await fireEvent.press(screen.getByLabelText("Decrease Heart rate"));

    expect(onChange).toHaveBeenNthCalledWith(1, 155);
    expect(onChange).toHaveBeenNthCalledWith(2, 150);
  });

  it("maps min-one five-step slider indices onto canonical multiples", async () => {
    const onChange = jest.fn();
    await renderNative(
      <NumberSliderInput
        label="Grid"
        max={20}
        min={1}
        onChange={onChange}
        step={5}
        testId="grid"
        value={5}
      />,
    );
    const slider = screen.getByTestId("grid-slider");
    expect(slider.props.minimumValue).toBe(1);
    expect(slider.props.maximumValue).toBe(4);
    await fireEvent(slider, "valueChange", 2);
    expect(onChange).toHaveBeenCalledWith(10);
  });
});
