import { act } from "@testing-library/react-native/pure";
import { useColorScheme } from "react-native";
import { NATIVE_THEME } from "../../lib/native-theme";
import { fireEvent, renderNative } from "../../test/render-native";
import { NativeQuantityInput } from "./index.native";

describe("NativeQuantityInput", () => {
  it("shows one assembled raw value with its unit and actual bounds without writing on open", async () => {
    const onChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Power"
        value="999.1257"
        unitLabel="W"
        min={1}
        max={500}
        decimals={3}
        presentation="panel"
        onChange={onChange}
      />,
    );
    expect(view.getAllByText("999.1257 W")).toHaveLength(1);
    expect(view.getByText("W")).toBeTruthy();
    expect(view.queryByRole("alert")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("distinguishes an empty quantity from a deliberate zero in the assembled readout", async () => {
    const onChange = jest.fn();
    const render = (value: string) => (
      <NativeQuantityInput
        label="Amount"
        value={value}
        unitLabel="km"
        min={0}
        max={100}
        decimals={3}
        presentation="panel"
        onChange={onChange}
      />
    );
    const view = await renderNative(render(""));
    expect(view.getByText("Not set km")).toBeTruthy();
    await view.rerender(render("0"));
    expect(view.getByText("0 km")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each([
    ["2.5", 3, false],
    ["-5", 5, true],
  ] as const)("retains a legacy count %s until a whole-value choice replaces it", async (value, expected, _invalid) => {
    const onNumberChange = jest.fn();
    const onChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Count"
        value={value}
        min={1}
        max={50}
        decimals={0}
        presentation="panel"
        onChange={onChange}
        onNumberChange={onNumberChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(Boolean(view.queryByRole("alert"))).toBe(false);
    expect(view.getByText(`${value}`)).toBeTruthy();
    await fireEvent(view.getByLabelText("Count Value"), "valueChange", expected);
    expect(onNumberChange).toHaveBeenLastCalledWith(expected);
    expect(onChange).toHaveBeenLastCalledWith(String(expected));
  });
  it("does not initialize an empty field and permits choosing zero directly", async () => {
    const onChange = jest.fn();
    const onNumberChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Amount"
        value=""
        min={0}
        max={100}
        decimals={2}
        onChange={onChange}
        onNumberChange={onNumberChange}
      />,
    );
    await fireEvent.press(view.getByLabelText("Amount"));
    expect(onChange).not.toHaveBeenCalled();
    expect(view.getByLabelText("Amount Value").props.selectedValue).toBe("");
    await fireEvent(view.getByLabelText("Amount Value"), "valueChange", 0);
    expect(onNumberChange).toHaveBeenLastCalledWith(0);
  });

  it("vetoes Done for an untouched required empty value and restores a changed overlay on Cancel", async () => {
    const onChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Distance"
        value=""
        min={1}
        max={100}
        decimals={0}
        required
        onChange={onChange}
      />,
    );
    await fireEvent.press(view.getByLabelText("Distance"));
    expect(view.getByTestId("Distance-quantity-overlay").props.className).toContain("justify-end");
    expect(view.getByLabelText("Distance Value").props.style).toMatchObject({
      color: NATIVE_THEME.light.foreground,
      backgroundColor: NATIVE_THEME.light.card,
    });
    expect(view.getByTestId("Distance-quantity-surface").props.style).toMatchObject({
      flexShrink: 1,
      maxHeight: "80%",
      minHeight: 0,
    });
    await fireEvent.press(view.getByLabelText("Done Distance"));
    expect(view.getByLabelText("Distance Value")).toBeTruthy();
    expect(view.getByRole("alert")).toBeTruthy();
    await fireEvent(view.getByLabelText("Distance Value"), "valueChange", 5);
    await fireEvent.press(view.getByLabelText("Cancel Distance"));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("uses the active dark scheme for an overlay body without changing panel callers", async () => {
    const scheme = useColorScheme as jest.Mock;
    scheme.mockReturnValue("dark");
    try {
      const view = await renderNative(
        <NativeQuantityInput
          label="Power"
          value="200"
          min={1}
          max={500}
          decimals={0}
          onChange={jest.fn()}
        />,
      );
      await fireEvent.press(view.getByLabelText("Power"));
      expect(view.getByLabelText("Power Value").props.style).toMatchObject({
        color: NATIVE_THEME.dark.foreground,
        backgroundColor: NATIVE_THEME.dark.card,
      });
    } finally {
      scheme.mockReset();
      scheme.mockReturnValue("light");
    }
  });

  it("ignores an invalid Done callback from an overlay canceled before it was reopened", async () => {
    const view = await renderNative(
      <NativeQuantityInput
        label="Distance"
        value=""
        min={1}
        max={100}
        decimals={0}
        required
        onChange={jest.fn()}
      />,
    );
    await fireEvent.press(view.getByLabelText("Distance"));
    const staleDone = view.getByLabelText("Done Distance").props.onPress as () => void;
    await fireEvent.press(view.getByLabelText("Cancel Distance"));
    await fireEvent.press(view.getByLabelText("Distance"));

    staleDone();
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByLabelText("Distance Value")).toBeTruthy();
  });

  it("limits a simple bounded integer wheel to its declared minimum and maximum", async () => {
    const view = await renderNative(
      <NativeQuantityInput
        label="Heart rate"
        value="150"
        min={30}
        max={250}
        decimals={0}
        presentation="panel"
        onChange={jest.fn()}
      />,
    );
    const options = view.getByLabelText("Heart rate Value").props.children;
    expect(options[0].props.value).toBe(30);
    expect(options.at(-1).props.value).toBe(250);
    expect(options.some((option: { props: { value: number } }) => option.props.value === 0)).toBe(
      false,
    );
  });

  it("can repair an unsafe legacy number through one deliberate wheel selection", async () => {
    const onChange = jest.fn();
    const onNumberChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Amount"
        value="999999999999999999999"
        min={0}
        max={1000}
        decimals={0}
        onChange={onChange}
        onNumberChange={onNumberChange}
        presentation="panel"
      />,
    );
    expect(view.queryByRole("alert")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent(view.getByLabelText("Amount units"), "valueChange", 5);
    expect(onChange).toHaveBeenLastCalledWith("5");
    expect(onNumberChange).toHaveBeenLastCalledWith(5);
  });

  it("rejects queued panel Clear and picker callbacks after their owner expires", async () => {
    let current = true;
    const onChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Amount"
        value="42.5"
        min={0}
        max={100}
        decimals={2}
        onChange={onChange}
        presentation="panel"
        isCurrent={() => current}
      />,
    );
    const clear = view.getByLabelText("Clear Amount").props.onPress;
    const select = view.getByLabelText("Amount Value").props.onValueChange;
    current = false;
    await act(() => {
      clear();
      select(50);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables every panel picker and its clear action", async () => {
    const onChange = jest.fn();
    const view = await renderNative(
      <NativeQuantityInput
        label="Amount"
        value="-42.5"
        min={-100}
        max={100}
        decimals={2}
        onChange={onChange}
        presentation="panel"
        disabled
      />,
    );
    for (const label of ["Amount sign", "Amount Value", "Amount Fractional value"]) {
      expect(view.getByLabelText(label).props.enabled).toBe(false);
    }
    expect(view.getByLabelText("Clear Amount").props.accessibilityState.disabled).toBe(true);
    await fireEvent(view.getByLabelText("Amount Value"), "valueChange", 50);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not reauthorize a Clear callback captured before disabling", async () => {
    const onChange = jest.fn();
    const render = (disabled: boolean) => (
      <NativeQuantityInput
        label="Amount"
        value="42.5"
        min={0}
        max={100}
        decimals={2}
        onChange={onChange}
        presentation="panel"
        disabled={disabled}
      />
    );
    const view = await renderNative(render(false));
    const staleClear = view.getByLabelText("Clear Amount").props.onPress;
    await view.rerender(render(true));
    await view.rerender(render(false));
    await act(() => staleClear());
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Clear Amount"));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("fences panel picker and Clear callbacks captured before a configuration transition", async () => {
    const onChange = jest.fn();
    const render = (max: number, unitLabel: string, required = false) => (
      <NativeQuantityInput
        label="Amount"
        value="42"
        min={0}
        max={max}
        decimals={0}
        unitLabel={unitLabel}
        required={required}
        onChange={onChange}
        presentation="panel"
      />
    );
    const view = await renderNative(render(100, "m"));
    const staleSelect = view.getByLabelText("Amount m").props.onValueChange;
    const staleClear = view.getByLabelText("Clear Amount").props.onPress;

    await view.rerender(render(200, "km"));
    await act(() => {
      staleSelect(50);
      staleClear();
    });
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent(view.getByLabelText("Amount km"), "valueChange", 50);
    expect(onChange).toHaveBeenLastCalledWith("50");

    const staleOptionalClear = view.getByLabelText("Clear Amount").props.onPress;
    onChange.mockClear();
    await view.rerender(render(200, "km", true));
    await act(() => staleOptionalClear());
    expect(onChange).not.toHaveBeenCalled();

    await view.rerender(render(200, "km"));
    await act(() => staleOptionalClear());
    expect(onChange).not.toHaveBeenCalled();
  });
});
