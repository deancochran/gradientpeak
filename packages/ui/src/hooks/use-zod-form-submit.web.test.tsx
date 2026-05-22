import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useZodFormSubmit } from "./use-zod-form-submit";

type FormValues = {
  name: string;
};

function SubmitHarness({
  onError,
  onSubmit,
  onValidationError,
}: {
  onError?: (error: unknown) => void;
  onSubmit: (values: FormValues) => Promise<void> | void;
  onValidationError?: (errors: unknown) => void;
}) {
  const form = useForm<FormValues>({ defaultValues: { name: "Ada" } });
  const submit = useZodFormSubmit<FormValues>({
    form,
    onError,
    onSubmit,
    onValidationError,
    shouldRethrow: false,
  });

  return (
    <form onSubmit={submit.handleSubmit}>
      <input aria-label="Name" {...form.register("name", { required: "Name is required" })} />
      <span data-testid="pending-state">{submit.isSubmitting ? "submitting" : "idle"}</span>
      <span data-testid="error-state">{submit.submitError?.message ?? "none"}</span>
      <button type="submit">Save</button>
    </form>
  );
}

describe("useZodFormSubmit", () => {
  afterEach(() => {
    cleanup();
  });

  it("tracks pending state during async submit", async () => {
    let resolveSubmit: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(<SubmitHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByTestId("pending-state")).toHaveTextContent("submitting"),
    );
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ada" });

    resolveSubmit();

    await waitFor(() => expect(screen.getByTestId("pending-state")).toHaveTextContent("idle"));
  });

  it("stores submit errors and calls onError without rethrowing when disabled", async () => {
    const error = new Error("Save failed");
    const onError = vi.fn();

    render(
      <SubmitHarness
        onError={onError}
        onSubmit={async () => {
          throw error;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByTestId("error-state")).toHaveTextContent("Save failed"));
    expect(onError).toHaveBeenCalledWith(error);
    expect(screen.getByTestId("pending-state")).toHaveTextContent("idle");
  });

  it("reports validation errors without calling submit", async () => {
    const onSubmit = vi.fn();
    const onValidationError = vi.fn();

    render(<SubmitHarness onSubmit={onSubmit} onValidationError={onValidationError} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onValidationError).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("pending-state")).toHaveTextContent("idle");
  });
});
