import { renderNative } from "../../test/render-native";
import { Progress } from "./index.native";

describe("Progress native", () => {
  it("maps normalized test props onto the root progress bar", () => {
    const { getByLabelText } = renderNative(
      <Progress
        accessibilityLabel="Upload progress"
        id="upload-progress"
        testId="upload-progress-bar"
        value={55}
      />,
    );

    const progress = getByLabelText("Upload progress");

    expect(progress.props.testID).toBe("upload-progress-bar");
    expect(progress.props.nativeID).toBe("upload-progress");
  });
});
