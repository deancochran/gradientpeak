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
  FormWeightInputField,
} from "./index.web";

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
  activity_type: z.string(),
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
      activity_type: "run",
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
        <FormTextField control={methods.control} label="Username" name="username" />
        <FormTextareaField
          control={methods.control}
          formatValue={(value) => value ?? ""}
          label="Bio"
          name="bio"
          parseValue={(value) => value || null}
        />
        <FormDateInputField control={methods.control} label="Date of Birth" name="dob" />
        <FormDateTimeField control={methods.control} label="Recorded At" name="recorded_at" />
        <FormSegmentedSelectField
          control={methods.control}
          label="Activity Type"
          name="activity_type"
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
        <FormNumberField control={methods.control} label="Target Power" name="target_power" />
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
      activity_type: "run",
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

describe("Form fields web", () => {
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
    expect(screen.getByTestId("values").textContent).toContain('"activity_type":"bike"');
    expect(screen.getByTestId("values").textContent).toContain('"duration":"0:45:00"');
    expect(screen.getByTestId("values").textContent).toContain('"max_sessions":4');
    expect(screen.getByTestId("values").textContent).toContain('"is_public":true');
    expect(screen.getByTestId("values").textContent).toContain('"ftp":300');
    expect(screen.getByTestId("values").textContent).toContain('"pace":"4:05"');
    expect(screen.getByTestId("values").textContent).toContain('"recovery_priority":0.75');
    expect(screen.getByTestId("values").textContent).toContain('"weight_kg":72.5');
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
