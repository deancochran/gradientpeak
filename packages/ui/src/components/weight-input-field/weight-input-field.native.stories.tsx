import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { weightInputFieldFixtures } from "./fixtures";
import { WeightInputField } from "./index.native";

const meta = {
  title: "Inputs/WeightInputField/Native",
  component: WeightInputField,
  args: {
    ...weightInputFieldFixtures.athlete,
    onChangeKg: () => {},
  },
} satisfies Meta<typeof WeightInputField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [valueKg, setValueKg] = React.useState<number | null>(
      weightInputFieldFixtures.athlete.valueKg,
    );
    const [unit, setUnit] = React.useState<"kg" | "lbs">("kg");

    return (
      <View className="bg-background p-6">
        <WeightInputField
          {...args}
          onChangeKg={setValueKg}
          onUnitChange={setUnit}
          unit={unit}
          valueKg={valueKg}
        />
      </View>
    );
  },
};
