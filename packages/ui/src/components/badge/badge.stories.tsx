import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./index.web";
import { BADGE_VARIANTS } from "./shared";

const meta = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: {
    children: "Featured",
    variant: "default",
  },
  argTypes: {
    variant: {
      control: "select",
      options: BADGE_VARIANTS,
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {BADGE_VARIANTS.map((variant) => (
        <Badge key={variant} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
};
