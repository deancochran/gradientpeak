import { renderNative } from "../../test/render-native";
import { ProgressBar } from "./index.native";

describe("Progress native", () => {
  it("maps normalized test props onto the root progress bar", () => {
    const { getByLabelText } = renderNative(
      <ProgressBar
        accessibilityLabel="Upload progress"
        id="upload-progress"
        testId="upload-progress-bar"
        value={55}
      />,
    );

    const progress = getByLabelText("Upload progress");

    expect(progress.props.testID).toBe("upload-progress-bar");
    expect(progress.props.nativeID).toBe("upload-progress");
    expect(progress.props.accessibilityRole).toBe("progressbar");
    expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 55 });
  });

  it("clamps values to the accessible range", () => {
    const { getByLabelText } = renderNative(
      <ProgressBar accessibilityLabel="Upload progress" value={120} />,
    );
    expect(getByLabelText("Upload progress").props.accessibilityValue.now).toBe(100);
  });
});
