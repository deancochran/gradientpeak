import type { Meta, StoryObj } from "@storybook/react";
import { Activity } from "lucide-react-native";
import { View } from "react-native";

import { metricCardFixtures } from "./fixtures";
import { MetricCard } from "./index.native";

const meta = {
  title: "Components/MetricCard/Native",
  component: MetricCard,
  args: {
    ...metricCardFixtures.distance,
    icon: Activity,
  },
} satisfies Meta<typeof MetricCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Comparison: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <MetricCard {...args} />
    </View>
  ),
};

export const Subtitle: Story = {
  args: {
    ...metricCardFixtures.fatigue,
    icon: Activity,
  },
  render: (args) => (
    <View className="bg-background p-6">
      <MetricCard {...args} />
    </View>
  ),
};
