import { act } from "react";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import { z } from "zod";

import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { fireEvent, renderNative } from "../../test/render-native";
import { Button } from "../button/index.native";
import { Form, FormItem, FormLabel } from "../form/index.native";
import { Text } from "../text/index.native";
import {
  FormBoundedNumberField,
  FormDateInputField,
  FormDateTimeField,
  FormDurationField,
  FormIntegerStepperField,
  FormNumberField,
  FormPaceField,
  FormPercentSliderField,
  FormSegmentedSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
  FormTimeInputField,
  FormTimezoneField,
  FormWeightInputField,
} from "./index.native";
import { getTimezoneOptions, isValidIanaTimezone } from "./shared";

const profileSchema = z.object({
  activity_category: z.string(),
  bio: z.string().nullable(),
  dob: z.string().nullable(),
  duration: z.string(),
  ftp: z.number().optional(),
  max_sessions: z.number(),
  pace: z.string(),
  recorded_at: z.string(),
  recovery_priority: z.number(),
  target_power: z.number(),
  wake_time: z.string().nullable(),
  weight_kg: z.number().nullable(),
  username: z.string(),
});

function getPickerByMode(nodes: ReactTestInstance[], mode: "date" | "time"): ReactTestInstance {
  const node = nodes.find((candidate) => candidate.props.mode === mode);

  if (!node) {
    throw new Error(`Expected ${mode} picker to be rendered`);
  }

  return node;
}

function getLastNode(nodes: ReactTestInstance[], label: string): ReactTestInstance {
  const node = nodes[nodes.length - 1];

  if (!node) {
    throw new Error(`Expected ${label} to be rendered`);
  }

  return node;
}

function FormFieldsHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      activity_category: "run",
      bio: null,
      dob: null,
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      pace: "4:30",
      recorded_at: "2026-03-23T06:30",
      recovery_priority: 0.5,
      target_power: 180,
      wake_time: "06:30",
      weight_kg: 70,
      username: "Avery",
    },
  });

  return (
    <Form {...methods}>
      <FormTextField control={methods.control} label="Username" name="username" />
      <FormTextareaField
        control={methods.control}
        formatValue={(value) => value ?? ""}
        label="Bio"
        name="bio"
        parseValue={(value) => value || null}
      />
      <FormDateInputField
        control={methods.control}
        disabled
        description="Used to calculate age"
        label="Date of Birth"
        name="dob"
        required
        testId="date-of-birth"
      />
      <FormDurationField control={methods.control} label="Duration" name="duration" />
      <FormIntegerStepperField
        control={methods.control}
        label="Max Sessions"
        max={14}
        min={0}
        name="max_sessions"
      />
      <FormDateTimeField
        control={methods.control}
        dateLabel="Recorded date"
        label="Recorded At"
        name="recorded_at"
        timeLabel="Recorded time"
        testId="recorded-at-field"
      />
      <FormSegmentedSelectField
        control={methods.control}
        label="Activity Category"
        name="activity_category"
        options={[
          { label: "Run", value: "run" },
          { label: "Ride", value: "bike" },
        ]}
        testId="activity-category-field"
      />
      <FormTimeInputField
        control={methods.control}
        label="Wake Time"
        name="wake_time"
        pickerPresentation="modal"
        testId="wake-time-field"
      />
      <FormBoundedNumberField control={methods.control} decimals={0} label="FTP" name="ftp" />
      <FormNumberField
        clampOnBlur={false}
        control={methods.control}
        label="Target Power"
        max={300}
        name="target_power"
      />
      <FormNumberField
        control={methods.control}
        label="Clamped Target Power"
        max={300}
        name="target_power"
      />
      <FormPaceField control={methods.control} label="Pace" name="pace" />
      <FormPercentSliderField
        control={methods.control}
        decimals={0}
        label="Recovery Priority"
        max={100}
        min={0}
        name="recovery_priority"
        step={1}
        valueMode="fraction"
      />
      <FormWeightInputField control={methods.control} label="Weight" name="weight_kg" unit="kg" />
      <Button
        testId="set-date-error"
        onPress={() => methods.setError("dob", { message: "Birth date is invalid" })}
      >
        <Text>Set date error</Text>
      </Button>
      <Text>{JSON.stringify(methods.watch())}</Text>
      <Text>{JSON.stringify(methods.formState.touchedFields)}</Text>
    </Form>
  );
}

function DetachedFormLabelHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      activity_category: "run",
      bio: null,
      dob: null,
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      pace: "4:30",
      recorded_at: "2026-03-23T06:30",
      recovery_priority: 0.5,
      target_power: 180,
      wake_time: "06:30",
      weight_kg: 70,
      username: "Avery",
    },
  });

  return (
    <Form {...methods}>
      <FormItem>
        <FormLabel>Detached label</FormLabel>
      </FormItem>
    </Form>
  );
}

function DisabledPercentHarness() {
  const methods = useZodForm({
    schema: z.object({ recovery: z.number() }),
    defaultValues: { recovery: 50 },
  });

  return (
    <Form {...methods}>
      <FormPercentSliderField
        control={methods.control}
        description="Choose recovery priority"
        disabled
        label="Recovery Priority"
        name="recovery"
        required
        testId="recovery-priority"
      />
    </Form>
  );
}

function SwitchValidationHarness() {
  const methods = useZodForm({
    schema: z.object({ enabled: z.boolean() }),
    defaultValues: { enabled: false },
  });

  return (
    <Form {...methods}>
      <FormSwitchField
        control={methods.control}
        description="Controls availability"
        label="Enabled"
        name="enabled"
        testId="enabled-switch"
      />
      <Button
        testId="set-switch-error"
        onPress={() => methods.setError("enabled", { message: "Choose an availability" })}
      >
        <Text>Set switch error</Text>
      </Button>
    </Form>
  );
}

function DraftSubmitHarness({ onSubmit }: { onSubmit: (values: { amount: number }) => void }) {
  const methods = useZodForm({
    schema: z.object({ amount: z.number() }),
    defaultValues: { amount: 10 },
  });
  const submit = useZodFormSubmit({ form: methods, onSubmit });

  return (
    <Form {...methods}>
      <FormNumberField control={methods.control} label="Amount" name="amount" />
      <Button testId="reset-amount" onPress={() => methods.reset()}>
        <Text>Reset amount</Text>
      </Button>
      <Button testId="submit-amount" onPress={submit.handleSubmit}>
        <Text>Submit amount</Text>
      </Button>
    </Form>
  );
}

function OptionalNumberSubmitHarness({
  onSubmit,
}: {
  onSubmit: (values: { amount?: number | undefined }) => void;
}) {
  const methods = useZodForm({
    schema: z.object({ amount: z.number().optional() }),
    defaultValues: { amount: 10 },
  });
  const submit = useZodFormSubmit({ form: methods, onSubmit });

  return (
    <Form {...methods}>
      <FormNumberField control={methods.control} label="Optional amount" name="amount" />
      <Button testId="submit-optional-amount" onPress={submit.handleSubmit}>
        <Text>Submit optional amount</Text>
      </Button>
    </Form>
  );
}

function NullableNumberHarness() {
  const methods = useZodForm({
    schema: z.object({ amount: z.number().finite().nullable() }),
    defaultValues: { amount: 0 },
  });

  return (
    <Form {...methods}>
      <FormNumberField
        clampOnBlur={false}
        control={methods.control}
        emptyValue={null}
        label="Nullable amount"
        name="amount"
      />
      <Button
        testId="set-amount-error"
        onPress={() => methods.setError("amount", { message: "Amount is invalid" })}
      >
        <Text>Set amount error</Text>
      </Button>
      <Text>{JSON.stringify(methods.watch())}</Text>
    </Form>
  );
}

function TimezoneHarness({ disabled = false }: { disabled?: boolean }) {
  const methods = useZodForm({
    schema: z.object({ timezone: z.string().nullable() }),
    defaultValues: { timezone: "Pacific/Kiritimati" },
  });

  return (
    <Form {...methods}>
      <FormTimezoneField
        control={methods.control}
        label="Planning timezone"
        name="timezone"
        disabled={disabled}
      />
      <Text>{JSON.stringify(methods.watch())}</Text>
      <Text testID="timezone-touched">
        {String(Boolean(methods.formState.touchedFields.timezone))}
      </Text>
    </Form>
  );
}

function TimeFirstDateTimeHarness() {
  const methods = useZodForm({
    schema: z.object({ recorded_at: z.string().nullable() }),
    defaultValues: { recorded_at: null },
  });

  return (
    <Form {...methods}>
      <FormDateTimeField
        control={methods.control}
        label="Recorded at"
        name="recorded_at"
        testId="time-first"
      />
      <Text>{JSON.stringify(methods.watch())}</Text>
    </Form>
  );
}

describe("Form fields native", () => {
  it("filters timezone choices and preserves canonical selection and clearing", async () => {
    const { getByLabelText, getByText } = await renderNative(<TimezoneHarness />);
    await fireEvent(getByLabelText("Search timezones"), "changeText", "kathmandu");
    await fireEvent.press(getByLabelText("Asia / Kathmandu"));
    expect(getByText(/"timezone":"Asia\/Kathmandu"/)).toBeTruthy();
    await fireEvent(getByLabelText("Search timezones"), "changeText", "not set");
    await fireEvent.press(getByLabelText("Not set"));
    expect(getByText(/"timezone":null/)).toBeTruthy();
  });
  it("discards same-value bounded and weight drafts on form reset", async () => {
    function ResetForm() {
      const form = useZodForm({
        schema: z.object({ quantity: z.number(), weight: z.number() }),
        defaultValues: { quantity: 1, weight: 70 },
      });
      return (
        <Form {...form}>
          <FormBoundedNumberField control={form.control} name="quantity" label="Quantity" />
          <FormWeightInputField control={form.control} name="weight" label="Weight" unit="kg" />
          <Button onPress={() => form.reset()}>
            <Text>Reset drafts</Text>
          </Button>
        </Form>
      );
    }
    const { getByLabelText, getByText } = await renderNative(<ResetForm />);
    const quantity = getByLabelText("Quantity");
    const weight = getByLabelText("Weight");
    await fireEvent(quantity, "changeText", "1.0");
    await fireEvent.press(weight);
    expect(quantity.props.value).toBe("1.0");
    expect(weight.props.accessibilityValue).toEqual({ text: "70" });
    await fireEvent.press(getByText("Reset drafts"));
    expect(quantity.props.value).toBe("1");
    expect(weight.props.accessibilityValue).toEqual({ text: "70" });
  });

  it("binds shared controlled wrappers to react-hook-form", async () => {
    const { container, getAllByText, getByLabelText, getByTestId, getByText } = await renderNative(
      <FormFieldsHarness />,
    );
    const getAllByTypeName = (type: string) =>
      container.queryAll((node) => node.type === type) as ReactTestInstance[];

    await fireEvent(getByLabelText("Username"), "changeText", "Taylor");
    await fireEvent(getByLabelText("Bio"), "changeText", "Coach");
    await fireEvent.press(getByTestId("wake-time-field"));
    const timePicker = getLastNode(
      getAllByTypeName("DateTimePicker").filter((node) => node.props.mode === "time"),
      "time picker",
    );
    await fireEvent(timePicker, "change", {}, new Date(2026, 2, 23, 3, 45));
    await fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));
    await fireEvent.press(getByLabelText("Duration"));
    await fireEvent(getByLabelText("Duration minutes"), "valueChange", 45);
    await fireEvent.press(getByLabelText("Done Duration"));
    await fireEvent.press(getByLabelText("Max Sessions"));
    await fireEvent(getByLabelText("Max Sessions Value"), "valueChange", 4);
    await fireEvent.press(getByTestId("recorded-at-field-date"));
    const datePicker = getPickerByMode(getAllByTypeName("DateTimePicker"), "date");
    await fireEvent(datePicker, "change", {}, new Date(2026, 2, 24, 0, 0));
    await fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));
    await fireEvent.press(getByTestId("recorded-at-field-time"));
    const recordedTimePicker = getPickerByMode(getAllByTypeName("DateTimePicker"), "time");
    await fireEvent(recordedTimePicker, "change", {}, new Date(2026, 2, 24, 4, 15));
    await fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));
    await fireEvent.press(getByTestId("activity-category-field-bike"));
    await fireEvent(getByLabelText("FTP"), "changeText", "300");
    await fireEvent(getByLabelText("FTP"), "blur");
    await fireEvent.press(getByLabelText("Pace"));
    await fireEvent(getByLabelText("Pace seconds"), "valueChange", 5);
    await fireEvent.press(getByLabelText("Done Pace"));
    await fireEvent(getByLabelText("Recovery Priority"), "changeText", "75");
    await fireEvent(getByLabelText("Recovery Priority"), "blur");
    await fireEvent.press(getByLabelText("Weight"));
    await fireEvent(getByLabelText("Weight kg"), "valueChange", 72);
    await fireEvent(getByLabelText("Weight Fractional kg"), "valueChange", "50");

    expect(getByText(/"username":"Taylor"/)).toBeTruthy();
    expect(getByText(/"bio":"Coach"/)).toBeTruthy();
    expect(getByText(/"wake_time":"03:45"/)).toBeTruthy();
    expect(getByText(/"duration":"0:45:00"/)).toBeTruthy();
    expect(getByText(/"max_sessions":4/)).toBeTruthy();
    expect(getByText(/"recorded_at":"2026-03-24T04:15"/)).toBeTruthy();
    expect(getByText(/"activity_category":"bike"/)).toBeTruthy();
    expect(getByText(/"ftp":300/)).toBeTruthy();
    expect(getByText(/"pace":"4:05"/)).toBeTruthy();
    expect(getByText(/"recovery_priority":0.75/)).toBeTruthy();
    expect(getByText(/"weight_kg":72.5/)).toBeTruthy();
  });

  it("throws a clear error when form subcomponents render outside FormField", async () => {
    await expect(renderNative(<DetachedFormLabelHarness />)).rejects.toThrow(
      "useFormField should be used within <FormField>",
    );
  });

  it("announces switch validation errors without unsupported control props", async () => {
    const { getByTestId, getByText } = await renderNative(<SwitchValidationHarness />);

    await fireEvent.press(getByTestId("set-switch-error"));

    const message = getByText("Choose an availability");
    const control = getByTestId("enabled-switch");
    expect(message.props).toMatchObject({
      accessibilityLiveRegion: "assertive",
      accessibilityRole: "alert",
    });
    expect(control.props).not.toHaveProperty("accessibilityInvalid");
    expect(control.props.accessibilityState?.invalid).toBeUndefined();
  });

  it("forwards disabled and blur behavior for bounded number fields", async () => {
    const { getByLabelText, getByTestId, getByText } = await renderNative(<FormFieldsHarness />);
    const ftp = getByLabelText("FTP");

    await fireEvent(ftp, "blur");

    expect(getByText(/"ftp":true/)).toBeTruthy();
    expect(getByTestId("date-of-birth").props.disabled).toBe(true);
  });

  it("keeps partial number drafts stable and commits a normalized value on blur", async () => {
    const { getByLabelText, getByText } = await renderNative(<FormFieldsHarness />);
    const input = getByLabelText("Target Power");

    await fireEvent(input, "changeText", "-");
    expect(input.props.value).toBe("-");
    expect(getByText(/"target_power":180/)).toBeTruthy();

    await fireEvent(input, "changeText", "12.");
    expect(input.props.value).toBe("12.");
    await fireEvent(input, "blur");

    expect(input.props.value).toBe("12");
    expect(getByText(/"target_power":12/)).toBeTruthy();
  });

  it("preserves invalid out-of-range drafts regardless of the deprecated clamping option", async () => {
    const { getByLabelText, getByText } = await renderNative(<FormFieldsHarness />);
    const preserved = getByLabelText("Target Power");
    const clamped = getByLabelText("Clamped Target Power");

    await fireEvent(preserved, "changeText", "500");
    await fireEvent(preserved, "blur");
    expect(preserved.props.value).toBe("500");
    expect(getByText(/"target_power":null/)).toBeTruthy(); // JSON encodes NaN as null.

    await fireEvent(clamped, "changeText", "500");
    await fireEvent(clamped, "blur");
    expect(clamped.props.value).toBe("500");
    expect(getByText(/"target_power":null/)).toBeTruthy();
  });

  it("keeps invalid optional number drafts visible and rejects submission instead of clearing", async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByTestId } = await renderNative(
      <OptionalNumberSubmitHarness onSubmit={onSubmit} />,
    );
    const input = getByLabelText("Optional amount");

    await fireEvent(input, "changeText", "invalid");
    await fireEvent(input, "blur");
    expect(input.props.value).toBe("invalid");

    await act(async () => {
      await fireEvent.press(getByTestId("submit-optional-amount"));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.props.value).toBe("invalid");
  });

  it("preserves zero, clears to null, and announces numeric errors", async () => {
    const { getByLabelText, getByTestId, getByText } = await renderNative(
      <NullableNumberHarness />,
    );
    const input = getByLabelText("Nullable amount");

    expect(input.props.value).toBe("0");
    await fireEvent(input, "changeText", "");
    await fireEvent(input, "blur");
    expect(getByText(/"amount":null/)).toBeTruthy();

    await fireEvent.press(getByTestId("set-amount-error"));
    expect(getByText("Amount is invalid").props).toMatchObject({
      accessibilityLiveRegion: "assertive",
      accessibilityRole: "alert",
    });
  });

  it("preserves valid timezone values without selecting one automatically", async () => {
    expect(isValidIanaTimezone("Pacific/Kiritimati")).toBe(true);
    const options = getTimezoneOptions("Pacific/Kiritimati", "UTC");
    expect(options?.some((option) => option.value === "Pacific/Kiritimati")).toBe(true);
    expect(options?.find((option) => option.value === "")?.label).toBe("Not set");

    const { getByText } = await renderNative(<TimezoneHarness />);
    expect(getByText(/"timezone":"Pacific\/Kiritimati"/)).toBeTruthy();
  });

  it("controls the existing Dialog through open/change, closes after selection and preserves nullable clear", async () => {
    const view = await renderNative(<TimezoneHarness />);
    const dialog = () =>
      getLastNode(
        view.container.queryAll((node) => node.type === "@rn-primitives/dialog.Root"),
        "Timezone dialog",
      );
    expect(dialog().props.open).toBe(false);
    await fireEvent(dialog(), "openChange", true);
    expect(dialog().props.open).toBe(true);
    await fireEvent(view.getByLabelText("Search timezones"), "changeText", "new york");
    await fireEvent.press(view.getByLabelText("America / New York"));
    expect(view.getByText(/"timezone":"America\/New_York"/)).toBeTruthy();
    expect(dialog().props.open).toBe(false);
    expect(view.getByTestId("timezone-touched").props.children).toBe("true");
    await fireEvent(dialog(), "openChange", true);
    expect(view.getByLabelText("Search timezones").props.value).toBe("");
    await fireEvent.press(view.getByLabelText("Not set"));
    expect(view.getByText(/"timezone":null/)).toBeTruthy();
    expect(dialog().props.open).toBe(false);
  });

  it("dismisses and clears search when disabled without reopening when enabled", async () => {
    const view = await renderNative(<TimezoneHarness />);
    const dialog = () =>
      getLastNode(
        view.container.queryAll((node) => node.type === "@rn-primitives/dialog.Root"),
        "Timezone dialog",
      );
    await fireEvent(dialog(), "openChange", true);
    await fireEvent(view.getByLabelText("Search timezones"), "changeText", "new york");
    await view.rerender(<TimezoneHarness disabled />);
    expect(dialog().props.open).toBe(false);
    expect(view.getByLabelText("Planning timezone").props.accessibilityState.disabled).toBe(true);
    await view.rerender(<TimezoneHarness />);
    expect(dialog().props.open).toBe(false);
    expect(view.getByText(/"timezone":"Pacific\/Kiritimati"/)).toBeTruthy();
    await fireEvent(dialog(), "openChange", true);
    await fireEvent(dialog(), "openChange", false);
    expect(view.getByTestId("timezone-touched").props.children).toBe("true");
  });

  it("uses the local calendar day when a time is selected before a date", async () => {
    const localNow = new Date();
    const expectedDate = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
    const toISOString = jest.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
      throw new Error("UTC formatting must not be used for local datetime fallbacks");
    });

    try {
      const { container, getAllByText, getByTestId, getByText } = await renderNative(
        <TimeFirstDateTimeHarness />,
      );
      const getAllByTypeName = (type: string) =>
        container.queryAll((node) => node.type === type) as ReactTestInstance[];

      await fireEvent.press(getByTestId("time-first-time"));
      const timePicker = getPickerByMode(getAllByTypeName("DateTimePicker"), "time");
      await fireEvent(timePicker, "change", {}, new Date(2026, 2, 23, 4, 15));
      await fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));

      expect(getByText(new RegExp(`"recorded_at":"${expectedDate}T04:15"`))).toBeTruthy();
    } finally {
      toISOString.mockRestore();
    }
  });

  it("flushes a focused number draft before constructing the submit payload", async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByTestId } = await renderNative(
      <DraftSubmitHarness onSubmit={onSubmit} />,
    );

    await fireEvent(getByLabelText("Amount"), "changeText", "12.");
    await act(async () => {
      await fireEvent.press(getByTestId("submit-amount"));
    });

    expect(onSubmit).toHaveBeenCalledWith({ amount: 12 });
  });

  it("discards a focused number draft when reset restores the same value", async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByTestId } = await renderNative(
      <DraftSubmitHarness onSubmit={onSubmit} />,
    );
    const input = getByLabelText("Amount");

    await fireEvent(input, "changeText", "12.");
    await fireEvent.press(getByTestId("reset-amount"));

    expect(input.props.value).toBe("10");

    await act(async () => {
      await fireEvent.press(getByTestId("submit-amount"));
    });

    expect(onSubmit).toHaveBeenCalledWith({ amount: 10 });
    expect(input.props.value).toBe("10");
  });

  it("exposes native hints, invalid state, required state, and disabled state", async () => {
    const { getByLabelText, getByTestId, unmount } = await renderNative(<FormFieldsHarness />);
    const date = getByLabelText("Date of Birth");

    expect(date.props.accessibilityHint).toContain("Required");
    expect(date.props.accessibilityHint).toContain("Used to calculate age");
    expect(date.props.accessibilityState).toEqual({ disabled: true });
    expect(date.props["aria-required"]).toBe(true);

    await fireEvent.press(getByTestId("set-date-error"));

    expect(getByLabelText("Date of Birth").props["aria-invalid"]).toBe(true);
    expect(getByLabelText("Date of Birth").props.accessibilityHint).toContain(
      "Error: Birth date is invalid",
    );

    await unmount();
    const disabledPercent = (await renderNative(<DisabledPercentHarness />)).getByTestId(
      "recovery-priority",
    );
    expect(disabledPercent.props.editable).toBe(false);
    expect(disabledPercent.props.accessibilityState).toEqual({ disabled: true });
    expect(disabledPercent.props.accessibilityHint).toContain("Required");
    expect(disabledPercent.props.accessibilityHint).toContain("Choose recovery priority");
  });
});
