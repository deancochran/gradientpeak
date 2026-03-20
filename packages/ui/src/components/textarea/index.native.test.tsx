import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));

import { renderNative } from "../../test/render-native";
import { Textarea } from "./index.native";

describe("Textarea native", () => {
  it("maps normalized test props onto the text input", () => {
    const { getByDisplayValue, getByTestId } = renderNative(
      <Textarea
        accessibilityLabel="Bio"
        id="bio-input"
        testId="bio-textarea"
        value="Loves long runs"
      />,
    );

    expect(getByDisplayValue("Loves long runs")).toBeTruthy();

    const textarea = getByTestId("bio-textarea");

    expect(textarea.props.testID).toBe("bio-textarea");
    expect(textarea.props.nativeID).toBe("bio-input");
    expect(textarea.props.accessibilityLabel).toBe("Bio");
  });
});
