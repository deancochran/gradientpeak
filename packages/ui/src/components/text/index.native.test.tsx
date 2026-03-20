import { renderNative } from "../../test/render-native";
import { Text } from "./index.native";

describe("Text native", () => {
  it("maps normalized test props onto the rendered text node", () => {
    const { getByTestId, getByText } = renderNative(
      <Text
        accessibilityLabel="Welcome copy"
        id="welcome-copy"
        testId="welcome-copy-text"
      >
        Welcome back
      </Text>,
    );

    const text = getByTestId("welcome-copy-text");

    expect(text.props.testID).toBe("welcome-copy-text");
    expect(text.props.nativeID).toBe("welcome-copy");
    expect(text.props.accessibilityLabel).toBe("Welcome copy");
    expect(getByText("Welcome back")).toBeTruthy();
  });
});
