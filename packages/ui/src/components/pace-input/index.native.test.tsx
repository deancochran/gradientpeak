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
});
