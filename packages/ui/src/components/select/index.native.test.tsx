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

  it("defaults the option list to a bounded nested scroll view", () => {
    const { getByTestId } = renderNative(
      <NativeSelectScrollView testID="native-select-scroll-view" />,
    );

    const scrollView = getByTestId("native-select-scroll-view");

    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scrollView.props.nestedScrollEnabled).toBe(true);
    expect(scrollView.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ maxHeight: 208 })]),
    );
  });

  it("composes caller styles and allows native scroll props to override defaults", () => {
    const callerStyle = { maxHeight: 320 };
    const { getByTestId } = renderNative(
      <NativeSelectScrollView
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled={false}
        style={callerStyle}
        testID="custom-native-select-scroll-view"
      />,
    );

    const scrollView = getByTestId("custom-native-select-scroll-view");

    expect(scrollView.props.keyboardShouldPersistTaps).toBe("always");
    expect(scrollView.props.nestedScrollEnabled).toBe(false);
    expect(scrollView.props.style).toEqual([{ maxHeight: 208 }, callerStyle]);
  });

  it("preserves a caller-provided NativeWind max-height override", () => {
    const { getByTestId } = renderNative(
      <NativeSelectScrollView className="max-h-80" testID="class-height-select-scroll-view" />,
    );

    const scrollView = getByTestId("class-height-select-scroll-view");

    expect(scrollView.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ maxHeight: 208 })]),
    );
  });
});
