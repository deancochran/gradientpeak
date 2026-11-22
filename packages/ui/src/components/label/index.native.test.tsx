import { Text } from "react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { labelFixtures } from "./fixtures";
import { Label } from "./index.native";

describe("Label native", () => {
  it("maps normalized test props and forwards press handlers", async () => {
    const onPress = jest.fn();

    const { getByLabelText } = await renderNative(
      <Label
        accessibilityLabel={labelFixtures.email.children}
        onPress={onPress}
        testId={labelFixtures.email.testId}
      >
        <Text>{labelFixtures.email.children}</Text>
      </Label>,
    );

    const label = getByLabelText(labelFixtures.email.children);

    expect(label.props.testID).toBe(labelFixtures.email.testId);
    await fireEvent.press(label);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
