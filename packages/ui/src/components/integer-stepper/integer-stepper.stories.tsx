import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn } from "@storybook/test";
import { useState } from "react";

import { integerStepperFixtures } from "./fixtures";
import { IntegerStepper } from "./index.web";
import { exerciseIntegerStepperStory } from "./interactions";

const meta = {
  title: "Components/IntegerStepper",
  component: IntegerStepper,
  tags: ["autodocs"],
  args: {
    ...integerStepperFixtures.weeks,
    onChange: fn(),
  },
} satisfies Meta<typeof IntegerStepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState<number>(integerStepperFixtures.weeks.value);
    return (
      <IntegerStepper
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
    const { input } = await exerciseIntegerStepperStory({
      canvasElement,
      expectedLabel: integerStepperFixtures.weeks.label,
    });

    await expect(input).toHaveValue("7");
    await expect(args.onChange).toHaveBeenCalledWith(7);
  },
};
