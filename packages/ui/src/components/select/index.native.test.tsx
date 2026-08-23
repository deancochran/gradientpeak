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
  it("renders trigger and option content", async () => {
    const selectedOption = selectFixtures.sessionFocus.options[1]!;

    const { getByTestId } = await renderNative(
      <Select onValueChange={() => {}} value={selectedOption as never}>
        <SelectTrigger testID={`${selectFixtures.sessionFocus.testId}-trigger`}>
          <SelectValue placeholder={selectFixtures.sessionFocus.placeholder} />
        </SelectTrigger>
        <SelectContent testID={`${selectFixtures.sessionFocus.testId}-content`}>
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

    expect(getByTestId(`${selectFixtures.sessionFocus.testId}-trigger`)).toBeTruthy();
    expect(getByTestId(`${selectFixtures.sessionFocus.testId}-content`)).toBeTruthy();
    expect(getByTestId(`${selectedOption.value}-option`)).toBeTruthy();
  });

  it("defaults the option list to a bounded nested scroll view", async () => {
    const { getByTestId } = await renderNative(
      <NativeSelectScrollView testID="native-select-scroll-view" />,
    );

    const scrollView = getByTestId("native-select-scroll-view");

    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scrollView.props.nestedScrollEnabled).toBe(true);
    expect(scrollView.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ maxHeight: 208 })]),
    );
  });

  it("composes caller styles and allows native scroll props to override defaults", async () => {
    const callerStyle = { maxHeight: 320 };
    const { getByTestId } = await renderNative(
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

  it("preserves a caller-provided NativeWind max-height override", async () => {
    const { getByTestId } = await renderNative(
      <NativeSelectScrollView className="max-h-80" testID="class-height-select-scroll-view" />,
    );

    const scrollView = getByTestId("class-height-select-scroll-view");

    expect(scrollView.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ maxHeight: 208 })]),
    );
  });
});
