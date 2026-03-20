import { fireEvent, renderNative } from "../../test/render-native";
import { Slider } from "./index.native";

describe("Slider native", () => {
  it("forwards value change events", () => {
    const onValueChange = jest.fn();

    const { getByTestId } = renderNative(
      <Slider
        {...({ testID: "effort-slider" } as { testID: string })}
        onValueChange={onValueChange}
        value={0.4}
      />,
    );

    fireEvent(getByTestId("effort-slider"), "onValueChange", 0.75);
    expect(onValueChange).toHaveBeenCalledWith(0.75);
  });
});
