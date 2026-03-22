import { fireEvent, renderNative } from "../../test/render-native";
import { sliderFixtures } from "./fixtures";
import { Slider } from "./index.native";

describe("Slider native", () => {
  it("forwards value change events", () => {
    const onValueChange = jest.fn();

    const { getByTestId } = renderNative(
      <Slider {...sliderFixtures.effort} onValueChange={onValueChange} />,
    );

    fireEvent(getByTestId(sliderFixtures.effort.testId), "onValueChange", 0.75);
    expect(onValueChange).toHaveBeenCalledWith(0.75);
  });
});
