import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { weightInputFieldFixtures } from "./fixtures";
import { WeightInputField } from "./index.web";

const meta = {
  title: "Components/WeightInputField",
  component: WeightInputField,
  tags: ["autodocs"],
  args: {
    ...weightInputFieldFixtures.athlete,
    onChangeKg: () => {},
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
        onChangeKg={setValueKg}
        onUnitChange={setUnit}
        unit={unit}
        valueKg={valueKg}
      />
    );
  },
};
