import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";

import { loadingSkeletonFixtures } from "./fixtures";
import { ChartSkeleton, ListSkeleton, TrendsOverviewSkeleton } from "./index.native";

const meta = {
  title: "Components/LoadingSkeletons/Native",
  component: ListSkeleton,
  args: loadingSkeletonFixtures.list,
} satisfies Meta<typeof ListSkeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const List: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <ListSkeleton {...args} />
    </View>
  ),
};

export const Chart: Story = {
  render: () => (
    <View className="bg-background p-6">
      <ChartSkeleton {...loadingSkeletonFixtures.chart} />
    </View>
  ),
};

export const TrendsOverview: Story = {
  render: () => (
    <View className="bg-background p-6">
      <TrendsOverviewSkeleton />
    </View>
  ),
};
