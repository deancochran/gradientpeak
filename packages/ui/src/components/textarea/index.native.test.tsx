import { NATIVE_THEME } from "../../lib/native-theme";
import { renderNative } from "../../test/render-native";
import { textareaFixtures } from "./fixtures";
import { Textarea } from "./index.native";

describe("Textarea native", () => {
  it("maps normalized test props onto the text input", () => {
    const { getByDisplayValue, getByTestId } = renderNative(
      <Textarea {...textareaFixtures.notes} value={textareaFixtures.value} />,
    );

    expect(getByDisplayValue(textareaFixtures.value)).toBeTruthy();

    const textarea = getByTestId(textareaFixtures.notes.testId);

    expect(textarea.props.testID).toBe(textareaFixtures.notes.testId);
    expect(textarea.props.nativeID).toBe(textareaFixtures.notes.id);
    expect(textarea.props.accessibilityLabel).toBe(textareaFixtures.notes.accessibilityLabel);
  });

  it("applies theme-aware text and placeholder colors", () => {
    const { getByTestId } = renderNative(
      <Textarea {...textareaFixtures.notes} placeholder="Notes" value={textareaFixtures.value} />,
    );

    const textarea = getByTestId(textareaFixtures.notes.testId);

    expect(textarea.props.placeholderTextColor).toBe(NATIVE_THEME.light.mutedForeground);
    expect(textarea.props.selectionColor).toBe(NATIVE_THEME.light.primary);
    expect(textarea.props.cursorColor).toBe(NATIVE_THEME.light.primary);
    expect(textarea.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: NATIVE_THEME.light.foreground })]),
    );
  });
});
