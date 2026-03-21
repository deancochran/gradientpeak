import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";

import { errorStateCardFixtures } from "./fixtures";
import { ErrorMessage, ErrorStateCard } from "./index.native";

const meta = {
  title: "Components/ErrorStateCard/Native",
  component: ErrorStateCard,
  args: {
    ...errorStateCardFixtures.generic,
    onRetry: () => {},
  },
} satisfies Meta<typeof ErrorStateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Card: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <ErrorStateCard {...args} />
    </View>
  ),
};

export const Inline: Story = {
  render: () => (
    <View className="bg-background p-6">
      <ErrorMessage {...errorStateCardFixtures.inline} onRetry={() => {}} />
    </View>
  ),
};
