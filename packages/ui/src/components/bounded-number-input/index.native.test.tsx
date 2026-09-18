import { useState } from "react";
import { fireEvent, renderNative } from "../../test/render-native";
import { BoundedNumberInput } from "./index.native";

describe("BoundedNumberInput native", () => {
  it("preserves non-clamping precision on blur and distinguishes blank from zero", async () => {
    const onNumberChange = jest.fn();
    const view = await renderNative(
      <BoundedNumberInput
        id="exact"
        label="Exact"
        value=""
        min={0}
        max={100}
        decimals={2}
        clampProjection={false}
        onChange={jest.fn()}
        onNumberChange={onNumberChange}
      />,
    );
    const input = view.getByLabelText("Exact");
    await fireEvent(input, "changeText", "14.444");
    await fireEvent(input, "blur");
    expect(input.props.value).toBe("14.444");
    expect(onNumberChange).toHaveBeenLastCalledWith(14.444);
    await fireEvent(input, "changeText", "");
    expect(onNumberChange).toHaveBeenLastCalledWith(undefined);
    await fireEvent(input, "changeText", "0");
    expect(onNumberChange).toHaveBeenLastCalledWith(0);
  });
  it("preserves decimal punctuation and trailing zeros through a numeric parent echo", async () => {
    function NumericParent() {
      const [value, setValue] = useState<number | undefined>();
      return (
        <BoundedNumberInput
          id="quantity"
          label="Quantity"
          value={value === undefined ? "" : String(value)}
          onChange={() => undefined}
          onNumberChange={setValue}
        />
      );
    }
    const { getByLabelText } = await renderNative(<NumericParent />);
    const input = getByLabelText("Quantity");
    await fireEvent(input, "changeText", "1.");
    expect(input.props.value).toBe("1.");
    await fireEvent(input, "changeText", "12.50");
    expect(input.props.value).toBe("12.50");
    await fireEvent(input, "blur");
    expect(input.props.value).toBe("12.5");
  });

  it("keeps partial text while publishing a bounded projection before blur", async () => {
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
    expect(onNumberChange).toHaveBeenLastCalledWith(30);
    expect(input.props.value).toBe("7");

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
