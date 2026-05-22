import React from "react";

import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const submitMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Modal: ({ visible, children, ...props }: any) =>
    visible ? React.createElement("Modal", props, children) : null,
}));

jest.mock("@repo/ui/hooks", () => {
  const React = require("react");

  return {
    __esModule: true,
    useZodForm: ({ defaultValues }: any) => {
      const initialDefaultsRef = React.useRef(defaultValues);
      const [values, setValues] = React.useState(initialDefaultsRef.current);
      const valuesRef = React.useRef(values);

      valuesRef.current = values;

      return React.useMemo(() => {
        const setValue = (name: string, value: unknown) =>
          setValues((current: Record<string, unknown>) => ({ ...current, [name]: value }));

        return {
          control: { setValue },
          getValues: () => valuesRef.current,
          reset: (nextValues?: Record<string, unknown>) =>
            setValues(nextValues ?? initialDefaultsRef.current),
          setValue,
          watch: (name: string) => valuesRef.current[name],
        };
      }, []);
    },
    useZodFormSubmit: ({ form, onSubmit }: any) => ({
      isSubmitting: false,
      handleSubmit: () => onSubmit(form.getValues()),
    }),
  };
});

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: mockCreateHost("Form"),
  FormDateInputField: mockCreateHost("FormDateInputField"),
  FormSwitchField: mockCreateHost("FormSwitchField"),
  FormTextareaField: mockCreateHost("FormTextareaField"),
  FormTextField: ({ testId, name, ...props }: any) =>
    React.createElement("FormTextField", {
      testID: testId,
      name,
      ...props,
      onChangeText: (value: string) => props.control?.setValue?.(name, value),
    }),
  FormTimeInputField: mockCreateHost("FormTimeInputField"),
}));

const { CalendarManualCreateModal } = require("../CalendarManualCreateModal");

describe("CalendarManualCreateModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits bounded weekly recurrence for user-created custom events", () => {
    renderNative(
      <CalendarManualCreateModal
        visible
        activeDate="2026-06-02"
        createType="custom"
        submitting={false}
        onClose={jest.fn()}
        onSubmit={submitMock}
      />,
    );

    fireEvent.changeText(screen.getByTestId("manual-create-title-input"), "Tuesday mobility");
    fireEvent.press(screen.getByTestId("manual-create-repeat-weekly-toggle"));
    fireEvent.press(screen.getByTestId("manual-create-submit"));

    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        createType: "custom",
        title: "Tuesday mobility",
        recurrence: {
          rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=4;BYDAY=TU",
          timezone: "UTC",
        },
      }),
    );
  });
});
