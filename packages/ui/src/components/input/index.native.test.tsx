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
});
