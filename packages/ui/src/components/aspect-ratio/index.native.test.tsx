import { renderNative } from "../../test/render-native";
import { Text } from "../text/index.native";
import { AspectRatio } from "./index.native";

describe("AspectRatio native", () => {
  it("renders children inside the primitive root", () => {
    const { getByTestId, getByText } = renderNative(
      <AspectRatio ratio={16 / 9} testID="media-frame">
        <Text>Preview media</Text>
      </AspectRatio>,
    );

    expect(getByTestId("media-frame")).toBeTruthy();
    expect(getByText("Preview media")).toBeTruthy();
  });
});
