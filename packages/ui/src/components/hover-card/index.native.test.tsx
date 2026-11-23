import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./index.native";

describe("HoverCard native", () => {
  it("renders trigger text and preview content", async () => {
    const { getByTestId } = await renderNative(
      <HoverCard openDelay={0}>
        <HoverCardTrigger testID="athlete-preview-trigger">
          <Text>Athlete preview</Text>
        </HoverCardTrigger>
        <HoverCardContent testID="athlete-preview-content">
          <Text>Last session: 10 x 400m.</Text>
        </HoverCardContent>
      </HoverCard>,
    );

    expect(getByTestId("athlete-preview-trigger")).toBeTruthy();
    expect(getByTestId("athlete-preview-content")).toBeTruthy();
  });
});
