import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn } from "@storybook/test";
import { useState } from "react";

import { paceInputFixtures } from "./fixtures";
import { PaceInput } from "./index.web";
import { exercisePaceInputStory } from "./interactions";

const meta = {
  title: "Components/PaceInput",
  component: PaceInput,
  tags: ["autodocs"],
  args: {
    ...paceInputFixtures.threshold,
    onChange: fn(),
  },
} satisfies Meta<typeof PaceInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(paceInputFixtures.threshold.value);
    return (
      <PaceInput
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
    await exercisePaceInputStory({
      canvasElement,
      expectedLabel: paceInputFixtures.threshold.label,
      nextValue: "4:05",
    });

    await expect(args.onChange).toHaveBeenCalledWith("4:05");
  },
};
