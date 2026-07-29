import { renderNative } from "../../test/render-native";
import { radioGroupFixtures } from "./fixtures";
import { RadioGroup, RadioGroupItem } from "./index.native";

describe("RadioGroup native", () => {
  it("renders the root and item content", () => {
    const { getByTestId } = renderNative(
      <RadioGroup
        onValueChange={() => {}}
        testID={radioGroupFixtures.activityCategory.testId}
        value={radioGroupFixtures.activityCategory.value}
      >
        <RadioGroupItem
          testID={`${radioGroupFixtures.activityCategory.testId}-${radioGroupFixtures.activityCategory.options[0]?.value}`}
          value={radioGroupFixtures.activityCategory.options[0]?.value}
        />
      </RadioGroup>,
    );

    expect(getByTestId(radioGroupFixtures.activityCategory.testId)).toBeTruthy();
    expect(
      getByTestId(
        `${radioGroupFixtures.activityCategory.testId}-${radioGroupFixtures.activityCategory.options[0]?.value}`,
      ),
    ).toBeTruthy();
  });
});
