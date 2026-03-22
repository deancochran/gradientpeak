import type { ChartSkeletonProps, ListSkeletonProps } from "./shared";

export const loadingSkeletonFixtures = {
  chart: {
    height: 280,
  } satisfies ChartSkeletonProps,
  list: {
    count: 5,
  } satisfies ListSkeletonProps,
};
