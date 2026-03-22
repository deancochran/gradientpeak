import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";

import { avatarStackFixtures } from "./fixtures";
import { AvatarStack } from "./index.native";

const meta = {
  title: "Components/AvatarStack/Native",
  component: AvatarStack,
  args: avatarStackFixtures.team,
} satisfies Meta<typeof AvatarStack>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <AvatarStack {...args} />
    </View>
  ),
};

export const Horizontal: Story = {
  args: {
    ...avatarStackFixtures.team,
    orientation: "horizontal",
  },
  render: (args) => (
    <View className="bg-background p-6">
      <AvatarStack {...args} />
    </View>
  ),
};
