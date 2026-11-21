import type { Meta, StoryObj } from "@storybook/react-native";
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

export const UnbrokenContent: Story = {
  ...Playground,
  args: emptyStateCardFixtures.unbrokenText,
};
export const Unavailable: Story = {
  ...Playground,
  args: emptyStateCardFixtures.unavailable,
};
export const RecoverableError: Story = {
  ...Playground,
  args: emptyStateCardFixtures.recoverableError,
};
export const Denied: Story = {
  ...Playground,
  args: emptyStateCardFixtures.denied,
};
