import type { Meta, StoryObj } from "@storybook/react";

import { avatarStackFixtures } from "./fixtures";
import { AvatarStack } from "./index.web";

const meta = {
  title: "Components/AvatarStack",
  component: AvatarStack,
  tags: ["autodocs"],
  args: avatarStackFixtures.team,
} satisfies Meta<typeof AvatarStack>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Vertical: Story = {};

export const Horizontal: Story = {
  args: {
    ...avatarStackFixtures.team,
    orientation: "horizontal",
  },
};
