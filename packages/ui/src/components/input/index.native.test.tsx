import { NATIVE_THEME } from "../../lib/native-theme";
import { renderNative } from "../../test/render-native";
import { inputFixtures } from "./fixtures";
import { Input } from "./index.native";

describe("Input native", () => {
  it("maps normalized test props onto the native input", () => {
    const { getByLabelText, getByTestId } = renderNative(<Input {...inputFixtures.email} />);

    expect(getByLabelText(inputFixtures.email.accessibilityLabel)).toBeTruthy();

    const input = getByTestId(inputFixtures.email.testId);

    expect(input.props.testID).toBe(inputFixtures.email.testId);
    expect(input.props.nativeID).toBe(inputFixtures.email.id);
  });

  it("applies theme-aware text and placeholder colors", () => {
    const { getByTestId } = renderNative(<Input {...inputFixtures.email} placeholder="Email" />);

    const input = getByTestId(inputFixtures.email.testId);

    expect(input.props.placeholderTextColor).toBe(NATIVE_THEME.light.mutedForeground);
    expect(input.props.selectionColor).toBe(NATIVE_THEME.light.primary);
    expect(input.props.cursorColor).toBe(NATIVE_THEME.light.primary);
    expect(input.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: NATIVE_THEME.light.foreground })]),
    );
  });
});
