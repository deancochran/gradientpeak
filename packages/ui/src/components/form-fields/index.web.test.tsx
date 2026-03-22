import { describe, expect, it } from "vitest";
import { z } from "zod";

import { useZodForm } from "../../hooks/use-zod-form";
import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { Form } from "../form/index.web";
import {
  FormBoundedNumberField,
  FormDateInputField,
  FormDurationField,
  FormIntegerStepperField,
  FormPaceField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
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
  duration: z.string(),
  ftp: z.number().optional(),
  max_sessions: z.number(),
  pace: z.string(),
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
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      is_public: false,
      pace: "4:30",
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
        <FormPaceField control={methods.control} label="Pace" name="pace" />
        <FormWeightInputField control={methods.control} label="Weight" name="weight_kg" unit="kg" />
      </form>
      <output data-testid="values">{JSON.stringify(methods.watch())}</output>
    </Form>
  );
}

describe("Form fields web", () => {
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
    fireEvent.change(screen.getByLabelText("Weight"), {
      target: { value: "72.5" },
    });
    fireEvent.blur(screen.getByLabelText("Weight"));

    expect(screen.getByLabelText("Username")).toHaveValue("Taylor");
    expect(screen.getByLabelText("FTP")).toHaveValue("300");
    expect(screen.getByTestId("values").textContent).toContain('"bio":"Coach"');
    expect(screen.getByTestId("values").textContent).toContain('"dob":"1990-05-01"');
    expect(screen.getByTestId("values").textContent).toContain('"duration":"0:45:00"');
    expect(screen.getByTestId("values").textContent).toContain('"max_sessions":4');
    expect(screen.getByTestId("values").textContent).toContain('"is_public":true');
    expect(screen.getByTestId("values").textContent).toContain('"ftp":300');
    expect(screen.getByTestId("values").textContent).toContain('"pace":"4:05"');
    expect(screen.getByTestId("values").textContent).toContain('"weight_kg":72.5');
  });
});
