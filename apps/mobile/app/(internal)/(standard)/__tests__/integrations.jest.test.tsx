import React, { act } from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const pushMock = jest.fn();
const refetchMock = jest.fn();
const invalidateActivitiesMock = jest.fn();
const invalidatePostActivityIngestionQueriesMock = jest.fn(async () => undefined);
const getSignedUrlMock = jest.fn();
const processFitFileMock = jest.fn();
const uploadToSignedUrlMock = jest.fn();
const getDocumentAsyncMock = jest.fn();

const defaultPickedFitFile = {
  name: "morning-ride.fit",
  size: 2048,
  uri: "file:///morning-ride.fit",
};

const expectedImportProvenance = {
  import_source: "manual_historical",
  import_file_type: "fit",
  import_original_file_name: "morning-ride.fit",
};

const ButtonHost = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  Alert: { alert: jest.fn() },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: (...args: any[]) => getDocumentAsyncMock(...args),
}));

jest.mock("expo-file-system", () => ({
  __esModule: true,
  File: class MockFile {
    size: number;

    constructor(_uri: string) {
      this.size = 2048;
    }
  },
}));

jest.mock("expo-linking", () => ({
  __esModule: true,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  createURL: jest.fn(() => "gradientpeak://integrations"),
}));

jest.mock("expo-web-browser", () => ({
  __esModule: true,
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({
    mutateAsync: jest.fn(async () => undefined),
    isPending: false,
  }),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getServerConfig: () => ({ supabaseUrl: "https://supabase.example.test" }),
}));

jest.mock("@/lib/services/fit/FitUploader", () => ({
  __esModule: true,
  FitUploader: jest.fn().mockImplementation(() => ({
    uploadToSignedUrl: uploadToSignedUrlMock,
  })),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      activities: {
        invalidate: invalidateActivitiesMock,
      },
    }),
    integrations: {
      list: {
        useQuery: () => ({
          data: [],
          refetch: refetchMock,
          isLoading: false,
        }),
      },
      getAuthUrl: {
        useMutation: () => ({
          mutateAsync: jest.fn(async () => ({ url: "https://example.test" })),
        }),
      },
      disconnect: {
        useMutation: () => ({ mutateAsync: jest.fn(async () => undefined) }),
      },
    },
    fitFiles: {
      getSignedUploadUrl: {
        useMutation: () => ({
          mutateAsync: getSignedUrlMock,
          isPending: false,
        }),
      },
      processFitFile: {
        useMutation: () => ({
          mutateAsync: processFitFileMock,
          isPending: false,
        }),
      },
    },
  },
}));

jest.mock("@repo/api/client", () => ({
  __esModule: true,
  invalidatePostActivityIngestionQueries: invalidatePostActivityIngestionQueriesMock,
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({ value, onChangeText, placeholder, ...props }: any) =>
    React.createElement("TextInput", {
      value,
      onChangeText,
      placeholder,
      ...props,
    }),
}));

jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  Select: ({ children, ...props }: any) => React.createElement("Select", props, children),
  SelectContent: ({ children, ...props }: any) =>
    React.createElement("SelectContent", props, children),
  SelectGroup: ({ children, ...props }: any) => React.createElement("SelectGroup", props, children),
  SelectItem: ({ children, ...props }: any) => React.createElement("SelectItem", props, children),
  SelectTrigger: ({ children, ...props }: any) =>
    React.createElement("SelectTrigger", props, children),
  SelectValue: (props: any) => React.createElement("SelectValue", props),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: ({ value, onChangeText, placeholder, ...props }: any) =>
    React.createElement("TextInput", {
      value,
      onChangeText,
      placeholder,
      ...props,
    }),
}));

const IntegrationsScreen = require("../integrations").default;
const { Alert } = require("react-native");

describe("integrations historical FIT import", () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    getDocumentAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [defaultPickedFitFile],
    });
    getSignedUrlMock.mockResolvedValue({
      signedUrl: "https://upload.example.test",
      filePath: "activities/user/uploads/123_morning-ride.fit",
    });
    uploadToSignedUrlMock.mockResolvedValue({ success: true });
    processFitFileMock.mockResolvedValue({
      activity: { id: "activity-1", name: "Morning Ride" },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("auto-fills the activity name from a selected FIT file", async () => {
    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();
      expect(screen.getByText("morning-ride.fit")).toBeTruthy();
    });
  });

  it("shows an alert for unsupported files before staging an import", async () => {
    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "history.tcx",
          size: 2048,
          uri: "file:///history.tcx",
        },
      ],
    });

    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Unsupported file",
        "Choose a FIT file ending in .fit.",
      );
    });
    expect(screen.queryByText("history.tcx")).toBeNull();
  });

  it("submits manual historical provenance and lets the user open the imported activity", async () => {
    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue("morning-ride"), "  Morning Ride  ");
    fireEvent.changeText(
      screen.getByPlaceholderText("Optional notes"),
      "  Imported from archive  ",
    );
    fireEvent.press(screen.getByText("Import FIT Activity"));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(processFitFileMock).toHaveBeenCalledWith({
        fitFilePath: "activities/user/uploads/123_morning-ride.fit",
        name: "Morning Ride",
        notes: "Imported from archive",
        activityType: "bike",
        importProvenance: expectedImportProvenance,
      });
      expect(invalidatePostActivityIngestionQueriesMock).toHaveBeenCalled();
      expect(invalidateActivitiesMock).toHaveBeenCalled();
      expect(screen.getByText("Historical activity imported")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("View Activity"));
    expect(pushMock).toHaveBeenCalledWith("/activity-detail?id=activity-1");
  });

  it("maps FIT parse failures to a friendly import alert", async () => {
    processFitFileMock.mockRejectedValueOnce(new Error("Failed to parse FIT file: bad file"));

    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Import FIT Activity"));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Import failed",
        "We could not read that FIT file. Try a different export or recording.",
      );
    });
  });

  it("maps other parser errors like bar error to the same friendly import alert", async () => {
    processFitFileMock.mockRejectedValueOnce(new Error("FIT decoder bar error while parsing"));

    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Import FIT Activity"));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Import failed",
        "We could not read that FIT file. Try a different export or recording.",
      );
    });
  });
});
