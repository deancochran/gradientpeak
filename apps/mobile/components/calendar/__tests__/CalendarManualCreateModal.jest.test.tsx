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
      getSubmitButtonState: ({ disabled, label, submittingLabel }: any) => ({
        disabled,
        label,
        loading: false,
        loadingLabel: submittingLabel,
      }),
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
  FormTimeInputField: ({ testId, name, ...props }: any) =>
    React.createElement("FormTimeInputField", {
      testID: testId,
      name,
      ...props,
      onChangeText: (value: string) => props.control?.setValue?.(name, value),
    }),
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
    fireEvent(screen.getByLabelText("Repeat weekly"), "onCheckedChange", true);
    fireEvent.press(screen.getByTestId("manual-create-submit"));

    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        createType: "custom",
        title: "Tuesday mobility",
        scheduledDate: "2026-06-02",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        recurrence: {
          rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=4;BYDAY=TU",
          timezone: "UTC",
        },
      }),
    );
  });

  it("keeps custom-event recurrence within supported bounds", () => {
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
    fireEvent(screen.getByLabelText("Repeat weekly"), "onCheckedChange", true);
    for (let index = 0; index < 60; index++) {
      fireEvent.press(screen.getByLabelText("Increase occurrence count"));
    }
    fireEvent.press(screen.getByTestId("manual-create-submit"));

    expect(submitMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recurrence: {
          rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=52;BYDAY=TU",
          timezone: "UTC",
        },
      }),
    );

    submitMock.mockClear();
    for (let index = 0; index < 60; index++) {
      fireEvent.press(screen.getByLabelText("Decrease occurrence count"));
    }
    fireEvent.press(screen.getByTestId("manual-create-submit"));

    expect(submitMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recurrence: {
          rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=2;BYDAY=TU",
          timezone: "UTC",
        },
      }),
    );
  });

  it("omits recurrence when weekly repeat is disabled", () => {
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
    fireEvent.press(screen.getByTestId("manual-create-submit"));

    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({ recurrence: undefined }));
  });

  it.each([
    ["UTC+14", -14 * 60, "00:30", "2026-06-01T10:30:00.000Z", 1, "MO"],
    ["UTC-12", 12 * 60, "23:30", "2026-06-03T11:30:00.000Z", 3, "WE"],
  ] as const)("derives BYDAY from the persisted startsAt instant in %s", (_timezone, timezoneOffsetMinutes, scheduledTime, expectedStartsAt, expectedUtcDay, expectedByDay) => {
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

    fireEvent.changeText(screen.getByTestId("manual-create-title-input"), "Boundary event");
    fireEvent.changeText(screen.getByTestId("manual-create-time-button"), scheduledTime);
    fireEvent(screen.getByLabelText("Repeat weekly"), "onCheckedChange", true);

    const RealDate = Date;
    class MockLocalDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length >= 2) {
          const [year, month, day = 1, hours = 0, minutes = 0, seconds = 0, ms = 0] =
            args as number[];
          super(
            RealDate.UTC(year ?? 1970, month ?? 0, day, hours, minutes, seconds, ms) +
              timezoneOffsetMinutes * 60_000,
          );
          return;
        }

        if (args.length === 1) {
          super(args[0] as string | number);
          return;
        }

        super();
      }
    }

    global.Date = MockLocalDate as DateConstructor;
    try {
      fireEvent.press(screen.getByTestId("manual-create-submit"));
    } finally {
      global.Date = RealDate;
    }

    const submitted = submitMock.mock.calls.at(-1)?.[0] as {
      startsAt: Date;
      recurrence: { rule: string; timezone: string };
    };
    const backendWeekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

    expect(submitted.startsAt.toISOString()).toBe(expectedStartsAt);
    expect(submitted.startsAt.getUTCDay()).toBe(expectedUtcDay);
    expect(submitted.recurrence).toEqual({
      rule: `FREQ=WEEKLY;INTERVAL=1;COUNT=4;BYDAY=${expectedByDay}`,
      timezone: "UTC",
    });
    expect(submitted.recurrence.rule).toContain(
      `BYDAY=${backendWeekdays[submitted.startsAt.getUTCDay()]}`,
    );
  });
});
