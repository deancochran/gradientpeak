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
});
