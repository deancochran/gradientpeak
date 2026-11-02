// @vitest-environment jsdom

import { MAX_ROUTE_FILE_SIZE_BYTES } from "@repo/core/route-files";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteUploadForm } from "./route-upload-form";

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: (fn: () => void) => fn(),
    markSaveFailed: vi.fn(),
    markSaved: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

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
    <RouteUploadForm
      idempotencyScope="11111111-1111-4111-8111-111111111111"
      onCancel={() => undefined}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  const fileInput = () => screen.getByLabelText("GPX or TCX file") as HTMLInputElement;
  const form = () => fileInput().closest("form") as HTMLFormElement;
  const selectFile = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
  const submit = () => fireEvent.submit(form());

  return { ...result, fileInput, form, onSubmit, selectFile, submit };
}

describe("RouteUploadForm", () => {
  it("does not start a write after the upload owner unmounts during file preparation", async () => {
    const read = deferred<string>();
    const onSubmit = vi.fn();
    const view = renderForm({ onSubmit });
    view.selectFile(routeFile("pending.gpx", { readText: vi.fn(() => read.promise) }).file);
    view.submit();
    await screen.findByText("Reading route file...", { selector: "p" });
    view.unmount();
    await act(async () => read.resolve("<gpx />"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits an explicitly cleared optional description as null", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "route-1" });
    const { selectFile, submit } = renderForm({ onSubmit });
    selectFile(routeFile("notes.gpx").file);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Temporary notes" },
    });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "" } });
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: null })),
    );
  });
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
      idempotencyKey: expect.any(String),
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
    expect(onSubmit.mock.calls[1]?.[0].idempotencyKey).toBe(
      onSubmit.mock.calls[0]?.[0].idempotencyKey,
    );
  });

  it("restores the same operation id after a browser-session restart", async () => {
    const firstSubmit = vi.fn().mockRejectedValue(new Error("Response lost"));
    const firstRender = renderForm({ onSubmit: firstSubmit });
    firstRender.selectFile(routeFile("durable.gpx").file);
    firstRender.submit();
    await waitFor(() => expect(firstSubmit).toHaveBeenCalledOnce());
    const firstId = firstSubmit.mock.calls[0]?.[0].idempotencyKey;
    firstRender.unmount();
    sessionStorage.clear();

    const secondSubmit = vi.fn().mockResolvedValue({ id: "route-1" });
    const secondRender = renderForm({ onSubmit: secondSubmit });
    secondRender.selectFile(routeFile("durable.gpx").file);
    secondRender.submit();
    await waitFor(() => expect(secondSubmit).toHaveBeenCalledOnce());

    expect(secondSubmit.mock.calls[0]?.[0].idempotencyKey).toBe(firstId);
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
    const navigation = deferred<void>();
    const onSuccess = vi
      .fn()
      .mockRejectedValueOnce(new Error("Navigation failed"))
      .mockReturnValueOnce(navigation.promise);
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
    expect((await screen.findByRole("alert")).textContent).toContain("Route saved");
    fireEvent.click(screen.getByRole("button", { name: "Open route" }));
    fireEvent.click(screen.getByRole("button", { name: "Opening route..." }));
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(onSuccess.mock.calls[1]?.[0]).toBe(onSuccess.mock.calls[0]?.[0]);
    navigation.resolve();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open route" })).toBeNull());
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
