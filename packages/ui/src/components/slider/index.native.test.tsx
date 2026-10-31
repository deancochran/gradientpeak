import { NATIVE_THEME } from "../../lib/native-theme";
import { fireEvent, renderNative } from "../../test/render-native";
import { sliderFixtures } from "./fixtures";
import { Slider } from "./index.native";

describe("Slider native", () => {
  it("defaults to normalized units and rejects expired callbacks", async () => {
    const change = jest.fn();
    const view = await renderNative(<Slider testId="normalized" onValueChange={change} />);
    const slider = view.getByTestId("normalized");
    expect(slider.props).toMatchObject({ minimumValue: 0, maximumValue: 1, step: 0.01, value: 0 });
    const previousChange = slider.props.onValueChange;
    await view.rerender(<Slider testId="normalized" onValueChange={change} disabled />);
    previousChange(0.5);
    await view.rerender(<Slider testId="normalized" onValueChange={change} />);
    previousChange(0.75);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(view.getByTestId("normalized"), "onValueChange", 0.25);
    expect(change).toHaveBeenCalledWith(0.25);
  });
  it("forwards value change events", async () => {
    const onValueChange = jest.fn();

    const { getByTestId } = await renderNative(
      <Slider {...sliderFixtures.effort} onValueChange={onValueChange} />,
    );

    await fireEvent(getByTestId(sliderFixtures.effort.testId), "onValueChange", 0.75);
    expect(onValueChange).toHaveBeenCalledWith(0.75);
    expect(getByTestId(sliderFixtures.effort.testId).props.minimumTrackTintColor).toBe(
      NATIVE_THEME.light.primary,
    );
    expect(getByTestId(sliderFixtures.effort.testId).props.maximumTrackTintColor).toBe(
      NATIVE_THEME.light.input,
    );
  });
});
