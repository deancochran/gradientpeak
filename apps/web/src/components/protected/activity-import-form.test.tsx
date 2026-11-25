// @vitest-environment jsdom

import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityImportForm } from "./activity-import-form";

const guardMocks = vi.hoisted(() => ({
  guardedCancel: vi.fn((fn: () => void) => fn()),
  markSaveFailed: vi.fn(),
  markSaved: vi.fn(),
}));

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: guardMocks.guardedCancel,
    markSaveFailed: guardMocks.markSaveFailed,
    markSaved: guardMocks.markSaved,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  it("derives required persistence metadata without exposing an activity-name field", async () => {
    const onSubmit = vi.fn();
    const file = activityFile("morning-ride.fit");
    const { selectFile, submit } = renderForm({ onSubmit });

    selectFile(file);
    expect(screen.queryByLabelText("Activity name")).toBeNull();
    expect(screen.queryByTestId("activity-import-name-input")).toBeNull();
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

  it("updates the hidden derived persistence name when the file is replaced", async () => {
    const onSubmit = vi.fn();
    const { selectFile, submit } = renderForm({ onSubmit });

    selectFile(activityFile("first.fit"));
    expect(screen.getByRole("button", { name: "Replace file for Activity file" })).toBeTruthy();

    selectFile(activityFile("replacement.GPX"));
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "replacement" })),
    );
  });

  it("removes the file and permits a direct replacement", async () => {
    const { selectFile } = renderForm();

    selectFile(activityFile("first.fit"));
    fireEvent.click(screen.getByRole("button", { name: "Remove first.fit" }));

    await waitFor(() => {
      expect(screen.queryByText(/first\.fit \(/)).toBeNull();
    });

    selectFile(activityFile("next.fit"));
    expect(screen.getByText(/next\.fit \(/)).toBeTruthy();
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

  it("keeps required activity persistence metadata out of the rendered form", async () => {
    const onSubmit = vi.fn();
    const { selectFile, submit } = renderForm({ onSubmit });
    selectFile(activityFile("activity.fit"));
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "activity" })),
    );
    expect(screen.queryByText("Activity name is required")).toBeNull();
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
      "The activity file could not be imported. Check the file and try again.",
    );
    expect(screen.getByText(/retry\.fit \(/)).toBeTruthy();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Keep these notes");

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Retry notes" } });
    await waitFor(() =>
      expect(
        screen.queryByText(
          "The activity file could not be imported. Check the file and try again.",
        ),
      ).toBeNull(),
    );
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it("sends null after optional notes are explicitly cleared", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "activity-1" });
    const { selectFile, submit } = renderForm({ onSubmit });
    selectFile(activityFile("notes.fit"));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Remove these notes" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "" } });
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notes: null })),
    );
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
    expect(screen.queryByLabelText("Activity name")).toBeNull();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole("button", { name: new RegExp(label) }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("marks the draft saved and navigates through onSuccess only after the import resolves", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "activity-1" });
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const { selectFile, submit } = renderForm({ onSubmit, onSuccess });
    selectFile(activityFile("commit.fit"));
    submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "activity-1" }));
    expect(guardMocks.markSaved).toHaveBeenCalledTimes(1);
    expect(guardMocks.markSaved.mock.invocationCallOrder[0]).toBeLessThan(
      onSuccess.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps the draft guarded when the import rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Storage unavailable"));
    const onSuccess = vi.fn();
    const { selectFile, submit } = renderForm({ onSubmit, onSuccess });
    selectFile(activityFile("reject.fit"));
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(guardMocks.markSaved).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("alert", { name: "" }).textContent).toContain(
      "The activity file could not be imported. Check the file and try again.",
    );
  });
});
