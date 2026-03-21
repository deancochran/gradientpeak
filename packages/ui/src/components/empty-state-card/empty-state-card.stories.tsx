import type { Meta, StoryObj } from "@storybook/react";
import { CircleAlertIcon } from "lucide-react";

import { emptyStateCardFixtures } from "./fixtures";
import { EmptyStateCard } from "./index.web";

const meta = {
  title: "Components/EmptyStateCard",
  component: EmptyStateCard,
  tags: ["autodocs"],
  args: {
    ...emptyStateCardFixtures.generic,
    icon: CircleAlertIcon,
    onAction: () => {},
  },
} satisfies Meta<typeof EmptyStateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
