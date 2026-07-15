import { fireEvent, renderNative } from "../../test/render-native";
import { PaceInput } from "./index.native";

describe("PaceInput native", () => {
  it("normalizes pace input on blur", () => {
    const onChange = jest.fn();

    const { getByPlaceholderText } = renderNative(
      <PaceInput id="pace" label="Pace" value="" onChange={onChange} />,
    );

    const input = getByPlaceholderText("e.g., 4:15");
    fireEvent(input, "changeText", "04:05");
    fireEvent(input, "blur");

    expect(onChange).toHaveBeenLastCalledWith("4:05");
  });

  it("forwards disabled, test, required, error, and blur semantics", () => {
    const onBlur = jest.fn();
    const onChange = jest.fn();
    const { getByTestId, rerender } = renderNative(
      <PaceInput
        disabled
        error="Invalid pace"
        helperText="Pace help"
        id="pace"
        label="Pace"
        onBlur={onBlur}
        onChange={onChange}
        required
        testId="pace-input"
        value="4:30"
      />,
    );
    const input = getByTestId("pace-input");

    fireEvent(input, "changeText", "5:00");

    expect(input.props.editable).toBe(false);
    expect(input.props["aria-required"]).toBe(true);
    expect(input.props["aria-invalid"]).toBe(true);
    expect(input.props.accessibilityHint).toContain("Pace help");
    expect(input.props.accessibilityHint).toContain("Error: Invalid pace");
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <PaceInput
        id="pace"
        label="Pace"
        onBlur={onBlur}
        onChange={onChange}
        testId="pace-input"
        value="4:30"
      />,
    );
    fireEvent(getByTestId("pace-input"), "blur");
    expect(onBlur).toHaveBeenCalled();
  });
});
