import { fireEvent, renderNative } from "../../test/render-native";
import { DurationInput } from "./index.native";

describe("DurationInput native", () => {
  it("normalizes duration input on blur", () => {
    const onChange = jest.fn();

    const { getByPlaceholderText } = renderNative(
      <DurationInput id="duration" label="Duration" value="" onChange={onChange} />,
    );

    const input = getByPlaceholderText("e.g., 1:35:00");
    fireEvent(input, "changeText", "20:00");
    fireEvent(input, "blur");

    expect(onChange).toHaveBeenLastCalledWith("0:20:00");
  });

  it("forwards disabled, test, required, error, and blur semantics", () => {
    const onBlur = jest.fn();
    const onChange = jest.fn();
    const { getByTestId, rerender } = renderNative(
      <DurationInput
        disabled
        error="Invalid duration"
        helperText="Duration help"
        id="duration"
        label="Duration"
        onBlur={onBlur}
        onChange={onChange}
        required
        testId="duration-input"
        value="0:20:00"
      />,
    );
    const input = getByTestId("duration-input");

    fireEvent(input, "changeText", "0:30:00");

    expect(input.props.editable).toBe(false);
    expect(input.props["aria-required"]).toBe(true);
    expect(input.props["aria-invalid"]).toBe(true);
    expect(input.props.accessibilityHint).toContain("Duration help");
    expect(input.props.accessibilityHint).toContain("Error: Invalid duration");
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <DurationInput
        id="duration"
        label="Duration"
        onBlur={onBlur}
        onChange={onChange}
        testId="duration-input"
        value="0:20:00"
      />,
    );
    fireEvent(getByTestId("duration-input"), "blur");
    expect(onBlur).toHaveBeenCalled();
  });
});
