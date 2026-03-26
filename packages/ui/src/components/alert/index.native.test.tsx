import { CircleAlert } from "lucide-react-native";

import { renderNative } from "../../test/render-native";
import { Alert, AlertDescription, AlertTitle } from "./index.native";

describe("Alert native", () => {
  it("renders alert content with title and description", () => {
    const { getByText } = renderNative(
      <Alert accessibilityLabel="Training alert" icon={CircleAlert} testID="training-alert">
        <AlertTitle>Fuel before your session</AlertTitle>
        <AlertDescription>Bring 40g of carbs for the long run.</AlertDescription>
      </Alert>,
    );

    expect(getByText("Fuel before your session")).toBeTruthy();
    expect(getByText("Bring 40g of carbs for the long run.")).toBeTruthy();
  });
});
