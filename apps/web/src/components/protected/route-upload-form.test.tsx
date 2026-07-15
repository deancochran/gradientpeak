// @vitest-environment jsdom

import { MAX_ROUTE_FILE_SIZE_BYTES } from "@repo/core/route-files";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteUploadForm } from "./route-upload-form";

afterEach(cleanup);

function routeFile(
  name: string,
  {
    content = "<gpx />",
    readText = vi.fn().mockResolvedValue(content),
    size = content.length,
    type = "application/gpx+xml",
  }: { content?: string; readText?: ReturnType<typeof vi.fn>; size?: number; type?: string } = {},
) {
  const file = new File([content], name, { type });
  if (file.size !== size) {
    Object.defineProperty(file, "size", { value: size });
  }
  Object.defineProperty(file, "text", { value: readText });
  return { file, readText };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderForm(props: Partial<React.ComponentProps<typeof RouteUploadForm>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const result = render(
    <RouteUploadForm onCancel={() => undefined} onSubmit={onSubmit} {...props} />,
  );
  const fileInput = () => screen.getByLabelText("GPX or TCX file") as HTMLInputElement;
  const form = () => fileInput().closest("form") as HTMLFormElement;
  const selectFile = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
  const submit = () => fireEvent.submit(form());

  return { ...result, fileInput, form, onSubmit, selectFile, submit };
}

describe("RouteUploadForm", () => {
  it("validates metadata, reads only on valid submit, and keeps XML out of form values", async () => {
    const onSubmit = vi.fn();
    const { file, readText } = routeFile("ridge-loop.gpx", { content: "<gpx>secret</gpx>" });
    const { selectFile, submit } = renderForm({ onSubmit });

    selectFile(file);
    expect(readText).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Route name") as HTMLInputElement).value).toBe("ridge-loop");

    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const values = onSubmit.mock.calls[0]?.[0];
    expect(values).toMatchObject({
      description: null,
      file,
      fileContent: "<gpx>secret</gpx>",
      name: "ridge-loop",
    });
    expect(values.files).toHaveLength(1);
    expect(values.files[0]).not.toHaveProperty("fileContent");
    expect(document.body.textContent).not.toContain("<gpx>secret</gpx>");
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unsupported extension", routeFile("route.fit").file],
    ["oversize metadata", routeFile("route.gpx", { size: MAX_ROUTE_FILE_SIZE_BYTES + 1 }).file],
  ])("shows an inline file error for %s", async (_case, file) => {
    const onSubmit = vi.fn();
    const { fileInput, selectFile, submit } = renderForm({ onSubmit });

    selectFile(file);
    submit();

    await waitFor(() => expect(fileInput().getAttribute("aria-invalid")).toBe("true"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert", { name: "" })).toBeNull();
  });

  it("rejects valid-looking metadata that does not contain an actual browser File", async () => {
    const onSubmit = vi.fn();
    const { fileInput, submit } = renderForm({ onSubmit });
    fireEvent.change(fileInput(), {
      target: {
        files: [{ name: "spoofed.gpx", size: 8, type: "application/gpx+xml" }],
      },
    });

    submit();

    expect(await screen.findByText("Choose a browser file before uploading.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enforces the route name limit without discarding valid file metadata", async () => {
    const { file } = routeFile("valid.tcx", { type: "application/vnd.garmin.tcx+xml" });
    const { selectFile, submit } = renderForm();
    selectFile(file);
    fireEvent.change(screen.getByLabelText("Route name"), {
      target: { value: "n".repeat(101) },
    });

    submit();

    await waitFor(() =>
      expect(screen.getByLabelText("Route name").getAttribute("aria-invalid")).toBe("true"),
    );
    expect(screen.getByText(/valid\.tcx \(/)).toBeTruthy();
  });

  it("updates an auto-derived name on replacement, preserves a manual name, and clears only an auto name", async () => {
    const { selectFile } = renderForm();
    const nameInput = screen.getByLabelText("Route name") as HTMLInputElement;

    selectFile(routeFile("first.gpx").file);
    expect(nameInput.value).toBe("first");
    selectFile(routeFile("replacement.XML", { type: "application/xml" }).file);
    await waitFor(() => expect(nameInput.value).toBe("replacement"));

    fireEvent.change(nameInput, { target: { value: "Manual route" } });
    selectFile(routeFile("third.tcx").file);
    await waitFor(() => expect(nameInput.value).toBe("Manual route"));
    fireEvent.click(screen.getByRole("button", { name: "Remove third.tcx" }));
    await waitFor(() => expect(nameInput.value).toBe("Manual route"));

    selectFile(routeFile("auto.gpx").file);
    fireEvent.change(nameInput, { target: { value: "" } });
    selectFile(routeFile("derived.gpx").file);
    await waitFor(() => expect(nameInput.value).toBe("derived"));
    fireEvent.click(screen.getByRole("button", { name: "Remove derived.gpx" }));
    await waitFor(() => expect(nameInput.value).toBe(""));
  });

  it("uses explicit reading/uploading phases, disables everything, and blocks duplicate submits synchronously", async () => {
    const read = deferred<string>();
    const upload = deferred<{ id: string }>();
    const onSubmit = vi.fn(() => upload.promise);
    const { file } = routeFile("phases.gpx", { readText: vi.fn(() => read.promise) });
    const { fileInput, selectFile, submit } = renderForm({ onSubmit });

    selectFile(file);
    submit();
    submit();

    expect(await screen.findByText("Reading route file...", { selector: "p" })).toBeTruthy();
    expect(fileInput().disabled).toBe(true);
    expect((screen.getByLabelText("Route name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(onSubmit).not.toHaveBeenCalled();

    read.resolve("<gpx />");
    expect(await screen.findByText("Uploading route...", { selector: "p" })).toBeTruthy();
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    upload.resolve({ id: "route-1" });
    expect(await screen.findByText("Route uploaded", { selector: "p" })).toBeTruthy();
  });

  it("preserves file and metadata for retry after an API root error", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary route failure"))
      .mockResolvedValueOnce({ id: "route-1" });
    const { selectFile, submit } = renderForm({ onSubmit });
    selectFile(routeFile("retry.gpx").file);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Keep these notes" },
    });

    submit();
    expect(await screen.findByText("Temporary route failure")).toBeTruthy();
    expect(screen.getByText(/retry\.gpx \(/)).toBeTruthy();
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "Keep these notes",
    );

    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it("preserves file and metadata for retry after a read error", async () => {
    const readText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary read failure"))
      .mockResolvedValueOnce("<gpx />");
    const onSubmit = vi.fn().mockResolvedValue({ id: "route-1" });
    const { selectFile, submit } = renderForm({ onSubmit });
    selectFile(routeFile("read-retry.gpx", { readText }).file);

    submit();
    expect(await screen.findByText("Temporary read failure")).toBeTruthy();
    expect(screen.getByText(/read-retry\.gpx \(/)).toBeTruthy();

    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(readText).toHaveBeenCalledTimes(2);
  });

  it("stays terminal after the API commits even when post-commit work fails", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "route-1" });
    const onSuccess = vi.fn().mockRejectedValue(new Error("Navigation failed"));
    const { selectFile, submit } = renderForm({ onSubmit, onSuccess });
    selectFile(routeFile("committed.gpx").file);

    submit();
    expect(await screen.findByText("Route uploaded", { selector: "p" })).toBeTruthy();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "route-1" }));
    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: /Route uploaded/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
