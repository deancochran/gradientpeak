import type { Meta, StoryObj } from "@storybook/react";

import { fileInputFixtures } from "./fixtures";
import { FileInput } from "./index.web";

const meta = {
  title: "Components/FileInput",
  component: FileInput,
  tags: ["autodocs"],
  args: {
    ...fileInputFixtures.avatar,
    files: [{ name: "avatar.png", type: "image/png", size: 102400 }],
  },
} satisfies Meta<typeof FileInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
