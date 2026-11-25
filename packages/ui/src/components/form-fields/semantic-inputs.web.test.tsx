import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { Form } from "../form/index.web";
import {
  FormBoundedNumberField,
  FormDurationField,
  FormIntegerStepperField,
  FormNumberField,
  FormPaceField,
  FormPercentSliderField,
  FormWeightInputField,
} from "./index.web";

// Intentionally permissive: visible malformed input must block before the resolver.
const schema = z.object({
  number: z.any(),
  count: z.any(),
  bounded: z.any(),
  percent: z.any(),
  weight: z.any(),
  pace: z.any(),
  duration: z.any(),
});
const defaults = {
  number: 2,
  count: 3,
  bounded: 4,
  percent: 0.123456789,
  weight: 70.123456789,
  pace: "4:30",
  duration: "0:00:30",
};
function Harness({
  onSubmit,
}: {
  onSubmit: (values: z.infer<typeof schema>) => void | Promise<void>;
}) {
  const form = useZodForm({ schema, defaultValues: defaults });
  const submit = useZodFormSubmit({ form, onSubmit });
  return (
    <Form {...form}>
      <form onSubmit={submit.handleSubmit}>
        <FormNumberField control={form.control} name="number" label="Number" allowDecimal={false} />
        <FormIntegerStepperField
          control={form.control}
          name="count"
          label="Count"
          min={1}
          max={10}
          emptyValue={null}
        />
        <FormBoundedNumberField
          control={form.control}
          name="bounded"
          label="Bounded"
          min={1}
          max={10}
          emptyValue={null}
        />
        <FormPercentSliderField
          control={form.control}
          name="percent"
          label="Percent"
          valueMode="fraction"
        />
        <FormWeightInputField
          control={form.control}
          name="weight"
          label="Weight"
          unit="kg"
          onUnitChange={() => undefined}
        />
        <FormPaceField control={form.control} name="pace" label="Pace" />
        <FormDurationField control={form.control} name="duration" label="Duration" />
        <button type="submit">Save</button>
        <button type="button" onClick={() => form.reset(defaults)}>
          Reset
        </button>
        <output data-testid="touched">{JSON.stringify(form.formState.touchedFields)}</output>
      </form>
    </Form>
  );
}

describe("semantic form input contracts", () => {
  afterEach(cleanup);
  it.each([
    "Number",
    "Count",
    "Bounded",
    "Percent",
    "Weight",
    "Pace",
    "Duration",
  ])("blocks optional invalid %s, preserves its text and focuses it", async (label) => {
    const submit = vi.fn();
    render(<Harness onSubmit={submit} />);
    const input = screen.getByRole(label === "Count" ? "spinbutton" : "textbox", { name: label });
    fireEvent.change(input, { target: { value: "4oops" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveValue("4oops");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(input).not.toHaveValue("4oops");
    expect(screen.getByTestId("touched")).toHaveTextContent("{}");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(defaults));
  });

  it("flushes the last keystroke and preserves declared blank semantics", async () => {
    const submit = vi.fn();
    render(<Harness onSubmit={submit} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Number" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Bounded" }), {
      target: { value: "9.123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        ...defaults,
        number: undefined,
        count: null,
        bounded: 9.123456,
      }),
    );
  });

  it("retains canonical precision on untouched blur and disables actual controls during submit", async () => {
    let finish = () => {};
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Harness onSubmit={submit} />);
    fireEvent.blur(screen.getByRole("textbox", { name: "Percent" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "Weight" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(defaults));
    for (const label of ["Weight", "Pace", "Count", "Percent"])
      expect(
        screen.getByRole(label === "Count" ? "spinbutton" : "textbox", { name: label }),
      ).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Weight" })).not.toBeDisabled());
  });
});
