// @vitest-environment jsdom

import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityImportForm } from "./activity-import-form";

afterEach(cleanup);

function activityFile(name: string, size = 4, type = "application/octet-stream") {
  const file = new File([new Uint8Array(Math.min(size, 4))], name, { type });
  if (file.size !== size) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

function renderForm(props: Partial<React.ComponentProps<typeof ActivityImportForm>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const result = render(
    <ActivityImportForm onCancel={() => undefined} onSubmit={onSubmit} phase="idle" {...props} />,
  );
  const fileInput = () => screen.getByLabelText("Activity file") as HTMLInputElement;
  const selectFile = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
  const submit = () => fireEvent.submit(fileInput().closest("form") as HTMLFormElement);

  return { ...result, fileInput, onSubmit, selectFile, submit };
}

describe("ActivityImportForm", () => {
  it("validates canonical metadata and submits the actual browser File", async () => {
    const onSubmit = vi.fn();
    const file = activityFile("morning-ride.fit");
    const { selectFile, submit } = renderForm({ onSubmit });

    selectFile(file);
    expect((screen.getByLabelText("Activity name") as HTMLInputElement).value).toBe("morning-ride");
    submit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
          name: "morning-ride",
          notes: null,
        }),
      );
    });
    expect(screen.queryByLabelText("Activity type")).toBeNull();
  });

  it("rejects file-like metadata that is not an actual browser File", async () => {
    const onSubmit = vi.fn();
    const { fileInput, submit } = renderForm({ onSubmit });

    fireEvent.change(fileInput(), {
      target: {
        files: [{ name: "spoofed.fit", size: 4, type: "application/octet-stream" }],
      },
    });
    submit();

    expect(await screen.findByText("Choose a browser file before importing.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("updates an auto-derived name on replacement and preserves a manual name", async () => {
    const { selectFile } = renderForm();
    const nameInput = screen.getByLabelText("Activity name") as HTMLInputElement;

    selectFile(activityFile("first.fit"));
    expect(nameInput.value).toBe("first");
    expect(screen.getByRole("button", { name: "Replace file for Activity file" })).toBeTruthy();

    selectFile(activityFile("replacement.GPX"));
    await waitFor(() => expect(nameInput.value).toBe("replacement"));

    fireEvent.change(nameInput, { target: { value: "My manual title" } });
    selectFile(activityFile("third.tcx"));
    await waitFor(() => expect(nameInput.value).toBe("My manual title"));
  });

  it("removes an auto-derived name with its file and permits a direct replacement", async () => {
    const { selectFile } = renderForm();
    const nameInput = screen.getByLabelText("Activity name") as HTMLInputElement;

    selectFile(activityFile("first.fit"));
    fireEvent.click(screen.getByRole("button", { name: "Remove first.fit" }));

    await waitFor(() => {
      expect(screen.queryByText(/first\.fit \(/)).toBeNull();
      expect(nameInput.value).toBe("");
    });

    selectFile(activityFile("next.fit"));
    expect(nameInput.value).toBe("next");
  });

  it.each([
    ["unsupported type", activityFile("activity.csv"), "Only FIT, GPX, and TCX"],
    ["oversize file", activityFile("activity.fit", MAX_ACTIVITY_FILE_SIZE_BYTES + 1), null],
  ])("rejects an %s and clears the field error after replacement", async (_case, file, error) => {
    const onSubmit = vi.fn();
    const { selectFile, submit } = renderForm({ onSubmit });

    selectFile(file);
    submit();
    if (error) {
      expect(await screen.findByText(new RegExp(error, "i"))).toBeTruthy();
    } else {
      await waitFor(() =>
        expect(screen.getByLabelText("Activity file").getAttribute("aria-invalid")).toBe("true"),
      );
    }
    expect(onSubmit).not.toHaveBeenCalled();

    selectFile(activityFile("valid.fit"));
    await waitFor(() =>
      expect(screen.getByLabelText("Activity file").getAttribute("aria-invalid")).toBe("false"),
    );
  });

  it("shows name validation without discarding the selected file", async () => {
    const { selectFile, submit } = renderForm();
    selectFile(activityFile("activity.fit"));
    fireEvent.change(screen.getByLabelText("Activity name"), { target: { value: "   " } });
    submit();

    expect(await screen.findByText("Activity name is required")).toBeTruthy();
    expect(screen.getByText(/activity\.fit \(/)).toBeTruthy();
  });

  it("preserves values for retry after a root error and clears that error on edits", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary processing failure"))
      .mockResolvedValueOnce(undefined);
    const { selectFile, submit } = renderForm({ onSubmit });
    const file = activityFile("retry.fit");
    selectFile(file);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Keep these notes" } });
    submit();

    expect((await screen.findByRole("alert", { name: "" })).textContent).toContain(
      "Temporary processing failure",
    );
    expect(screen.getByText(/retry\.fit \(/)).toBeTruthy();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Keep these notes");

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Retry notes" } });
    await waitFor(() => expect(screen.queryByText("Temporary processing failure")).toBeNull());
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["signing", "Preparing upload..."],
    ["uploading", "Uploading activity file..."],
    ["processing", "Processing activity..."],
    ["success", "Activity imported"],
  ] as const)("fully disables the form during the %s phase", (phase, label) => {
    renderForm({ phase });

    expect(screen.getByText(label, { selector: "p" }).textContent).toContain(label);
    expect((screen.getByLabelText("Activity file") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Activity name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole("button", { name: new RegExp(label) }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
