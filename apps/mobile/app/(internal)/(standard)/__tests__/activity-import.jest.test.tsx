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
  await fireEvent.press(screen.getByTestId("activity-import-file-input"));
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

  it("uses native MIME filters and hides required activity-name persistence metadata", async () => {
    await renderNative(<ActivityImportScreen />);

    await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
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

    expect(screen.queryByTestId("activity-import-name-input")).toBeNull();
    expect(screen.queryByText("Activity name")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("activity-import-notes-input"), "n".repeat(5001));
    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(screen.getByText("Notes must be at most 5000 characters")).toBeTruthy();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("preserves the selected file when replacement picking is canceled", async () => {
    await renderNative(<ActivityImportScreen />);
    await chooseFile();

    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: true, assets: [] });
    await fireEvent.press(screen.getByTestId("activity-import-file-input"));

    expect(screen.getByText("morning-ride.fit")).toBeTruthy();
    expect(screen.queryByTestId("activity-import-name-input")).toBeNull();
  });

  it("updates the hidden derived persistence name when replacing a file", async () => {
    await renderNative(<ActivityImportScreen />);
    await chooseFile();

    await chooseFile({
      name: "evening-run.gpx",
      size: 4096,
      uri: "file:///evening-run.gpx",
      mimeType: "application/gpx+xml",
    });
    await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    await waitFor(() =>
      expect(processActivityFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "evening-run" }),
      ),
    );
  });

  it.each([
    ["empty", { ...defaultPickedFitFile, size: 0 }],
    ["oversize", { ...defaultPickedFitFile, size: 50 * 1024 * 1024 + 1 }],
    ["unsupported extension", { ...defaultPickedFitFile, name: "activity.csv" }],
  ])("rejects an %s file before signing", async (_label, file) => {
    await renderNative(<ActivityImportScreen />);
    await chooseFile(file);

    await fireEvent.press(screen.getByTestId("activity-import-submit-button"));

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

    await renderNative(<ActivityImportScreen />);
    await chooseFile();
    let importPromise: Promise<unknown> | undefined;
    const submit = screen.getByTestId("activity-import-submit-button").props.onPress;
    if (typeof submit !== "function") throw new Error("Expected activity import submit action");
    await act(() => {
      importPromise = Promise.resolve(submit());
    });

    expect(screen.getByText("Step 1 of 3: Preparing upload…")).toBeTruthy();
    expect(screen.getByTestId("activity-import-file-input").props.disabled).toBe(true);
    expect(screen.queryByTestId("activity-import-name-input")).toBeNull();
    expect(screen.getByTestId("activity-import-notes-input").props.editable).toBe(false);
    expect(screen.getByTestId("activity-import-submit-button").props.disabled).toBe(true);

    await act(async () => {
      resolveSigning({ signedUrl: "https://upload.example.test", filePath: "uploads/file.fit" });
    });
    expect(screen.getByText("Step 2 of 3: Uploading activity file…")).toBeTruthy();

    await act(async () => resolveUpload({ success: true }));
    expect(screen.getByText("Step 3 of 3: Processing activity…")).toBeTruthy();

    await act(async () => {
      resolveProcessing({ activity: { id: "activity-1", name: "Morning Ride" } });
      await importPromise;
    });
    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
  });

  it("runs only one pipeline for same-turn duplicate submits", async () => {
    let resolveSigning!: (value: { signedUrl: string; filePath: string }) => void;
    getSignedUrlMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSigning = resolve;
      }),
    );

    await renderNative(<ActivityImportScreen />);
    await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    await waitFor(() => expect(screen.getByText("Select exactly one file")).toBeTruthy());
    expect(getSignedUrlMock).not.toHaveBeenCalled();

    await chooseFile();

    const submitButton = screen.getByTestId("activity-import-submit-button");
    const submit = submitButton.props.onPress;
    if (typeof submit !== "function") throw new Error("Expected activity import submit action");
    let firstSubmit: Promise<unknown> | undefined;
    await act(() => {
      firstSubmit = Promise.resolve(submit());
      submit();
    });

    await waitFor(() => expect(getSignedUrlMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveSigning({
        signedUrl: "https://upload.example.test",
        filePath: "activities/user/uploads/123_morning-ride.fit",
      });
      await firstSubmit;
    });

    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
  });

  it("preserves metadata after a root error, clears it on edit, and retries the uploader", async () => {
    uploadToSignedUrlMock.mockResolvedValueOnce({ success: false, error: "network unavailable" });
    await renderNative(<ActivityImportScreen />);
    await chooseFile();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(
      await screen.findByText(
        "The activity file could not be imported right now. Please try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("morning-ride.fit")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("activity-import-notes-input"), "Retrying");
    expect(
      screen.queryByText("The activity file could not be imported right now. Please try again."),
    ).toBeNull();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
    expect(getSignedUrlMock).toHaveBeenCalledTimes(2);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(2);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
  });

  it("shows generic recovery without logging raw manual-import failures", async () => {
    const privateCanaries = [
      "file:///private/dean-private.fit",
      "https://storage.test/upload?token=super-secret-token",
    ] as const;
    processActivityFileMock.mockRejectedValueOnce(new Error(privateCanaries.join(" ")));
    await renderNative(<ActivityImportScreen />);
    consoleErrorSpy.mockClear();
    await chooseFile({
      ...defaultPickedFitFile,
      name: "dean-private.fit",
      uri: privateCanaries[0],
    });

    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    expect(
      await screen.findByText(
        "The activity file could not be imported right now. Please try again.",
      ),
    ).toBeTruthy();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("keeps terminal success through invalidation/navigation failures and retries navigation only", async () => {
    invalidatePostActivityIngestionQueriesMock.mockRejectedValueOnce(
      new Error("activity cache unavailable"),
    );
    invalidateActivitiesMock.mockRejectedValueOnce(new Error("legacy cache unavailable"));
    pushMock.mockImplementationOnce(() => {
      throw new Error("navigation unavailable");
    });

    await renderNative(<ActivityImportScreen />);
    await chooseFile();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    await waitFor(() => expect(screen.getByText("Historical activity imported")).toBeTruthy());
    expect(
      screen.queryByText("The activity file could not be imported right now. Please try again."),
    ).toBeNull();
    expect(screen.getByTestId("activity-import-submit-button").props.disabled).toBe(true);

    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(processActivityFileMock).toHaveBeenCalledTimes(1);
    expect(invalidatePostActivityIngestionQueriesMock).toHaveBeenCalledTimes(1);
    expect(invalidateActivitiesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await fireEvent.press(screen.getByText("View Activity"));
    });
    expect(
      screen.getByText("Could not open the activity. Tap View Activity to try again."),
    ).toBeTruthy();
    expect(screen.getByText("Historical activity imported")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByText("View Activity"));
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

  it("submits the canonical payload, invalidates caches, and navigates", async () => {
    await renderNative(<ActivityImportScreen />);
    await chooseFile();
    await fireEvent.changeText(
      screen.getByTestId("activity-import-notes-input"),
      "  From archive  ",
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId("activity-import-submit-button"));
    });

    await waitFor(() => {
      expect(processActivityFileMock).toHaveBeenCalledWith({
        activityFilePath: "activities/user/uploads/123_morning-ride.fit",
        name: "morning-ride",
        notes: "From archive",
      });
      expect(invalidatePostActivityIngestionQueriesMock).toHaveBeenCalled();
      expect(invalidateActivitiesMock).toHaveBeenCalled();
    });

    await fireEvent.press(screen.getByText("View Activity"));
    expect(pushMock).toHaveBeenCalledWith("/activity-detail?id=activity-1");
  });
});
