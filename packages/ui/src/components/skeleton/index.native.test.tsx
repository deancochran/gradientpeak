import { renderNative } from "../../test/render-native";
import { Skeleton } from "./index.native";

describe("Skeleton native", () => {
  it("renders the placeholder view", async () => {
    const { getByTestId } = await renderNative(<Skeleton testID="loading-skeleton" />);

    expect(getByTestId("loading-skeleton")).toBeTruthy();
  });
});
