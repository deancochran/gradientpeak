import type { Meta, StoryObj } from "@storybook/react";
import { ActivityIcon } from "lucide-react";

import { metricCardFixtures } from "./fixtures";
import { MetricCard } from "./index.web";

const meta = {
  title: "Components/MetricCard",
  component: MetricCard,
  tags: ["autodocs"],
  args: {
    ...metricCardFixtures.distance,
    icon: ActivityIcon,
  },
} satisfies Meta<typeof MetricCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Comparison: Story = {};

export const Subtitle: Story = {
  args: {
    ...metricCardFixtures.fatigue,
    icon: ActivityIcon,
  },
};
