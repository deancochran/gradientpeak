import { fireEvent, renderNative } from "../../test/render-native";
import { getSearchFieldInputClassName, SearchField } from "./index.native";

describe("SearchField native", () => {
  it("exposes search keyboard behavior, submission, and stable selectors", () => {
    const onSubmit = jest.fn();
    const onValueChange = jest.fn();
    const { getByLabelText, getByTestId } = renderNative(
      <SearchField
        accessibilityLabel="Search plans"
        clearTestId="legacy-plan-search-clear"
        maxLength={80}
        onSubmit={onSubmit}
        onValueChange={onValueChange}
        placeholder="Search plans"
        testId="plan-search"
        value="tempo"
      />,
    );
    const input = getByLabelText("Search plans");

    expect(input.props.autoCapitalize).toBe("none");
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.returnKeyType).toBe("search");
    expect(input.props.maxLength).toBe(80);
    expect(getSearchFieldInputClassName({ hasValue: true, loading: false })).toContain("pr-16");
    expect(getSearchFieldInputClassName({ hasValue: true, loading: false })).not.toContain("pr-24");
    expect(getByTestId("legacy-plan-search-clear").props.className).toContain("h-11 w-11");
    fireEvent(input, "changeText", "recovery");
    fireEvent(input, "submitEditing");
    fireEvent.press(getByTestId("legacy-plan-search-clear"));

    expect(onValueChange).toHaveBeenNthCalledWith(1, "recovery");
    expect(onValueChange).toHaveBeenNthCalledWith(2, "");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("announces loading and disables editing and clearing", () => {
    const onValueChange = jest.fn();
    const { getByLabelText, getByTestId } = renderNative(
      <SearchField
        accessibilityLabel="Search routes"
        disabled
        loading
        loadingLabel="Updating routes"
        onValueChange={onValueChange}
        placeholder="Search routes"
        testId="route-search"
        value="hill"
      />,
    );

    expect(getByLabelText("Updating routes")).toBeTruthy();
    expect(getSearchFieldInputClassName({ hasValue: true, loading: true })).toContain("pr-24");
    const input = getByLabelText("Search routes");
    expect(input.props.editable).toBe(false);
    expect(getByTestId("route-search-clear").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(getByTestId("route-search-clear"));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
