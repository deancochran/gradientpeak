import React, { act } from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
const invalidateActivitiesMock = jest.fn();
const invalidatePostActivityIngestionQueriesMock = jest.fn(async () => undefined);
const getSignedUrlMock = jest.fn();
const processActivityFileMock = jest.fn();
const uploadToSignedUrlMock = jest.fn();
const getDocumentAsyncMock = jest.fn();

const defaultPickedFitFile = {
  name: "morning-ride.fit",
  size: 2048,
  uri: "file:///morning-ride.fit",
  mimeType: "application/vnd.ant.fit",
};

type HostProps = {
  children?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  placeholder?: string;
  testID?: string;
  testId?: string;
  value?: string;
  [key: string]: unknown;
};

type FormFieldProps = HostProps & {
  control: unknown;
  name: string;
};

type ControllerRenderArgs = {
  field: {
    onChange: (value: unknown) => void;
    value?: unknown;
  };
  fieldState: { error?: { message?: string } };
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: (...args: unknown[]) => getDocumentAsyncMock(...args),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/services/fit/ActivityFileUploader", () => ({
  __esModule: true,
  ActivityFileUploader: jest.fn().mockImplementation(() => ({
    uploadToSignedUrl: uploadToSignedUrlMock,
  })),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ activities: { invalidate: invalidateActivitiesMock } }),
    activityFiles: {
      getSignedUploadUrl: {
        useMutation: () => ({ mutateAsync: getSignedUrlMock, isPending: false }),
      },
      processActivityFile: {
        useMutation: () => ({ mutateAsync: processActivityFileMock, isPending: false }),
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
  Button: ({ children, onPress, testId, ...props }: HostProps) =>
    React.createElement("Pressable", { onPress, testID: testId, ...props }, children),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/form", () => {
  const controlledTextField = ({
    control,
    disabled,
    formatValue,
    name,
    parseValue,
    placeholder,
    testId,
    ...props
  }: FormFieldProps) => {
    const { Controller } = require("react-hook-form");
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field, fieldState }: ControllerRenderArgs) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement("TextInput", {
            editable: !disabled,
            onChangeText: (value: string) =>
              field.onChange(typeof parseValue === "function" ? parseValue(value) : value),
            placeholder,
            testID: testId,
            value:
              typeof formatValue === "function"
                ? formatValue(field.value)
                : typeof field.value === "string"
                  ? field.value
                  : "",
            ...props,
          }),
          fieldState.error?.message
            ? React.createElement("Text", null, fieldState.error.message)
            : null,
        ),
    });
  };

  return {
    __esModule: true,
    Form: ({ children }: { children?: React.ReactNode }) => children,
    FormFileField: ({
      buttonLabel,
      clearLabel,
      control,
      disabled,
      name,
      nativeMimeTypes,
      testId,
    }: FormFieldProps) => {
      const { Controller } = require("react-hook-form");
      return React.createElement(Controller, {
        control,
        name,
        render: ({ field, fieldState }: ControllerRenderArgs) => {
          const files = Array.isArray(field.value) ? field.value : [];
          return React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "Pressable",
              {
                disabled,
                testID: testId,
                onPress: async () => {
                  const result = await getDocumentAsyncMock({
                    copyToCacheDirectory: true,
                    multiple: false,
                    type: nativeMimeTypes,
                  });
                  if (!result.canceled) {
                    field.onChange(
                      result.assets.map((asset: typeof defaultPickedFitFile) => ({
                        name: asset.name,
                        size: asset.size,
                        type: asset.mimeType,
                        uri: asset.uri,
                      })),
                    );
                  }
                },
              },
              React.createElement("Text", null, String(buttonLabel)),
            ),
            files.length
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(
                    "Pressable",
                    {
                      disabled,
                      testID: `${testId}-clear`,
                      onPress: () => field.onChange([]),
                    },
                    React.createElement("Text", null, String(clearLabel)),
                  ),
                  React.createElement("Text", null, files[0].name),
                )
              : null,
            fieldState.error?.message
              ? React.createElement("Text", null, fieldState.error.message)
              : null,
          );
        },
      });
    },
    FormTextField: controlledTextField,
    FormTextareaField: controlledTextField,
    FormSegmentedSelectField: controlledTextField,
  };
});

jest.mock("@repo/ui/components/loading", () => ({
  __esModule: true,
  LoadingButton: ({ children, disabled, loading, onPress, ...props }: HostProps) =>
    React.createElement(
      "Pressable",
      { disabled: disabled || loading, onPress, ...props },
      children,
    ),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  History: createHost("History"),
}));

const ActivityImportScreen = require("../activity-import").default;

async function chooseFile(file = defaultPickedFitFile) {
  getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [file] });
  await act(async () => {
    fireEvent.press(screen.getByTestId("activity-import-file-input"));
  });
}

describe("activity import screen", () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    getSignedUrlMock.mockResolvedValue({
      signedUrl: "https://upload.example.test",
      filePath: "activities/user/uploads/123_morning-ride.fit",
    });
    uploadToSignedUrlMock.mockResolvedValue({ success: true });
    processActivityFileMock.mockResolvedValue({
      activity: { id: "activity-1", name: "Morning Ride" },
    });
  });

  afterAll(() => consoleErrorSpy.mockRestore());

  it("uses native MIME filters and validates required canonical fields", async () => {
    renderNative(<ActivityImportScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(screen.getByText("Select exactly one file")).toBeTruthy();
    expect(getSignedUrlMock).not.toHaveBeenCalled();

    await chooseFile();
    expect(getDocumentAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        type: expect.arrayContaining([
          "application/vnd.ant.fit",
          "application/gpx+xml",
          "application/vnd.garmin.tcx+xml",
        ]),
      }),
    );

    fireEvent.changeText(screen.getByTestId("activity-import-name-input"), " ");
    fireEvent.changeText(screen.getByTestId("activity-import-notes-input"), "n".repeat(5001));
    fireEvent.changeText(screen.getByTestId("activity-import-type-select"), "pickleball");
    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(screen.getByText("Activity name is required")).toBeTruthy();
    expect(screen.getByText("Notes must be at most 5000 characters")).toBeTruthy();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("preserves the selected file when replacement picking is canceled", async () => {
    renderNative(<ActivityImportScreen />);
    await chooseFile();

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: true, assets: [] });
    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-file-input"));
    });

    expect(screen.getByText("morning-ride.fit")).toBeTruthy();
    expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();
  });

  it("updates only a previous auto name on replace and preserves a manual name on replace/remove", async () => {
    renderNative(<ActivityImportScreen />);
    await chooseFile();
    expect(screen.getByDisplayValue("morning-ride")).toBeTruthy();

    await chooseFile({
      name: "evening-run.gpx",
      size: 4096,
      uri: "file:///evening-run.gpx",
      mimeType: "application/gpx+xml",
    });
    expect(screen.getByDisplayValue("evening-run")).toBeTruthy();

    fireEvent.changeText(screen.getByTestId("activity-import-name-input"), "Archive favorite");
    await chooseFile({
      name: "pool-session.tcx",
      size: 8192,
      uri: "file:///pool-session.tcx",
      mimeType: "application/vnd.garmin.tcx+xml",
    });
    expect(screen.getByDisplayValue("Archive favorite")).toBeTruthy();

    fireEvent.press(screen.getByTestId("activity-import-file-input-clear"));
    expect(screen.queryByText("pool-session.tcx")).toBeNull();
    expect(screen.getByDisplayValue("Archive favorite")).toBeTruthy();
  });

  it.each([
    ["empty", { ...defaultPickedFitFile, size: 0 }],
    ["oversize", { ...defaultPickedFitFile, size: 50 * 1024 * 1024 + 1 }],
    ["unsupported extension", { ...defaultPickedFitFile, name: "activity.csv" }],
  ])("rejects an %s file before signing", async (_label, file) => {
    renderNative(<ActivityImportScreen />);
    await chooseFile(file);

    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    expect(getSignedUrlMock).not.toHaveBeenCalled();
    if (file.name.endsWith(".csv")) {
      expect(screen.getByText("Choose a FIT, GPX, or TCX file.")).toBeTruthy();
    }
  });

  it("shows all numeric phases and disables the entire form while importing", async () => {
    let resolveSigning!: (value: { signedUrl: string; filePath: string }) => void;
    let resolveUpload!: (value: { success: boolean }) => void;
    let resolveProcessing!: (value: { activity: { id: string; name: string } }) => void;
    getSignedUrlMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSigning = resolve;
      }),
    );
    uploadToSignedUrlMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    processActivityFileMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProcessing = resolve;
      }),
    );

    renderNative(<ActivityImportScreen />);
    await chooseFile();
    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    expect(screen.getByText("Step 1 of 3: Preparing upload…")).toBeTruthy();
    expect(screen.getByTestId("activity-import-file-input").props.disabled).toBe(true);
    expect(screen.getByTestId("activity-import-name-input").props.editable).toBe(false);
    expect(screen.getByTestId("activity-import-type-select").props.editable).toBe(false);
    expect(screen.getByTestId("activity-import-notes-input").props.editable).toBe(false);
    expect(screen.getByTestId("activity-import-submit-button").props.disabled).toBe(true);

    await act(async () => {
      resolveSigning({ signedUrl: "https://upload.example.test", filePath: "uploads/file.fit" });
    });
    expect(screen.getByText("Step 2 of 3: Uploading activity file…")).toBeTruthy();

    await act(async () => resolveUpload({ success: true }));
    expect(screen.getByText("Step 3 of 3: Processing activity…")).toBeTruthy();

    await act(async () =>
      resolveProcessing({ activity: { id: "activity-1", name: "Morning Ride" } }),
    );
    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
  });

  it("runs only one pipeline for same-turn duplicate submits", async () => {
    let resolveSigning!: (value: { signedUrl: string; filePath: string }) => void;
    getSignedUrlMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSigning = resolve;
      }),
    );

    renderNative(<ActivityImportScreen />);
    fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    await waitFor(() => expect(screen.getByText("Select exactly one file")).toBeTruthy());
    expect(getSignedUrlMock).not.toHaveBeenCalled();

    await chooseFile();

    const submitButton = screen.getByTestId("activity-import-submit-button");
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    await waitFor(() => expect(getSignedUrlMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveSigning({
        signedUrl: "https://upload.example.test",
        filePath: "activities/user/uploads/123_morning-ride.fit",
      });
    });

    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
  });

  it("preserves metadata after a root error, clears it on edit, and retries the uploader", async () => {
    uploadToSignedUrlMock.mockResolvedValueOnce({ success: false, error: "network unavailable" });
    renderNative(<ActivityImportScreen />);
    await chooseFile();
    fireEvent.changeText(screen.getByTestId("activity-import-name-input"), "Retry Ride");

    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(
      await screen.findByText(
        "The activity file could not be imported right now. Please try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("morning-ride.fit")).toBeTruthy();
    expect(screen.getByDisplayValue("Retry Ride")).toBeTruthy();

    fireEvent.changeText(screen.getByTestId("activity-import-notes-input"), "Retrying");
    expect(
      screen.queryByText("The activity file could not be imported right now. Please try again."),
    ).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
    expect(getSignedUrlMock).toHaveBeenCalledTimes(2);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(2);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
  });

  it("keeps terminal success through invalidation/navigation failures and retries navigation only", async () => {
    invalidatePostActivityIngestionQueriesMock.mockRejectedValueOnce(
      new Error("activity cache unavailable"),
    );
    invalidateActivitiesMock.mockRejectedValueOnce(new Error("legacy cache unavailable"));
    pushMock.mockImplementationOnce(() => {
      throw new Error("navigation unavailable");
    });

    renderNative(<ActivityImportScreen />);
    await chooseFile();
    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
    expect(
      screen.queryByText("The activity file could not be imported right now. Please try again."),
    ).toBeNull();
    expect(screen.getByTestId("activity-import-submit-button").props.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
    expect(invalidatePostActivityIngestionQueriesMock).toHaveBeenCalledTimes(1);
    expect(invalidateActivitiesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByText("View Activity"));
    });
    expect(
      screen.getByText("Could not open the activity. Tap View Activity to try again."),
    ).toBeTruthy();
    expect(screen.getByText("Historical activity imported")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("View Activity"));
    });
    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenLastCalledWith("/activity-detail?id=activity-1");
    expect(
      screen.queryByText("Could not open the activity. Tap View Activity to try again."),
    ).toBeNull();
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
  });

  it("submits canonical payload and provenance, invalidates caches, and navigates", async () => {
    renderNative(<ActivityImportScreen />);
    await chooseFile();
    fireEvent.changeText(screen.getByTestId("activity-import-name-input"), "  Morning Ride  ");
    fireEvent.changeText(screen.getByTestId("activity-import-notes-input"), "  From archive  ");

    await act(async () => {
      fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    await waitFor(() => {
      expect(processActivityFileMock).toHaveBeenCalledWith({
        activityFilePath: "activities/user/uploads/123_morning-ride.fit",
        name: "Morning Ride",
        notes: "From archive",
        activityType: "bike",
        importProvenance: {
          import_source: "manual_historical",
          import_file_type: "fit",
          import_original_file_name: "morning-ride.fit",
        },
      });
      expect(invalidatePostActivityIngestionQueriesMock).toHaveBeenCalled();
      expect(invalidateActivitiesMock).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByText("View Activity"));
    expect(pushMock).toHaveBeenCalledWith("/activity-detail?id=activity-1");
  });
});
