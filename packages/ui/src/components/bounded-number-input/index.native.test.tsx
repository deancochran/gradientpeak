import { fireEvent, renderNative } from "../../test/render-native";
import { BoundedNumberInput } from "./index.native";

describe("BoundedNumberInput native", () => {
  it("keeps partial values while typing and only clamps on blur", async () => {
    const onChange = jest.fn();
    const onNumberChange = jest.fn();

    const { getByPlaceholderText } = await renderNative(
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

    await fireEvent(input, "changeText", "7");

    expect(onChange).toHaveBeenLastCalledWith("7");
    expect(onNumberChange).toHaveBeenLastCalledWith(7);

    await fireEvent(input, "blur");

    expect(onChange).toHaveBeenLastCalledWith("30");
    expect(onNumberChange).toHaveBeenLastCalledWith(30);
  });

  it("normalizes bounded values on blur", async () => {
    const onChange = jest.fn();

    const { getByPlaceholderText } = await renderNative(
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
    await fireEvent(input, "changeText", "250.4");
    await fireEvent(input, "blur");

    expect(onChange).toHaveBeenLastCalledWith("250");
  });

  it("forwards the test ID and uses the matching numeric keyboard", async () => {
    const { getByTestId } = await renderNative(
      <>
        <BoundedNumberInput
          decimals={0}
          label="FTP"
          onChange={jest.fn()}
          testID="ftp-input"
          value=""
        />
        <BoundedNumberInput
          decimals={2}
          label="Intensity factor"
          onChange={jest.fn()}
          testID="intensity-factor-input"
          value=""
        />
      </>,
    );

    expect(getByTestId("ftp-input").props.keyboardType).toBe("numeric");
    expect(getByTestId("intensity-factor-input").props.keyboardType).toBe("decimal-pad");
  });

  it("blocks changes, commits, and presets while disabled", async () => {
    const onChange = jest.fn();
    const onNumberChange = jest.fn();

    const { getByLabelText, getByText } = await renderNative(
      <BoundedNumberInput
        disabled
        id="ftp"
        label="FTP"
        onChange={onChange}
        onNumberChange={onNumberChange}
        presets={[{ label: "Use 250", value: "250" }]}
        value="200"
      />,
    );

    const input = getByLabelText("FTP");

    expect(input.props.editable).toBe(false);
    await fireEvent(input, "changeText", "300");
    await fireEvent(input, "blur");
    await fireEvent.press(getByText("Use 250"));

    expect(onChange).not.toHaveBeenCalled();
    expect(onNumberChange).not.toHaveBeenCalled();
  });
});
