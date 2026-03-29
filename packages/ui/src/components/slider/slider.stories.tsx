import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { sliderFixtures } from "./fixtures";
import { Slider } from "./index.web";
import { exerciseSliderStory } from "./interactions";

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

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<number>(sliderFixtures.effort.value);
    return <Slider {...args} onValueChange={(nextValue) => setValue(nextValue)} value={value} />;
  },
  play: async ({ canvasElement }) => {
    await exerciseSliderStory({
      canvasElement,
      expectedLabel: sliderFixtures.effort.accessibilityLabel,
      nextValue: 8,
    });
  },
};
