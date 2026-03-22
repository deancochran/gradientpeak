import { fireEvent, renderNative } from "../../test/render-native";
import { BoundedNumberInput } from "./index.native";

describe("BoundedNumberInput native", () => {
  it("normalizes bounded values on blur", () => {
    const onChange = jest.fn();

    const { getByPlaceholderText } = renderNative(
      <BoundedNumberInput
        id="ftp"
        label="FTP"
        value=""
        onChange={onChange}
        placeholder="Enter ftp"
        min={0}
        max={500}
        decimals={0}
      />,
    );

    const input = getByPlaceholderText("Enter ftp");
    fireEvent(input, "changeText", "250.4");
    fireEvent(input, "blur");

    expect(onChange).toHaveBeenLastCalledWith("250");
  });
});
