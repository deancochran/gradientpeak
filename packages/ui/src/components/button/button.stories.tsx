import type { Meta, StoryObj } from "@storybook/react";
import { ChevronRight } from "lucide-react";

import { buttonFixtures } from "./fixtures";
import { Button } from "./index.web";
import { BUTTON_SIZES, BUTTON_VARIANTS } from "./shared";

const meta = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    ...buttonFixtures.continue,
    variant: "default",
    size: "default",
    disabled: false,
  },
  argTypes: {
    size: {
      control: "select",
      options: BUTTON_SIZES,
    },
    variant: {
      control: "select",
      options: BUTTON_VARIANTS,
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {BUTTON_VARIANTS.map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {BUTTON_SIZES.map((size) => (
        <Button
          key={size}
          size={size}
          variant={size === "icon" ? "outline" : "default"}
        >
          {size === "icon" ? <ChevronRight /> : size}
        </Button>
      ))}
    </div>
  ),
};
