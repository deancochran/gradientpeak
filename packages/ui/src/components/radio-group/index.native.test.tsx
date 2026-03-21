import { renderNative } from "../../test/render-native";
import { radioGroupFixtures } from "./fixtures";
import { RadioGroup, RadioGroupItem } from "./index.native";

describe("RadioGroup native", () => {
  it("renders the root and item content", () => {
    const { getByTestId } = renderNative(
      <RadioGroup
        onValueChange={() => {}}
        testID={radioGroupFixtures.sport.testId}
        value={radioGroupFixtures.sport.value}
      >
        <RadioGroupItem
          testID={`${radioGroupFixtures.sport.testId}-${radioGroupFixtures.sport.options[0]?.value}`}
          value={radioGroupFixtures.sport.options[0]?.value}
        />
      </RadioGroup>,
    );

    expect(getByTestId(radioGroupFixtures.sport.testId)).toBeTruthy();
    expect(
      getByTestId(
        `${radioGroupFixtures.sport.testId}-${radioGroupFixtures.sport.options[0]?.value}`,
      ),
    ).toBeTruthy();
  });
});
