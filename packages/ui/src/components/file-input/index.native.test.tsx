import { getDocumentAsync } from "expo-document-picker";
import { fireEvent, renderNative } from "../../test/render-native";
import { FileInput } from "./index.native";

const mockedGetDocumentAsync = jest.mocked(getDocumentAsync);

describe("FileInput native", () => {
  it("selects multiple files using native MIME filters rather than web accept syntax", async () => {
    const onFilesChange = jest.fn();
    mockedGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "one.fit",
          size: 2048,
          mimeType: "application/octet-stream",
          uri: "file:///one.fit",
          lastModified: 0,
        },
        {
          name: "two.gpx",
          size: 512,
          mimeType: "application/gpx+xml",
          uri: "file:///two.gpx",
          lastModified: 0,
        },
      ],
    });
    const rendered = renderNative(
      <FileInput
        accept=".fit,.gpx"
        label="Activity files"
        multiple
        nativeMimeTypes={["application/octet-stream", "application/gpx+xml"]}
        onFilesChange={onFilesChange}
        testId="activity-file"
      />,
    );

    await fireEvent.press(rendered.getByTestId("activity-file"));

    expect(mockedGetDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: true,
        type: ["application/octet-stream", "application/gpx+xml"],
      }),
    );
    expect(mockedGetDocumentAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: ".fit,.gpx" }),
    );
    expect(onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "one.fit", uri: "file:///one.fit" }),
      expect.objectContaining({ name: "two.gpx", uri: "file:///two.gpx" }),
    ]);
  });

  it("preserves the current selection when the picker is cancelled", async () => {
    const onFilesChange = jest.fn();
    mockedGetDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    const rendered = renderNative(
      <FileInput
        files={[{ name: "keep.fit", size: 2048, uri: "file:///keep.fit" }]}
        label="Activity file"
        onFilesChange={onFilesChange}
        testId="activity-file"
      />,
    );

    await fireEvent.press(rendered.getByTestId("activity-file"));

    expect(onFilesChange).not.toHaveBeenCalled();
    expect(rendered.getByText("keep.fit (2.0 KB)")).toBeTruthy();
  });

  it("replaces in one picker interaction and supports direct remove and clear", async () => {
    const onFilesChange = jest.fn();
    mockedGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "new.fit",
          size: 1024,
          mimeType: "application/octet-stream",
          uri: "file:///new.fit",
          lastModified: 0,
        },
      ],
    });
    const rendered = renderNative(
      <FileInput
        files={[
          { name: "old.fit", size: 10 },
          { name: "other.fit", size: 20 },
        ]}
        label="Activity files"
        multiple
        onFilesChange={onFilesChange}
        testId="activity-file"
      />,
    );

    expect(rendered.getByText("Replace files")).toBeTruthy();
    await fireEvent.press(rendered.getByTestId("activity-file"));
    expect(onFilesChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: "new.fit" })]);

    fireEvent.press(rendered.getByTestId("activity-file-remove-0"));
    expect(onFilesChange).toHaveBeenLastCalledWith([{ name: "other.fit", size: 20 }]);
    fireEvent.press(rendered.getByTestId("activity-file-clear"));
    expect(onFilesChange).toHaveBeenLastCalledWith([]);
  });

  it("blocks all interactions while disabled", async () => {
    const onFilesChange = jest.fn();
    const rendered = renderNative(
      <FileInput
        disabled
        files={[{ name: "locked.fit", size: 10 }]}
        label="Locked file"
        onFilesChange={onFilesChange}
        testId="locked-file"
      />,
    );

    expect(rendered.getByTestId("locked-file").props.disabled).toBe(true);
    expect(rendered.getByTestId("locked-file").props["aria-required"]).toBe(false);
    await fireEvent.press(rendered.getByTestId("locked-file"));
    fireEvent.press(rendered.getByTestId("locked-file-remove-0"));
    fireEvent.press(rendered.getByTestId("locked-file-clear"));
    expect(mockedGetDocumentAsync).not.toHaveBeenCalled();
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it("associates its label, helper, error, required state, id, name, and selector", () => {
    const rendered = renderNative(
      <FileInput
        error="Choose a supported file"
        helperText="FIT only"
        id="upload"
        label="Upload"
        name="upload_file"
        required
        testId="upload-file"
      />,
    );
    const button = rendered.getByTestId("upload-file");

    expect(button.props.accessibilityLabel).toBe("Upload");
    expect(button.props.accessibilityLabelledBy).toBe("upload-label");
    expect(button.props.accessibilityHint).toBe("FIT only. Choose a supported file");
    expect(button.props["aria-invalid"]).toBe(true);
    expect(button.props["aria-required"]).toBe(true);
    expect(rendered.getByText("Choose a supported file").props.nativeID).toBe("upload-error");
    const views = (
      rendered as unknown as {
        UNSAFE_getAllByType: (type: string) => Array<{ props: Record<string, unknown> }>;
      }
    ).UNSAFE_getAllByType("View");
    expect(views.some((view) => view.props.name === "upload_file")).toBe(true);
  });
});
