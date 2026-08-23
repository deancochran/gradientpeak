import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform } from "react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { DateInput } from "./index.native";

describe("DateInput native", () => {
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
