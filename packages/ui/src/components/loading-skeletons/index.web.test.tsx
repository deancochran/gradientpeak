import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { loadingSkeletonFixtures } from "./fixtures";
import { ChartSkeleton, ListSkeleton } from "./index.web";

describe("LoadingSkeletons web", () => {
  it("renders the requested number of list rows", () => {
    const { container } = renderWeb(<ListSkeleton {...loadingSkeletonFixtures.list} />);
    expect(container.querySelectorAll(".rounded-lg.border").length).toBe(
      loadingSkeletonFixtures.list.count,
    );
  });

  it("renders chart skeleton", () => {
    renderWeb(<ChartSkeleton {...loadingSkeletonFixtures.chart} />);
    expect(screen.getAllByRole("generic").length).toBeGreaterThan(0);
  });
});
