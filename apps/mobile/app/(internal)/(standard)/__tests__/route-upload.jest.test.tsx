import type React from "react";
import { act } from "react";

import {
  claimRouteUploadOperation,
  clearRouteUploadOperation,
} from "@/lib/route-files/route-upload-operation";

import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const getDocumentAsyncMock = jest.fn();
const invalidateRoutesMock = jest.fn();
const uploadRouteMock = jest.fn();
const digestStringAsyncMock = jest.fn();
const randomUuidMock = jest.fn();
const mockRouteOperationStorage = new Map<string, string>();

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

jest.mock("expo-crypto", () => ({
  __esModule: true,
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (...args: unknown[]) => digestStringAsyncMock(...args),
  randomUUID: () => randomUuidMock(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockRouteOperationStorage.get(key) ?? null),
    removeItem: (key: string) => Promise.resolve(void mockRouteOperationStorage.delete(key)),
    setItem: (key: string, value: string) => {
      mockRouteOperationStorage.set(key, value);
      return Promise.resolve();
    },
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
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
    digestStringAsyncMock.mockReset().mockResolvedValue("route-file-digest");
    randomUuidMock.mockReset().mockReturnValue("55555555-5555-4555-8555-555555555555");
    mockRouteOperationStorage.clear();
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

  it("persists an operation id until the successful claim is cleared", async () => {
    const input = {
      description: null,
      fileContent: "<TrainingCenterDatabase />",
      fileName: routeFile.name,
      name: "Ridge Loop",
      profileId: "11111111-1111-4111-8111-111111111111",
    };

    const first = await claimRouteUploadOperation(input);
    randomUuidMock.mockReturnValue("66666666-6666-4666-8666-666666666666");
    const resumed = await claimRouteUploadOperation(input);

    expect(resumed).toEqual(first);
    await clearRouteUploadOperation(first.storageKey);
    await expect(claimRouteUploadOperation(input)).resolves.toMatchObject({
      idempotencyKey: "66666666-6666-4666-8666-666666666666",
    });
  });

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
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
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

  it("reuses the same operation id after an ambiguous upload failure", async () => {
    uploadRouteMock
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ id: "route-1" });
    await renderScreen();
    await pickFile();

    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });
    expect(await screen.findByText(/response lost/i)).toBeTruthy();
    const firstId = uploadRouteMock.mock.calls[0]?.[0].idempotencyKey;
    await act(async () => {
      fireEvent.press(screen.getByTestId("route-upload-submit-button"));
    });
    await waitFor(() => expect(uploadRouteMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(backMock).toHaveBeenCalledTimes(1));
    expect(uploadRouteMock.mock.calls[1]?.[0].idempotencyKey).toBe(firstId);
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
