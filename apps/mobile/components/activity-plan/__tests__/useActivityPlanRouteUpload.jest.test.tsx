import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useActivityPlanRouteUpload } from "../useActivityPlanRouteUpload";

const getDocumentAsyncMock = jest.fn();
const invalidateRoutesMock = jest.fn();
const uploadRouteMock = jest.fn();

const MAX_ROUTE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const gpxFile = {
  name: "morning-loop.gpx",
  size: 2048,
  uri: "file:///morning-loop.gpx",
  mimeType: "application/gpx+xml",
};

jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: (...args: unknown[]) => getDocumentAsyncMock(...args),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ routes: { invalidate: invalidateRoutesMock } }),
    routes: {
      upload: {
        useMutation: () => ({ mutateAsync: uploadRouteMock }),
      },
    },
  },
}));

describe("useActivityPlanRouteUpload", () => {
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    getDocumentAsyncMock.mockReset();
    invalidateRoutesMock.mockReset().mockResolvedValue(undefined);
    uploadRouteMock.mockReset().mockResolvedValue({ id: "route-1" });
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue("<gpx />") });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderRouteUpload(onRouteUploaded = jest.fn()) {
    const hook = renderHook(() =>
      useActivityPlanRouteUpload({ planName: "Tempo plan", onRouteUploaded }),
    );
    return { ...hook, onRouteUploaded };
  }

  it.each([
    ["route.gpx", "application/gpx+xml"],
    ["route.tcx", "application/vnd.garmin.tcx+xml"],
    ["route.xml", "application/xml"],
  ])("supports %s and derives a route name for the upload payload", async (name, mimeType) => {
    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...gpxFile, name, mimeType }],
    });
    const { result, onRouteUploaded } = renderRouteUpload();

    await act(async () => result.current.pickGpxFile());

    expect(getDocumentAsyncMock).toHaveBeenCalledWith({
      copyToCacheDirectory: true,
      type: [
        "application/gpx+xml",
        "application/vnd.garmin.tcx+xml",
        "application/xml",
        "text/xml",
      ],
    });
    expect(uploadRouteMock).toHaveBeenCalledWith({
      name: "route",
      description: "Uploaded for Tempo plan",
      fileContent: "<gpx />",
      fileName: name,
    });
    expect(onRouteUploaded).toHaveBeenCalledWith("route-1");
    await waitFor(() => expect(result.current.isUploadingRoute).toBe(false));
  });

  it("sets busy before selection, ignores concurrent calls, and clears busy after cancel", async () => {
    let resolvePicker!: (value: unknown) => void;
    getDocumentAsyncMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolvePicker = resolve)),
    );
    const { result } = renderRouteUpload();

    let firstUpload!: Promise<void>;
    act(() => {
      firstUpload = result.current.pickGpxFile();
    });
    expect(result.current.isUploadingRoute).toBe(true);
    await act(async () => result.current.pickGpxFile());
    expect(getDocumentAsyncMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePicker({ canceled: true, assets: [] });
      await firstUpload;
    });
    expect(result.current.isUploadingRoute).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploadRouteMock).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("uploads when picker metadata size is %s", async (size) => {
    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...gpxFile, size }],
    });
    const { result } = renderRouteUpload();

    await act(async () => result.current.pickGpxFile());

    expect(uploadRouteMock).toHaveBeenCalledTimes(1);
  });

  it("rejects understated metadata when actual multibyte content exceeds the limit", async () => {
    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...gpxFile, size: 1 }],
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: jest.fn().mockResolvedValue("é".repeat(MAX_ROUTE_FILE_SIZE_BYTES / 2 + 1)),
    });
    const { result } = renderRouteUpload();

    await act(async () => result.current.pickGpxFile());

    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Route file too large",
      "The selected route file is larger than 10 MB. Choose a smaller file.",
    );
    expect(uploadRouteMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported and oversized selections before reading", async () => {
    const { result } = renderRouteUpload();
    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...gpxFile, name: "route.fit" }],
    });
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Unsupported route file",
      "Choose a GPX, TCX, or XML route file.",
    );

    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...gpxFile, size: 10 * 1024 * 1024 + 1 }],
    });
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Route file too large",
      "Choose a route file no larger than 10 MB.",
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploadRouteMock).not.toHaveBeenCalled();
  });

  it("uses distinct safe selection, read, and upload errors and always clears busy", async () => {
    const { result } = renderRouteUpload();
    getDocumentAsyncMock.mockRejectedValueOnce(new Error("private picker detail"));
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Route selection failed",
      "Could not select a route file. Please try again.",
    );

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [gpxFile] });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("private read detail"));
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Route read failed",
      "The selected route file could not be read. Choose it again and retry.",
    );

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [gpxFile] });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      text: jest.fn().mockResolvedValue("private provider detail"),
    });
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Route read failed",
      "The selected route file could not be read. Choose it again and retry.",
    );

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [gpxFile] });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: jest.fn().mockResolvedValue(""),
    });
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Empty route file",
      "The selected route file is empty. Choose another file.",
    );

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [gpxFile] });
    uploadRouteMock.mockRejectedValueOnce(new Error("private server detail"));
    await act(async () => result.current.pickGpxFile());
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Route upload failed",
      "Failed to upload route. Please try again.",
    );
    expect(result.current.isUploadingRoute).toBe(false);
  });
});
