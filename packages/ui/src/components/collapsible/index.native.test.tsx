import { renderNative } from "../../test/render-native";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./index.native";

describe("Collapsible native", () => {
  it("renders trigger and content within the collapsible root", () => {
    const { getByTestId } = renderNative(
      <Collapsible defaultOpen testID="recovery-collapsible">
        <CollapsibleTrigger testID="recovery-trigger">Recovery notes</CollapsibleTrigger>
        <CollapsibleContent testID="recovery-content">
          Sleep was steady all week.
        </CollapsibleContent>
      </Collapsible>,
    );

    expect(getByTestId("recovery-collapsible")).toBeTruthy();
    expect(getByTestId("recovery-trigger")).toBeTruthy();
    expect(getByTestId("recovery-content")).toBeTruthy();
  });
});
