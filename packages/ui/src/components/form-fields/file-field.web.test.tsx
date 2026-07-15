import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { fireEvent, renderWeb, screen } from "../../test/render-web";
import type { SelectedFile } from "../file-input/shared";
import { Form } from "../form/index.web";
import { FormFileField } from "./index.web";

afterEach(cleanup);

const fileSchema = z.object({
  files: z.array(z.custom<SelectedFile>()).min(1, "Choose at least one file"),
});

function FileFieldHarness({ disabled = false }: { disabled?: boolean }) {
  const methods = useZodForm({ schema: fileSchema, defaultValues: { files: [] } });

  return (
    <Form {...methods}>
      <form onSubmit={methods.handleSubmit(vi.fn())}>
        <FormFileField
          accept=".fit,.gpx"
          control={methods.control}
          description="FIT or GPX"
          disabled={disabled}
          label="Activity files"
          multiple
          name="files"
          required
          testId="form-files"
        />
        <button onClick={() => void methods.trigger("files")} type="button">
          Validate
        </button>
        <button onClick={() => methods.reset({ files: [] })} type="button">
          Reset files
        </button>
      </form>
    </Form>
  );
}

describe("FormFileField web", () => {
  it("uses [] by default, validates, updates, and resets the controlled files", async () => {
    renderWeb(<FileFieldHarness />);
    const input = screen.getByTestId("form-files");

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("Choose at least one file")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array(1024)], "activity.fit", { type: "application/octet-stream" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() =>
      expect(screen.queryByText("Choose at least one file")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("activity.fit (1.0 KB)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset files" }));
    expect(screen.queryByText(/activity\.fit/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose files for activity files/i })).toBeEnabled();
  });

  it("prevents wrapper interactions when disabled", () => {
    renderWeb(<FileFieldHarness disabled />);

    expect(screen.getByTestId("form-files")).toBeDisabled();
    expect(screen.getByTestId("form-files-pick")).toBeDisabled();
  });
});
