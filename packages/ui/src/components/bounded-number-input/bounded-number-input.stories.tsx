import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn } from "@storybook/test";
import { useState } from "react";

import { boundedNumberInputFixtures } from "./fixtures";
import { BoundedNumberInput } from "./index.web";
import { exerciseBoundedNumberInputStory } from "./interactions";

const meta = {
  title: "Components/BoundedNumberInput",
  component: BoundedNumberInput,
  tags: ["autodocs"],
  args: {
    ...boundedNumberInputFixtures.ftp,
    onChange: fn(),
  },
} satisfies Meta<typeof BoundedNumberInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(boundedNumberInputFixtures.ftp.value);
    return (
      <BoundedNumberInput
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
    await exerciseBoundedNumberInputStory({
      canvasElement,
      expectedLabel: boundedNumberInputFixtures.ftp.label,
      nextValue: "275",
    });

    await expect(args.onChange).toHaveBeenCalledWith("275");
  },
};
