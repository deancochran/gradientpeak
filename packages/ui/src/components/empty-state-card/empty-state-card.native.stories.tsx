import type { Meta, StoryObj } from "@storybook/react";
import { CircleAlert } from "lucide-react-native";
import { View } from "react-native";

import { emptyStateCardFixtures } from "./fixtures";
import { EmptyStateCard } from "./index.native";

const meta = {
  title: "Components/EmptyStateCard/Native",
  component: EmptyStateCard,
  args: {
    ...emptyStateCardFixtures.generic,
    icon: CircleAlert,
    onAction: () => {},
  },
} satisfies Meta<typeof EmptyStateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <EmptyStateCard {...args} />
    </View>
  ),
};
