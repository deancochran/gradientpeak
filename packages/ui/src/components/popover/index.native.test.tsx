import { renderNative } from "../../test/render-native";
import { Popover, PopoverContent, PopoverTrigger } from "./index.native";

describe("Popover native", () => {
  it("renders trigger text and popover content", () => {
    const { getByTestId } = renderNative(
      <Popover>
        <PopoverTrigger testID="session-details-trigger">
          Session details
        </PopoverTrigger>
        <PopoverContent testID="session-details-content">
          Threshold pace updated for race week.
        </PopoverContent>
      </Popover>,
    );

    expect(getByTestId("session-details-trigger")).toBeTruthy();
    expect(getByTestId("session-details-content")).toBeTruthy();
  });
});
