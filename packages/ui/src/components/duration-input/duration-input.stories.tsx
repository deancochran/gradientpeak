import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn } from "@storybook/test";
import { useState } from "react";

import { durationInputFixtures } from "./fixtures";
import { DurationInput } from "./index.web";
import { exerciseDurationInputStory } from "./interactions";

const meta = {
  title: "Components/DurationInput",
  component: DurationInput,
  tags: ["autodocs"],
  args: {
    ...durationInputFixtures.workout,
    onChange: fn(),
  },
} satisfies Meta<typeof DurationInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(durationInputFixtures.workout.value);
    return (
      <DurationInput
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
    await exerciseDurationInputStory({
      canvasElement,
      expectedLabel: durationInputFixtures.workout.label,
      nextValue: "2:05:30",
    });

    await expect(args.onChange).toHaveBeenCalledWith("2:05:30");
  },
};
