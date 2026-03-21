import type { Meta, StoryObj } from "@storybook/react";

import { loadingSkeletonFixtures } from "./fixtures";
import { ChartSkeleton, ListSkeleton, TrendsOverviewSkeleton } from "./index.web";

const meta = {
  title: "Components/LoadingSkeletons",
  component: ListSkeleton,
  tags: ["autodocs"],
  args: loadingSkeletonFixtures.list,
} satisfies Meta<typeof ListSkeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const List: Story = {};

export const Chart: Story = {
  render: () => <ChartSkeleton {...loadingSkeletonFixtures.chart} />,
};

export const TrendsOverview: Story = {
  render: () => <TrendsOverviewSkeleton />,
};
