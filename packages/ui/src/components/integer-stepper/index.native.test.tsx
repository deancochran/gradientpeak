import { fireEvent, renderNative } from "../../test/render-native";
import { IntegerStepper } from "./index.native";

describe("IntegerStepper native", () => {
  it("tactile actions are bounded and invalid exact input survives blur and picker switching", async () => {
    const change = jest.fn();
    const invalid = jest.fn();
    const { getByLabelText, queryByLabelText } = await renderNative(
      <IntegerStepper
        presentation="tactile"
        label="Reps"
        value={1}
        min={1}
        max={2}
        onChange={change}
        onInvalidChange={invalid}
      />,
    );
    expect(queryByLabelText("Reps")).toBeNull();
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText("Decrease Reps"));
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText("Increase Reps"));
    await fireEvent.press(getByLabelText("Increase Reps"));
    expect(change.mock.calls).toEqual([[2]]);
    await fireEvent.press(getByLabelText("Enter exact Reps"));
    await fireEvent(getByLabelText("Reps"), "changeText", "1.5");
    await fireEvent(getByLabelText("Reps"), "blur");
    await fireEvent.press(getByLabelText("Use Reps buttons"));
    await fireEvent.press(getByLabelText("Decrease Reps"));
    expect(getByLabelText("Reps").props.value).toBe("1.5");
    expect(invalid).toHaveBeenLastCalledWith(true);
    expect(change.mock.calls).toEqual([[2]]);
  });
  it("clamps increment and decrement actions", async () => {
    const onChange = jest.fn();

    const { getByLabelText } = await renderNative(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        value={1}
        onChange={onChange}
        min={0}
        max={2}
      />,
    );

    await fireEvent.press(getByLabelText("Increase Sessions"));
    await fireEvent.press(getByLabelText("Decrease Sessions"));

    expect(onChange).toHaveBeenNthCalledWith(1, 2);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it("forwards its stable test ID to the editable value", async () => {
    const { getByLabelText, getByTestId } = await renderNative(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        value={2}
        onChange={jest.fn()}
        testId="preferences-min-sessions"
      />,
    );

    expect(getByTestId("preferences-min-sessions")).toBeTruthy();
    expect(getByLabelText("Sessions").props.accessibilityState).toEqual({ disabled: false });
  });

  it("disables boundary actions and every control when disabled", async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId } = await renderNative(
      <IntegerStepper
        disabled
        id="sessions"
        label="Sessions"
        max={2}
        min={0}
        onChange={onChange}
        testId="sessions-input"
        value={0}
      />,
    );

    const input = getByTestId("sessions-input");
    const decrease = getByLabelText("Decrease Sessions");
    const increase = getByLabelText("Increase Sessions");

    expect(input.props.editable).toBe(false);
    expect(input.props.accessibilityLabel).toBe("Sessions");
    expect(input.props.accessibilityState).toEqual({ disabled: true });
    expect(input.props.accessibilityValue).toEqual({ max: 2, min: 0, now: 0 });
    expect(decrease.props.disabled).toBe(true);
    expect(increase.props.disabled).toBe(true);

    await fireEvent.press(decrease);
    await fireEvent.press(increase);
    await fireEvent(input, "changeText", "2");
    await fireEvent(input, "blur");

    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe("0");
  });

  it("uses the current valid draft when a button is pressed", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await renderNative(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        max={5}
        min={0}
        onChange={onChange}
        value={1}
      />,
    );
    const input = getByLabelText("Sessions");

    await fireEvent(input, "changeText", "4");
    await fireEvent.press(getByLabelText("Increase Sessions"));

    expect(onChange).toHaveBeenCalledWith(5);
    expect(input.props.value).toBe("5");
  });
});
