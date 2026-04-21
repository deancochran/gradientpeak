import React, { act } from "react";

import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
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

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
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

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
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
  Button: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
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

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CheckCircle: createHost("CheckCircle"),
  FileText: createHost("FileText"),
  History: createHost("History"),
  Upload: createHost("Upload"),
}));

const ActivityImportScreen = require("../activity-import").default;
const { Alert } = require("react-native");

describe("activity import screen", () => {
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
    renderNative(<ActivityImportScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();
      expect(screen.getByText("morning-ride.fit")).toBeTruthy();
    });
  });

  it("shows an alert for unsupported files before staging an import", async () => {
    getDocumentAsyncMock.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: "history.tcx", size: 2048, uri: "file:///history.tcx" }],
    });

    renderNative(<ActivityImportScreen />);

    fireEvent.press(screen.getByText("Choose FIT File"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Unsupported file",
        "Choose a FIT file ending in .fit.",
      );
    });
  });

  it("submits manual historical provenance and lets the user open the imported activity", async () => {
    renderNative(<ActivityImportScreen />);

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
});
