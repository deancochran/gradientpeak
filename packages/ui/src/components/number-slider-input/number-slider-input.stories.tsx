import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { numberSliderInputFixtures } from "./fixtures";
import { NumberSliderInput } from "./index.web";
import { exerciseNumberSliderInputStory } from "./interactions";

const meta = {
  title: "Components/NumberSliderInput",
  component: NumberSliderInput,
  tags: ["autodocs"],
  args: {
    ...numberSliderInputFixtures.intensity,
    onChange: () => {},
  },
} satisfies Meta<typeof NumberSliderInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<number>(numberSliderInputFixtures.intensity.value);
    return <NumberSliderInput {...args} onChange={setValue} showNumericInput value={value} />;
  },
  play: async ({ canvasElement }) => {
    await exerciseNumberSliderInputStory({
      canvasElement,
      expectedLabel: numberSliderInputFixtures.intensity.label,
      nextValue: "0.95",
    });
  },
};
