import { renderNative } from "../../test/render-native";
import { Separator } from "./index.native";

describe("Separator native", () => {
  it("maps normalized test props onto the separator root", () => {
    const { getByLabelText } = renderNative(
      <Separator
        accessibilityLabel="Section divider"
        decorative={false}
        id="section-divider"
        testId="section-divider"
      />,
    );

    const separator = getByLabelText("Section divider");

    expect(separator.props.testID).toBe("section-divider");
    expect(separator.props.nativeID).toBe("section-divider");
  });
});
