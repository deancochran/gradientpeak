import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Form } from "../components/form/index.web";
import { FormNumberField } from "../components/form-fields/index.web";
import { useZodFormSubmit } from "./use-zod-form-submit";

type FormValues = {
  name: string;
};

function SubmitHarness({
  onError,
  onSubmit,
  onValidationError,
  shouldRethrow = false,
  submittingLabel = "Saving...",
}: {
  onError?: (error: unknown) => void;
  onSubmit: (values: FormValues) => Promise<void> | void;
  onValidationError?: (errors: unknown) => void;
  shouldRethrow?: boolean;
  submittingLabel?: string;
}) {
  const form = useForm<FormValues>({ defaultValues: { name: "Ada" } });
  const submit = useZodFormSubmit<FormValues>({
    form,
    onError,
    onSubmit,
    onValidationError,
    shouldRethrow,
    submittingLabel,
  });
  const buttonState = submit.getSubmitButtonState({ label: "Save" });

  return (
    <form onSubmit={submit.handleSubmit}>
      <input aria-label="Name" {...form.register("name", { required: "Name is required" })} />
      <span data-testid="pending-state">{submit.isSubmitting ? "submitting" : "idle"}</span>
      <span data-testid="button-state">
        {buttonState.loading ? buttonState.loadingLabel : buttonState.label}
      </span>
      <span data-testid="error-state">{submit.submitError?.message ?? "none"}</span>
      <button type="submit">Save</button>
    </form>
  );
}

function DraftSubmitHarness({ onSubmit }: { onSubmit: (values: { amount: number }) => void }) {
  const form = useForm<{ amount: number }>({ defaultValues: { amount: 10 } });
  const submit = useZodFormSubmit({ form, onSubmit });

  return (
    <Form {...form}>
      <form onSubmit={submit.handleSubmit}>
        <FormNumberField control={form.control} label="Amount" name="amount" />
        <button type="submit">Submit amount</button>
      </form>
    </Form>
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
    expect(screen.getByTestId("button-state")).toHaveTextContent("Saving...");
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ada" });

    resolveSubmit();

    await waitFor(() => expect(screen.getByTestId("pending-state")).toHaveTextContent("idle"));
    expect(screen.getByTestId("button-state")).toHaveTextContent("Save");
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

  it("flushes a focused number draft before constructing the submit payload", async () => {
    const onSubmit = vi.fn();
    render(<DraftSubmitHarness onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), {
      target: { value: "12." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit amount" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ amount: 12 }));
  });

  it("uses the latest submit callback and submitting label after rerender", async () => {
    const firstSubmit = vi.fn();
    let resolveSubmit: () => void = () => undefined;
    const latestSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const { rerender } = render(
      <SubmitHarness onSubmit={firstSubmit} submittingLabel="First label" />,
    );

    rerender(<SubmitHarness onSubmit={latestSubmit} submittingLabel="Latest label" />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(latestSubmit).toHaveBeenCalledWith({ name: "Ada" }));
    expect(firstSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("button-state")).toHaveTextContent("Latest label");

    resolveSubmit();
    await waitFor(() => expect(screen.getByTestId("pending-state")).toHaveTextContent("idle"));
  });

  it("uses the latest error callback and shouldRethrow option after rerender", async () => {
    const error = new Error("Latest save failed");
    const firstError = vi.fn();
    const latestError = vi.fn();
    const failingSubmit = async () => {
      throw error;
    };
    const { rerender } = render(
      <SubmitHarness onError={firstError} onSubmit={failingSubmit} shouldRethrow />,
    );

    rerender(
      <SubmitHarness onError={latestError} onSubmit={failingSubmit} shouldRethrow={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(latestError).toHaveBeenCalledWith(error));
    expect(firstError).not.toHaveBeenCalled();
    expect(screen.getByTestId("error-state")).toHaveTextContent("Latest save failed");
  });

  it("uses the latest validation error callback after rerender", async () => {
    const onSubmit = vi.fn();
    const firstValidationError = vi.fn();
    const latestValidationError = vi.fn();
    const { rerender } = render(
      <SubmitHarness onSubmit={onSubmit} onValidationError={firstValidationError} />,
    );

    rerender(<SubmitHarness onSubmit={onSubmit} onValidationError={latestValidationError} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(latestValidationError).toHaveBeenCalled());
    expect(firstValidationError).not.toHaveBeenCalled();
  });
});
