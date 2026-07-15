import { cleanup } from "@testing-library/react";
import { type FormEvent, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { FileInput } from "./index.web";
import type { SelectedFile } from "./shared";

afterEach(cleanup);

function ControlledFileInput({ initialFiles = [] }: { initialFiles?: SelectedFile[] }) {
  const [files, setFiles] = useState(initialFiles);
  return (
    <FileInput
      accept=".fit,.gpx"
      files={files}
      helperText="FIT or GPX activity file"
      id="activity-file"
      label="Activity file"
      multiple
      name="activity_files"
      onFilesChange={setFiles}
      required
      testId="activity-file-input"
    />
  );
}

describe("FileInput web", () => {
  it("selects multiple files and exposes accessible metadata without a browser path", () => {
    renderWeb(<ControlledFileInput />);
    const input = screen.getByLabelText("Activity file");
    const fit = new File([new Uint8Array(2048)], "morning.fit", {
      type: "application/octet-stream",
    });
    const gpx = new File([new Uint8Array(512)], "route.gpx", { type: "application/gpx+xml" });

    expect(input).toHaveAttribute("id", "activity-file-field");
    expect(input).toHaveAttribute("name", "activity_files");
    expect(input).toHaveAttribute("accept", ".fit,.gpx");
    expect(input).not.toHaveAttribute("required");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-describedby", "activity-file-helper");
    expect(screen.getByTestId("activity-file-input-pick")).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [fit, gpx] } });

    expect(screen.getByText("morning.fit (2.0 KB)")).toBeInTheDocument();
    expect(screen.getByText("route.gpx (512 bytes)")).toBeInTheDocument();
    expect(screen.queryByText(/fakepath/i)).not.toBeInTheDocument();
  });

  it("submits after selection, replacement, cancellation, and same-file reselection", () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    renderWeb(
      <form data-testid="upload-form" onSubmit={onSubmit}>
        <ControlledFileInput />
        <button type="submit">Upload</button>
      </form>,
    );
    const form = screen.getByTestId("upload-form") as HTMLFormElement;
    const input = screen.getByTestId("activity-file-input") as HTMLInputElement;
    const selected = new File(["selected"], "selected.fit", {
      type: "application/octet-stream",
    });
    const replacement = new File(["new"], "new.fit", { type: "application/octet-stream" });

    fireEvent.change(input, { target: { files: [selected] } });
    expect(input.value).toBe("");
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { files: [replacement] } });
    expect(input.value).toBe("");
    expect(screen.queryByText(/selected\.fit/)).not.toBeInTheDocument();
    expect(screen.getByText(/new\.fit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { files: [] } });
    expect(screen.getByText(/new\.fit/)).toBeInTheDocument();
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(3);

    fireEvent.change(input, { target: { files: [replacement] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(onSubmit).toHaveBeenCalledTimes(4);
  });

  it("removes and clears selected files", () => {
    renderWeb(<ControlledFileInput initialFiles={[{ name: "old.fit", size: 1024 }]} />);
    const input = screen.getByTestId("activity-file-input") as HTMLInputElement;
    const replacement = new File(["new"], "new.fit", { type: "application/octet-stream" });

    fireEvent.change(input, { target: { files: [replacement] } });

    fireEvent.click(screen.getByTestId("activity-file-input-remove-0"));
    expect(screen.queryByText(/new\.fit/)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [replacement] } });
    fireEvent.click(screen.getByTestId("activity-file-input-clear"));
    expect(screen.queryByText(/new\.fit/)).not.toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("preserves controlled files for an empty picker change", () => {
    const onFilesChange = vi.fn();
    renderWeb(
      <FileInput
        files={[{ name: "keep.fit", size: 1 }]}
        label="File"
        onFilesChange={onFilesChange}
        testId="file"
      />,
    );

    fireEvent.change(screen.getByTestId("file"), { target: { files: [] } });

    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByText("keep.fit (1 byte)")).toBeInTheDocument();
  });

  it("disables picking, clearing, and removal", () => {
    const onFilesChange = vi.fn();
    renderWeb(
      <FileInput
        disabled
        files={[{ name: "locked.fit", size: 100 }]}
        label="Locked file"
        onFilesChange={onFilesChange}
        testId="locked-file"
      />,
    );

    expect(screen.getByTestId("locked-file")).toBeDisabled();
    expect(screen.getByTestId("locked-file-pick")).toBeDisabled();
    expect(screen.getByTestId("locked-file-clear")).toBeDisabled();
    expect(screen.getByTestId("locked-file-remove-0")).toBeDisabled();
    fireEvent.change(screen.getByTestId("locked-file"), {
      target: { files: [new File(["locked"], "replacement.fit")] },
    });
    fireEvent.click(screen.getByTestId("locked-file-clear"));
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it("associates helper and error text with the input", () => {
    renderWeb(
      <FileInput
        error="Choose a supported activity file"
        helperText="FIT only"
        id="upload"
        label="Upload"
      />,
    );

    const input = screen.getByLabelText("Upload");
    expect(input).toHaveAccessibleName("Upload");
    expect(input).toHaveAttribute("aria-describedby", "upload-helper upload-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a supported activity file");
  });
});
