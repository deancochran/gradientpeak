import { fireEvent, renderNative } from "../../test/render-native";
import { labelFixtures } from "./fixtures";
import { Label } from "./index.native";

describe("Label native", () => {
  it("maps normalized test props and forwards press handlers", () => {
    const onPress = jest.fn();

    const { getByLabelText } = renderNative(
      <Label
        accessibilityLabel={labelFixtures.email.children}
        onPress={onPress}
        testId={labelFixtures.email.testId}
      >
        {labelFixtures.email.children}
      </Label>,
    );

    const label = getByLabelText(labelFixtures.email.children);

    expect(label.props.testID).toBe(labelFixtures.email.testId);
    fireEvent.press(label);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
