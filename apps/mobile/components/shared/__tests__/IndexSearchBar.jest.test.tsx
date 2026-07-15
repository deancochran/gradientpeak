import { fireEvent, render } from "@testing-library/react-native";
import { IndexSearchBar } from "../IndexSearchBar";

describe("IndexSearchBar", () => {
  it("keeps shared search and filter actions independently selectable", () => {
    const onChangeText = jest.fn();
    const onClear = jest.fn();
    const onFilterPress = jest.fn();
    const { getByTestId } = render(
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

    fireEvent(getByTestId("activities-list-search-input"), "changeText", "recovery");
    fireEvent.press(getByTestId("activities-list-search-clear"));
    fireEvent.press(getByTestId("activities-list-filter-button"));

    expect(onChangeText).toHaveBeenCalledWith("recovery");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onFilterPress).toHaveBeenCalledTimes(1);
    expect(getByTestId("activities-list-filter-button").props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
