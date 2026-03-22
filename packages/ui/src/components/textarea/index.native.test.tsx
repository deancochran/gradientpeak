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
});
