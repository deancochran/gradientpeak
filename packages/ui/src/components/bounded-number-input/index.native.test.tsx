import { fireEvent, renderNative } from "../../test/render-native";
import { BoundedNumberInput } from "./index.native";

describe("BoundedNumberInput native", () => {
  it("keeps partial values while typing and only clamps on blur", () => {
    const onChange = jest.fn();
    const onNumberChange = jest.fn();

    const { getByPlaceholderText } = renderNative(
      <BoundedNumberInput
        id="weight"
        label="Weight"
        value=""
        onChange={onChange}
        onNumberChange={onNumberChange}
        placeholder="70.0"
        min={30}
        max={300}
        decimals={1}
      />,
    );

    const input = getByPlaceholderText("70.0");

    fireEvent(input, "changeText", "7");

    expect(onChange).toHaveBeenLastCalledWith("7");
    expect(onNumberChange).toHaveBeenLastCalledWith(7);

    fireEvent(input, "blur");

    expect(onChange).toHaveBeenLastCalledWith("30");
    expect(onNumberChange).toHaveBeenLastCalledWith(30);
  });

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
