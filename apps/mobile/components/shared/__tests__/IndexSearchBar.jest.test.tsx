import { fireEvent, render } from "@testing-library/react-native";
import { FilterChip, IndexResultsSummary, IndexSearchBar } from "../IndexSearchBar";

describe("IndexSearchBar", () => {
  it("keeps shared search and filter actions independently selectable", async () => {
    const onChangeText = jest.fn();
    const onClear = jest.fn();
    const onFilterPress = jest.fn();
    const { getByTestId } = await render(
      <IndexSearchBar
        hasActiveFilters
        onChangeText={onChangeText}
        onClear={onClear}
        onFilterPress={onFilterPress}
        placeholder="Search activities"
        testIDPrefix="activities-list"
        value="tempo"
      />,
    );

    await fireEvent(getByTestId("activities-list-search-input"), "changeText", "recovery");
    await fireEvent.press(getByTestId("activities-list-search-clear"));
    await fireEvent.press(getByTestId("activities-list-filter-button"));

    expect(onChangeText).toHaveBeenCalledWith("recovery");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onFilterPress).toHaveBeenCalledTimes(1);
    expect(getByTestId("activities-list-filter-button").props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(getByTestId("activities-list-filter-button").props.accessibilityRole).toBe("button");
    expect(getByTestId("activities-list-filter-button").props.className).toContain("min-h-12");
  });

  it("exposes filter chips as selected 48dp buttons", async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <FilterChip isActive label="Cycling" onPress={onPress} testID="cycling-filter" />,
    );

    const chip = getByTestId("cycling-filter");
    expect(chip.props.accessibilityRole).toBe("button");
    expect(chip.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(chip.props.className).toContain("min-h-12");
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("labels partial pagination counts as loaded results", async () => {
    const { getByText } = await render(
      <IndexResultsSummary count={20} countKind="loaded" singularLabel="route" />,
    );

    expect(getByText("20 routes loaded")).toBeTruthy();
  });
});
