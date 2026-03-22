import { renderNative } from "../../test/render-native";
import { selectFixtures } from "./fixtures";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./index.native";

describe("Select native", () => {
  it("renders trigger and option content", () => {
    const selectedOption = selectFixtures.workoutType.options[1]!;

    const { getByTestId } = renderNative(
      <Select onValueChange={() => {}} value={selectedOption as never}>
        <SelectTrigger testID={`${selectFixtures.workoutType.testId}-trigger`}>
          <SelectValue placeholder={selectFixtures.workoutType.placeholder} />
        </SelectTrigger>
        <SelectContent testID={`${selectFixtures.workoutType.testId}-content`}>
          <NativeSelectScrollView>
            <SelectItem
              label={selectedOption.label}
              testID={`${selectedOption.value}-option`}
              value={selectedOption.value as never}
            />
          </NativeSelectScrollView>
        </SelectContent>
      </Select>,
    );

    expect(getByTestId(`${selectFixtures.workoutType.testId}-trigger`)).toBeTruthy();
    expect(getByTestId(`${selectFixtures.workoutType.testId}-content`)).toBeTruthy();
    expect(getByTestId(`${selectedOption.value}-option`)).toBeTruthy();
  });
});
