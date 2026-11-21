import { fireEvent, renderNative } from "../../test/render-native";
import { IntegerStepper } from "./index.native";

describe("IntegerStepper native", () => {
  it("opens a bounded native count dial and publishes a selected value", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <IntegerStepper label="Repeats" value={1} min={1} max={10_000} onChange={change} />,
    );
    await fireEvent.press(view.getByLabelText("Repeats"));
    await fireEvent(view.getByLabelText("Repeats thousands"), "valueChange", 9);
    expect(change).toHaveBeenLastCalledWith(9001);
  });

  it("keeps +/- bounded and has no manual/exact-entry toggle", async () => {
    const change = jest.fn();
    const { getByLabelText, queryByLabelText, queryByText } = await renderNative(
      <IntegerStepper
        presentation="tactile"
        label="Reps"
        value={1}
        min={1}
        max={2}
        onChange={change}
      />,
    );
    await fireEvent.press(getByLabelText("Decrease Reps"));
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText("Increase Reps"));
    expect(change).toHaveBeenLastCalledWith(2);
    expect(queryByLabelText("Enter exact Reps")).toBeNull();
    expect(queryByText("Use buttons")).toBeNull();
  });

  it("disables both controls when disabled", async () => {
    const { getByLabelText, getByTestId } = await renderNative(
      <IntegerStepper
        disabled
        label="Sessions"
        value={0}
        min={0}
        max={2}
        onChange={jest.fn()}
        testId="sessions-input"
      />,
    );
    expect(getByTestId("sessions-input").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(getByLabelText("Decrease Sessions").props.disabled).toBe(true);
    expect(getByLabelText("Increase Sessions").props.disabled).toBe(true);
  });
});
