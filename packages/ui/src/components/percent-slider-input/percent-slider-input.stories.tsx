import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";

import { percentSliderInputFixtures } from "./fixtures";
import { PercentSliderInput } from "./index.web";
import { exercisePercentSliderInputStory } from "./interactions";

const meta = {
  title: "Components/PercentSliderInput",
  component: PercentSliderInput,
  tags: ["autodocs"],
  args: {
    ...percentSliderInputFixtures.recovery,
    onChange: fn(),
  },
} satisfies Meta<typeof PercentSliderInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<number>(percentSliderInputFixtures.recovery.value);
    return (
      <PercentSliderInput
        {...args}
        onChange={(nextValue) => {
          setValue(nextValue);
          args.onChange(nextValue);
        }}
        value={value}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    await exercisePercentSliderInputStory({
      canvasElement,
      expectedLabel: percentSliderInputFixtures.recovery.label,
      nextValue: "13.25",
    });
  },
};
