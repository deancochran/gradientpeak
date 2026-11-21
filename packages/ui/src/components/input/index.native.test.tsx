import { StyleSheet } from "react-native";
import { NATIVE_THEME } from "../../lib/native-theme";
import { renderNative } from "../../test/render-native";
import { inputFixtures } from "./fixtures";
import { Input, inputVariants } from "./index.native";

describe("Input native", () => {
  it("leaves text padding to the native host rather than doubling it on the shell", () => {
    const classes = inputVariants();
    expect(classes).toContain("shadow-none");
    expect(classes).not.toMatch(/\b(?:px|py|p)-\d/);
    expect(classes).not.toContain("flex-row");
  });

  it("maps normalized test props onto the native input", async () => {
    const { getByLabelText, getByTestId } = await renderNative(<Input {...inputFixtures.email} />);

    expect(getByLabelText(inputFixtures.email.accessibilityLabel)).toBeTruthy();

    const input = getByTestId(inputFixtures.email.testId);

    expect(input.props.testID).toBe(inputFixtures.email.testId);
    expect(input.props.nativeID).toBe(inputFixtures.email.id);
  });

  it("applies theme-aware text and placeholder colors", async () => {
    const { getByTestId } = await renderNative(
      <Input {...inputFixtures.email} placeholder="Email" />,
    );

    const input = getByTestId(inputFixtures.email.testId);

    expect(input.props.placeholderTextColor).toBe(NATIVE_THEME.light.mutedForeground);
    expect(input.props.selectionColor).toBe(NATIVE_THEME.light.primary);
    expect(input.props.cursorColor).toBe(NATIVE_THEME.light.primary);
    expect(StyleSheet.flatten(input.props.style)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: NATIVE_THEME.light.foreground }),
        expect.objectContaining({ minHeight: 48 }),
      ]),
    );
  });

  it("forwards refs to the native text input", async () => {
    const ref = jest.fn();
    await renderNative(<Input {...inputFixtures.email} ref={ref} />);

    expect(ref).toHaveBeenCalled();
  });
});
