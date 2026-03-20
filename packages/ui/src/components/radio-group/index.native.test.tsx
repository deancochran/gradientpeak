import { renderNative } from "../../test/render-native";
import { RadioGroup, RadioGroupItem } from "./index.native";

describe("RadioGroup native", () => {
  it("renders the root and item content", () => {
    const { getByTestId } = renderNative(
      <RadioGroup onValueChange={() => {}} testID="activity-format" value="run">
        <RadioGroupItem testID="activity-format-run" value="run" />
      </RadioGroup>,
    );

    expect(getByTestId("activity-format")).toBeTruthy();
    expect(getByTestId("activity-format-run")).toBeTruthy();
  });
});
