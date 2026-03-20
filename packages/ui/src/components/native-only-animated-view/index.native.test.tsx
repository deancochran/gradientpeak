import { renderNative } from "../../test/render-native";
import { Text } from "../text/index.native";
import { NativeOnlyAnimatedView } from "./index.native";

describe("NativeOnlyAnimatedView native", () => {
  it("renders its children through the animated wrapper", () => {
    const { getByText } = renderNative(
      <NativeOnlyAnimatedView>
        <Text>Animated content</Text>
      </NativeOnlyAnimatedView>,
    );

    expect(getByText("Animated content")).toBeTruthy();
  });
});
