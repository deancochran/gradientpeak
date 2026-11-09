import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { Popover, PopoverContent, PopoverTrigger } from "./index.native";

describe("Popover native", () => {
  it("renders trigger text and popover content", async () => {
    const { getByTestId } = await renderNative(
      <Popover>
        <PopoverTrigger testID="session-details-trigger">
          <Text>Session details</Text>
        </PopoverTrigger>
        <PopoverContent testID="session-details-content">
          <Text>Threshold pace updated for race week.</Text>
        </PopoverContent>
      </Popover>,
    );

    expect(getByTestId("session-details-trigger")).toBeTruthy();
    expect(getByTestId("session-details-content")).toBeTruthy();
  });
});
