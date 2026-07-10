import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform } from "../../lib/react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { DateInput } from "./index.native";

describe("DateInput native", () => {
  it("exposes a disabled date control and prevents opening or clearing", () => {
    const onChange = jest.fn();
    const { getByLabelText, getByTestId, queryByText } = renderNative(
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

    fireEvent.press(control);
    fireEvent.press(getByLabelText("Clear date"));

    expect(queryByText("Done")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores an Android modal picker selection after becoming disabled", () => {
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
      const { getByTestId, rerender } = renderNative(<DateInput {...props} />);

      fireEvent.press(getByTestId("start-date"));
      const open = DateTimePickerAndroid.open as jest.Mock;
      const pickerOptions = open.mock.calls[0]?.[0];

      expect(pickerOptions).toBeDefined();

      rerender(<DateInput {...props} disabled />);
      pickerOptions.onChange({}, new Date(2026, 2, 24));

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      Platform.OS = "ios";
    }
  });

  it("keeps an open native modal dismissible after becoming disabled", () => {
    const onChange = jest.fn();
    const props = {
      id: "start-date",
      label: "Start date",
      onChange,
      testId: "start-date",
      value: "2026-03-23",
    };
    const { getByTestId, getByText, queryByText, rerender } = renderNative(
      <DateInput {...props} />,
    );

    fireEvent.press(getByTestId("start-date"));
    rerender(<DateInput {...props} disabled />);
    fireEvent.press(getByText("Cancel"));

    expect(queryByText("Done")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
