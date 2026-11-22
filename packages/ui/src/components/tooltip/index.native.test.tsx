import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { Tooltip, TooltipContent, TooltipTrigger } from "./index.native";

describe("Tooltip native", () => {
  it("renders trigger text and tooltip content", async () => {
    const { getByTestId } = await renderNative(
      <Tooltip>
        <TooltipTrigger testID="tooltip-trigger">
          <Text>Why this matters</Text>
        </TooltipTrigger>
        <TooltipContent testID="tooltip-content">
          <Text>Activity stress updates after sync.</Text>
        </TooltipContent>
      </Tooltip>,
    );

    expect(getByTestId("tooltip-trigger")).toBeTruthy();
    expect(getByTestId("tooltip-content")).toBeTruthy();
  });
});
