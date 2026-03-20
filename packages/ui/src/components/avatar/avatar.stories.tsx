import type { Meta, StoryObj } from "@storybook/react";

import { Avatar, AvatarFallback, AvatarImage } from "./index.web";

const avatarMarkup = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><rect width='96' height='96' rx='48' fill='%231f2937'/><circle cx='48' cy='36' r='18' fill='%23f9fafb'/><path d='M20 82c6-14 18-22 28-22s22 8 28 22' fill='%23f9fafb'/></svg>",
);

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  render: () => (
    <Avatar className="size-14">
      <AvatarImage
        alt="Avery Brooks"
        src={`data:image/svg+xml,${avatarMarkup}`}
      />
      <AvatarFallback>AB</AvatarFallback>
    </Avatar>
  ),
};

export const Fallbacks: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarFallback>GP</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarFallback>TM</AvatarFallback>
      </Avatar>
      <Avatar className="size-16">
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
    </div>
  ),
};
