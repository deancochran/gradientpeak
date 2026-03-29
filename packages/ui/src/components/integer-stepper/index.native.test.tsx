import { fireEvent, renderNative } from "../../test/render-native";
import { IntegerStepper } from "./index.native";

describe("IntegerStepper native", () => {
  it("clamps increment and decrement actions", () => {
    const onChange = jest.fn();

    const { getByLabelText } = renderNative(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        value={2}
        onChange={onChange}
        min={0}
        max={2}
      />,
    );

    fireEvent.press(getByLabelText("Increase Sessions"));
    fireEvent.press(getByLabelText("Decrease Sessions"));

    expect(onChange).toHaveBeenNthCalledWith(1, 2);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });
});
