import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Controller } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { PaceSecondsField } from "./index.web";

function FormHarness({ onSubmit }: { onSubmit: (value: { pace: number }) => void }) {
  const form = useZodForm({
    schema: z.object({ pace: z.number({ message: "Pace is required" }) }),
    defaultValues: { pace: 330 },
  });
  const submit = useZodFormSubmit({ form, onSubmit });

  return (
    <form onSubmit={submit.handleSubmit}>
      <Controller
        control={form.control}
        name="pace"
        render={({ field, fieldState }) => (
          <PaceSecondsField
            error={fieldState.error?.message}
            formControl={form.control}
            id="pace"
            label="Pace"
            onBlur={field.onBlur}
            onChangeSeconds={field.onChange}
            valueSeconds={field.value}
          />
        )}
      />
      <button type="submit">Save</button>
      <button type="button" onClick={() => form.reset({ pace: 330 })}>
        Reset
      </button>
    </form>
  );
}

describe("PaceSecondsField web", () => {
  afterEach(cleanup);

  it("retains an incomplete draft and emits a corrected valid value before blur", () => {
    const onBlur = vi.fn();
    const onChangeSeconds = vi.fn();
    render(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onBlur={onBlur}
        onChangeSeconds={onChangeSeconds}
        valueSeconds={270}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Pace" });

    fireEvent.change(input, { target: { value: "4:3" } });
    expect(input).toHaveValue("4:3");
    expect(onChangeSeconds).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "4:35" } });
    expect(onChangeSeconds).toHaveBeenCalledWith(275);
    expect(onBlur).not.toHaveBeenCalled();
    fireEvent.blur(input);

    expect(onChangeSeconds).toHaveBeenCalledWith(275);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("treats empty text as an intentional clear", () => {
    const onChangeSeconds = vi.fn();
    render(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        valueSeconds={270}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Pace" }), {
      target: { value: "" },
    });

    expect(onChangeSeconds).toHaveBeenCalledWith(null);
  });

  it("flushes a valid focused draft before submit", async () => {
    const onSubmit = vi.fn();
    render(<FormHarness onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Pace" }), {
      target: { value: "5:45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ pace: 345 }));
  });

  it("retains an incomplete submitted draft and surfaces an accessible error", async () => {
    const onSubmit = vi.fn();
    render(<FormHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: "Pace" });

    fireEvent.change(input, { target: { value: "4:3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveValue("4:3");
    expect(input).toHaveAccessibleDescription(expect.stringContaining("Pace is required"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("discards a same-value pending draft on reset", () => {
    render(<FormHarness onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Pace" });
    fireEvent.change(input, { target: { value: "4:3" } });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(input).toHaveValue("5:30");
  });

  it("resynchronizes when the external value changes", () => {
    const onChangeSeconds = vi.fn();
    const { rerender } = render(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        valueSeconds={330}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Pace" }), {
      target: { value: "4:3" },
    });

    rerender(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        valueSeconds={360}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Pace" })).toHaveValue("6:00");
  });
});
