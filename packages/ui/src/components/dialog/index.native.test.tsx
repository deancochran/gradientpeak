import { renderNative } from "../../test/render-native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./index.native";

describe("Dialog native", () => {
  it("renders trigger text and dialog content", () => {
    const { getByTestId } = renderNative(
      <Dialog open>
        <DialogTrigger testID="plan-details-trigger">
          Open plan details
        </DialogTrigger>
        <DialogContent testID="plan-details-content">
          <DialogTitle testID="plan-details-title">Plan details</DialogTitle>
          <DialogDescription>
            Review the upcoming block before saving.
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(getByTestId("plan-details-trigger")).toBeTruthy();
    expect(getByTestId("plan-details-content")).toBeTruthy();
    expect(getByTestId("plan-details-title")).toBeTruthy();
  });
});
