import { renderNative } from "../../test/render-native";
import { loadingSkeletonFixtures } from "./fixtures";
import { ChartSkeleton, ListSkeleton } from "./index.native";

describe("LoadingSkeletons native", () => {
  it("renders the requested number of list rows", async () => {
    const { toJSON } = await renderNative(<ListSkeleton {...loadingSkeletonFixtures.list} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders chart skeleton", async () => {
    const { toJSON } = await renderNative(<ChartSkeleton {...loadingSkeletonFixtures.chart} />);
    expect(toJSON()).toBeTruthy();
  });
});
