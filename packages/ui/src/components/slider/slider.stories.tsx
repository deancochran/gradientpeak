import type { Meta, StoryObj } from "@storybook/react";

import { sliderFixtures } from "./fixtures";
import { Slider } from "./index.web";

const meta = {
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
  args: {
    ...sliderFixtures.effort,
  },
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
