import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { act } from "@testing-library/react-native/pure";
import { AccessibilityInfo, findNodeHandle, Keyboard, Platform, View } from "react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { DateInput } from "./index.native";

describe("DateInput native", () => {
  it("invalidates a date callback when the form control is rebound", async () => {
    const first = jest.fn();
    const second = jest.fn();
    const firstOwner = {};
    const secondOwner = {};
    const props = { label: "Date", testId: "date", value: "2026-03-08" };
    const view = await renderNative(
      <DateInput {...props} formControl={firstOwner} onChange={first} />,
    );
    await fireEvent.press(view.getByTestId("date"));
    const oldChange = view.container.queryAll((node) => node.type === "DateTimePicker")[0]?.props
      .onChange;
    await view.rerender(<DateInput {...props} formControl={secondOwner} onChange={second} />);
    expect(view.queryByText("Done")).toBeNull();
    await act(async () => oldChange({ type: "set" }, new Date(2026, 2, 9)));
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
  it("rejects an old date selection after cancel and reopening", async () => {
    const onChange = jest.fn();
    const view = await renderNative(
      <DateInput label="Date" testId="date" value="2026-03-08" onChange={onChange} />,
    );
    await fireEvent.press(view.getByTestId("date"));
    const oldChange = view.container.queryAll((node) => node.type === "DateTimePicker")[0]?.props
      .onChange;
    await fireEvent.press(view.getByText("Cancel"));
    await fireEvent.press(view.getByTestId("date"));
    await act(async () => oldChange({ type: "set" }, new Date(2026, 2, 9)));
    await fireEvent.press(view.getByText("Done"));
    expect(onChange).toHaveBeenCalledWith("2026-03-08");
  });
  it("does not restore an older field over a newer picker owner", async () => {
    const view = await renderNative(
      <View>
        <DateInput label="First" testId="first" value="2026-03-08" onChange={jest.fn()} />
        <DateInput label="Second" testId="second" value="2026-03-09" onChange={jest.fn()} />
      </View>,
    );
    await fireEvent.press(view.getByTestId("first"));
    const dismissFirst = view.container.queryAll((node) => node.type === "Modal")[0]?.props
      .onDismiss;
    await fireEvent.press(view.getByText("Cancel"));
    await fireEvent.press(view.getByTestId("second"));
    await act(async () => dismissFirst());
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
    expect(view.getByText("Done")).toBeTruthy();
  });
  it("dismisses the keyboard before opening and restores only the latest dismissed trigger", async () => {
    const onChange = jest.fn();
    const view = await renderNative(
      <DateInput label="Date" testId="date" value="2026-03-08" onChange={onChange} />,
    );
    await fireEvent.press(view.getByTestId("date"));
    expect(Keyboard.dismiss).toHaveBeenCalled();
    const oldModal = view.container.queryAll((node) => node.type === "Modal")[0];
    const oldDismiss = oldModal?.props.onDismiss;
    await fireEvent.press(view.getByText("Cancel"));
    await fireEvent.press(view.getByTestId("date"));
    await act(async () => oldDismiss());
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
    const latestDismiss = view.container.queryAll((node) => node.type === "Modal")[0]?.props
      .onDismiss;
    await fireEvent.press(view.getByText("Cancel"));
    jest.mocked(findNodeHandle).mockReturnValueOnce(42);
    await act(async () => latestDismiss());
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(42);
    await act(async () => latestDismiss());
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each([
    "2026-03-08",
    "2026-11-01",
    "2026-01-01",
  ])("confirms %s without shifting the local calendar date", async (value) => {
    const onChange = jest.fn();
    const { getByTestId, getByText } = await renderNative(
      <DateInput id="date" label="Date" testId="date" value={value} onChange={onChange} />,
    );
    await fireEvent.press(getByTestId("date"));
    await fireEvent.press(getByText("Done"));
    expect(onChange).toHaveBeenCalledWith(value);
  });

  it.each([0, 23])("commits the Android selection's local day at hour %s", async (hour) => {
    Platform.OS = "android";
    try {
      const onChange = jest.fn();
      const { getByTestId } = await renderNative(
        <DateInput id="date" label="Date" testId="date" value="2026-03-08" onChange={onChange} />,
      );
      await fireEvent.press(getByTestId("date"));
      const open = DateTimePickerAndroid.open as jest.Mock;
      await act(async () =>
        open.mock.calls.at(-1)?.[0].onChange({ type: "set" }, new Date(2026, 2, 8, hour, 30)),
      );
      expect(onChange).toHaveBeenCalledWith("2026-03-08");
    } finally {
      Platform.OS = "ios";
    }
  });

  it("exposes a disabled date control and prevents opening or clearing", async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId, queryByText } = await renderNative(
      <DateInput
        clearable
        disabled
        id="start-date"
        label="Start date"
        onChange={onChange}
        testId="start-date"
        value="2026-03-23"
      />,
    );

    const control = getByTestId("start-date");
    expect(control.props.disabled).toBe(true);
    expect(control.props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.press(control);
    await fireEvent.press(getByLabelText("Clear date"));

    expect(queryByText("Done")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores an Android modal picker selection after becoming disabled", async () => {
    const onChange = jest.fn();
    const props = {
      id: "start-date",
      label: "Start date",
      onChange,
      testId: "start-date",
      value: "2026-03-23",
    };

    Platform.OS = "android";

    try {
      const { getByTestId, rerender } = await renderNative(<DateInput {...props} />);

      await fireEvent.press(getByTestId("start-date"));
      const open = DateTimePickerAndroid.open as jest.Mock;
      const pickerOptions = open.mock.calls[0]?.[0];

      expect(pickerOptions).toBeDefined();

      await rerender(<DateInput {...props} disabled />);
      pickerOptions.onChange({}, new Date(2026, 2, 24));

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      Platform.OS = "ios";
    }
  });

  it("keeps an open native modal dismissible after becoming disabled", async () => {
    const onChange = jest.fn();
    const props = {
      id: "start-date",
      label: "Start date",
      onChange,
      testId: "start-date",
      value: "2026-03-23",
    };
    const { getByTestId, getByText, queryByText, rerender } = await renderNative(
      <DateInput {...props} />,
    );

    await fireEvent.press(getByTestId("start-date"));
    await rerender(<DateInput {...props} disabled />);
    await fireEvent.press(getByText("Cancel"));

    expect(queryByText("Done")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
