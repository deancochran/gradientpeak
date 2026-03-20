import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));

import { renderNative } from "../../test/render-native";
import { Input } from "./index.native";

describe("Input native", () => {
  it("maps normalized test props onto the native input", () => {
    const { getByLabelText, getByTestId } = renderNative(
      <Input accessibilityLabel="Email" id="email-input" testId="auth-email" />,
    );

    expect(getByLabelText("Email")).toBeTruthy();

    const input = getByTestId("auth-email");

    expect(input.props.testID).toBe("auth-email");
    expect(input.props.nativeID).toBe("email-input");
  });
});
