import { renderNative } from "../../test/render-native";
import { ToggleGroup, ToggleGroupItem } from "./index.native";

describe("ToggleGroup native", () => {
  it("maps normalized test props for the root and items", () => {
    const { getByTestId } = renderNative(
      <ToggleGroup
        onValueChange={() => {}}
        testId="view-toggle-group"
        type="single"
        value="grid"
      >
        <ToggleGroupItem testId="view-grid" value="grid">
          Grid
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(getByTestId("view-toggle-group")).toBeTruthy();
    expect(getByTestId("view-grid")).toBeTruthy();
  });
});
