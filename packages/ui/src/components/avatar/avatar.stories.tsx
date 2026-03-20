import type { Meta, StoryObj } from "@storybook/react";

import { avatarFixtures } from "./fixtures";
import { Avatar, AvatarFallback, AvatarImage } from "./index.web";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  render: () => (
    <Avatar className="size-14" testId={avatarFixtures.profile.testId}>
      <AvatarImage
        alt={avatarFixtures.profile.alt}
        src={avatarFixtures.profile.imageSrc}
      />
      <AvatarFallback>{avatarFixtures.profile.fallback}</AvatarFallback>
    </Avatar>
  ),
};

export const Fallbacks: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarFallback>{avatarFixtures.fallbacks[0]}</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarFallback>{avatarFixtures.fallbacks[1]}</AvatarFallback>
      </Avatar>
      <Avatar className="size-16">
        <AvatarFallback>{avatarFixtures.fallbacks[2]}</AvatarFallback>
      </Avatar>
    </div>
  ),
};
