import { renderNative } from "../../test/render-native";
import { checkboxFixtures } from "./fixtures";
import { Checkbox } from "./index.native";

describe("Checkbox native", () => {
  it("maps normalized test props onto the root control", () => {
    const { getByLabelText } = renderNative(
      <Checkbox {...checkboxFixtures.terms} checked={false} onCheckedChange={() => {}} />,
    );

    const checkbox = getByLabelText(checkboxFixtures.terms.accessibilityLabel);

    expect(checkbox.props.testID).toBe(checkboxFixtures.terms.testId);
    expect(checkbox.props.nativeID).toBe(checkboxFixtures.terms.id);
  });
});
