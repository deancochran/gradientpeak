import { fireEvent, renderNative } from "../../test/render-native";
import { IntegerStepper } from "./index.native";

describe("IntegerStepper native", () => {
  it("clamps increment and decrement actions", async () => {
    const onChange = jest.fn();

    const { getByLabelText } = await renderNative(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        value={2}
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
});
