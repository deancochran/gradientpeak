import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { View } from "react-native";

import { percentSliderInputFixtures } from "./fixtures";
import { PercentSliderInput } from "./index.native";

const meta = {
  title: "Inputs/PercentSliderInput/Native",
  component: PercentSliderInput,
  args: {
    ...percentSliderInputFixtures.recovery,
    onChange: () => {},
  },
} satisfies Meta<typeof PercentSliderInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<number>(percentSliderInputFixtures.recovery.value);

    return (
      <View className="bg-background p-6">
        <PercentSliderInput {...args} onChange={setValue} value={value} />
      </View>
    );
  },
};
