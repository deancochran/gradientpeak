import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./index.native";

describe("Dialog native", () => {
  it("renders trigger text and dialog content", async () => {
    const { getByTestId } = await renderNative(
      <Dialog open>
        <DialogTrigger testID="plan-details-trigger">
          <Text>Open plan details</Text>
        </DialogTrigger>
        <DialogContent testID="plan-details-content">
          <DialogTitle testID="plan-details-title">
            <Text>Plan details</Text>
          </DialogTitle>
          <DialogDescription>
            <Text>Review the upcoming block before saving.</Text>
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(getByTestId("plan-details-trigger")).toBeTruthy();
    expect(getByTestId("plan-details-content")).toBeTruthy();
    expect(getByTestId("plan-details-title")).toBeTruthy();
  });
});
