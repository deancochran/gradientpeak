import { renderNative } from "../../test/render-native";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./index.native";

describe("HoverCard native", () => {
  it("renders trigger text and preview content", () => {
    const { getByTestId } = renderNative(
      <HoverCard openDelay={0}>
        <HoverCardTrigger testID="athlete-preview-trigger">
          Athlete preview
        </HoverCardTrigger>
        <HoverCardContent testID="athlete-preview-content">
          Last session: 10 x 400m.
        </HoverCardContent>
      </HoverCard>,
    );

    expect(getByTestId("athlete-preview-trigger")).toBeTruthy();
    expect(getByTestId("athlete-preview-content")).toBeTruthy();
  });
});
