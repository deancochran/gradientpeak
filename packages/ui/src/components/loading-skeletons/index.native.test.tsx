import { renderNative } from "../../test/render-native";
import { loadingSkeletonFixtures } from "./fixtures";
import { ChartSkeleton, ListSkeleton } from "./index.native";

describe("LoadingSkeletons native", () => {
  it("renders the requested number of list rows", () => {
    const { toJSON } = renderNative(<ListSkeleton {...loadingSkeletonFixtures.list} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders chart skeleton", () => {
    const { toJSON } = renderNative(<ChartSkeleton {...loadingSkeletonFixtures.chart} />);
    expect(toJSON()).toBeTruthy();
  });
});
