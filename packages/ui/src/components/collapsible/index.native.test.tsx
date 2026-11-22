import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./index.native";

describe("Collapsible native", () => {
  it("renders trigger and content within the collapsible root", async () => {
    const { getByTestId } = await renderNative(
      <Collapsible defaultOpen testID="recovery-collapsible">
        <CollapsibleTrigger testID="recovery-trigger">
          <Text>Recovery notes</Text>
        </CollapsibleTrigger>
        <CollapsibleContent testID="recovery-content">
          <Text>Sleep was steady all week.</Text>
        </CollapsibleContent>
      </Collapsible>,
    );

    expect(getByTestId("recovery-collapsible")).toBeTruthy();
    expect(getByTestId("recovery-trigger")).toBeTruthy();
    expect(getByTestId("recovery-content")).toBeTruthy();
  });
});
