import type React from "react";
import { act } from "react";

import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const getDocumentAsyncMock = jest.fn();
const invalidateRoutesMock = jest.fn();
const uploadRouteMock = jest.fn();

const MAX_ROUTE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const routeFile = {
  name: "ridge-loop.tcx",
  size: 2048,
  uri: "file:///ridge-loop.tcx",
  mimeType: "application/vnd.garmin.tcx+xml",
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
  useRouter: () => ({ back: backMock }),
}));

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
        useMutation: () => ({ isPending: false, mutateAsync: uploadRouteMock }),
      },
    },
  },
}));

describe("route upload screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    getDocumentAsyncMock.mockReset();
    invalidateRoutesMock.mockReset().mockResolvedValue(undefined);
    uploadRouteMock.mockReset().mockResolvedValue({ id: "route-1" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue("<TrainingCenterDatabase />"),
    });
  });

  async function renderScreen() {
    const UploadRouteScreen = (await import("../route-upload")).default;
    return renderNative(<UploadRouteScreen />);
  }

  async function pickFile(
    file: { name: string; size?: number | null; uri: string; mimeType: string } = routeFile,
  ) {
    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [file] });
    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-file-input"));
    });
  }

  it("stores portable metadata, auto-names, reads only on submit, and uploads the expected payload", async () => {
    await renderScreen();
    await pickFile({ ...routeFile, size: null });

    expect(getDocumentAsyncMock).toHaveBeenCalledWith({
      copyToCacheDirectory: true,
      multiple: false,
      type: [
        "application/gpx+xml",
        "application/vnd.garmin.tcx+xml",
        "application/xml",
        "text/xml",
      ],
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("route-upload-name-input").props.value).toBe("ridge-loop");
    expect(screen.queryByText("<TrainingCenterDatabase />")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });

    await waitFor(() => expect(uploadRouteMock).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(uploadRouteMock).toHaveBeenCalledWith({
      name: "ridge-loop",
      description: undefined,
      fileContent: "<TrainingCenterDatabase />",
      fileName: "ridge-loop.tcx",
    });
    expect(invalidateRoutesMock).toHaveBeenCalledTimes(1);
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it("preserves selection on cancel and reports extension errors on the file field", async () => {
    await renderScreen();
    await pickFile();

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: true, assets: [] });
    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-file-input"));
    });
    expect(screen.getByText(/ridge-loop\.tcx/)).toBeTruthy();

    await pickFile({ ...routeFile, name: "ridge-loop.fit", uri: "file:///ridge-loop.fit" });
    expect(await screen.findByText("Unsupported route file extension")).toBeTruthy();
  });

  it("blocks oversized route files before reading or upload", async () => {
    await renderScreen();

    await pickFile({ ...routeFile, size: 10 * 1024 * 1024 + 1 });
    expect(await screen.findByText("Choose a route file no larger than 10 MB.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploadRouteMock).not.toHaveBeenCalled();
  });

  it("rejects understated metadata when the actual UTF-8 content is oversized", async () => {
    await renderScreen();
    await pickFile({ ...routeFile, size: 1 });
    const oversizedMultibyteContent = "é".repeat(MAX_ROUTE_FILE_SIZE_BYTES / 2 + 1);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: jest.fn().mockResolvedValue(oversizedMultibyteContent),
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });

    expect(await screen.findByText(/larger than 10 MB/i)).toBeTruthy();
    expect(uploadRouteMock).not.toHaveBeenCalled();
  });

  it("guards concurrent submits, retries after a read failure, and keeps XML out of form state", async () => {
    await renderScreen();
    await pickFile({
      ...routeFile,
      name: "route.xml",
      uri: "file:///route.xml",
      mimeType: "application/xml",
    });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("read failed"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });

    expect(await screen.findByText(/could not be read/i)).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(uploadRouteMock).not.toHaveBeenCalled();
    expect(screen.queryByText("<TrainingCenterDatabase />")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });
    await waitFor(() => expect(uploadRouteMock).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("enters a terminal success boundary when post-upload navigation and invalidation fail", async () => {
    invalidateRoutesMock.mockRejectedValueOnce(new Error("cache failed"));
    backMock.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    await renderScreen();
    await pickFile();

    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });

    expect(await screen.findByText("Uploaded")).toBeTruthy();
    expect(screen.getByTestId("route-upload-submit-button").props.disabled).toBe(true);
    expect(
      await screen.findByText(/Route uploaded, but this screen could not close/i),
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    expect(uploadRouteMock).toHaveBeenCalledTimes(1);
  });
});
