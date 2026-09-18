import { ianaTimezoneSchema } from "@repo/core/athlete-intelligence";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { Form, FormItem, FormLabel } from "../form/index.web";
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
  FormSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
  FormTimeInputField,
  FormTimezoneField,
  FormWeightInputField,
} from "./index.web";
import { filterTimezoneOptions, getTimezoneOptions, isValidIanaTimezone } from "./shared";
import { BUNDLED_TIMEZONES } from "./timezones";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
}

const profileSchema = z.object({
  bio: z.string().nullable(),
  dob: z.string().nullable(),
  recorded_at: z.string(),
  activity_category: z.string(),
  duration: z.string(),
  ftp: z.number().optional(),
  max_sessions: z.number(),
  pace: z.string(),
  recovery_priority: z.number(),
  target_power: z.number(),
  wake_time: z.string().nullable(),
  is_public: z.boolean(),
  weight_kg: z.number().nullable(),
  username: z.string(),
});

function FormFieldsHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      bio: null,
      dob: null,
      recorded_at: "2026-03-23T06:30",
      activity_category: "run",
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      is_public: false,
      pace: "4:30",
      recovery_priority: 0.5,
      target_power: 180,
      wake_time: null,
      weight_kg: 70,
      username: "Avery",
    },
  });

  return (
    <Form {...methods}>
      <form>
        <FormTextField control={methods.control} label="Username" name="username" required />
        <FormTextareaField
          control={methods.control}
          formatValue={(value) => value ?? ""}
          label="Bio"
          name="bio"
          parseValue={(value) => value || null}
          required
        />
        <FormDateInputField control={methods.control} label="Date of Birth" name="dob" />
        <FormDateTimeField control={methods.control} label="Recorded At" name="recorded_at" />
        <FormSegmentedSelectField
          control={methods.control}
          label="Activity Category"
          name="activity_category"
          options={[
            { label: "Run", value: "run" },
            { label: "Ride", value: "bike" },
          ]}
        />
        <FormTimeInputField control={methods.control} label="Wake Time" name="wake_time" />
        <FormDurationField control={methods.control} label="Duration" name="duration" />
        <FormIntegerStepperField
          control={methods.control}
          label="Max Sessions"
          max={14}
          min={0}
          name="max_sessions"
        />
        <FormSwitchField
          control={methods.control}
          label="Public Account"
          name="is_public"
          switchLabel="Profile visibility"
          testId="profile-visibility-switch"
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
      </form>
      <output data-testid="values">{JSON.stringify(methods.watch())}</output>
    </Form>
  );
}

function DetachedFormLabelHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      bio: null,
      dob: null,
      recorded_at: "2026-03-23T06:30",
      activity_category: "run",
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      is_public: false,
      pace: "4:30",
      recovery_priority: 0.5,
      target_power: 180,
      wake_time: null,
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

function AccessibilityHarness() {
  const methods = useZodForm({
    schema: z.object({
      activity: z.string(),
      dob: z.string().nullable(),
      recovery: z.number(),
    }),
    defaultValues: { activity: "run", dob: null, recovery: 50 },
  });

  return (
    <Form {...methods}>
      <FormDateInputField
        control={methods.control}
        description="Used to calculate age"
        label="Birth date"
        name="dob"
        required
      />
      <FormSelectField
        control={methods.control}
        description="Choose one activity"
        label="Activity"
        name="activity"
        options={[{ label: "Run", value: "run" }]}
        required
        testId="activity-trigger"
      />
      <FormPercentSliderField
        control={methods.control}
        disabled
        label="Recovery"
        name="recovery"
        required
      />
      <button
        type="button"
        onClick={() => methods.setError("dob", { message: "Birth date is invalid" })}
      >
        Set error
      </button>
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
      />
      <button
        type="button"
        onClick={() => methods.setError("enabled", { message: "Choose an availability" })}
      >
        Set switch error
      </button>
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
      <form onSubmit={submit.handleSubmit}>
        <FormNumberField control={methods.control} label="Amount" name="amount" />
        <button type="button" onClick={() => methods.reset()}>
          Reset amount
        </button>
        <button type="submit">Submit amount</button>
      </form>
    </Form>
  );
}

function OptionalNumberSubmitHarness({
  onSubmit,
}: {
  onSubmit: (values: { amount?: number }) => void;
}) {
  const methods = useZodForm({
    schema: z.object({ amount: z.number().optional() }),
    defaultValues: { amount: 10 },
  });
  const submit = useZodFormSubmit({ form: methods, onSubmit });

  return (
    <Form {...methods}>
      <form onSubmit={submit.handleSubmit}>
        <FormNumberField control={methods.control} label="Optional amount" name="amount" />
        <button type="submit">Submit optional amount</button>
      </form>
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
      <button
        type="button"
        onClick={() => methods.setError("amount", { message: "Amount is invalid" })}
      >
        Set amount error
      </button>
      <output data-testid="nullable-values">{JSON.stringify(methods.watch())}</output>
    </Form>
  );
}

function TimezoneHarness() {
  const methods = useZodForm({
    schema: z.object({ timezone: z.string().nullable() }),
    defaultValues: { timezone: "Pacific/Kiritimati" },
  });

  return (
    <Form {...methods}>
      <FormTimezoneField control={methods.control} label="Planning timezone" name="timezone" />
      <output data-testid="timezone-values">{JSON.stringify(methods.watch())}</output>
    </Form>
  );
}

describe("Form fields web", () => {
  it.each([
    true,
    false,
  ])("rejects unsupported bundled timezones while preserving valid aliases (enumeration: %s)", (enumerationAvailable) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "supportedValuesOf");
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const formatter = vi
      .spyOn(Intl, "DateTimeFormat")
      // biome-ignore lint/complexity/useArrowFunction: Core invokes this mock with new, so it must be constructible.
      .mockImplementation(function (locales, options) {
        if (options?.timeZone === "America/Coyhaique")
          throw new RangeError("Unsupported time zone");
        return new OriginalDateTimeFormat(locales, options);
      });
    try {
      Object.defineProperty(Intl, "supportedValuesOf", {
        configurable: true,
        value: enumerationAvailable ? () => ["America/Coyhaique", "America/New_York"] : undefined,
      });
      expect(BUNDLED_TIMEZONES).toContain("America/Coyhaique");
      const options = getTimezoneOptions("US/Eastern", "America/Coyhaique");
      expect(options.some((option) => option.value === "America/Coyhaique")).toBe(false);
      expect(options).toContainEqual({ label: "US / Eastern", value: "US/Eastern" });
      expect(options).toContainEqual({ label: "Asia / Kathmandu", value: "Asia/Kathmandu" });
      expect(options).toContainEqual({ label: "Not set", value: "" });
      expect(options.length).toBeGreaterThan(500);
      for (const option of options) {
        if (option.value) expect(ianaTimezoneSchema.safeParse(option.value).success).toBe(true);
      }
    } finally {
      formatter.mockRestore();
      if (descriptor) Object.defineProperty(Intl, "supportedValuesOf", descriptor);
      else Reflect.deleteProperty(Intl, "supportedValuesOf");
    }
  });

  it("keeps the comprehensive timezone catalog when native enumeration is absent or throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "supportedValuesOf");
    try {
      Object.defineProperty(Intl, "supportedValuesOf", { configurable: true, value: undefined });
      const options = getTimezoneOptions();
      expect(options.length).toBeGreaterThan(550);
      for (const value of [
        "UTC",
        "America/Coyhaique",
        "America/Ciudad_Juarez",
        "Asia/Kathmandu",
        "Europe/Kyiv",
        "Pacific/Chatham",
        "Etc/GMT-14",
        "US/Eastern",
      ]) {
        expect(options).toContainEqual(expect.objectContaining({ value }));
      }
      expect(filterTimezoneOptions(options, "new york").map((option) => option.value)).toEqual([
        "America/New_York",
      ]);
      Object.defineProperty(Intl, "supportedValuesOf", {
        configurable: true,
        value: () => {
          throw new RangeError("unsupported");
        },
      });
      expect(getTimezoneOptions()).toEqual(options);
    } finally {
      if (descriptor) Object.defineProperty(Intl, "supportedValuesOf", descriptor);
    }
    expect(new Set(BUNDLED_TIMEZONES).size).toBe(BUNDLED_TIMEZONES.length);
    for (const zone of Intl.supportedValuesOf("timeZone")) {
      expect(BUNDLED_TIMEZONES).toContain(zone);
    }
  });

  it("searches timezone choices and persists canonical values and explicit clearing", () => {
    renderWeb(<TimezoneHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Planning timezone" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Search timezones" }), {
      target: { value: "kathmandu" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Asia / Kathmandu" }));
    expect(screen.getByTestId("timezone-values")).toHaveTextContent('"timezone":"Asia/Kathmandu"');
    fireEvent.click(screen.getByRole("button", { name: "Planning timezone" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Search timezones" }), {
      target: { value: "not set" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Not set" }));
    expect(screen.getByTestId("timezone-values")).toHaveTextContent('"timezone":null');
  });
  it("discards same-value bounded and weight drafts on form reset", () => {
    function ResetForm() {
      const form = useZodForm({
        schema: z.object({ quantity: z.number(), weight: z.number() }),
        defaultValues: { quantity: 1, weight: 70 },
      });
      return (
        <Form {...form}>
          <FormBoundedNumberField control={form.control} name="quantity" label="Quantity" />
          <FormWeightInputField control={form.control} name="weight" label="Weight" unit="kg" />
          <button type="button" onClick={() => form.reset()}>
            Reset drafts
          </button>
        </Form>
      );
    }
    renderWeb(<ResetForm />);
    const quantity = screen.getByRole("textbox", { name: "Quantity" });
    const weight = screen.getByRole("textbox", { name: "Weight" });
    fireEvent.change(quantity, { target: { value: "1.0" } });
    fireEvent.change(weight, { target: { value: "70.0" } });
    expect(quantity).toHaveValue("1.0");
    expect(weight).toHaveValue("70.0");
    fireEvent.click(screen.getByRole("button", { name: "Reset drafts" }));
    expect(quantity).toHaveValue("1");
    expect(weight).toHaveValue("70");
  });

  afterEach(cleanup);

  it("binds shared controlled wrappers to react-hook-form", () => {
    renderWeb(<FormFieldsHarness />);

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "Taylor" },
    });
    fireEvent.change(screen.getByLabelText("Bio"), {
      target: { value: "Coach" },
    });
    fireEvent.change(screen.getByLabelText("Date of Birth"), {
      target: { value: "1990-05-01" },
    });
    fireEvent.change(screen.getByLabelText("Wake Time"), {
      target: { value: "06:45" },
    });
    fireEvent.change(screen.getByLabelText("Recorded At"), {
      target: { value: "2026-03-23T07:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ride" }));
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "45:00" },
    });
    fireEvent.blur(screen.getByLabelText("Duration"));
    fireEvent.click(screen.getAllByText("+")[0]!);
    fireEvent.click(screen.getByLabelText("Profile visibility"));
    fireEvent.change(screen.getByLabelText("FTP"), {
      target: { value: "300" },
    });
    fireEvent.blur(screen.getByLabelText("FTP"));
    fireEvent.change(screen.getByLabelText("Pace"), {
      target: { value: "04:05" },
    });
    fireEvent.blur(screen.getByLabelText("Pace"));
    fireEvent.change(screen.getByLabelText("Recovery Priority"), {
      target: { value: "75" },
    });
    fireEvent.blur(screen.getByLabelText("Recovery Priority"));
    fireEvent.change(screen.getByLabelText("Weight"), {
      target: { value: "72.5" },
    });
    fireEvent.blur(screen.getByLabelText("Weight"));

    expect(screen.getByLabelText("Username")).toHaveValue("Taylor");
    expect(screen.getByLabelText("FTP")).toHaveValue("300");
    expect(screen.getByTestId("values").textContent).toContain('"bio":"Coach"');
    expect(screen.getByTestId("values").textContent).toContain('"dob":"1990-05-01"');
    expect(screen.getByTestId("values").textContent).toContain('"wake_time":"06:45"');
    expect(screen.getByTestId("values").textContent).toContain('"recorded_at":"2026-03-23T07:30"');
    expect(screen.getByTestId("values").textContent).toContain('"activity_category":"bike"');
    expect(screen.getByTestId("values").textContent).toContain('"duration":"0:45:00"');
    expect(screen.getByTestId("values").textContent).toContain('"max_sessions":4');
    expect(screen.getByTestId("values").textContent).toContain('"is_public":true');
    expect(screen.getByTestId("values").textContent).toContain('"ftp":300');
    expect(screen.getByTestId("values").textContent).toContain('"pace":"4:05"');
    expect(screen.getByTestId("values").textContent).toContain('"recovery_priority":0.75');
    expect(screen.getByTestId("values").textContent).toContain('"weight_kg":72.5');
  });

  it("forwards required semantics to text inputs while preserving required labels", () => {
    renderWeb(<FormFieldsHarness />);

    expect(screen.getByLabelText("Username")).toBeRequired();
    expect(screen.getByLabelText("Bio")).toBeRequired();
    expect(screen.getByText("Username *")).toBeVisible();
    expect(screen.getByText("Bio *")).toBeVisible();
  });

  it("renders switch validation errors without disrupting its accessible control", () => {
    renderWeb(<SwitchValidationHarness />);
    const switchControl = screen.getByRole("switch", { name: "Enabled" });

    fireEvent.click(screen.getByRole("button", { name: "Set switch error" }));

    expect(screen.getByText("Choose an availability")).toBeVisible();
    expect(switchControl).toHaveAttribute("aria-invalid", "true");
    expect(switchControl).toHaveAccessibleDescription(
      "Controls availability Choose an availability",
    );
  });

  it("keeps partial number drafts stable and commits a normalized value on blur", () => {
    renderWeb(<FormFieldsHarness />);
    const input = screen.getByLabelText("Target Power");

    fireEvent.change(input, { target: { value: "-" } });
    expect(input).toHaveValue("-");
    expect(screen.getByTestId("values").textContent).toContain('"target_power":180');

    fireEvent.change(input, { target: { value: "12." } });
    expect(input).toHaveValue("12.");
    fireEvent.blur(input);

    expect(input).toHaveValue("12");
    expect(screen.getByTestId("values").textContent).toContain('"target_power":12');
  });

  it("preserves opt-out out-of-range drafts while the default field clamps", () => {
    renderWeb(<FormFieldsHarness />);
    const preserved = screen.getByLabelText("Target Power");
    const clamped = screen.getByLabelText("Clamped Target Power");

    fireEvent.change(preserved, { target: { value: "500" } });
    fireEvent.blur(preserved);
    expect(preserved).toHaveValue("500");
    expect(screen.getByTestId("values").textContent).toContain('"target_power":500');

    fireEvent.change(clamped, { target: { value: "500" } });
    fireEvent.blur(clamped);
    expect(clamped).toHaveValue("300");
    expect(screen.getByTestId("values").textContent).toContain('"target_power":300');
  });

  it("keeps invalid optional number drafts visible and rejects submission instead of clearing", async () => {
    const onSubmit = vi.fn();
    renderWeb(<OptionalNumberSubmitHarness onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Optional amount");

    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("invalid");

    fireEvent.click(screen.getByRole("button", { name: "Submit optional amount" }));

    await vi.waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    expect(input).toHaveValue("invalid");
  });

  it("preserves zero, clears to null, and associates the announced numeric error", () => {
    renderWeb(<NullableNumberHarness />);
    const input = screen.getByLabelText("Nullable amount");

    expect(input).toHaveValue("0");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("nullable-values")).toHaveTextContent('"amount":null');

    fireEvent.click(screen.getByRole("button", { name: "Set amount error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Amount is invalid");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("form-item-message");
  });

  it("preserves valid timezone values without selecting one automatically", () => {
    expect(isValidIanaTimezone("Pacific/Kiritimati")).toBe(true);
    const options = getTimezoneOptions("Pacific/Kiritimati", "UTC");
    expect(options?.some((option) => option.value === "Pacific/Kiritimati")).toBe(true);
    expect(options?.find((option) => option.value === "")?.label).toBe("Not set");

    renderWeb(<TimezoneHarness />);
    expect(screen.getByTestId("timezone-values")).toHaveTextContent(
      '"timezone":"Pacific/Kiritimati"',
    );
  });

  it("discards a focused number draft when reset restores the same value", async () => {
    const onSubmit = vi.fn();
    renderWeb(<DraftSubmitHarness onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Amount");

    fireEvent.change(input, { target: { value: "12." } });
    fireEvent.click(screen.getByRole("button", { name: "Reset amount" }));

    expect(input).toHaveValue("10");

    fireEvent.click(screen.getByRole("button", { name: "Submit amount" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ amount: 10 }));
    expect(input).toHaveValue("10");
  });

  it("connects specialized field labels, descriptions, errors, required, and disabled state", () => {
    renderWeb(<AccessibilityHarness />);
    const date = screen.getByLabelText("Birth date");
    const select = screen.getByRole("combobox", { name: "Activity" });

    expect(date).toBeRequired();
    expect(date).toHaveAttribute("name", "dob");
    expect(date).toHaveAccessibleDescription("Used to calculate age");
    expect(select).toHaveAttribute("data-slot", "form-control");
    expect(select).toHaveAttribute("data-testid", "activity-trigger");
    expect(select).toHaveAttribute("aria-required", "true");
    expect(select).toHaveAccessibleDescription("Choose one activity");
    expect(screen.getByLabelText("Recovery")).toBeDisabled();
    expect(screen.getByLabelText("Recovery slider")).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(screen.getByRole("button", { name: "Set error" }));

    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAccessibleDescription(
      "Used to calculate age Adjust this field: Birth date is invalid",
    );
  });

  it("throws a clear error when form subcomponents render outside FormField", () => {
    expect(() => renderWeb(<DetachedFormLabelHarness />)).toThrowError(
      "useFormField should be used within <FormField>",
    );
  });
});
