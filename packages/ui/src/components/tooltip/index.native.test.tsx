import { renderNative } from "../../test/render-native";
import { Tooltip, TooltipContent, TooltipTrigger } from "./index.native";

describe("Tooltip native", () => {
  it("renders trigger text and tooltip content", () => {
    const { getByTestId } = renderNative(
      <Tooltip>
        <TooltipTrigger testID="tooltip-trigger">
          Why this matters
        </TooltipTrigger>
        <TooltipContent testID="tooltip-content">
          Workout stress updates after sync.
        </TooltipContent>
      </Tooltip>,
    );

    expect(getByTestId("tooltip-trigger")).toBeTruthy();
    expect(getByTestId("tooltip-content")).toBeTruthy();
  });
});
