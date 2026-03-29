import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn } from "@storybook/test";
import { useState } from "react";

import { paceSecondsFieldFixtures } from "./fixtures";
import { PaceSecondsField } from "./index.web";
import { exercisePaceSecondsFieldStory } from "./interactions";

const meta = {
  title: "Components/PaceSecondsField",
  component: PaceSecondsField,
  tags: ["autodocs"],
  args: {
    ...paceSecondsFieldFixtures.easy,
    onChangeSeconds: fn(),
  },
} satisfies Meta<typeof PaceSecondsField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [valueSeconds, setValueSeconds] = useState<number | null>(
      paceSecondsFieldFixtures.easy.valueSeconds,
    );
    return (
      <PaceSecondsField
        {...args}
        onChangeSeconds={(nextValue) => {
          setValueSeconds(nextValue);
          args.onChangeSeconds(nextValue);
        }}
        valueSeconds={valueSeconds}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    await exercisePaceSecondsFieldStory({
      canvasElement,
      expectedLabel: paceSecondsFieldFixtures.easy.label,
      nextValue: "5:20",
    });

    await expect(args.onChangeSeconds).toHaveBeenCalled();
  },
};
