import type { Meta, StoryObj } from "@storybook/react";
import { ActivityIcon } from "lucide-react";

import { iconFixtures } from "./fixtures";
import { Icon } from "./index.web";

const meta = {
  title: "Components/Icon",
  component: Icon,
  tags: ["autodocs"],
  args: {
    as: ActivityIcon,
    size: iconFixtures.status.size,
    testId: iconFixtures.status.testId,
  },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
