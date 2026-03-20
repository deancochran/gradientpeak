import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));

import { renderNative } from "../../test/render-native";
import { Checkbox } from "./index.native";

describe("Checkbox native", () => {
  it("maps normalized test props onto the root control", () => {
    const { getByLabelText } = renderNative(
      <Checkbox
        accessibilityLabel="Accept terms"
        checked={false}
        id="accept-terms"
        onCheckedChange={() => {}}
        testId="accept-terms-checkbox"
      />,
    );

    const checkbox = getByLabelText("Accept terms");

    expect(checkbox.props.testID).toBe("accept-terms-checkbox");
    expect(checkbox.props.nativeID).toBe("accept-terms");
  });
});
