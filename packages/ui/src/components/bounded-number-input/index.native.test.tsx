import { useState } from "react";
import { fireEvent, renderNative } from "../../test/render-native";
import { BoundedNumberInput } from "./index.native";

describe("BoundedNumberInput native", () => {
  it("distinguishes clear from zero and publishes dial selections", async () => {
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
    await fireEvent.press(view.getByLabelText("Exact"));
    await fireEvent(view.getByLabelText("Exact Value"), "valueChange", 14);
    expect(onNumberChange).toHaveBeenLastCalledWith(14);
    await fireEvent.press(view.getByLabelText("Clear Exact"));
    expect(onNumberChange).toHaveBeenLastCalledWith(undefined);
    await fireEvent(view.getByLabelText("Exact Value"), "valueChange", 1);
    await fireEvent(view.getByLabelText("Exact Value"), "valueChange", 0);
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

  it("publishes an invalid initial candidate and allows wheel-only correction", async () => {
    const onChange = jest.fn();
    const onNumberChange = jest.fn();

    const { getByLabelText } = await renderNative(
      <BoundedNumberInput
        id="weight"
        label="Weight"
        value="7"
        onChange={onChange}
        onNumberChange={onNumberChange}
        min={30}
        max={300}
        decimals={1}
      />,
    );

    await fireEvent.press(getByLabelText("Weight"));
    const whole = getByLabelText("Weight Value");
    await fireEvent(whole, "valueChange", 30);
    expect(onChange).toHaveBeenLastCalledWith("30");
    expect(onNumberChange).toHaveBeenLastCalledWith(30);
  });

  it("keeps an off-grid original fraction while changing the whole wheel", async () => {
    const onChange = jest.fn();

    const { getByLabelText } = await renderNative(
      <BoundedNumberInput
        id="ftp"
        label="FTP"
        value="72.1234567"
        onChange={onChange}
        min={0}
        max={500}
        decimals={0}
        precision="decimal"
      />,
    );

    await fireEvent.press(getByLabelText("FTP"));
    await fireEvent(getByLabelText("FTP Value"), "valueChange", 73);
    expect(onChange).toHaveBeenLastCalledWith("73.1234567");
  });

  it("selects normal equivalent fractional values and keeps large ranges compact", async () => {
    const { getByLabelText } = await renderNative(
      <>
        <BoundedNumberInput
          label="Pace"
          value="1.5"
          onChange={jest.fn()}
          min={0}
          max={10}
          decimals={2}
        />
        <BoundedNumberInput
          label="Metres"
          value="42195"
          onChange={jest.fn()}
          min={0}
          max={2_000_000}
          decimals={0}
        />
      </>,
    );
    await fireEvent.press(getByLabelText("Pace"));
    expect(getByLabelText("Pace Fractional value").props.selectedValue).toBe("50");
    await fireEvent.press(getByLabelText("Metres"));
    expect(getByLabelText("Metres millions").props.children).toHaveLength(3);
    expect(getByLabelText("Metres thousands").props.children).toHaveLength(1_000);
    expect(getByLabelText("Metres units").props.children).toHaveLength(1_000);
  });

  it("uses a native picker only for finite quantity descriptors", async () => {
    const { getByTestId } = await renderNative(
      <>
        <BoundedNumberInput
          decimals={0}
          label="FTP"
          onChange={jest.fn()}
          testID="ftp-input"
          value=""
          min={1}
          max={500}
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

    expect(getByTestId("ftp-input").props.accessibilityRole).toBe("button");
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
