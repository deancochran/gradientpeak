// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityImportPage, validateActivityImportSearch } from "./import";

const mocks = vi.hoisted(() => ({
  activitiesInvalidate: vi.fn(),
  formProps: undefined as
    | {
        onCancel: (sport: "run" | "bike" | "swim" | "strength" | "other") => void;
        onSubmit: (values: unknown) => Promise<unknown>;
        phase: string;
      }
    | undefined,
  invalidateIngestion: vi.fn(),
  navigate: vi.fn(),
  process: vi.fn(),
  search: { activityType: "bike", from: undefined } as {
    activityType: "run" | "bike" | "swim" | "strength" | "other";
    category?: "run" | "bike" | "swim" | "strength" | "other";
    eventId?: string;
    from?: "record";
    gps?: "on" | "off";
    routeId?: string;
  },
  signedUrl: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  upload: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.search,
  }),
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ client: true }) }));

vi.mock("@repo/api/client", () => ({
  invalidatePostActivityIngestionQueries: mocks.invalidateIngestion,
}));

vi.mock("../../../components/protected/activity-import-form", () => ({
  ActivityImportForm: (props: NonNullable<typeof mocks.formProps>) => {
    mocks.formProps = props;
    return <p data-testid="import-phase">{props.phase}</p>;
  },
}));

vi.mock("../../../lib/activity-route-upload", () => ({
  uploadFileToSignedUrl: mocks.upload,
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    activityFiles: {
      getSignedUploadUrl: { useMutation: () => ({ mutateAsync: mocks.signedUrl }) },
      processActivityFile: { useMutation: () => ({ mutateAsync: mocks.process }) },
    },
    useUtils: () => ({ activities: { invalidate: mocks.activitiesInvalidate } }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

beforeEach(() => {
  mocks.formProps = undefined;
  mocks.search = { activityType: "bike", from: undefined };
  mocks.signedUrl.mockResolvedValue({ filePath: "user/activity.fit", signedUrl: "https://upload" });
  mocks.upload.mockResolvedValue(undefined);
  mocks.process.mockResolvedValue({ activity: { id: "activity-1", name: "Morning ride" } });
  mocks.invalidateIngestion.mockResolvedValue(undefined);
  mocks.activitiesInvalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityImportPage", () => {
  it("orchestrates signing, one upload, processing, invalidation, toast, and navigation", async () => {
    render(<ActivityImportPage />);
    const file = new File(["fit"], "Morning.FIT", { type: "application/octet-stream" });

    await act(async () => {
      await mocks.formProps?.onSubmit({
        file,
        files: [{ file, name: file.name, size: file.size, type: file.type }],
        name: "Morning ride",
        notes: "Felt good",
        sport: "bike",
      });
    });

    expect(mocks.signedUrl).toHaveBeenCalledWith({ fileName: "Morning.FIT", fileSize: file.size });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(file, "https://upload");
    expect(mocks.process).toHaveBeenCalledWith({
      activityFilePath: "user/activity.fit",
      activityType: "bike",
      importProvenance: {
        import_file_type: "fit",
        import_original_file_name: "Morning.FIT",
        import_source: "manual_historical",
      },
      name: "Morning ride",
      notes: "Felt good",
    });
    expect(mocks.signedUrl.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upload.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.process.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.invalidateIngestion).toHaveBeenCalledTimes(1);
    expect(mocks.activitiesInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported Morning ride");
    expect(mocks.navigate).toHaveBeenCalledWith({
      params: { activityId: "activity-1" },
      to: "/activities/$activityId",
    });
    expect(screen.getByTestId("import-phase").textContent).toBe("success");
  });

  it("synchronously guards same-turn double submits from starting duplicate pipelines", async () => {
    const signing = deferred<{ filePath: string; signedUrl: string }>();
    mocks.signedUrl.mockReturnValueOnce(signing.promise);
    render(<ActivityImportPage />);
    const file = new File(["fit"], "double.fit");
    const values = {
      file,
      files: [{ file, name: file.name, size: file.size }],
      name: "Double",
      notes: null,
      sport: "bike",
    };

    let firstSubmit!: Promise<unknown>;
    let secondSubmit!: Promise<unknown>;
    act(() => {
      firstSubmit = mocks.formProps?.onSubmit(values) ?? Promise.resolve();
      secondSubmit = mocks.formProps?.onSubmit(values) ?? Promise.resolve();
    });

    expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();

    signing.resolve({ filePath: "user/double.fit", signedUrl: "https://upload" });
    await act(async () => {
      await Promise.all([firstSubmit, secondSubmit]);
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });

  it("commits success before best-effort invalidation and blocks any re-import", async () => {
    mocks.invalidateIngestion.mockRejectedValueOnce(new Error("Cache unavailable"));
    render(<ActivityImportPage />);
    const file = new File(["fit"], "committed.fit");
    const values = {
      file,
      files: [{ file, name: file.name, size: file.size }],
      name: "Committed",
      notes: null,
      sport: "bike",
    };

    await act(async () => {
      await mocks.formProps?.onSubmit(values);
    });
    await act(async () => {
      await mocks.formProps?.onSubmit(values);
    });

    expect(screen.getByTestId("import-phase").textContent).toBe("success");
    expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("offers post-import navigation recovery without permitting another upload", async () => {
    mocks.navigate.mockRejectedValueOnce(new Error("Navigation unavailable"));
    render(<ActivityImportPage />);
    const file = new File(["fit"], "recovery.fit");
    const values = {
      file,
      files: [{ file, name: file.name, size: file.size }],
      name: "Recovery ride",
      notes: null,
      sport: "bike",
    };

    await act(async () => {
      await mocks.formProps?.onSubmit(values);
    });
    await act(async () => {
      await mocks.formProps?.onSubmit(values);
    });

    expect(screen.getByTestId("import-phase").textContent).toBe("success");
    expect(screen.getByRole("alert").textContent).toContain(
      "was imported successfully, but it could not be opened automatically",
    );
    expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open activity" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });

  it("returns to idle and rethrows retryable orchestration failures", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("Storage unavailable"));
    render(<ActivityImportPage />);
    const file = new File(["fit"], "retry.fit");

    await expect(
      mocks.formProps?.onSubmit({
        file,
        files: [{ file, name: file.name, size: file.size }],
        name: "Retry",
        notes: null,
        sport: "run",
      }),
    ).rejects.toThrow("Storage unavailable");

    expect(screen.getByTestId("import-phase").textContent).toBe("idle");
    expect(mocks.toastError).toHaveBeenCalledWith("Activity import failed");
    expect(mocks.process).not.toHaveBeenCalled();

    await mocks.formProps?.onSubmit({
      file,
      files: [{ file, name: file.name, size: file.size }],
      name: "Retry",
      notes: null,
      sport: "run",
    });
    expect(mocks.signedUrl).toHaveBeenCalledTimes(2);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });

  it("returns the complete validated recording search on cancel", () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const routeId = "22222222-2222-4222-8222-222222222222";
    mocks.search = {
      activityType: "run",
      category: "run",
      eventId,
      from: "record",
      gps: "off",
      routeId,
    };
    const { unmount } = render(<ActivityImportPage />);
    mocks.formProps?.onCancel("swim");
    expect(mocks.navigate).toHaveBeenCalledWith({
      search: { category: "run", eventId, gps: "off", routeId },
      to: "/record",
    });

    unmount();
    mocks.navigate.mockClear();
    mocks.search = { activityType: "swim", from: undefined };
    render(<ActivityImportPage />);
    mocks.formProps?.onCancel("swim");
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/activities" });
  });
});

describe("activity import search and deduplication", () => {
  it("normalizes activityType/category compatibility and record provenance", () => {
    expect(validateActivityImportSearch({ activityType: "swim", from: "record" })).toEqual({
      activityType: "swim",
      category: "swim",
      from: "record",
      gps: "off",
    });
    expect(validateActivityImportSearch({ category: "run" })).toEqual({
      activityType: "run",
      from: undefined,
    });
    expect(validateActivityImportSearch({ activityType: "invalid" })).toEqual({
      activityType: "bike",
      from: undefined,
    });

    const eventId = "11111111-1111-4111-8111-111111111111";
    const routeId = "22222222-2222-4222-8222-222222222222";
    expect(
      validateActivityImportSearch({
        activityType: "bike",
        category: "bike",
        eventId,
        from: "record",
        gps: "off",
        ignored: "unsafe",
        routeId,
      }),
    ).toEqual({
      activityType: "bike",
      category: "bike",
      eventId,
      from: "record",
      gps: "off",
      routeId,
    });
  });

  it("has no recording-owned provenance, extension, or upload helper duplicates", () => {
    const recordingSource = readFileSync("src/lib/recording-web.ts", "utf8");
    expect(recordingSource).not.toMatch(
      /buildManualHistoricalImportProvenance|getActivityImportFileType|uploadActivityFileToSignedUrl/,
    );

    const formSchemaSource = readFileSync("src/lib/activity-route-form-schemas.ts", "utf8");
    expect(formSchemaSource).not.toContain("activityImportFormSchema");
  });
});
