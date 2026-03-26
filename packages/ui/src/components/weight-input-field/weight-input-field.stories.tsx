import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn } from "@storybook/test";
import { useState } from "react";

import { weightInputFieldFixtures } from "./fixtures";
import { WeightInputField } from "./index.web";
import { exerciseWeightInputFieldStory } from "./interactions";

const meta = {
  title: "Components/WeightInputField",
  component: WeightInputField,
  tags: ["autodocs"],
  args: {
    ...weightInputFieldFixtures.athlete,
    onChangeKg: fn(),
    onUnitChange: fn(),
  },
} satisfies Meta<typeof WeightInputField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [valueKg, setValueKg] = useState<number | null>(weightInputFieldFixtures.athlete.valueKg);
    const [unit, setUnit] = useState<"kg" | "lbs">("kg");
    return (
      <WeightInputField
        {...args}
        onChangeKg={(nextValue) => {
          setValueKg(nextValue);
          args.onChangeKg(nextValue);
        }}
        onUnitChange={(nextUnit) => {
          setUnit(nextUnit);
          args.onUnitChange?.(nextUnit);
        }}
        unit={unit}
        valueKg={valueKg}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    await exerciseWeightInputFieldStory({
      canvasElement,
      expectedLabel: weightInputFieldFixtures.athlete.label,
      nextValue: "71.5",
    });

    await expect(args.onChangeKg).toHaveBeenCalled();
    await expect(args.onUnitChange).toHaveBeenCalledWith("lbs");
  },
};
