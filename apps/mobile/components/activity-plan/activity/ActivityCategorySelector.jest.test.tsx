import { BackHandler } from "react-native";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { ActivityCategorySelector } from "./ActivityCategorySelector";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
describe("ActivityCategorySelector compact menu", () => {
  it("keeps the category menu closed while disabled", async () => {
    const change = jest.fn();
    await renderNative(<ActivityCategorySelector compact disabled value="run" onChange={change} />);

    await fireEvent.press(screen.getByLabelText("Activity category"));

    expect(screen.queryByTestId("activity-category-selector-menu")).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("opens a compact local menu and returns the selected category", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <ActivityCategorySelector
        compact
        value="run"
        onChange={change}
        accessibilityLabel="Category"
      />,
    );

    expect(screen.queryByText("🏃")).toBeNull();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByLabelText("Category").props.accessibilityValue).toEqual({ text: "Run" });
    await fireEvent.press(screen.getByLabelText("Category"));
    expect(screen.getByTestId("activity-category-selector-menu")).toBeTruthy();
    expect(screen.getByTestId("activity-category-option-bike")).toBeTruthy();
    expect(screen.getByTestId("activity-category-option-run")).toBeTruthy();
    expect(screen.getByLabelText("Select Run")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Select Bike"));

    expect(change).toHaveBeenCalledWith("bike");
    expect(screen.queryByTestId("activity-category-selector-menu")).toBeNull();
    await view.rerender(
      <ActivityCategorySelector
        compact
        value="bike"
        onChange={change}
        accessibilityLabel="Category"
      />,
    );
    expect(screen.getByText("Bike")).toBeTruthy();
    expect(screen.getByLabelText("Category").props.accessibilityValue).toEqual({ text: "Bike" });
  });

  it("toggles and dismisses the menu from Back", async () => {
    const back = jest.spyOn(BackHandler, "addEventListener");
    await renderNative(<ActivityCategorySelector compact value="run" onChange={jest.fn()} />);
    const trigger = screen.getByLabelText("Activity category");

    await fireEvent.press(trigger);
    await fireEvent.press(trigger);
    expect(screen.queryByTestId("activity-category-selector-menu")).toBeNull();
    await fireEvent.press(trigger);
    const handler = back.mock.calls.at(-1)?.[1];
    await act(() => handler?.({} as never));
    expect(screen.queryByTestId("activity-category-selector-menu")).toBeNull();
    back.mockRestore();
  });

  it("cancels without changing the category and exposes options after reopening", async () => {
    const change = jest.fn();
    await renderNative(<ActivityCategorySelector compact value="run" onChange={change} />);
    const trigger = screen.getByLabelText("Activity category");

    await fireEvent.press(trigger);
    await fireEvent.press(screen.getByLabelText("Close category menu"));

    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByTestId("activity-category-selector-menu")).toBeNull();

    await fireEvent.press(trigger);

    expect(screen.getByLabelText("Select Run")).toBeTruthy();
    expect(screen.getByTestId("activity-category-option-run")).toBeTruthy();
  });

  it("dismisses the modal menu on an accessibility escape", async () => {
    const change = jest.fn();
    await renderNative(<ActivityCategorySelector compact value="run" onChange={change} />);

    await fireEvent.press(screen.getByLabelText("Activity category"));
    await fireEvent(screen.getByTestId("activity-category-selector-menu"), "accessibilityEscape");

    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByTestId("activity-category-selector-menu")).toBeNull();
  });
});
